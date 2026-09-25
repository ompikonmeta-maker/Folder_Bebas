import { useEffect, useState } from "react";
import { isDesktop, listClips, listSources, openProjectExports } from "../lib/api";
import type { Clip, Project, SourceVideo } from "../types";

function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface Props {
  project: Project;
  onToggleSidebar: () => void;
  onGo: (key: "studio" | "clips" | "queue") => void;
}

export function ProjectOverview({ project, onToggleSidebar, onGo }: Props) {
  const [source, setSource] = useState<SourceVideo | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);

  useEffect(() => {
    listSources(project.id).then((s) => setSource(s[0] ?? null)).catch(() => {});
    listClips(project.id).then(setClips).catch(() => {});
  }, [project.id]);

  return (
    <section className="canvas">
      <div className="topbar">
        <button className="icon-btn" onClick={onToggleSidebar} aria-label="Toggle sidebar">≡</button>
        <div className="title-wrap">
          <h1 className="ellipsis">{project.name}</h1>
          <p>Project overview</p>
        </div>
      </div>

      <div className="panel">
        <h2 className="section-h">Source</h2>
        {source ? (
          <>
            <div className="source-name ellipsis-2">{source.file_path.split(/[\\/]/).pop()}</div>
            <div className="meta">
              <span>⏱ {source.duration_sec ? fmt(source.duration_sec) : "?"}</span>
              <span>▭ {source.width ?? "?"}×{source.height ?? "?"}</span>
              <span>🎞 {source.fps ? source.fps.toFixed(0) : "?"} fps</span>
              <span>✂ {clips.length} clip{clips.length === 1 ? "" : "s"}</span>
            </div>
          </>
        ) : (
          <p className="muted">No source imported yet. Open Clip Studio to add one.</p>
        )}
      </div>

      <div className="overview-actions">
        <button className="action-card" onClick={() => onGo("studio")}>
          <span className="ac-icon">✂</span>
          <b>Clip Studio</b>
          <small>Import, cut, reformat, combine &amp; export — step by step.</small>
        </button>
        <button className="action-card" onClick={() => onGo("clips")}>
          <span className="ac-icon">▷</span>
          <b>Clips ({clips.length})</b>
          <small>Preview the clips already made in this project.</small>
        </button>
        <button className="action-card" onClick={() => onGo("queue")}>
          <span className="ac-icon">⤓</span>
          <b>Export &amp; Queue</b>
          <small>Run and track batch exports.</small>
        </button>
        {isDesktop() && (
          <button className="action-card" onClick={() => openProjectExports(project.id)}>
            <span className="ac-icon">🗁</span>
            <b>Open exports folder</b>
            <small>Show finished files in the file manager.</small>
          </button>
        )}
      </div>
    </section>
  );
}
