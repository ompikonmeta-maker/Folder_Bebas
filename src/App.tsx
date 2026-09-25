import { useEffect, useState } from "react";
import { Sidebar, type NavKey } from "./components/Sidebar";
import { ClipperWizard } from "./pages/ClipperWizard";
import { ProjectsPage } from "./pages/ProjectsPage";
import { LibraryPage } from "./pages/LibraryPage";
import { RenderQueue } from "./pages/RenderQueue";
import { SettingsPage } from "./pages/SettingsPage";
import { createProject, deleteProject, listProjects, renameProject } from "./lib/api";
import { applyTheme, getInitialTheme, type Theme } from "./lib/theme";
import type { Project } from "./types";

const ACTIVE_KEY = "clipforge.activeProject";

function loadActive(): number | null {
  try {
    const v = localStorage.getItem(ACTIVE_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}
function saveActive(id: number | null) {
  try {
    if (id == null) localStorage.removeItem(ACTIVE_KEY);
    else localStorage.setItem(ACTIVE_KEY, String(id));
  } catch {
    /* ignore */
  }
}

export default function App() {
  const [nav, setNav] = useState<NavKey>("projects");
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    const t = getInitialTheme();
    applyTheme(t);
    return t;
  });

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<number | null>(loadActive());

  async function refreshProjects(): Promise<Project[]> {
    const list = await listProjects().catch(() => []);
    setProjects(list);
    setActiveId((cur) => {
      const stillThere = cur != null && list.some((p) => p.id === cur);
      const next = stillThere ? cur : list[0]?.id ?? null;
      saveActive(next);
      return next;
    });
    return list;
  }

  useEffect(() => {
    refreshProjects();
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  function openProject(id: number) {
    setActiveId(id);
    saveActive(id);
    setNav("clipper");
  }

  async function handleCreate(name: string) {
    const p = await createProject(name).catch(() => null);
    await refreshProjects();
    if (p) openProject(p.id);
  }
  async function handleRename(id: number, name: string) {
    await renameProject(id, name).catch(() => {});
    refreshProjects();
  }
  async function handleDelete(id: number) {
    await deleteProject(id).catch(() => {});
    refreshProjects();
  }

  const activeProject = projects.find((p) => p.id === activeId) ?? null;
  const toggleSidebar = () => setCollapsed((v) => !v);

  function renderPage() {
    switch (nav) {
      case "projects":
        return (
          <ProjectsPage
            projects={projects}
            activeId={activeId}
            onOpen={openProject}
            onCreate={handleCreate}
            onRename={handleRename}
            onDelete={handleDelete}
            onToggleSidebar={toggleSidebar}
          />
        );
      case "library":
        return <LibraryPage onToggleSidebar={toggleSidebar} />;
      case "settings":
        return <SettingsPage theme={theme} onToggleTheme={toggleTheme} onToggleSidebar={toggleSidebar} />;
      case "clipper":
      case "queue":
        if (!activeProject) return <NoProject onToggleSidebar={toggleSidebar} onGo={() => setNav("projects")} />;
        return nav === "clipper" ? (
          <ClipperWizard
            projectId={activeProject.id}
            projectName={activeProject.name}
            onToggleSidebar={toggleSidebar}
            onGoToQueue={() => setNav("queue")}
          />
        ) : (
          <RenderQueue projectId={activeProject.id} onToggleSidebar={toggleSidebar} />
        );
    }
  }

  return (
    <div className={"app" + (collapsed ? " collapsed" : "")}>
      <Sidebar active={nav} onNavigate={setNav} theme={theme} onToggleTheme={toggleTheme} />
      {renderPage()}
    </div>
  );
}

function NoProject({ onToggleSidebar, onGo }: { onToggleSidebar: () => void; onGo: () => void }) {
  return (
    <section className="canvas">
      <div className="topbar">
        <button className="icon-btn" onClick={onToggleSidebar} aria-label="Toggle sidebar">≡</button>
        <div className="title-wrap">
          <h1>No project selected</h1>
          <p>Create or open a project first.</p>
        </div>
      </div>
      <button className="btn" onClick={onGo}>Go to Projects →</button>
    </section>
  );
}
