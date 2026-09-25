import { useEffect, useState } from "react";
import { clipThumbnail, deleteClip, isDesktop, listClips, openProjectExports } from "../lib/api";
import type { Clip } from "../types";

function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface Props {
  projectId: number;
  projectName: string;
  onToggleSidebar: () => void;
}

export function ClipsPreview({ projectId, projectName, onToggleSidebar }: Props) {
  const [clips, setClips] = useState<Clip[]>([]);

  function refresh() {
    listClips(projectId).then(setClips).catch(() => {});
  }
  useEffect(refresh, [projectId]);

  async function remove(id: number) {
    try {
      await deleteClip(id);
      setClips((cs) => cs.filter((c) => c.id !== id));
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="canvas">
      <div className="topbar">
        <button className="icon-btn" onClick={onToggleSidebar} aria-label="Toggle sidebar">≡</button>
        <div className="title-wrap">
          <h1 className="ellipsis">{projectName}</h1>
          <p>Clips preview · {clips.length} clip{clips.length === 1 ? "" : "s"}</p>
        </div>
        <div className="grow" />
        {isDesktop() && (
          <button className="btn tonal" onClick={() => openProjectExports(projectId)}>Open exports folder</button>
        )}
      </div>

      {clips.length === 0 ? (
        <p className="empty">No clips yet. Use Clip Studio to generate clips for this project.</p>
      ) : (
        <div className="preview-grid">
          {clips.map((c) => (
            <PreviewCard key={c.id} clip={c} onDelete={() => remove(c.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function PreviewCard({ clip, onDelete }: { clip: Clip; onDelete: () => void }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    clipThumbnail(clip.id).then((t) => alive && setThumb(t));
    return () => {
      alive = false;
    };
  }, [clip.id]);

  return (
    <div className="preview-card">
      <div className="preview-thumb" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>
        {!thumb && "▶"}
      </div>
      <div className="preview-info">
        <b className="ellipsis">{clip.file_path?.split(/[\\/]/).pop() ?? `clip ${clip.id}`}</b>
        <small>{fmt(clip.start_sec)}–{fmt(clip.end_sec)} · {fmt(clip.end_sec - clip.start_sec)}</small>
      </div>
      <button className="mini" title="Delete clip" onClick={onDelete}>✕</button>
    </div>
  );
}
