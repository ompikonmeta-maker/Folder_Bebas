//! SQLite access layer using rusqlite (bundled — no system SQLite needed).

use rusqlite::Connection;
use serde::Serialize;
use std::path::Path;

pub struct Db {
    pub conn: Connection,
}

#[derive(Serialize)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
    pub platform_preset: String,
}

#[derive(Serialize)]
pub struct SourceVideo {
    pub id: i64,
    pub project_id: i64,
    pub file_path: String,
    pub duration_sec: Option<f64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub fps: Option<f64>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct Clip {
    pub id: i64,
    pub project_id: i64,
    pub source_id: i64,
    pub mode: String,
    pub start_sec: f64,
    pub end_sec: f64,
    pub file_path: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct LibraryAsset {
    pub id: i64,
    pub kind: String,
    pub name: String,
    pub file_path: String,
    pub created_at: String,
}

/// A clip to create — start/end in seconds. Used by both auto and manual modes.
pub struct NewClip {
    pub source_id: i64,
    pub mode: String,
    pub start_sec: f64,
    pub end_sec: f64,
    pub file_path: String,
}

impl Db {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        let db = Db { conn };
        db.migrate()?;
        Ok(db)
    }

    /// Schema. Kept idempotent so it can run on every launch.
    fn migrate(&self) -> rusqlite::Result<()> {
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS projects (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                name            TEXT NOT NULL,
                platform_preset TEXT NOT NULL DEFAULT 'yt_shorts',
                created_at      TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS source_videos (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                file_path    TEXT NOT NULL,
                duration_sec REAL,
                width        INTEGER,
                height       INTEGER,
                fps          REAL,
                created_at   TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS clips (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                source_id  INTEGER NOT NULL REFERENCES source_videos(id) ON DELETE CASCADE,
                mode       TEXT NOT NULL CHECK (mode IN ('auto','manual')),
                start_sec  REAL NOT NULL,
                end_sec    REAL NOT NULL,
                file_path  TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS library_assets (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                kind       TEXT NOT NULL CHECK (kind IN ('opener','ending')),
                name       TEXT NOT NULL,
                file_path  TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS export_jobs (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                clip_id         INTEGER REFERENCES clips(id) ON DELETE SET NULL,
                platform_preset TEXT NOT NULL,
                resolution      TEXT NOT NULL CHECK (resolution IN ('SD','HD','UHD')),
                combine         INTEGER NOT NULL DEFAULT 0,
                status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','error')),
                progress        INTEGER NOT NULL DEFAULT 0,
                output_path     TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );
            "#,
        )
    }

    pub fn list_projects(&self) -> rusqlite::Result<Vec<Project>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, created_at, updated_at, platform_preset
             FROM projects ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Project {
                id: r.get(0)?,
                name: r.get(1)?,
                created_at: r.get(2)?,
                updated_at: r.get(3)?,
                platform_preset: r.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn create_project(&self, name: &str) -> rusqlite::Result<Project> {
        self.conn
            .execute("INSERT INTO projects (name) VALUES (?1)", [name])?;
        let id = self.conn.last_insert_rowid();
        self.conn.query_row(
            "SELECT id, name, created_at, updated_at, platform_preset FROM projects WHERE id = ?1",
            [id],
            |r| {
                Ok(Project {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    created_at: r.get(2)?,
                    updated_at: r.get(3)?,
                    platform_preset: r.get(4)?,
                })
            },
        )
    }

    // ---- Source videos ----

    pub fn insert_source(
        &self,
        project_id: i64,
        file_path: &str,
        duration_sec: Option<f64>,
        width: Option<i64>,
        height: Option<i64>,
        fps: Option<f64>,
    ) -> rusqlite::Result<SourceVideo> {
        self.conn.execute(
            "INSERT INTO source_videos (project_id, file_path, duration_sec, width, height, fps)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![project_id, file_path, duration_sec, width, height, fps],
        )?;
        self.get_source(self.conn.last_insert_rowid())
    }

    pub fn get_source(&self, id: i64) -> rusqlite::Result<SourceVideo> {
        self.conn.query_row(
            "SELECT id, project_id, file_path, duration_sec, width, height, fps, created_at
             FROM source_videos WHERE id = ?1",
            [id],
            Self::map_source,
        )
    }

    pub fn list_sources(&self, project_id: i64) -> rusqlite::Result<Vec<SourceVideo>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, project_id, file_path, duration_sec, width, height, fps, created_at
             FROM source_videos WHERE project_id = ?1 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([project_id], Self::map_source)?;
        rows.collect()
    }

    fn map_source(r: &rusqlite::Row) -> rusqlite::Result<SourceVideo> {
        Ok(SourceVideo {
            id: r.get(0)?,
            project_id: r.get(1)?,
            file_path: r.get(2)?,
            duration_sec: r.get(3)?,
            width: r.get(4)?,
            height: r.get(5)?,
            fps: r.get(6)?,
            created_at: r.get(7)?,
        })
    }

    // ---- Clips ----

    pub fn insert_clip(&self, project_id: i64, c: &NewClip) -> rusqlite::Result<Clip> {
        self.conn.execute(
            "INSERT INTO clips (project_id, source_id, mode, start_sec, end_sec, file_path)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![project_id, c.source_id, c.mode, c.start_sec, c.end_sec, c.file_path],
        )?;
        self.conn.query_row(
            "SELECT id, project_id, source_id, mode, start_sec, end_sec, file_path, created_at
             FROM clips WHERE id = ?1",
            [self.conn.last_insert_rowid()],
            Self::map_clip,
        )
    }

    pub fn get_clip(&self, id: i64) -> rusqlite::Result<Clip> {
        self.conn.query_row(
            "SELECT id, project_id, source_id, mode, start_sec, end_sec, file_path, created_at
             FROM clips WHERE id = ?1",
            [id],
            Self::map_clip,
        )
    }

    pub fn list_clips(&self, project_id: i64) -> rusqlite::Result<Vec<Clip>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, project_id, source_id, mode, start_sec, end_sec, file_path, created_at
             FROM clips WHERE project_id = ?1 ORDER BY start_sec ASC, id ASC",
        )?;
        let rows = stmt.query_map([project_id], Self::map_clip)?;
        rows.collect()
    }

    fn map_clip(r: &rusqlite::Row) -> rusqlite::Result<Clip> {
        Ok(Clip {
            id: r.get(0)?,
            project_id: r.get(1)?,
            source_id: r.get(2)?,
            mode: r.get(3)?,
            start_sec: r.get(4)?,
            end_sec: r.get(5)?,
            file_path: r.get(6)?,
            created_at: r.get(7)?,
        })
    }

    // ---- Library assets (opener / ending) ----

    pub fn insert_library_asset(
        &self,
        kind: &str,
        name: &str,
        file_path: &str,
    ) -> rusqlite::Result<LibraryAsset> {
        self.conn.execute(
            "INSERT INTO library_assets (kind, name, file_path) VALUES (?1, ?2, ?3)",
            rusqlite::params![kind, name, file_path],
        )?;
        self.get_library_asset(self.conn.last_insert_rowid())
    }

    pub fn get_library_asset(&self, id: i64) -> rusqlite::Result<LibraryAsset> {
        self.conn.query_row(
            "SELECT id, kind, name, file_path, created_at FROM library_assets WHERE id = ?1",
            [id],
            Self::map_asset,
        )
    }

    pub fn list_library(&self, kind: &str) -> rusqlite::Result<Vec<LibraryAsset>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, kind, name, file_path, created_at
             FROM library_assets WHERE kind = ?1 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([kind], Self::map_asset)?;
        rows.collect()
    }

    pub fn delete_library_asset(&self, id: i64) -> rusqlite::Result<Option<String>> {
        let path: Option<String> = self
            .conn
            .query_row(
                "SELECT file_path FROM library_assets WHERE id = ?1",
                [id],
                |r| r.get(0),
            )
            .ok();
        self.conn
            .execute("DELETE FROM library_assets WHERE id = ?1", [id])?;
        Ok(path)
    }

    fn map_asset(r: &rusqlite::Row) -> rusqlite::Result<LibraryAsset> {
        Ok(LibraryAsset {
            id: r.get(0)?,
            kind: r.get(1)?,
            name: r.get(2)?,
            file_path: r.get(3)?,
            created_at: r.get(4)?,
        })
    }
}
