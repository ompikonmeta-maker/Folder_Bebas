import { useEffect, useState } from "react";
import { ffmpegStatus, getStorageRoot, isDesktop, type FfmpegStatus } from "../lib/api";
import type { Theme } from "../lib/theme";

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
}

export function SettingsPage({ theme, onToggleTheme, onToggleSidebar }: Props) {
  const [root, setRoot] = useState("…");
  const [ff, setFf] = useState<FfmpegStatus | null>(null);

  useEffect(() => {
    getStorageRoot().then(setRoot).catch(() => setRoot("(unavailable)"));
    ffmpegStatus().then(setFf).catch(() => setFf(null));
  }, []);

  return (
    <section className="canvas">
      <div className="topbar">
        <button className="icon-btn" onClick={onToggleSidebar} aria-label="Toggle sidebar">≡</button>
        <div className="title-wrap">
          <h1>Settings</h1>
          <p>Storage, engine, and appearance.</p>
        </div>
      </div>

      <div className="panel">
        <h2 className="section-h">Central storage</h2>
        <p className="muted">All projects, media, and the database live here.</p>
        <div className="kv"><span>Folder</span><code className="path">{root}</code></div>
      </div>

      <div className="panel">
        <h2 className="section-h">FFmpeg engine</h2>
        {ff ? (
          ff.found ? (
            <>
              <div className="kv"><span>Status</span><span className="pill done">found</span></div>
              <div className="kv"><span>Version</span><code className="path">{ff.version}</code></div>
              <div className="kv"><span>Path</span><code className="path">{ff.ffmpeg_path}</code></div>
            </>
          ) : (
            <>
              <div className="kv"><span>Status</span><span className="pill error">not found</span></div>
              <p className="muted">The packaged app bundles FFmpeg. If missing, set <code>CLIPFORGE_FFMPEG_DIR</code> or add it to PATH.</p>
            </>
          )
        ) : (
          <p className="muted">{isDesktop() ? "Checking…" : "Preview mode — no engine."}</p>
        )}
      </div>

      <div className="panel">
        <h2 className="section-h">Appearance</h2>
        <div className="kv">
          <span>Theme</span>
          <button className="btn tonal" onClick={onToggleTheme}>{theme === "dark" ? "Dark" : "Light"} — switch</button>
        </div>
      </div>
    </section>
  );
}
