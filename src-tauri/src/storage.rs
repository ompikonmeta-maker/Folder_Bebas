//! Central storage folder: one place that holds the SQLite db and all user media.
//! Layout (created on first launch under the OS app-data dir, or a user-chosen root):
//!   VideoClipperData/
//!     app.db
//!     library/opener/  library/ending/          (shared across projects)
//!     projects/<id>/sources/  clips/  clips/thumbs/  exports/

use std::fs;
use std::path::{Path, PathBuf};

/// Shared, project-independent folders created once at the root.
pub const ROOT_SUBDIRS: [&str; 2] = ["library/opener", "library/ending"];

/// Per-project folders, created on demand under projects/<id>/.
pub const PROJECT_SUBDIRS: [&str; 4] = ["sources", "clips", "clips/thumbs", "exports"];

/// Ensure the central folder and shared subdirectories exist. Returns the root path.
pub fn init_storage(root: &Path) -> std::io::Result<PathBuf> {
    fs::create_dir_all(root)?;
    for sub in ROOT_SUBDIRS {
        fs::create_dir_all(root.join(sub))?;
    }
    Ok(root.to_path_buf())
}

pub fn db_path(root: &Path) -> PathBuf {
    root.join("app.db")
}

/// The folder that holds one project's media.
pub fn project_dir(root: &Path, project_id: i64) -> PathBuf {
    root.join("projects").join(project_id.to_string())
}

/// Ensure a project's subfolders exist. Returns the project folder.
pub fn ensure_project(root: &Path, project_id: i64) -> std::io::Result<PathBuf> {
    let dir = project_dir(root, project_id);
    for sub in PROJECT_SUBDIRS {
        fs::create_dir_all(dir.join(sub))?;
    }
    Ok(dir)
}
