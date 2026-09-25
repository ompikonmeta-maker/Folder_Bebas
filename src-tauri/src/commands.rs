//! Tauri commands exposed to the React frontend (see src/lib/api.ts).

use crate::db::{Clip, ExportJob, LibraryAsset, NewClip, NewJob, Project, SourceVideo};
use crate::ffmpeg::{self, FfmpegStatus};
use crate::AppState;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{Emitter, State};

fn map_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command]
pub fn get_storage_root(state: State<AppState>) -> Result<String, String> {
    Ok(state.storage_root.to_string_lossy().to_string())
}

#[tauri::command]
pub fn ffmpeg_status() -> FfmpegStatus {
    ffmpeg::status()
}

#[tauri::command]
pub fn list_projects(state: State<AppState>) -> Result<Vec<Project>, String> {
    let db = state.db.lock().map_err(map_err)?;
    db.list_projects().map_err(map_err)
}

#[tauri::command]
pub fn create_project(state: State<AppState>, name: String) -> Result<Project, String> {
    let db = state.db.lock().map_err(map_err)?;
    db.create_project(&name).map_err(map_err)
}

/// Copy a chosen video into the central `sources/` folder, probe it, and record it.
#[tauri::command]
pub fn import_source(
    state: State<AppState>,
    project_id: i64,
    src_path: String,
) -> Result<SourceVideo, String> {
    let src = PathBuf::from(&src_path);
    if !src.is_file() {
        return Err(format!("file not found: {src_path}"));
    }
    let file_name = src
        .file_name()
        .ok_or("source has no file name")?
        .to_string_lossy()
        .to_string();

    let dest_dir = state.storage_root.join("sources");
    let dest = unique_path(&dest_dir, &file_name);
    std::fs::copy(&src, &dest).map_err(|e| format!("copy failed: {e}"))?;

    let meta = ffmpeg::probe(&dest).unwrap_or_default();

    let db = state.db.lock().map_err(map_err)?;
    db.insert_source(
        project_id,
        &dest.to_string_lossy(),
        meta.duration_sec,
        meta.width,
        meta.height,
        meta.fps,
    )
    .map_err(map_err)
}

#[tauri::command]
pub fn list_sources(state: State<AppState>, project_id: i64) -> Result<Vec<SourceVideo>, String> {
    let db = state.db.lock().map_err(map_err)?;
    db.list_sources(project_id).map_err(map_err)
}

#[tauri::command]
pub fn list_clips(state: State<AppState>, project_id: i64) -> Result<Vec<Clip>, String> {
    let db = state.db.lock().map_err(map_err)?;
    db.list_clips(project_id).map_err(map_err)
}

#[derive(Serialize, Clone)]
struct ClipProgress {
    done: usize,
    total: usize,
    label: String,
}

/// Generate clips from a source.
/// - `mode = "auto"`: split into equal `segment_sec` windows across the whole video.
/// - `mode = "manual"`: cut the provided `segments` ([start, end] in seconds).
#[tauri::command]
pub fn generate_clips(
    app: tauri::AppHandle,
    state: State<AppState>,
    project_id: i64,
    source_id: i64,
    mode: String,
    segment_sec: Option<f64>,
    segments: Option<Vec<[f64; 2]>>,
) -> Result<Vec<Clip>, String> {
    // Resolve the source path + windows without holding the db lock during ffmpeg.
    let (input_path, windows) = {
        let db = state.db.lock().map_err(map_err)?;
        let source = db.get_source(source_id).map_err(map_err)?;
        let input = PathBuf::from(&source.file_path);
        let windows: Vec<(f64, f64)> = match mode.as_str() {
            "auto" => {
                let seg = segment_sec.ok_or("auto mode needs segment_sec")?;
                let total = source
                    .duration_sec
                    .ok_or("source duration unknown; cannot auto-split")?;
                ffmpeg::auto_windows(total, seg)
            }
            "manual" => segments
                .ok_or("manual mode needs segments")?
                .into_iter()
                .filter(|s| s[1] > s[0])
                .map(|s| (s[0], s[1]))
                .collect(),
            other => return Err(format!("unknown mode: {other}")),
        };
        (input, windows)
    };

    if windows.is_empty() {
        return Err("no clips to generate".into());
    }

    let clips_dir = state.storage_root.join("clips");
    let total = windows.len();
    let mut created = Vec::new();

    for (i, (start, end)) in windows.into_iter().enumerate() {
        let name = format!("p{project_id}_s{source_id}_{:03}.mp4", i + 1);
        let out = unique_path(&clips_dir, &name);
        ffmpeg::cut_segment(&input_path, &out, start, end)?;

        let db = state.db.lock().map_err(map_err)?;
        let clip = db
            .insert_clip(
                project_id,
                &NewClip {
                    source_id,
                    mode: mode.clone(),
                    start_sec: start,
                    end_sec: end,
                    file_path: out.to_string_lossy().to_string(),
                },
            )
            .map_err(map_err)?;
        drop(db);

        let _ = app.emit(
            "clip_progress",
            ClipProgress {
                done: i + 1,
                total,
                label: name,
            },
        );
        created.push(clip);
    }

    Ok(created)
}

