//! FFmpeg / ffprobe integration.
//!
//! Binary resolution order (first hit wins):
//!   1. env `CLIPFORGE_FFMPEG_DIR` — a folder containing ffmpeg(.exe)/ffprobe(.exe)
//!   2. a `binaries/` folder next to the executable (bundled sidecar)
//!   3. the system PATH (`ffmpeg` / `ffprobe`)

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

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
        .args(["-c", "copy", "-map", "0", "-avoid_negative_ts", "make_zero"])
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
