# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ClipForge Studio — an **offline, portable desktop app** that clips long
landscape videos into upload-ready social-media formats. Stack: **Tauri v2
(Rust) + React/TypeScript (Vite) + SQLite (rusqlite) + FFmpeg** (FFmpeg not yet
integrated). Target OS: **Windows**. All user data lives in one central folder,
never in browser storage.

## Commands

```bash
npm install          # install frontend deps
npm run dev          # frontend only in a browser — uses mock data (no Rust)
npm run build        # tsc typecheck + vite production build
npm run tauri:dev    # full desktop app (Vite + Rust)
npm run tauri:build  # Windows installer / .exe
```

- Rust check: `cd src-tauri && cargo check`. Needs GTK/webkit dev libs on
  Linux — install with `apt-get update && apt-get install -y libgtk-3-dev
  libwebkit2gtk-4.1-dev libsoup-3.0-dev` (the `apt-get update` matters; stale
  indexes 404). The real target is Windows.
- FFmpeg: the app locates `ffmpeg`/`ffprobe` via `CLIPFORGE_FFMPEG_DIR`, then a
  `binaries/` folder next to the exe, then PATH. Clipping is disabled in-UI when
  neither is found.
- No test runner is configured yet.

## Architecture

Two halves talk over Tauri's `invoke` bridge:

- **Frontend** (`src/`): React. `App.tsx` holds nav + theme state and renders
  `Sidebar` + `Workspace`. `lib/api.ts` is the single boundary to the backend —
  it detects `__TAURI_INTERNALS__` and, when absent (plain browser), returns
  mock data so the UI is fully previewable without Rust. `lib/presets.ts`
  defines the platform output presets and resolutions. `types.ts` mirrors the
  SQLite schema.
- **Backend** (`src-tauri/src/`): `lib.rs` builds the Tauri app, initializes the
  central folder + SQLite on `setup`, and holds both in `AppState` (a `Mutex<Db>`
  plus the storage root). `storage.rs` creates/owns the central folder layout.
  `db.rs` owns the schema (idempotent migrate on every launch) and queries.
  `ffmpeg.rs` locates the binaries and runs probe/cut. `commands.rs` exposes
  commands; register new ones in BOTH `commands.rs` and the `generate_handler!`
  list in `lib.rs`. Long ffmpeg work emits progress events (`clip_progress`,
  `reformat_progress`, `combine_progress`); the frontend subscribes via the
  matching `on*Progress` helpers in `lib/api.ts`. Combine normalizes each part
  (opener/clip/ending) to a common shape — synthesizing silent audio when a
  part has none — then concatenates with stream copy.

## Conventions

- **All colors live in `src/styles/tokens.css`** as CSS variables (steel-blue
  `--primary` + peach `--accent`, cool neutrals). Never hardcode colors in
  components — add/adjust tokens. Theme switches via `data-theme` on `<html>`
  (see `lib/theme.ts`); every token is defined for light, system-dark, and
  explicit-dark.
- The **central storage folder** (`VideoClipperData/` with `sources/`,
  `library/opener|ending/`, `clips/`, `exports/`, `app.db`) is the source of
  truth. Media files and `*.db` must never be committed (see `.gitignore`).
- SQLite schema changes go in `db.rs::migrate` and must stay idempotent; keep
  `types.ts` in sync.