#[derive(Serialize, Clone)]
struct ReformatProgress {
    stage: String, // "start" | "done"
    clip_id: i64,
    output: Option<String>,
}

/// Reformat one clip to `width`×`height` (center-crop cover) and write it to
/// `exports/`. Returns the output path. Dimensions come from the frontend
/// (preset × resolution), keeping preset definitions in one place.
#[tauri::command]
pub fn reformat_clip(
    app: tauri::AppHandle,
    state: State<AppState>,
    clip_id: i64,
    width: i64,
    height: i64,
) -> Result<String, String> {
    let input = {
        let db = state.db.lock().map_err(map_err)?;
        let clip = db.get_clip(clip_id).map_err(map_err)?;
        clip.file_path.ok_or("clip has no file on disk")?
    };
    let input = PathBuf::from(input);
    let stem = input
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| format!("clip{clip_id}"));

    let exports_dir = state.storage_root.join("exports");
    let out = unique_path(&exports_dir, &format!("{stem}_{width}x{height}.mp4"));

    let _ = app.emit(
        "reformat_progress",
        ReformatProgress { stage: "start".into(), clip_id, output: None },
    );
    ffmpeg::reformat(&input, &out, width, height)?;
    let out_str = out.to_string_lossy().to_string();
    let _ = app.emit(
        "reformat_progress",
        ReformatProgress { stage: "done".into(), clip_id, output: Some(out_str.clone()) },
    );
    Ok(out_str)
}

// ---- Library (opener / ending) ----

/// Copy a chosen file into `library/<kind>/` and record it.
#[tauri::command]
pub fn import_library_asset(
    state: State<AppState>,
    kind: String,
    src_path: String,
) -> Result<LibraryAsset, String> {
    if kind != "opener" && kind != "ending" {
        return Err(format!("invalid kind: {kind}"));
    }
    let src = PathBuf::from(&src_path);
    if !src.is_file() {
        return Err(format!("file not found: {src_path}"));
    }
    let file_name = src
        .file_name()
        .ok_or("asset has no file name")?
        .to_string_lossy()
        .to_string();

    let dest_dir = state.storage_root.join("library").join(&kind);
    let dest = unique_path(&dest_dir, &file_name);
    std::fs::copy(&src, &dest).map_err(|e| format!("copy failed: {e}"))?;

    let db = state.db.lock().map_err(map_err)?;
    db.insert_library_asset(&kind, &file_name, &dest.to_string_lossy())
        .map_err(map_err)
}

#[tauri::command]
pub fn list_library(state: State<AppState>, kind: String) -> Result<Vec<LibraryAsset>, String> {
    let db = state.db.lock().map_err(map_err)?;
    db.list_library(&kind).map_err(map_err)
}

#[tauri::command]
pub fn delete_library_asset(state: State<AppState>, id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(map_err)?;
    if let Some(path) = db.delete_library_asset(id).map_err(map_err)? {
        let _ = std::fs::remove_file(path); // best-effort; row already gone
    }
    Ok(())
}

