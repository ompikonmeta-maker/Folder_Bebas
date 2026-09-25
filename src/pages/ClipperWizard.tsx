import { useEffect, useMemo, useState } from "react";
import { ClipRow } from "../components/ClipRow";
import { AssetPicker } from "../components/AssetPicker";
import { PRESETS, RATIOS, RESOLUTIONS, presetByKey, targetDims } from "../lib/presets";
import {
  combineClip,
  deleteClip,
  deleteLibraryAsset,
  deleteSource,
  enqueueExports,
  ffmpegStatus,
  generateClips,
  isDesktop,
  listClips,
  listLibrary,
  listSources,
  openProjectExports,
  pickAndImport,
  pickAndImportAsset,
  reformatClip,
  type FfmpegStatus,
} from "../lib/api";
import type { AssetKind, Clip, ClipMode, LibraryAsset, SourceVideo } from "../types";

function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const STEPS = ["Import", "Clip", "Reformat", "Combine", "Export"] as const;

interface Props {
  projectId: number;
  projectName: string;
  onToggleSidebar: () => void;
  onGoToQueue: () => void;
}

export function ClipperWizard({ projectId, projectName, onToggleSidebar, onGoToQueue }: Props) {
  const [step, setStep] = useState(0);
  const [ff, setFf] = useState<FfmpegStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [source, setSource] = useState<SourceVideo | null>(null);
  const [mode, setMode] = useState<ClipMode>("auto");
  const [lenKey, setLenKey] = useState("1");
  const [customMin, setCustomMin] = useState("1.5");
  const [ranges, setRanges] = useState<[number, number][]>([[0, 60]]);

  const [clips, setClips] = useState<Clip[]>([]);
  const [busy, setBusy] = useState(false);
  const [formatting, setFormatting] = useState<Set<number>>(new Set());
  const [combining, setCombining] = useState<Set<number>>(new Set());
  const [outputs, setOutputs] = useState<Record<number, string>>({});
  const [finals, setFinals] = useState<Record<number, string>>({});

  const [preset, setPreset] = useState("yt_shorts");
  const [res, setRes] = useState("HD");
  const [openers, setOpeners] = useState<LibraryAsset[]>([]);
  const [endings, setEndings] = useState<LibraryAsset[]>([]);
  const [openerId, setOpenerId] = useState<number | null>(null);
  const [endingId, setEndingId] = useState<number | null>(null);
  const [combineOnExport, setCombineOnExport] = useState(true);

  const dims = useMemo(() => targetDims(preset, res), [preset, res]);
  const disabled = !!ff && !ff.found;

  useEffect(() => {
    ffmpegStatus().then(setFf).catch(() => setFf(null));
  }, []);

  useEffect(() => {
    // Reset + load whenever the active project changes.
    setStep(0);
    setSource(null);
    setClips([]);
    setOutputs({});
    setFinals({});
    setError(null);
    listSources(projectId).then((s) => setSource(s[0] ?? null)).catch(() => {});
    listClips(projectId).then(setClips).catch(() => {});
    refreshLibrary();
  }, [projectId]);

  function refreshLibrary() {
    listLibrary("opener").then(setOpeners).catch(() => {});
    listLibrary("ending").then(setEndings).catch(() => {});
  }

  const segmentSec = useMemo(() => {
    if (lenKey === "custom") return Math.max(1, parseFloat(customMin) || 1) * 60;
    return parseInt(lenKey, 10) * 60;
  }, [lenKey, customMin]);

  const estCount =
    mode === "auto" && source?.duration_sec
      ? Math.ceil(source.duration_sec / segmentSec)
      : ranges.filter((r) => r[1] > r[0]).length;

  // ---- handlers ----
  async function handleImport() {
    setError(null);
    try {
      const s = await pickAndImport(projectId);
      if (s) setSource(s);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRemoveSource() {
    if (!source) return;
    try {
      await deleteSource(source.id);
      setSource(null);
      setClips([]);
      setOutputs({});
      setFinals({});
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleGenerate() {
    if (!source) return setError("Import a source video first.");
    setError(null);
    setBusy(true);
    try {
      const made = await generateClips({
        projectId,
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

  async function handleReformat(ids: number[]) {
    if (ids.length === 0) return setError("Generate clips first.");
    setError(null);
    setFormatting((s) => new Set([...s, ...ids]));
    try {
      for (const id of ids) {
        const out = await reformatClip(id, dims.w, dims.h);
        setOutputs((o) => ({ ...o, [id]: out }));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setFormatting((s) => {
        const n = new Set(s);
        ids.forEach((id) => n.delete(id));
        return n;
      });
    }
  }

  async function handleCombine(ids: number[]) {
    if (ids.length === 0) return setError("Generate clips first.");
    setError(null);
    setCombining((s) => new Set([...s, ...ids]));
    try {
      for (const id of ids) {
        const out = await combineClip({ clipId: id, openerId, endingId, width: dims.w, height: dims.h });
        setFinals((f) => ({ ...f, [id]: out }));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCombining((s) => {
        const n = new Set(s);
        ids.forEach((id) => n.delete(id));
        return n;
      });
    }
  }

  async function handleDeleteClip(id: number) {
    try {
      await deleteClip(id);
      setClips((cs) => cs.filter((c) => c.id !== id));
    } catch (e) {
      setError(String(e));
    }
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

  async function handleQueueExport() {
    if (clips.length === 0) return setError("Generate clips first.");
    setError(null);
    try {
      await enqueueExports({
        projectId,
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

  const clipRows = (
    <div className="clip-grid">
      {clips.map((c) => (
        <ClipRow
          key={c.id}
          clip={c}
          dims={dims}
          disabled={disabled}
          isFormatting={formatting.has(c.id)}
          isCombining={combining.has(c.id)}
          out={outputs[c.id]}
          fin={finals[c.id]}
          onFormat={() => handleReformat([c.id])}
          onCombine={() => handleCombine([c.id])}
          onDelete={() => handleDeleteClip(c.id)}
        />
      ))}
    </div>
  );

  return (
    <section className="canvas">
      <div className="topbar">
        <button className="icon-btn" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          ≡
        </button>
        <div className="title-wrap">
          <h1 className="ellipsis">{projectName}</h1>
          <p>Clipper · step {step + 1} of {STEPS.length}</p>
        </div>
      </div>

      {/* Step tabs */}
      <div className="steps">
        {STEPS.map((s, i) => (
          <button
            key={s}
            className={"step-tab" + (i === step ? " on" : "") + (i < step ? " done" : "")}
            onClick={() => setStep(i)}
          >
            <span className="num">{i < step ? "✓" : i + 1}</span>
            {s}
          </button>
        ))}
      </div>

      {ff && !ff.found && (
        <div className="banner warn">
          FFmpeg not found — clipping/export disabled. Reinstall the app (it bundles FFmpeg) or
          set <code>CLIPFORGE_FFMPEG_DIR</code>.
        </div>
      )}
      {error && <div className="banner danger">{error}</div>}

      <div className="wizard-body">
        {/* STEP 1 — IMPORT */}
        {step === 0 && (
          <div className="panel">
            <h2>Import source video</h2>
            <p className="muted">Add one long landscape video. It's copied into this project's folder and probed.</p>
            {source ? (
              <div className="source-box">
                <div className="source-name ellipsis-2">{source.file_path.split(/[\\/]/).pop()}</div>
                <div className="meta">
                  <span>⏱ {source.duration_sec ? fmt(source.duration_sec) : "?"}</span>
                  <span>▭ {source.width ?? "?"}×{source.height ?? "?"}</span>
                  <span>🎞 {source.fps ? source.fps.toFixed(0) : "?"} fps</span>
                </div>
                <div className="btn-row">
                  <button className="btn tonal" onClick={handleImport}>Replace</button>
                  <button className="btn tonal danger-btn" onClick={handleRemoveSource}>Remove</button>
                </div>
              </div>
            ) : (
              <button className="btn" onClick={handleImport}>＋ Import video</button>
            )}
          </div>
        )}

        {/* STEP 2 — CLIP */}
        {step === 1 && (
          <div className="panel">
            <h2>Cut into clips</h2>
            <div className="seg">
              <button className={"seg-btn" + (mode === "auto" ? " on" : "")} onClick={() => setMode("auto")}>Auto-split</button>
              <button className={"seg-btn" + (mode === "manual" ? " on" : "")} onClick={() => setMode("manual")}>Manual</button>
            </div>
            {mode === "auto" ? (
              <>
                <label className="lbl">Clip length</label>
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
                    <input type="number" min="0.1" step="0.1" value={customMin} onChange={(e) => setCustomMin(e.target.value)} />
                  </label>
                )}
              </>
            ) : (
              <div className="ranges">
                <label className="lbl">Segments (seconds)</label>
                {ranges.map((r, i) => (
                  <div className="range-row" key={i}>
                    <input type="number" min="0" value={r[0]} onChange={(e) => setRanges((rs) => rs.map((x, j) => (j === i ? [parseFloat(e.target.value) || 0, x[1]] : x)))} />
                    <span>→</span>
                    <input type="number" min="0" value={r[1]} onChange={(e) => setRanges((rs) => rs.map((x, j) => (j === i ? [x[0], parseFloat(e.target.value) || 0] : x)))} />
                    <button className="mini" onClick={() => setRanges((rs) => rs.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
                <button className="btn tonal" onClick={() => setRanges((rs) => [...rs, [0, 60]])}>＋ Add segment</button>
              </div>
            )}
            <p className="hint-line">≈ {estCount} clip{estCount === 1 ? "" : "s"}</p>
            <button className="btn" disabled={busy || disabled || !source} onClick={handleGenerate}>
              {busy ? "Generating…" : "Generate clips →"}
            </button>
            {clips.length > 0 && (
              <>
                <h3 className="section-h">Clips ({clips.length})</h3>
                {clipRows}
              </>
            )}
          </div>
        )}

        {/* STEP 3 — REFORMAT */}
        {step === 2 && (
          <div className="panel">
            <h2>Reformat for a platform</h2>
            <div className="grid2">
              <div>
                <label className="lbl">Platform &amp; ratio</label>
                <select className="select" value={preset} onChange={(e) => setPreset(e.target.value)}>
                  {RATIOS.map((r) => (
                    <optgroup key={r.ratio} label={r.label}>
                      {PRESETS.filter((p) => p.ratio === r.ratio).map((p) => (
                        <option key={p.key} value={p.key}>{p.label} — {p.ratio}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <label className="lbl">Resolution</label>
                <div className="chips">
                  {RESOLUTIONS.map((r) => (
                    <span key={r.key} className={"chip" + (res === r.key ? " on" : "")} onClick={() => setRes(r.key)}>
                      {r.label} <span className="chip-note">{r.note}</span>
                    </span>
                  ))}
                </div>
                <p className="hint-line">Output {dims.w}×{dims.h} · center-crop</p>
                <button className="btn" disabled={clips.length === 0 || disabled || formatting.size > 0} onClick={() => handleReformat(clips.map((c) => c.id))}>
                  {formatting.size > 0 ? `Formatting ${formatting.size}…` : `Format all ${clips.length} →`}
                </button>
              </div>
              <div className="preview-wrap">
                <div className="preview" style={{ aspectRatio: `${dims.w}/${dims.h}` }}>{dims.w}×{dims.h}</div>
              </div>
            </div>
            {clips.length > 0 && <div className="section-h">Clips</div>}
            {clipRows}
          </div>
        )}

        {/* STEP 4 — COMBINE */}
        {step === 3 && (
          <div className="panel">
            <h2>Opener &amp; ending (optional)</h2>
            <p className="muted">Prepend an opener and append an ending, normalized to {dims.w}×{dims.h}. Manage the library on the Library page.</p>
            <AssetPicker label="Opener" assets={openers} selected={openerId} onSelect={setOpenerId} onImport={() => handleImportAsset("opener")} onDelete={(id) => handleDeleteAsset("opener", id)} />
            <AssetPicker label="Ending" assets={endings} selected={endingId} onSelect={setEndingId} onImport={() => handleImportAsset("ending")} onDelete={(id) => handleDeleteAsset("ending", id)} />
            <button className="btn" disabled={clips.length === 0 || disabled || combining.size > 0} onClick={() => handleCombine(clips.map((c) => c.id))}>
              {combining.size > 0 ? `Combining ${combining.size}…` : `Combine all ${clips.length} →`}
            </button>
            {clips.length > 0 && <div className="section-h">Clips</div>}
            {clipRows}
          </div>
        )}

        {/* STEP 5 — EXPORT */}
        {step === 4 && (
          <div className="panel">
            <h2>Batch export</h2>
            <p className="muted">Queue every clip at {presetByKey(preset).label} · {res} ({dims.w}×{dims.h}). Runs on the Export &amp; Queue page.</p>
            <label className="check">
              <input type="checkbox" checked={combineOnExport} onChange={(e) => setCombineOnExport(e.target.checked)} />
              Include opener + ending
            </label>
            <div className="btn-row">
              <button className="btn" disabled={clips.length === 0 || disabled} onClick={handleQueueExport}>
                Queue {clips.length} clip{clips.length === 1 ? "" : "s"} & open queue →
              </button>
              {isDesktop() && (
                <button className="btn tonal" onClick={() => openProjectExports(projectId)}>Open exports folder</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Wizard footer */}
      <div className="wizard-foot">
        <button className="btn tonal" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>← Back</button>
        <div className="grow" />
        {step < STEPS.length - 1 ? (
          <>
            <button className="btn ghost" onClick={() => setStep((s) => s + 1)}>Skip</button>
            <button className="btn" onClick={() => setStep((s) => s + 1)}>Next →</button>
          </>
        ) : (
          <button className="btn" disabled={clips.length === 0 || disabled} onClick={handleQueueExport}>Finish · Queue export</button>
        )}
      </div>
    </section>
  );
}
