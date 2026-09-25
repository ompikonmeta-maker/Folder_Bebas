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
}