// ---- Combine (opener + clip + ending) ----

#[derive(Serialize, Clone)]
struct CombineProgress {
    stage: String, // "normalize" | "concat" | "done"
    clip_id: i64,
    output: Option<String>,
}

/// Build a final, upload-ready file: [opener?] + reformatted clip + [ending?],
/// each normalized to `width`×`height`, concatenated into `exports/`.
#[tauri::command]
pub fn combine_clip(
    app: tauri::AppHandle,
    state: State<AppState>,
    clip_id: i64,
    opener_id: Option<i64>,
    ending_id: Option<i64>,
    width: i64,
    height: i64,
) -> Result<String, String> {
    // Resolve all input paths up front.
    let (clip_path, opener_path, ending_path) = {
        let db = state.db.lock().map_err(map_err)?;
        let clip = db.get_clip(clip_id).map_err(map_err)?;
        let clip_path = clip.file_path.ok_or("clip has no file on disk")?;
        let opener_path = match opener_id {
            Some(id) => Some(db.get_library_asset(id).map_err(map_err)?.file_path),
            None => None,
        };
        let ending_path = match ending_id {
            Some(id) => Some(db.get_library_asset(id).map_err(map_err)?.file_path),
            None => None,
        };
        (clip_path, opener_path, ending_path)
    };

    let _ = app.emit(
        "combine_progress",
        CombineProgress { stage: "normalize".into(), clip_id, output: None },
    );
    let out_str = combine_parts(
        &state.storage_root,
        clip_id,
        &clip_path,
        opener_path,
        ending_path,
        width,
        height,
    )?;
    let _ = app.emit(
        "combine_progress",
        CombineProgress { stage: "done".into(), clip_id, output: Some(out_str.clone()) },
    );
    Ok(out_str)
}

/// Normalize [opener?] + clip + [ending?] to `width`×`height` and concat them
/// into `exports/`. Temp parts are cleaned up. Returns the output path.
fn combine_parts(
    storage_root: &Path,
    clip_id: i64,
    clip_path: &str,
    opener_path: Option<String>,
    ending_path: Option<String>,
    width: i64,
    height: i64,
) -> Result<String, String> {
    let mut sources: Vec<PathBuf> = Vec::new();
    if let Some(p) = opener_path {
        sources.push(PathBuf::from(p));
    }
    sources.push(PathBuf::from(clip_path));
    if let Some(p) = ending_path {
        sources.push(PathBuf::from(p));
    }

    let exports_dir = storage_root.join("exports");
    let tmp_dir = exports_dir.join(".tmp");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| format!("mkdir tmp failed: {e}"))?;

    let mut normalized: Vec<PathBuf> = Vec::new();
    for (i, src) in sources.iter().enumerate() {
        let part = tmp_dir.join(format!("c{clip_id}_part{i}.mp4"));
        ffmpeg::normalize(src, &part, width, height, 30)?;
        normalized.push(part);
    }

    let stem = Path::new(clip_path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| format!("clip{clip_id}"));
    let out = unique_path(&exports_dir, &format!("{stem}_final_{width}x{height}.mp4"));
    let list = tmp_dir.join(format!("c{clip_id}_list.txt"));
    let result = ffmpeg::concat_copy(&normalized, &list, &out);

    for p in &normalized {
        let _ = std::fs::remove_file(p);
    }
    let _ = std::fs::remove_file(&list);
    result?;
    Ok(out.to_string_lossy().to_string())
}

// ---- Export queue ----

/// Enqueue one export job per clip with the given settings. Nothing runs yet.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn enqueue_exports(
    state: State<AppState>,
    project_id: i64,
    clip_ids: Vec<i64>,
    platform_preset: String,
    resolution: String,
    combine: bool,
    opener_id: Option<i64>,
    ending_id: Option<i64>,
    width: i64,
    height: i64,
) -> Result<Vec<ExportJob>, String> {
    let db = state.db.lock().map_err(map_err)?;
    let mut jobs = Vec::new();
    for clip_id in clip_ids {
        let job = db
            .insert_job(
                project_id,
                &NewJob {
                    clip_id,
                    platform_preset: platform_preset.clone(),
                    resolution: resolution.clone(),
                    combine,
                    opener_id: if combine { opener_id } else { None },
                    ending_id: if combine { ending_id } else { None },
                    width,
                    height,
                },
            )
            .map_err(map_err)?;
        jobs.push(job);
    }
    Ok(jobs)
}

