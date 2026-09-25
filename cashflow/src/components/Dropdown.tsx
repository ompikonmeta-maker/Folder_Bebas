import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export interface Option<T> { value: T; label: string; icon?: string; group?: string }

interface Props<T> {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  id?: string;
  ariaLabel?: string;
  className?: string;
  /** Custom trigger content; defaults to the selected option's icon + label. */
  children?: React.ReactNode;
  /** Render the trigger as a nav item etc. */
  trigger?: (p: { ref: React.RefObject<HTMLButtonElement>; open: boolean; toggle: () => void }) => React.ReactNode;
}

/** M3 Expressive dropdown menu: springy open from the anchor, staggered items, shape-morphing selection. */
export function Dropdown<T extends string | number>({ value, options, onChange, id, ariaLabel, className = "drop-btn", children, trigger }: Props<T>) {
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; minWidth: number; up: boolean }>({ left: 0, top: 0, minWidth: 200, up: false });

  const close = (focus = false) => {
    if (!open) return;
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); if (focus) btn.current?.focus(); }, 140);
  };
  const toggle = () => (open ? close() : setOpen(true));

  useLayoutEffect(() => {
    if (!open || !btn.current || !menu.current) return;
    const r = btn.current.getBoundingClientRect();
    const mh = menu.current.offsetHeight, mw = Math.max(menu.current.offsetWidth, r.width, 200);
    const up = innerHeight - r.bottom < mh + 12 && r.top > innerHeight - r.bottom;
    setPos({
      left: Math.max(16, Math.min(r.left, innerWidth - mw - 16)),
      top: up ? Math.max(8, r.top - mh - 6) : r.bottom + 6,
      minWidth: Math.max(200, r.width),
      up,
    });
    const items = [...menu.current.querySelectorAll<HTMLButtonElement>("button")];
    (items.find(b => b.getAttribute("aria-checked") === "true") ?? items[0])?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close();
    };
    const onResize = () => close();
    document.addEventListener("pointerdown", onDown);
    addEventListener("resize", onResize);
    return () => { document.removeEventListener("pointerdown", onDown); removeEventListener("resize", onResize); };
  });

  const onKey = (e: React.KeyboardEvent) => {
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); close(true); }
  };

  const sel = options.find(o => o.value === value);
  let lastGroup: string | undefined;
  let idx = 0;

  return (
    <>
      {trigger ? trigger({ ref: btn, open, toggle }) : (
        <button type="button" ref={btn} id={id} className={className} aria-haspopup="menu" aria-expanded={open} aria-label={ariaLabel} onClick={toggle}>
          <span>{children ?? <>{sel?.icon && <Icon n={sel.icon} />}{sel?.label ?? "Pilih"}</>}</span>
          <Icon n="expand_more" className="caret" />
        </button>
      )}
      {open && createPortal(
        <ul ref={menu} role="menu" className={`menu${pos.up ? " up" : ""}${closing ? " closing" : ""}`} style={{ left: pos.left, top: pos.top, minWidth: pos.minWidth }} onKeyDown={onKey}>
          {options.map(o => {
            const head = o.group && o.group !== lastGroup ? <li key={"g" + o.group} role="presentation" className="group">{o.group}</li> : null;
            lastGroup = o.group;
            const checked = o.value === value;
            return [head,
              <li key={String(o.value)} role="none" style={{ "--i": idx++ } as React.CSSProperties}>
                <button type="button" role="menuitemradio" aria-checked={checked} onClick={() => { onChange(o.value); close(true); }}>
                  {o.icon && <Icon n={o.icon} />}{o.label}{checked && <Icon n="check" className="chk" />}
                </button>
              </li>];
          })}
        </ul>,
        document.body,
      )}
    </>
  );
}
