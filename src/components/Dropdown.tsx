import { useEffect, useRef, useState } from "react";
import { PRESETS } from "../lib/presets";

interface Props {
  value: string;
  onChange: (key: string) => void;
}

// MD3 expressive dropdown menu for platform presets, grouped by aspect ratio.
export function Dropdown({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = PRESETS.find((p) => p.key === value) ?? PRESETS[0];

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const portrait = PRESETS.filter((p) => p.ratio === "9:16");
  const landscape = PRESETS.filter((p) => p.ratio === "16:9");

  return (
    <div className={"dd" + (open ? " open" : "")} ref={ref}>
      <button
        className="dd-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span aria-hidden>📱</span>
        <span>{current.label}</span>
        <span className="chev" aria-hidden>▾</span>
      </button>

      <div className="dd-menu" role="menu">
        <div className="dd-grp">Portrait 9:16</div>
        {portrait.map((p) => (
          <div
            key={p.key}
            role="menuitemradio"
            aria-checked={p.key === value}
            className={"dd-item" + (p.key === value ? " sel" : "")}
            onClick={() => {
              onChange(p.key);
              setOpen(false);
            }}
          >
            <span aria-hidden>▶</span>
            <span>{p.label}</span>
            <span className="ratio">{p.ratio}</span>
          </div>
        ))}
        <div className="dd-grp">Landscape 16:9</div>
        {landscape.map((p) => (
          <div
            key={p.key}
            role="menuitemradio"
            aria-checked={p.key === value}
            className={"dd-item" + (p.key === value ? " sel" : "")}
            onClick={() => {
              onChange(p.key);
              setOpen(false);
            }}
          >
            <span aria-hidden>▬</span>
            <span>{p.label}</span>
            <span className="ratio">{p.ratio}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
