// Theme helper: persists choice per-viewer and applies data-theme on <html>.
export type Theme = "light" | "dark";

const KEY = "clipforge.theme";

export function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY) as Theme | null;
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage may be blocked */
  }
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
}
