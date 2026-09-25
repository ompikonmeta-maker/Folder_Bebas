//! FFmpeg / ffprobe integration.
//!
//! Binary resolution order (first hit wins):
//!   1. env `CLIPFORGE_FFMPEG_DIR` — a folder containing ffmpeg(.exe)/ffprobe(.exe)
//!   2. a `binaries/` folder next to the executable (bundled sidecar)
//!   3. the system PATH (`ffmpeg` / `ffprobe`)

use serde::Serialize;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[cfg(windows)]
const EXE: &str = ".exe";
#[cfg(not(windows))]
const EXE: &str = "";

#[derive(Serialize, Clone)]
pub struct FfmpegStatus {
    pub found: bool,
    pub ffmpeg_path: String,
    pub ffprobe_path: String,
    pub version: Option<String>,
}

#[derive(Serialize, Clone, Default)]
pub struct VideoMeta {
    pub duration_sec: Option<f64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub fps: Option<f64>,
}

fn candidate_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(d) = std::env::var("CLIPFORGE_FFMPEG_DIR") {
        dirs.push(PathBuf::from(d));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            dirs.push(parent.join("binaries"));
            dirs.push(parent.to_path_buf());
        }
    }
    dirs
}

/// Resolve a tool ("ffmpeg" | "ffprobe") to an absolute path, or the bare name
/// (which lets the OS resolve it on PATH).
fn resolve(tool: &str) -> String {
    let name = format!("{tool}{EXE}");
    for dir in candidate_dirs() {
        let p = dir.join(&name);
        if p.is_file() {
            return p.to_string_lossy().to_string();
        }
    }
    name
}

pub fn ffmpeg_bin() -> String {
    resolve("ffmpeg")
}
pub fn ffprobe_bin() -> String {
    resolve("ffprobe")
}

