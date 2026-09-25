// Shared types mirroring the SQLite schema (see src-tauri/src/db.rs).

export type ClipMode = "auto" | "manual";
export type AssetKind = "opener" | "ending";
export type Resolution = "SD" | "HD" | "UHD";
export type JobStatus = "queued" | "running" | "done" | "error";

export interface Project {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  platform_preset: string; // e.g. "yt_shorts"
}

export interface SourceVideo {
  id: number;
  project_id: number;
  file_path: string;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  created_at: string;
}

export interface Clip {
  id: number;
  project_id: number;
  source_id: number;
  mode: ClipMode;
  start_sec: number;
  end_sec: number;
  file_path: string | null;
  created_at: string;
}

export interface LibraryAsset {
  id: number;
  kind: AssetKind;
  name: string;
  file_path: string;
  created_at: string;
}

export interface ExportJob {
  id: number;
  project_id: number;
  clip_id: number | null;
  platform_preset: string;
  resolution: Resolution;
  combine: boolean;
  status: JobStatus;
  progress: number; // 0..100
  output_path: string | null;
  created_at: string;
}

export interface PlatformPreset {
  key: string;
  label: string;
  width: number;
  height: number;
  ratio: string; // "9:16" | "16:9"
}
