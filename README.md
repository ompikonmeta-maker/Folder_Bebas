# ClipForge Studio

Offline, portable desktop app for turning long landscape videos into
upload-ready social-media clips. Built with **Tauri (Rust) + React/TypeScript +
SQLite + FFmpeg**. All user data — the database and every media file — lives in
one central folder, never in the browser.

> Status: **M1 scaffold** — UI shell (MD3 Expressive), theming, and the SQLite
> layer are in place. Video processing (FFmpeg) lands in later milestones.

## Features (planned)

- **Input** — import a long landscape video.
- **Clip** — auto-split into equal lengths (1/2/3 min or custom) **or** mark
  segments manually.
- **Reformat** — landscape → portrait via center-crop for platform presets
  (YouTube Shorts, Reels, TikTok, WA/IG Story) plus 16:9 YouTube.
- **Combine** (optional per project) — prepend an opener and append an ending
  credit from a user-supplied library.
- **Export** — SD (480p) / HD (1080p) / Ultra HD (4K).

## Central storage

Created on first launch under the OS app-data dir:

```
VideoClipperData/
├── app.db              # SQLite: projects, sources, clips, library, jobs
├── sources/            # imported long videos
├── library/opener/     # opener templates (user-supplied)
├── library/ending/     # ending templates (user-supplied)
├── clips/              # generated clips
└── exports/            # final upload-ready files
```

## Develop

Prerequisites: Node 18+, Rust (stable), and the
[Tauri v2 system deps](https://tauri.app/start/prerequisites/).

```bash
npm install            # frontend deps
npm run tauri:dev      # run the desktop app (spawns Vite + Rust)
npm run dev            # frontend only, in a browser (uses mock data)
npm run tauri:build    # produce a Windows installer / .exe
```

Generate app icons once before `tauri:build` (see `src-tauri/icons/README.md`).

### Get the Windows installer without a Windows machine

The Windows `.exe` can only be built on Windows (MSVC + WebView2 + NSIS). A
GitHub Actions workflow does this for you: `.github/workflows/build-windows.yml`
runs on a Windows runner on every push to the working branch, or on demand from
the **Actions** tab (**Run workflow**). When it finishes, download the installer
from the run's **Artifacts** section (`clipforge-studio-installer`) and the
standalone binary (`clipforge-studio-portable`).

FFmpeg is **bundled** by the workflow: it downloads a static Windows build and
packages `ffmpeg.exe`/`ffprobe.exe` as Tauri resources, so the installed app and
the portable build are fully self-contained — no separate FFmpeg install needed.
(The binaries are fetched in CI and never committed; for a local Windows build,
drop them into `src-tauri/binaries/` first.) The resolver still honors a
`CLIPFORGE_FFMPEG_DIR` override and falls back to `PATH`.

## Architecture

- `src/` — React UI. `styles/tokens.css` holds the entire color system
  (steel-blue + peach); change colors there only. `lib/api.ts` wraps Tauri
  commands and falls back to mock data in a plain browser.
- `src-tauri/src/` — Rust backend. `storage.rs` owns the central folder,
  `db.rs` owns the SQLite schema + queries, `commands.rs` exposes them to the
  frontend, `lib.rs` wires state and the command handler.
