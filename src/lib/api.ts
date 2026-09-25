// Thin wrapper over Tauri commands (src-tauri/src/commands.rs).
// Falls back to mock data when running in a plain browser (vite dev without Tauri),
// so the UI is previewable without the Rust backend.
import type {
  AssetKind,
  Clip,
  ClipMode,
  ExportJob,
  LibraryAsset,
  Project,
  SourceVideo,
} from "../types";

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

// ---- Reformat ----

/** Reformat a clip to width×height (center-crop). Returns the output file path. */
export async function reformatClip(clipId: number, width: number, height: number): Promise<string> {
  const invoke = await getInvoke();
  if (!invoke) return `(preview)/export_${width}x${height}.mp4`;
  return invoke<string>("reformat_clip", { clipId, width, height });
}

export interface ReformatProgress {
  stage: "start" | "done";
  clip_id: number;
  output: string | null;
}

/** Subscribe to reformat progress. Returns an unlisten fn (no-op in browser). */
export async function onReformatProgress(cb: (p: ReformatProgress) => void): Promise<() => void> {
  if (!isDesktop()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<ReformatProgress>("reformat_progress", (e) => cb(e.payload));
}

// ---- Library (opener / ending) ----

let mockLibrary: LibraryAsset[] = [];

export async function listLibrary(kind: AssetKind): Promise<LibraryAsset[]> {
  const invoke = await getInvoke();
  if (!invoke) return mockLibrary.filter((a) => a.kind === kind);
  return invoke<LibraryAsset[]>("list_library", { kind });
}

export async function pickAndImportAsset(kind: AssetKind): Promise<LibraryAsset | null> {
  if (!isDesktop()) {
    const a: LibraryAsset = {
      id: Math.floor(Math.random() * 1e6),
      kind,
      name: `${kind}_sample.mp4`,
      file_path: `(preview)/library/${kind}/${kind}_sample.mp4`,
      created_at: new Date().toISOString(),
    };
    mockLibrary = [a, ...mockLibrary];
    return a;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    multiple: false,
    filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "avi", "webm", "m4v"] }],
  });
  if (!selected || Array.isArray(selected)) return null;
  const invoke = (await getInvoke())!;
  return invoke<LibraryAsset>("import_library_asset", { kind, srcPath: selected });
}

export async function deleteLibraryAsset(id: number): Promise<void> {
  const invoke = await getInvoke();
  if (!invoke) {
    mockLibrary = mockLibrary.filter((a) => a.id !== id);
    return;
  }
  return invoke<void>("delete_library_asset", { id });
}

// ---- Combine ----

export async function combineClip(args: {
  clipId: number;
  openerId?: number | null;
  endingId?: number | null;
  width: number;
  height: number;
}): Promise<string> {
  const invoke = await getInvoke();
  if (!invoke) return `(preview)/export_final_${args.width}x${args.height}.mp4`;
  return invoke<string>("combine_clip", {
    clipId: args.clipId,
    openerId: args.openerId ?? null,
    endingId: args.endingId ?? null,
    width: args.width,
    height: args.height,
  });
}

export interface CombineProgress {
  stage: "normalize" | "concat" | "done";
  clip_id: number;
  output: string | null;
}

export async function onCombineProgress(cb: (p: CombineProgress) => void): Promise<() => void> {
  if (!isDesktop()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<CombineProgress>("combine_progress", (e) => cb(e.payload));
}

// ---- Export queue ----

let mockJobs: ExportJob[] = [];

export interface EnqueueArgs {
  projectId: number;
  clipIds: number[];
  platformPreset: string;
  resolution: string;
  combine: boolean;
  openerId?: number | null;
  endingId?: number | null;
  width: number;
  height: number;
}

export async function enqueueExports(args: EnqueueArgs): Promise<ExportJob[]> {
  const invoke = await getInvoke();
  if (!invoke) {
    const jobs = args.clipIds.map((cid, i) => ({
      id: mockJobs.length + i + 1,
      project_id: args.projectId,
      clip_id: cid,
      platform_preset: args.platformPreset,
      resolution: args.resolution as ExportJob["resolution"],
      combine: args.combine,
      opener_id: args.combine ? args.openerId ?? null : null,
      ending_id: args.combine ? args.endingId ?? null : null,
      width: args.width,
      height: args.height,
      status: "queued" as const,
      progress: 0,
      output_path: null,
      error: null,
      created_at: new Date().toISOString(),
    }));
    mockJobs = [...mockJobs, ...jobs];
    return jobs;
  }
  return invoke<ExportJob[]>("enqueue_exports", {
    projectId: args.projectId,
    clipIds: args.clipIds,
    platformPreset: args.platformPreset,
    resolution: args.resolution,
    combine: args.combine,
    openerId: args.openerId ?? null,
    endingId: args.endingId ?? null,
    width: args.width,
    height: args.height,
  });
}

export async function listJobs(projectId: number): Promise<ExportJob[]> {
  const invoke = await getInvoke();
  return invoke ? invoke<ExportJob[]>("list_jobs", { projectId }) : mockJobs;
}

export async function runQueue(projectId: number): Promise<void> {
  const invoke = await getInvoke();
  if (!invoke) {
    // Browser preview: simulate sequential completion.
    for (const j of mockJobs) {
      if (j.status === "queued") {
        j.status = "done";
        j.progress = 100;
        j.output_path = `(preview)/exports/clip_${j.clip_id}_${j.width}x${j.height}.mp4`;
      }
    }
    return;
  }
  return invoke<void>("run_queue", { projectId });
}

export async function clearFinishedJobs(projectId: number): Promise<number> {
  const invoke = await getInvoke();
  if (!invoke) {
    const before = mockJobs.length;
    mockJobs = mockJobs.filter((j) => j.status !== "done" && j.status !== "error");
    return before - mockJobs.length;
  }
  return invoke<number>("clear_finished_jobs", { projectId });
}

export async function onJobProgress(cb: (j: ExportJob) => void): Promise<() => void> {
  if (!isDesktop()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<ExportJob>("job_progress", (e) => cb(e.payload));
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
