//! Tauri commands exposed to the React frontend (see src/lib/api.ts).

use crate::db::Project;
use crate::AppState;
use tauri::State;

fn map_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command]
pub fn get_storage_root(state: State<AppState>) -> Result<String, String> {
    Ok(state.storage_root.to_string_lossy().to_string())
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
