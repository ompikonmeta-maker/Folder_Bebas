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

- Rust check: `cd src-tauri && cargo check`. Requires Tauri system deps; on
  Linux that means GTK/webkit dev libraries, so a Linux CI box without them
  fails at the `gdk-sys` build step even when the code is correct — this is
  expected, the real target is Windows.
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
  `commands.rs` exposes commands; register new ones in BOTH `commands.rs` and
  the `generate_handler!` list in `lib.rs`.

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
