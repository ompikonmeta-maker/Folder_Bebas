import { useEffect, useState } from "react";
import { Dropdown } from "../components/Dropdown";
import { Card } from "../components/Card";
import { RESOLUTIONS } from "../lib/presets";
import { getStorageRoot, isDesktop } from "../lib/api";

interface Props {
  onToggleSidebar: () => void;
}

// The empty working canvas: shows the 5-step clip → export pipeline for the active project.
export function Workspace({ onToggleSidebar }: Props) {
  const [preset, setPreset] = useState("yt_shorts");
  const [clipLen, setClipLen] = useState("1");
  const [res, setRes] = useState("HD");
  const [storageRoot, setStorageRoot] = useState("…");

  useEffect(() => {
    getStorageRoot().then(setStorageRoot).catch(() => setStorageRoot("(unavailable)"));
  }, []);

  return (
    <section className="canvas">
      <div className="topbar">
        <button className="icon-btn" onClick={onToggleSidebar} title="Toggle sidebar" aria-label="Toggle sidebar">
          ≡
        </button>
        <div className="title-wrap">
          <h1>Untitled Project</h1>
          <p>
            {isDesktop() ? "Central storage: " : "Preview mode — "}
            {storageRoot}
          </p>
        </div>
        <div className="grow" />
        <Dropdown value={preset} onChange={setPreset} />
      </div>

      <div className="grid">
        <Card step="① Import" title="Source video" index={0}>
          <p>Add a long landscape video from disk. Metadata (duration, resolution, fps) is saved to SQLite.</p>
          <div className="thumb">＋ Drop / Browse file</div>
        </Card>

        <Card step="② Clip" title="Cutting mode" index={1}>
          <p>Auto-split into equal lengths, or mark segments manually on a timeline.</p>
          <div className="chips">
            {["1", "2", "3", "custom", "manual"].map((v) => (
              <span
                key={v}
                className={"chip" + (clipLen === v ? " on" : "")}
                onClick={() => setClipLen(v)}
              >
                {v === "custom" ? "Custom" : v === "manual" ? "Manual" : `Auto ${v} min`}
              </span>
            ))}
          </div>
        </Card>

        <Card step="③ Reformat" title="Portrait crop" index={2}>
          <p>Landscape → portrait via center-crop, following the platform preset above.</p>
          <div className="thumb" style={{ aspectRatio: "9/16", maxHeight: 150, marginInline: "auto" }}>
            9:16 preview
          </div>
        </Card>

        <Card step="④ Combine" title="Opener + ending" index={3}>
          <p>Optional per project. Pick templates from the Library to prepend and append.</p>
          <div className="chips">
            <span className="chip on">Opener: none yet</span>
            <span className="chip on">Ending: none yet</span>
          </div>
        </Card>

        <Card step="⑤ Export" title="Resolution" index={4}>
          <p>Render the upload-ready file into the exports/ folder.</p>
          <div className="chips">
            {RESOLUTIONS.map((r) => (
              <span key={r.key} className={"chip" + (res === r.key ? " on" : "")} onClick={() => setRes(r.key)}>
                {r.label}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, gap: 12 }}>
            <button className="btn tonal">Preview</button>
            <button className="btn">Render →</button>
          </div>
        </Card>
      </div>
    </section>
  );
}
