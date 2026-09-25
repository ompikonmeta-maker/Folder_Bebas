import { useEffect, useState } from "react";
import { clipThumbnail } from "../lib/api";
import type { Clip } from "../types";

function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface Props {
  clip: Clip;
  dims: { w: number; h: number };
  disabled: boolean;
  isFormatting: boolean;
  isCombining: boolean;
  out?: string;
  fin?: string;
  onFormat: () => void;
  onCombine: () => void;
  onDelete: () => void;
}

export function ClipRow({
  clip,
  dims,
  disabled,
  isFormatting,
  isCombining,
  out,
  fin,
  onFormat,
  onCombine,
  onDelete,
}: Props) {
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    clipThumbnail(clip.id).then((t) => alive && setThumb(t));
    return () => {
      alive = false;
    };
  }, [clip.id]);

  return (
    <div className="clip">
      <div className="clip-thumb" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>
        {!thumb && "▶"}
      </div>
      <div className="clip-body">
        <b>{clip.file_path?.split(/[\\/]/).pop() ?? `clip ${clip.id}`}</b>
        <small>
          {fmt(clip.start_sec)}–{fmt(clip.end_sec)} · {fmt(clip.end_sec - clip.start_sec)} · {clip.mode}
        </small>
        {out && <small className="ok">✂ {out.split(/[\\/]/).pop()}</small>}
        {fin && <small className="ok">▣ {fin.split(/[\\/]/).pop()}</small>}
      </div>
      <div className="clip-actions">
        <button
          className="mini format"
          title={`Reformat to ${dims.w}×${dims.h}`}
          disabled={isFormatting || disabled}
          onClick={onFormat}
        >
          {isFormatting ? "…" : "⤓"}
        </button>
        <button
          className="mini format"
          title="Combine with opener + ending"
          disabled={isCombining || disabled}
          onClick={onCombine}
        >
          {isCombining ? "…" : "▣"}
        </button>
        <button className="mini" title="Delete clip" onClick={onDelete}>
          ✕
        </button>
      </div>
    </div>
  );
}
