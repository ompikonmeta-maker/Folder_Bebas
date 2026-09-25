import { useEffect, useMemo, useState } from "react";
import { Dropdown } from "../components/Dropdown";
import { Card } from "../components/Card";
import { RESOLUTIONS } from "../lib/presets";
import {
  ffmpegStatus,
  generateClips,
  getStorageRoot,
  isDesktop,
  listClips,
  listSources,
  onClipProgress,
  pickAndImport,
  type ClipProgress,
  type FfmpegStatus,
} from "../lib/api";
import type { Clip, ClipMode, SourceVideo } from "../types";

const PROJECT_ID = 1; // single active project for M2

function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

interface Props {
  onToggleSidebar: () => void;
}

export function Workspace({ onToggleSidebar }: Props) {
  const [preset, setPreset] = useState("yt_shorts");
  const [res, setRes] = useState("HD");
  const [storageRoot, setStorageRoot] = useState("…");
  const [ff, setFf] = useState<FfmpegStatus | null>(null);

  const [source, setSource] = useState<SourceVideo | null>(null);
  const [mode, setMode] = useState<ClipMode>("auto");
  const [lenKey, setLenKey] = useState("1"); // "1" | "2" | "3" | "custom"
  const [customMin, setCustomMin] = useState("1.5");
  const [ranges, setRanges] = useState<[number, number][]>([[0, 60]]);

  const [clips, setClips] = useState<Clip[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ClipProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStorageRoot().then(setStorageRoot).catch(() => setStorageRoot("(unavailable)"));
    ffmpegStatus().then(setFf).catch(() => setFf(null));
    listSources(PROJECT_ID).then((s) => setSource(s[0] ?? null)).catch(() => {});
    listClips(PROJECT_ID).then(setClips).catch(() => {});
    const un = onClipProgress(setProgress);
    return () => {
      un.then((f) => f());
    };
  }, []);

  const segmentSec = useMemo(() => {
    if (lenKey === "custom") return Math.max(1, parseFloat(customMin) || 1) * 60;
    return parseInt(lenKey, 10) * 60;
  }, [lenKey, customMin]);

  async function handleImport() {
    setError(null);
    try {
      const s = await pickAndImport(PROJECT_ID);
      if (s) setSource(s);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleGenerate() {
    if (!source) {
      setError("Import a source video first.");
      return;
    }
    setError(null);
    setBusy(true);
    setProgress(null);
    try {
      const made = await generateClips({
        projectId: PROJECT_ID,
        sourceId: source.id,
        mode,
        segmentSec: mode === "auto" ? segmentSec : undefined,
        segments: mode === "manual" ? ranges.filter((r) => r[1] > r[0]) : undefined,
      });
      setClips((prev) => [...prev, ...made]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const estCount =
    mode === "auto" && source?.duration_sec
      ? Math.ceil(source.duration_sec / segmentSec)
      : ranges.filter((r) => r[1] > r[0]).length;

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

      {ff && !ff.found && (
        <div className="banner warn">
          FFmpeg not found. Clipping is disabled until it's installed or bundled.
          Set <code>CLIPFORGE_FFMPEG_DIR</code> or place binaries next to the app.
        </div>
      )}
      {error && <div className="banner danger">{error}</div>}

      <div className="grid">
        {/* 1 — Import */}
        <Card step="① Import" title="Source video" index={0}>
          {source ? (
            <>
              <p style={{ marginBottom: 8 }}>
                {source.file_path.split(/[\\/]/).pop()}
              </p>
              <div className="meta">
                <span>⏱ {source.duration_sec ? fmt(source.duration_sec) : "?"}</span>
                <span>▭ {source.width ?? "?"}×{source.height ?? "?"}</span>
                <span>🎞 {source.fps ? source.fps.toFixed(0) : "?"} fps</span>
              </div>
              <button className="btn tonal" style={{ marginTop: 14 }} onClick={handleImport}>
                Replace
              </button>
            </>
          ) : (
            <>
              <p>Add a long landscape video. It's copied to the central folder and probed.</p>
              <button className="btn" style={{ marginTop: 16 }} onClick={handleImport}>
                ＋ Import video
              </button>
            </>
          )}
        </Card>

        {/* 2 — Clip */}
        <Card step="② Clip" title="Cutting mode" index={1}>
          <div className="seg">
            <button className={"seg-btn" + (mode === "auto" ? " on" : "")} onClick={() => setMode("auto")}>
              Auto-split
            </button>
            <button className={"seg-btn" + (mode === "manual" ? " on" : "")} onClick={() => setMode("manual")}>
              Manual
            </button>
          </div>

          {mode === "auto" ? (
            <>
              <div className="chips">
                {["1", "2", "3", "custom"].map((v) => (
                  <span key={v} className={"chip" + (lenKey === v ? " on" : "")} onClick={() => setLenKey(v)}>
                    {v === "custom" ? "Custom" : `${v} min`}
                  </span>
                ))}
              </div>
              {lenKey === "custom" && (
                <label className="field">
                  Minutes per clip
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={customMin}
                    onChange={(e) => setCustomMin(e.target.value)}
                  />
                </label>
              )}
            </>
          ) : (
            <div className="ranges">
              {ranges.map((r, i) => (
                <div className="range-row" key={i}>
                  <input
                    type="number"
                    value={r[0]}
                    min="0"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setRanges((rs) => rs.map((x, j) => (j === i ? [v, x[1]] : x)));
                    }}
                  />
                  <span>→</span>
                  <input
                    type="number"
                    value={r[1]}
                    min="0"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setRanges((rs) => rs.map((x, j) => (j === i ? [x[0], v] : x)));
                    }}
                  />
                  <button
                    className="mini"
                    onClick={() => setRanges((rs) => rs.filter((_, j) => j !== i))}
                    aria-label="Remove range"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button className="btn tonal" onClick={() => setRanges((rs) => [...rs, [0, 60]])}>
                ＋ Add range (sec)
              </button>
            </div>
          )}

          <p className="hint-line">≈ {estCount} clip{estCount === 1 ? "" : "s"}</p>
          <button className="btn" style={{ marginTop: 12 }} disabled={busy || (!!ff && !ff.found)} onClick={handleGenerate}>
            {busy ? "Generating…" : "Generate clips →"}
          </button>
          {progress && busy && (
            <div className="bar">
              <i style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          )}
        </Card>

        {/* 3 — Reformat (M3) */}
        <Card step="③ Reformat" title="Portrait crop" index={2}>
          <p>Landscape → portrait via center-crop, following the preset above. (M3)</p>
          <div className="thumb" style={{ aspectRatio: "9/16", maxHeight: 150, marginInline: "auto" }}>
            9:16 preview
          </div>
        </Card>

        {/* 4 — Combine (M4) */}
        <Card step="④ Combine" title="Opener + ending" index={3}>
          <p>Optional per project. Pick templates from the Library. (M4)</p>
          <div className="chips">
            <span className="chip">Opener: none</span>
            <span className="chip">Ending: none</span>
          </div>
        </Card>

        {/* 5 — Export (M5) */}
        <Card step="⑤ Export" title="Resolution" index={4}>
          <p>Render upload-ready files into exports/. (M5)</p>
          <div className="chips">
            {RESOLUTIONS.map((r) => (
              <span key={r.key} className={"chip" + (res === r.key ? " on" : "")} onClick={() => setRes(r.key)}>
                {r.label}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* Generated clips */}
      <h2 className="section-h">Clips ({clips.length})</h2>
      {clips.length === 0 ? (
        <p className="empty">No clips yet. Import a video and generate.</p>
      ) : (
        <div className="clip-grid">
          {clips.map((c) => (
            <div className="clip" key={c.id}>
              <div className="clip-thumb">▶</div>
              <div>
                <b>{c.file_path?.split(/[\\/]/).pop() ?? `clip ${c.id}`}</b>
                <small>
                  {fmt(c.start_sec)}–{fmt(c.end_sec)} · {fmt(c.end_sec - c.start_sec)} · {c.mode}
                </small>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