pub fn status() -> FfmpegStatus {
    let ffmpeg = ffmpeg_bin();
    let ffprobe = ffprobe_bin();
    let version = Command::new(&ffmpeg)
        .arg("-version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.lines().next().map(|l| l.trim().to_string()));
    FfmpegStatus {
        found: version.is_some(),
        ffmpeg_path: ffmpeg,
        ffprobe_path: ffprobe,
        version,
    }
}

/// Read duration / dimensions / fps via ffprobe's JSON output.
pub fn probe(input: &Path) -> Result<VideoMeta, String> {
    let out = Command::new(ffprobe_bin())
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
        ])
        .arg(input)
        .output()
        .map_err(|e| format!("ffprobe failed to start: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "ffprobe exited with {}: {}",
            out.status,
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    let json: serde_json::Value =
        serde_json::from_slice(&out.stdout).map_err(|e| format!("bad ffprobe json: {e}"))?;

    let mut meta = VideoMeta::default();

    if let Some(dur) = json
        .get("format")
        .and_then(|f| f.get("duration"))
        .and_then(|d| d.as_str())
        .and_then(|s| s.parse::<f64>().ok())
    {
        meta.duration_sec = Some(dur);
    }

    if let Some(streams) = json.get("streams").and_then(|s| s.as_array()) {
        if let Some(v) = streams
            .iter()
            .find(|s| s.get("codec_type").and_then(|c| c.as_str()) == Some("video"))
        {
            meta.width = v.get("width").and_then(|w| w.as_i64());
            meta.height = v.get("height").and_then(|h| h.as_i64());
            if let Some(rate) = v.get("avg_frame_rate").and_then(|r| r.as_str()) {
                meta.fps = parse_rational(rate);
            }
        }
    }
    Ok(meta)
}

/// Parse ffprobe rationals like "30000/1001" into fps.
fn parse_rational(s: &str) -> Option<f64> {
    let (n, d) = s.split_once('/')?;
    let n: f64 = n.parse().ok()?;
    let d: f64 = d.parse().ok()?;
    if d == 0.0 {
        None
    } else {
        Some(n / d)
    }
}

/// Cut a single [start, end) segment with stream copy (fast, keyframe-aligned).
pub fn cut_segment(input: &Path, output: &Path, start_sec: f64, end_sec: f64) -> Result<(), String> {
    let dur = (end_sec - start_sec).max(0.0);
    let out = Command::new(ffmpeg_bin())
        .args(["-hide_banner", "-loglevel", "error", "-y"])
        .args(["-ss", &format!("{start_sec:.3}")])
        .arg("-i")
        .arg(input)
        .args(["-t", &format!("{dur:.3}")])
        // Copy video + audio only; drop subtitle/data streams that MP4 can't hold
        // (e.g. subrip in MKV would fail the mux).
        .args(["-map", "0:v:0", "-map", "0:a?", "-c", "copy", "-avoid_negative_ts", "make_zero"])
        .arg(output)
        .output()
        .map_err(|e| format!("ffmpeg failed to start: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "ffmpeg cut exited with {}: {}",
            out.status,
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(())
}

/// Run an encoding command while streaming ffmpeg's `-progress` output, calling
/// `on(fraction)` (0.0–1.0) as it advances. `total_sec` is the expected output
/// duration used to turn elapsed time into a fraction.
fn run_encode(
    mut cmd: Command,
    total_sec: f64,
    on: &mut dyn FnMut(f64),
) -> Result<(), String> {
    cmd.args(["-progress", "pipe:1", "-nostats"]);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("ffmpeg failed to start: {e}"))?;

    if let Some(stdout) = child.stdout.take() {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(v) = line.strip_prefix("out_time_us=") {
                if let Ok(us) = v.trim().parse::<f64>() {
                    if total_sec > 0.0 {
                        on((us / 1_000_000.0 / total_sec).clamp(0.0, 1.0));
                    }
                }
            }
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        let mut err = String::new();
        if let Some(mut se) = child.stderr.take() {
            let _ = se.read_to_string(&mut err);
        }
        return Err(format!("ffmpeg exited with {status}: {}", err.trim()));
    }
    on(1.0);
    Ok(())
}

/// Reformat a clip to `w`×`h` using center-crop "cover": scale so the frame is
/// fully covered, then crop the overflow from the center. Re-encodes to H.264/AAC.
/// Streams progress via `on` (needs `total_sec`, the clip duration).
pub fn reformat(
    input: &Path,
    output: &Path,
    w: i64,
    h: i64,
    total_sec: f64,
    on: &mut dyn FnMut(f64),
) -> Result<(), String> {
    let vf = format!("scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1");
    let mut cmd = Command::new(ffmpeg_bin());
    cmd.args(["-hide_banner", "-loglevel", "error", "-y"])
        .arg("-i")
        .arg(input)
        .args(["-vf", &vf])
        // Only the first video + first audio; ignore subtitles/data.
        .args(["-map", "0:v:0", "-map", "0:a:0?"])
        .args(["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"])
        .args(["-c:a", "aac", "-b:a", "128k"])
        .args(["-movflags", "+faststart"])
        .arg(output);
    run_encode(cmd, total_sec, on)
}

/// Extract a single-frame JPEG thumbnail at `at_sec`, scaled to `width` px wide.
pub fn thumbnail(input: &Path, output: &Path, at_sec: f64, width: i64) -> Result<(), String> {
    let vf = format!("scale={width}:-2");
    let out = Command::new(ffmpeg_bin())
        .args(["-hide_banner", "-loglevel", "error", "-y"])
        .args(["-ss", &format!("{at_sec:.3}")])
        .arg("-i")
        .arg(input)
        .args(["-frames:v", "1", "-vf", &vf, "-q:v", "4"])
        .arg(output)
        .output()
        .map_err(|e| format!("ffmpeg failed to start: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "ffmpeg thumbnail exited with {}: {}",
            out.status,
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(())
}

/// Does the file have at least one audio stream?
pub fn has_audio(input: &Path) -> bool {
    Command::new(ffprobe_bin())
        .args([
            "-v", "quiet",
            "-select_streams", "a",
            "-show_entries", "stream=index",
            "-of", "csv=p=0",
        ])
        .arg(input)
        .output()
        .map(|o| !o.stdout.is_empty())
        .unwrap_or(false)
}

/// Normalize one part to a common shape (W×H cover-crop, `fps`, H.264/yuv420p,
/// stereo AAC 48k). Silent audio is synthesized when the source has none, so
/// every normalized part carries a matching audio track for a clean concat.
pub fn normalize(
    input: &Path,
    output: &Path,
    w: i64,
    h: i64,
    fps: u32,
    on: &mut dyn FnMut(f64),
) -> Result<(), String> {
    let vf = format!(
        "scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1,fps={fps}"
    );
    let total = probe(input).ok().and_then(|m| m.duration_sec).unwrap_or(0.0);

    let mut cmd = Command::new(ffmpeg_bin());
    cmd.args(["-hide_banner", "-loglevel", "error", "-y"]);

    let audio = has_audio(input);
    cmd.arg("-i").arg(input);
    if !audio {
        // main input + synthesized silence
        cmd.args(["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]);
    }

    cmd.args(["-vf", &vf]);
    if audio {
        // First video + first audio only; drop subtitles/data.
        cmd.args(["-map", "0:v:0", "-map", "0:a:0"]);
    } else {
        cmd.args(["-map", "0:v:0", "-map", "1:a:0", "-shortest"]);
    }
    cmd.args(["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"])
        .args(["-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "128k"])
        .arg(output);

    run_encode(cmd, total, on)
}

/// Concatenate already-normalized parts (identical codec params) with stream
/// copy via the concat demuxer. `list_path` is a scratch file listing inputs.
pub fn concat_copy(parts: &[PathBuf], list_path: &Path, output: &Path) -> Result<(), String> {
    let mut list = String::new();
    for p in parts {
        // concat demuxer needs single-quotes escaped as '\''
        let s = p.to_string_lossy().replace('\'', "'\\''");
        list.push_str(&format!("file '{s}'\n"));
    }
    std::fs::write(list_path, list).map_err(|e| format!("write concat list failed: {e}"))?;

    let out = Command::new(ffmpeg_bin())
        .args(["-hide_banner", "-loglevel", "error", "-y"])
        .args(["-f", "concat", "-safe", "0"])
        .arg("-i")
        .arg(list_path)
        .args(["-c", "copy", "-movflags", "+faststart"])
        .arg(output)
        .output()
        .map_err(|e| format!("ffmpeg failed to start: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "ffmpeg concat exited with {}: {}",
            out.status,
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(())
}

/// Compute equal-length [start, end] windows covering `total` seconds.
pub fn auto_windows(total: f64, seg: f64) -> Vec<(f64, f64)> {
    let mut out = Vec::new();
    if total <= 0.0 || seg <= 0.0 {
        return out;
    }
    let mut start = 0.0;
    while start < total - 0.05 {
        let end = (start + seg).min(total);
        out.push((start, end));
        start = end;
    }
    out
}
