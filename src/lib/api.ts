// Thin wrapper over Tauri commands (src-tauri/src/commands.rs).
// Falls back to mock data when running in a plain browser (vite dev without Tauri),
// so the UI is previewable without the Rust backend.
import type { Clip, ClipMode, Project, SourceVideo } from "../types";

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function getInvoke(): Promise<InvokeFn | null> {
  if (isDesktop()) {
    const mod = await import("@tauri-apps/api/core");
    return mod.invoke as InvokeFn;
  }
  return null;
}

export interface FfmpegStatus {
  found: boolean;
  ffmpeg_path: string;
  ffprobe_path: string;
  version: string | null;
}

// ---- Projects ----

let mockProjects: Project[] = [
  {
    id: 1,
    name: "Untitled Project",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    platform_preset: "yt_shorts",
  },
];

export async function listProjects(): Promise<Project[]> {
  const invoke = await getInvoke();
  return invoke ? invoke<Project[]>("list_projects") : mockProjects;
}

export async function createProject(name: string): Promise<Project> {
  const invoke = await getInvoke();
  if (!invoke) {
    const p: Project = {
      id: mockProjects.length + 1,
      name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      platform_preset: "yt_shorts",
    };
    mockProjects = [p, ...mockProjects];
    return p;
  }
  return invoke<Project>("create_project", { name });
}

export async function getStorageRoot(): Promise<string> {
  const invoke = await getInvoke();
  return invoke ? invoke<string>("get_storage_root") : "(browser preview — no central folder)";
}

export async function ffmpegStatus(): Promise<FfmpegStatus> {
  const invoke = await getInvoke();
  if (!invoke) {
    return { found: false, ffmpeg_path: "ffmpeg", ffprobe_path: "ffprobe", version: null };
  }
  return invoke<FfmpegStatus>("ffmpeg_status");
}

// ---- Import ----

/** Open a file picker for a video, then import+probe it into central storage. */
export async function pickAndImport(projectId: number): Promise<SourceVideo | null> {
  if (!isDesktop()) {
    // Browser preview: fabricate a 10-minute source.
    return {
      id: Math.floor(Math.random() * 1e6),
      project_id: projectId,
      file_path: "(preview)/sample_landscape.mp4",
      duration_sec: 600,
      width: 1920,
      height: 1080,
      fps: 30,
      created_at: new Date().toISOString(),
    };
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    multiple: false,
    filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "avi", "webm", "m4v"] }],
  });
  if (!selected || Array.isArray(selected)) return null;
  const invoke = (await getInvoke())!;
  return invoke<SourceVideo>("import_source", { projectId, srcPath: selected });
}

export async function listSources(projectId: number): Promise<SourceVideo[]> {
  const invoke = await getInvoke();
  return invoke ? invoke<SourceVideo[]>("list_sources", { projectId }) : [];
}

// ---- Clips ----

export async function listClips(projectId: number): Promise<Clip[]> {
  const invoke = await getInvoke();
  return invoke ? invoke<Clip[]>("list_clips", { projectId }) : [];
}

export interface GenerateClipsArgs {
  projectId: number;
  sourceId: number;
  mode: ClipMode;
  segmentSec?: number;
  segments?: [number, number][];
}

export async function generateClips(args: GenerateClipsArgs): Promise<Clip[]> {
  const invoke = await getInvoke();
  if (!invoke) {
    // Browser preview: fabricate clips from the requested windows.
    const seg = args.segmentSec ?? 60;
    const wins: [number, number][] =
      args.mode === "manual" && args.segments
        ? args.segments
        : Array.from({ length: 6 }, (_, i) => [i * seg, (i + 1) * seg] as [number, number]);
    return wins.map((w, i) => ({
      id: i + 1,
      project_id: args.projectId,
      source_id: args.sourceId,
      mode: args.mode,
      start_sec: w[0],
      end_sec: w[1],
      file_path: `(preview)/clip_${String(i + 1).padStart(3, "0")}.mp4`,
      created_at: new Date().toISOString(),
    }));
  }
  return invoke<Clip[]>("generate_clips", {
    projectId: args.projectId,
    sourceId: args.sourceId,
    mode: args.mode,
    segmentSec: args.segmentSec ?? null,
    segments: args.segments ?? null,
  });
}

export interface ClipProgress {
  done: number;
  total: number;
  label: string;
}

/** Subscribe to clip-generation progress. Returns an unlisten fn (no-op in browser). */
export async function onClipProgress(cb: (p: ClipProgress) => void): Promise<() => void> {
  if (!isDesktop()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<ClipProgress>("clip_progress", (e) => cb(e.payload));
}
