//! Tauri commands exposed to the React frontend (see src/lib/api.ts).

use crate::db::{Clip, NewClip, Project, SourceVideo};
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
