//! Central storage folder: one place that holds the SQLite db and all user media.
//! Layout (created on first launch under the OS app-data dir, or a user-chosen root):
//!   VideoClipperData/
//!     app.db
//!     sources/ library/opener/ library/ending/ clips/ exports/

use std::fs;
use std::path::{Path, PathBuf};

pub const SUBDIRS: [&str; 5] = [
    "sources",
    "library/opener",
    "library/ending",
    "clips",
    "exports",
];

/// Ensure the central folder and all subdirectories exist. Returns the root path.
pub fn init_storage(root: &Path) -> std::io::Result<PathBuf> {
    fs::create_dir_all(root)?;
    for sub in SUBDIRS {
        fs::create_dir_all(root.join(sub))?;
    }
    Ok(root.to_path_buf())
}

pub fn db_path(root: &Path) -> PathBuf {
    root.join("app.db")
}
