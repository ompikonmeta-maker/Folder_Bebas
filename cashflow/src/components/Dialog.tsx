import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; wide?: boolean }) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); }
    else if (mounted) { setClosing(true); const t = setTimeout(() => { setMounted(false); setClosing(false); }, 170); return () => clearTimeout(t); }
  }, [open]);

  useEffect(() => {
    if (!mounted || closing) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>("input, button, [tabindex]");
    first?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    return () => { removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [mounted, closing]);

  if (!mounted) return null;
  return createPortal(
    <div className={`scrim${closing ? " closing" : ""}`} onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className={`dialog${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmation dialog built into the page (no native confirm()). */
export function Confirm({ open, title, body, action, danger, onCancel, onConfirm }: { open: boolean; title: string; body: React.ReactNode; action: string; danger?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <div className="muted">{body}</div>
      <div className="actions">
        <button type="button" className="btn text" onClick={onCancel}>Batal</button>
        <button type="button" className={`btn${danger ? " danger" : ""}`} onClick={onConfirm}>{action}</button>
      </div>
    </Dialog>
  );
}
