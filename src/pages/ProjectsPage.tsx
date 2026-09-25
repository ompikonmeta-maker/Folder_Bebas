import { useState } from "react";
import type { Project } from "../types";

interface Props {
  projects: Project[];
  activeId: number | null;
  onOpen: (id: number) => void;
  onCreate: (name: string) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  onToggleSidebar: () => void;
}

export function ProjectsPage({ projects, activeId, onOpen, onCreate, onRename, onDelete, onToggleSidebar }: Props) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);

  function submitNew() {
    const n = newName.trim();
    if (!n) return;
    onCreate(n);
    setNewName("");
  }

  return (
    <section className="canvas">
      <div className="topbar">
        <button className="icon-btn" onClick={onToggleSidebar} aria-label="Toggle sidebar">≡</button>
        <div className="title-wrap">
          <h1>Projects</h1>
          <p>Each project holds one long video and its clips, in its own folder.</p>
        </div>
      </div>

      <div className="new-project">
        <input
          className="select"
          placeholder="New project name (e.g. Daredevil S01E01)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitNew()}
        />
        <button className="btn" onClick={submitNew} disabled={!newName.trim()}>＋ New project</button>
      </div>

      {projects.length === 0 ? (
        <p className="empty">No projects yet. Create one above to start.</p>
      ) : (
        <div className="project-grid">
          {projects.map((p) => (
            <div className={"project-card" + (p.id === activeId ? " active" : "")} key={p.id}>
              {editingId === p.id ? (
                <input
                  className="select"
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editName.trim()) {
                      onRename(p.id, editName.trim());
                      setEditingId(null);
                    }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onBlur={() => setEditingId(null)}
                />
              ) : (
                <b className="ellipsis" onDoubleClick={() => { setEditingId(p.id); setEditName(p.name); }}>
                  {p.name}
                </b>
              )}
              <small>updated {p.updated_at?.slice(0, 16).replace("T", " ")}</small>
              <div className="btn-row">
                <button className="btn" onClick={() => onOpen(p.id)}>Open</button>
                <button className="btn tonal" onClick={() => { setEditingId(p.id); setEditName(p.name); }}>Rename</button>
                {confirmId === p.id ? (
                  <button className="btn tonal danger-btn" onClick={() => { onDelete(p.id); setConfirmId(null); }}>Confirm delete?</button>
                ) : (
                  <button className="btn tonal danger-btn" onClick={() => setConfirmId(p.id)}>Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