#[tauri::command]
pub fn list_jobs(state: State<AppState>, project_id: i64) -> Result<Vec<ExportJob>, String> {
    let db = state.db.lock().map_err(map_err)?;
    db.list_jobs(project_id).map_err(map_err)
}

#[tauri::command]
pub fn clear_finished_jobs(state: State<AppState>, project_id: i64) -> Result<usize, String> {
    let db = state.db.lock().map_err(map_err)?;
    db.delete_finished_jobs(project_id).map_err(map_err)
}

/// Run every queued job for the project, sequentially. Each job's status and
/// output are persisted; a `job_progress` event carries the updated job after
/// every transition. The db lock is released during ffmpeg work.
#[tauri::command]
pub fn run_queue(
    app: tauri::AppHandle,
    state: State<AppState>,
    project_id: i64,
) -> Result<(), String> {
    let queued = {
        let db = state.db.lock().map_err(map_err)?;
        db.list_queued(project_id).map_err(map_err)?
    };

    for job in queued {
        // Mark running.
        {
            let db = state.db.lock().map_err(map_err)?;
            db.update_job(job.id, "running", 0, None, None).map_err(map_err)?;
            if let Ok(j) = db.get_job(job.id) {
                let _ = app.emit("job_progress", j);
            }
        }

        let outcome = run_one_job(&state, &job);

        let db = state.db.lock().map_err(map_err)?;
        match outcome {
            Ok(path) => db.update_job(job.id, "done", 100, Some(&path), None).map_err(map_err)?,
            Err(e) => db.update_job(job.id, "error", 0, None, Some(&e)).map_err(map_err)?,
        }
        if let Ok(j) = db.get_job(job.id) {
            let _ = app.emit("job_progress", j);
        }
    }
    Ok(())
}

/// Produce the output file for one job: combine when requested, else reformat.
fn run_one_job(state: &State<AppState>, job: &ExportJob) -> Result<String, String> {
    let clip_id = job.clip_id.ok_or("job has no clip")?;
    let width = job.width.ok_or("job has no width")?;
    let height = job.height.ok_or("job has no height")?;

    let (clip_path, opener_path, ending_path) = {
        let db = state.db.lock().map_err(map_err)?;
        let clip = db.get_clip(clip_id).map_err(map_err)?;
        let clip_path = clip.file_path.ok_or("clip has no file on disk")?;
        let opener = match job.opener_id {
            Some(id) => Some(db.get_library_asset(id).map_err(map_err)?.file_path),
            None => None,
        };
        let ending = match job.ending_id {
            Some(id) => Some(db.get_library_asset(id).map_err(map_err)?.file_path),
            None => None,
        };
        (clip_path, opener, ending)
    };

    if job.combine && (opener_path.is_some() || ending_path.is_some()) {
        combine_parts(&state.storage_root, clip_id, &clip_path, opener_path, ending_path, width, height)
    } else {
        // Reformat only.
        let exports_dir = state.storage_root.join("exports");
        let stem = Path::new(&clip_path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| format!("clip{clip_id}"));
        let out = unique_path(&exports_dir, &format!("{stem}_{width}x{height}.mp4"));
        ffmpeg::reformat(&PathBuf::from(&clip_path), &out, width, height)?;
        Ok(out.to_string_lossy().to_string())
    }
}

/// Return a path in `dir` for `name`, appending _1, _2, … if it already exists.
fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let stem = Path::new(name)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| name.to_string());
    let ext = Path::new(name)
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    for n in 1.. {
        let p = dir.join(format!("{stem}_{n}{ext}"));
        if !p.exists() {
            return p;
        }
    }
    unreachable!()
}
