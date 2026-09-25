// Thin wrapper over Tauri commands (src-tauri/src/commands.rs).
// Falls back to no-op/mock data when running in a plain browser (vite dev without Tauri),
// so the UI is previewable without the Rust backend.
import type { Project } from "../types";

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

async function getInvoke(): Promise<InvokeFn | null> {
  // Tauri injects __TAURI_INTERNALS__ only inside the desktop shell.
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const mod = await import("@tauri-apps/api/core");
    return mod.invoke as InvokeFn;
  }
  return null;
}

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
  if (!invoke) return mockProjects;
  return invoke<Project[]>("list_projects");
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
  if (!invoke) return "(browser preview — no central folder)";
  return invoke<string>("get_storage_root");
}

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
