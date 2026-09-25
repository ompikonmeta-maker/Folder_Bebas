import { useEffect, useMemo, useState } from "react";
import { Dropdown } from "../components/Dropdown";
import { Card } from "../components/Card";
import { RESOLUTIONS, presetByKey, targetDims } from "../lib/presets";
import {
  combineClip,
  deleteLibraryAsset,
  enqueueExports,
  ffmpegStatus,
  generateClips,
  getStorageRoot,
  isDesktop,
  listClips,
  listLibrary,
  listSources,
  onClipProgress,
  pickAndImport,
  pickAndImportAsset,
  reformatClip,
  type ClipProgress,
  type FfmpegStatus,
} from "../lib/api";
import type { AssetKind, Clip, ClipMode, LibraryAsset, SourceVideo } from "../types";

const PROJECT_ID = 1; // single active project for M2

function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

interface Props {
  onToggleSidebar: () => void;
  onGoToQueue: () => void;
}

export function Workspace({ onToggleSidebar, onGoToQueue }: Props) {
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

  const [formatting, setFormatting] = useState<Set<number>>(new Set());
  const [outputs, setOutputs] = useState<Record<number, string>>({});

  const [openers, setOpeners] = useState<LibraryAsset[]>([]);
  const [endings, setEndings] = useState<LibraryAsset[]>([]);
  const [openerId, setOpenerId] = useState<number | null>(null);
  const [endingId, setEndingId] = useState<number | null>(null);
  const [combining, setCombining] = useState<Set<number>>(new Set());
  const [finals, setFinals] = useState<Record<number, string>>({});

  const [combineOnExport, setCombineOnExport] = useState(true);

  const dims = useMemo(() => targetDims(preset, res), [preset, res]);

  useEffect(() => {
    getStorageRoot().then(setStorageRoot).catch(() => setStorageRoot("(unavailable)"));
    ffmpegStatus().then(setFf).catch(() => setFf(null));
    listSources(PROJECT_ID).then((s) => setSource(s[0] ?? null)).catch(() => {});
    listClips(PROJECT_ID).then(setClips).catch(() => {});
    refreshLibrary();
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

  async function refreshLibrary() {
    listLibrary("opener").then(setOpeners).catch(() => {});
    listLibrary("ending").then(setEndings).catch(() => {});
  }

  async function handleImportAsset(kind: AssetKind) {
    setError(null);
    try {
      const a = await pickAndImportAsset(kind);
      if (a) {
        await refreshLibrary();
        if (kind === "opener") setOpenerId(a.id);
        else setEndingId(a.id);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDeleteAsset(kind: AssetKind, id: number) {
    try {
      await deleteLibraryAsset(id);
      if (kind === "opener" && openerId === id) setOpenerId(null);
      if (kind === "ending" && endingId === id) setEndingId(null);
      await refreshLibrary();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCombine(clipIds: number[]) {
    if (clipIds.length === 0) {
      setError("Generate clips first.");
      return;
    }
    setError(null);
    setCombining((s) => new Set([...s, ...clipIds]));
    try {
      for (const id of clipIds) {
        const out = await combineClip({ clipId: id, openerId, endingId, width: dims.w, height: dims.h });
        setFinals((f) => ({ ...f, [id]: out }));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCombining((s) => {
        const n = new Set(s);
        clipIds.forEach((id) => n.delete(id));
        return n;
      });
    }
  }

  async function handleQueueExport() {
    if (clips.length === 0) {
      setError("Generate clips first.");
      return;
    }
    setError(null);
    try {
      await enqueueExports({
        projectId: PROJECT_ID,
        clipIds: clips.map((c) => c.id),
        platformPreset: preset,
        resolution: res,
        combine: combineOnExport,
        openerId,
        endingId,
        width: dims.w,
        height: dims.h,
      });
      onGoToQueue();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleReformat(clipIds: number[]) {
    if (clipIds.length === 0) {
      setError("Generate clips first.");
      return;
    }
    setError(null);
    setFormatting((s) => new Set([...s, ...clipIds]));
    try {
      for (const id of clipIds) {
        const out = await reformatClip(id, dims.w, dims.h);
        setOutputs((o) => ({ ...o, [id]: out }));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setFormatting((s) => {
        const n = new Set(s);
        clipIds.forEach((id) => n.delete(id));
        return n;
      });
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

        {/* 3 — Reformat */}
        <Card step="③ Reformat" title="Portrait crop" index={2}>
          <p>
            Center-crop to {presetByKey(preset).label} ({presetByKey(preset).ratio}).
          </p>
          <div className="chips">
            {RESOLUTIONS.map((r) => (
              <span key={r.key} className={"chip" + (res === r.key ? " on" : "")} onClick={() => setRes(r.key)}>
                {r.label}
              </span>
            ))}
          </div>
          <div
            className="thumb"
            style={{
              aspectRatio: `${dims.w}/${dims.h}`,
              maxHeight: 150,
              marginInline: "auto",
            }}
          >
            {dims.w}×{dims.h}
          </div>
          <button
            className="btn"
            style={{ marginTop: 14 }}
            disabled={clips.length === 0 || (!!ff && !ff.found) || formatting.size > 0}
            onClick={() => handleReformat(clips.map((c) => c.id))}
          >
            {formatting.size > 0 ? `Formatting ${formatting.size}…` : `Format all ${clips.length} clips →`}
          </button>
        </Card>

        {/* 4 — Combine */}
        <Card step="④ Combine" title="Opener + ending" index={3}>
          <p>Optional. Prepend an opener and append an ending, normalized to {dims.w}×{dims.h}.</p>

          <AssetPicker
            label="Opener"
            assets={openers}
            selected={openerId}
            onSelect={setOpenerId}
            onImport={() => handleImportAsset("opener")}
            onDelete={(id) => handleDeleteAsset("opener", id)}
          />
          <AssetPicker
            label="Ending"
            assets={endings}
            selected={endingId}
            onSelect={setEndingId}
            onImport={() => handleImportAsset("ending")}
            onDelete={(id) => handleDeleteAsset("ending", id)}
          />

          <button
            className="btn"
            style={{ marginTop: 14 }}
            disabled={clips.length === 0 || (!!ff && !ff.found) || combining.size > 0}
            onClick={() => handleCombine(clips.map((c) => c.id))}
          >
            {combining.size > 0 ? `Combining ${combining.size}…` : `Combine all ${clips.length} →`}
          </button>
        </Card>

        {/* 5 — Export */}
        <Card step="⑤ Export" title="Batch export" index={4}>
          <p>
            Queue every clip at {presetByKey(preset).label} · {res} ({dims.w}×{dims.h}) into exports/.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={combineOnExport}
              onChange={(e) => setCombineOnExport(e.target.checked)}
            />
            Include opener + ending
          </label>
          <div className="meta" style={{ marginTop: 10 }}>
            <span>✂ {Object.keys(outputs).length} reformatted</span>
            <span>▣ {Object.keys(finals).length} combined</span>
          </div>
          <button
            className="btn"
            style={{ marginTop: 12 }}
            disabled={clips.length === 0 || (!!ff && !ff.found)}
            onClick={handleQueueExport}
          >
            Queue export ({clips.length}) →
          </button>
        </Card>
      </div>

      {/* Generated clips */}
      <h2 className="section-h">Clips ({clips.length})</h2>
      {clips.length === 0 ? (
        <p className="empty">No clips yet. Import a video and generate.</p>
      ) : (
        <div className="clip-grid">
          {clips.map((c) => {
            const isFormatting = formatting.has(c.id);
            const isCombining = combining.has(c.id);
            const out = outputs[c.id];
            const fin = finals[c.id];
            const disabled = !!ff && !ff.found;
            return (
              <div className="clip" key={c.id}>
                <div className="clip-thumb">▶</div>
                <div className="clip-body">
                  <b>{c.file_path?.split(/[\\/]/).pop() ?? `clip ${c.id}`}</b>
                  <small>
                    {fmt(c.start_sec)}–{fmt(c.end_sec)} · {fmt(c.end_sec - c.start_sec)} · {c.mode}
                  </small>
                  {out && <small className="ok">✂ {out.split(/[\\/]/).pop()}</small>}
                  {fin && <small className="ok">▣ {fin.split(/[\\/]/).pop()}</small>}
                </div>
                <div className="clip-actions">
                  <button
                    className="mini format"
                    title={`Reformat to ${dims.w}×${dims.h}`}
                    disabled={isFormatting || disabled}
                    onClick={() => handleReformat([c.id])}
                  >
                    {isFormatting ? "…" : "⤓"}
                  </button>
                  <button
                    className="mini format"
                    title="Combine with opener + ending"
                    disabled={isCombining || disabled}
                    onClick={() => handleCombine([c.id])}
                  >
                    {isCombining ? "…" : "▣"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface AssetPickerProps {
  label: string;
  assets: LibraryAsset[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  onImport: () => void;
  onDelete: (id: number) => void;
}

function AssetPicker({ label, assets, selected, onSelect, onImport, onDelete }: AssetPickerProps) {
  return (
    <div className="picker">
      <div className="picker-head">
        <span>{label}</span>
        <button className="mini format" title={`Import ${label.toLowerCase()}`} onClick={onImport}>
          ＋
        </button>
      </div>
      <div className="chips">
        <span className={"chip" + (selected === null ? " on" : "")} onClick={() => onSelect(null)}>
          None
        </span>
        {assets.map((a) => (
          <span
            key={a.id}
            className={"chip" + (selected === a.id ? " on" : "")}
            onClick={() => onSelect(a.id)}
            onDoubleClick={() => onDelete(a.id)}
            title={`${a.name} — double-click to remove`}
          >
            {a.name}
          </span>
        ))}
      </div>
    </div>
  );
}
