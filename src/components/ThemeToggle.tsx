import type { Theme } from "../lib/theme";

interface Props {
  theme: Theme;
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: Props) {
  const dark = theme === "dark";
  return (
    <button className="theme-toggle" onClick={onToggle} aria-pressed={dark}>
      <span className="knob" style={{ transform: dark ? "rotate(360deg)" : "none" }}>
        {dark ? "☾" : "☀"}
      </span>
      <span className="lbl">{dark ? "Dark theme" : "Light theme"}</span>
    </button>
  );
}
