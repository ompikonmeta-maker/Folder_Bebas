//! ClipForge Studio — Tauri backend.
//! Owns the central storage folder and the SQLite connection, and exposes commands.

mod commands;
mod db;
mod ffmpeg;
mod storage;

use db::Db;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

/// Shared application state available to every command.
pub struct AppState {
    pub db: Mutex<Db>,
    pub storage_root: PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Central storage under the OS app-data dir, e.g.
            //   Windows: %APPDATA%/com.clipforge.studio/VideoClipperData
            let base = app
                .path()
                .app_data_dir()
                .expect("no app data dir")
                .join("VideoClipperData");
            let root = storage::init_storage(&base)?;
            let db = Db::open(&storage::db_path(&root))?;

            // Point ffmpeg resolution at the bundled binaries (resource_dir/binaries)
            // when present, unless the user already set an override. This makes the
            // packaged app self-contained — no system ffmpeg needed.
            if std::env::var_os("CLIPFORGE_FFMPEG_DIR").is_none() {
                if let Ok(res) = app.path().resource_dir() {
                    let bin = res.join("binaries");
                    if bin.is_dir() {
                        std::env::set_var("CLIPFORGE_FFMPEG_DIR", &bin);
                    }
                }
            }

            app.manage(AppState {
                db: Mutex::new(db),
                storage_root: root,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_storage_root,
            commands::ffmpeg_status,
            commands::list_projects,
            commands::create_project,
            commands::import_source,
            commands::list_sources,
            commands::list_clips,
            commands::generate_clips,
            commands::reformat_clip,
            commands::import_library_asset,
            commands::list_library,
            commands::delete_library_asset,
            commands::combine_clip,
            commands::enqueue_exports,
            commands::list_jobs,
            commands::run_queue,
            commands::clear_finished_jobs,
            commands::clip_thumbnail,
            commands::delete_clip,
            commands::delete_source,
            commands::reveal_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
