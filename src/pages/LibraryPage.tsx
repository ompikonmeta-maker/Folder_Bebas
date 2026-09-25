import { useEffect, useState } from "react";
import { deleteLibraryAsset, listLibrary, pickAndImportAsset } from "../lib/api";
import type { AssetKind, LibraryAsset } from "../types";

interface Props {
  onToggleSidebar: () => void;
}

export function LibraryPage({ onToggleSidebar }: Props) {
  const [openers, setOpeners] = useState<LibraryAsset[]>([]);
  const [endings, setEndings] = useState<LibraryAsset[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    listLibrary("opener").then(setOpeners).catch(() => {});
    listLibrary("ending").then(setEndings).catch(() => {});
  }
  useEffect(refresh, []);

  async function add(kind: AssetKind) {
    setError(null);
    try {
      const a = await pickAndImportAsset(kind);
      if (a) refresh();
    } catch (e) {
      setError(String(e));
    }
  }
  async function remove(id: number) {
    try {
      await deleteLibraryAsset(id);
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  const section = (title: string, kind: AssetKind, items: LibraryAsset[]) => (
    <div className="panel">
      <div className="section-bar">
        <h2 className="section-h">{title} ({items.length})</h2>
        <button className="btn" onClick={() => add(kind)}>＋ Import {title.toLowerCase()}</button>
      </div>
      {items.length === 0 ? (
        <p className="empty">None yet. Import a short {title.toLowerCase()} clip to reuse across projects.</p>
      ) : (
        <div className="clip-grid">
          {items.map((a) => (
            <div className="clip" key={a.id}>
              <div className="clip-thumb">{kind === "opener" ? "⭰" : "⭲"}</div>
              <div className="clip-body">
                <b>{a.name}</b>
                <small>{a.file_path}</small>
              </div>
              <div className="clip-actions">
                <button className="mini" title="Remove" onClick={() => remove(a.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <section className="canvas">
      <div className="topbar">
        <button className="icon-btn" onClick={onToggleSidebar} aria-label="Toggle sidebar">≡</button>
        <div className="title-wrap">
          <h1>Library</h1>
          <p>Opener &amp; ending templates, shared across all projects.</p>
        </div>
      </div>
      {error && <div className="banner danger">{error}</div>}
      {section("Openers", "opener", openers)}
      {section("Endings", "ending", endings)}
    </section>
  );
}
