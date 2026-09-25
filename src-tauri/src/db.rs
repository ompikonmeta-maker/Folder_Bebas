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

#[derive(Serialize, Clone)]
pub struct ExportJob {
    pub id: i64,
    pub project_id: i64,
    pub clip_id: Option<i64>,
    pub platform_preset: String,
    pub resolution: String,
    pub combine: bool,
    pub opener_id: Option<i64>,
    pub ending_id: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub status: String,
    pub progress: i64,
    pub output_path: Option<String>,
    pub error: Option<String>,
    pub created_at: String,
}

/// Parameters for enqueuing one export job.
pub struct NewJob {
    pub clip_id: i64,
    pub platform_preset: String,
    pub resolution: String,
    pub combine: bool,
    pub opener_id: Option<i64>,
    pub ending_id: Option<i64>,
    pub width: i64,
    pub height: i64,
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
                opener_id       INTEGER,
                ending_id       INTEGER,
                width           INTEGER,
                height          INTEGER,
                status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','error')),
                progress        INTEGER NOT NULL DEFAULT 0,
                output_path     TEXT,
                error           TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
            );
            "#,
        )?;
        // Idempotent column adds for databases created before these columns
        // existed. Duplicate-column errors are expected and ignored.
        for col in [
            "ALTER TABLE export_jobs ADD COLUMN opener_id INTEGER",
            "ALTER TABLE export_jobs ADD COLUMN ending_id INTEGER",
            "ALTER TABLE export_jobs ADD COLUMN width INTEGER",
            "ALTER TABLE export_jobs ADD COLUMN height INTEGER",
            "ALTER TABLE export_jobs ADD COLUMN error TEXT",
        ] {
            let _ = self.conn.execute(col, []);
        }
        Ok(())
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

    /// Delete a clip row; returns its file path (if any) for the caller to unlink.
    pub fn delete_clip(&self, id: i64) -> rusqlite::Result<Option<String>> {
        let path: Option<String> = self
            .conn
            .query_row("SELECT file_path FROM clips WHERE id = ?1", [id], |r| {
                r.get::<_, Option<String>>(0)
            })
            .ok()
            .flatten();
        self.conn.execute("DELETE FROM clips WHERE id = ?1", [id])?;
        Ok(path)
    }

    /// Delete a source and (via cascade) its clips. Returns the source path and
    /// all clip file paths, gathered before deletion, for the caller to unlink.
    pub fn delete_source(&self, id: i64) -> rusqlite::Result<(Option<String>, Vec<String>)> {
        let src: Option<String> = self
            .conn
            .query_row("SELECT file_path FROM source_videos WHERE id = ?1", [id], |r| {
                r.get::<_, String>(0)
            })
            .ok();
        let mut clip_paths = Vec::new();
        {
            let mut stmt = self
                .conn
                .prepare("SELECT file_path FROM clips WHERE source_id = ?1")?;
            let rows = stmt.query_map([id], |r| r.get::<_, Option<String>>(0))?;
            for r in rows.flatten().flatten() {
                clip_paths.push(r);
            }
        }
        self.conn
            .execute("DELETE FROM source_videos WHERE id = ?1", [id])?;
        Ok((src, clip_paths))
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

    // ---- Export jobs ----

    const JOB_COLS: &'static str = "id, project_id, clip_id, platform_preset, resolution, combine, \
        opener_id, ending_id, width, height, status, progress, output_path, error, created_at";

    pub fn insert_job(&self, project_id: i64, j: &NewJob) -> rusqlite::Result<ExportJob> {
        self.conn.execute(
            "INSERT INTO export_jobs
             (project_id, clip_id, platform_preset, resolution, combine, opener_id, ending_id, width, height)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                project_id, j.clip_id, j.platform_preset, j.resolution, j.combine as i64,
                j.opener_id, j.ending_id, j.width, j.height
            ],
        )?;
        self.get_job(self.conn.last_insert_rowid())
    }

    pub fn get_job(&self, id: i64) -> rusqlite::Result<ExportJob> {
        let sql = format!("SELECT {} FROM export_jobs WHERE id = ?1", Self::JOB_COLS);
        self.conn.query_row(&sql, [id], Self::map_job)
    }

    pub fn list_jobs(&self, project_id: i64) -> rusqlite::Result<Vec<ExportJob>> {
        let sql = format!(
            "SELECT {} FROM export_jobs WHERE project_id = ?1 ORDER BY id ASC",
            Self::JOB_COLS
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map([project_id], Self::map_job)?;
        rows.collect()
    }

    pub fn list_queued(&self, project_id: i64) -> rusqlite::Result<Vec<ExportJob>> {
        let sql = format!(
            "SELECT {} FROM export_jobs WHERE project_id = ?1 AND status = 'queued' ORDER BY id ASC",
            Self::JOB_COLS
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map([project_id], Self::map_job)?;
        rows.collect()
    }

    pub fn update_job(
        &self,
        id: i64,
        status: &str,
        progress: i64,
        output_path: Option<&str>,
        error: Option<&str>,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE export_jobs SET status = ?2, progress = ?3, output_path = ?4, error = ?5 WHERE id = ?1",
            rusqlite::params![id, status, progress, output_path, error],
        )?;
        Ok(())
    }

    pub fn delete_finished_jobs(&self, project_id: i64) -> rusqlite::Result<usize> {
        self.conn.execute(
            "DELETE FROM export_jobs WHERE project_id = ?1 AND status IN ('done','error')",
            [project_id],
        )
    }

    fn map_job(r: &rusqlite::Row) -> rusqlite::Result<ExportJob> {
        Ok(ExportJob {
            id: r.get(0)?,
            project_id: r.get(1)?,
            clip_id: r.get(2)?,
            platform_preset: r.get(3)?,
            resolution: r.get(4)?,
            combine: r.get::<_, i64>(5)? != 0,
            opener_id: r.get(6)?,
            ending_id: r.get(7)?,
            width: r.get(8)?,
            height: r.get(9)?,
            status: r.get(10)?,
            progress: r.get(11)?,
            output_path: r.get(12)?,
            error: r.get(13)?,
            created_at: r.get(14)?,
        })
    }
}
