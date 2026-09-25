// Theme is a per-device display preference (not user data), so it lives in localStorage.
export type Theme = "light" | "dark";
const KEY = "cashflow-theme";

export function initTheme() {
  try { const t = localStorage.getItem(KEY); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch {}
}
export const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};

/** Switch theme with a circular reveal growing from (x, y). */
export function toggleTheme(x: number, y: number, onApplied?: () => void) {
  const next: Theme = isDark() ? "light" : "dark";
  const apply = () => {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch {}
    onApplied?.();
  };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  if (!doc.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  doc.startViewTransition(apply).ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 650, easing: "cubic-bezier(.2,0,0,1)", pseudoElement: "::view-transition-new(root)" },
    );
  });
}
