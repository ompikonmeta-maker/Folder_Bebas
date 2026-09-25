import { ThemeToggle } from "./ThemeToggle";
import type { Theme } from "../lib/theme";

export type NavKey = "projects" | "clipper" | "library" | "export" | "queue" | "settings";

const ITEMS: { key: NavKey; icon: string; label: string }[] = [
  { key: "projects", icon: "◆", label: "Projects" },
  { key: "clipper", icon: "✂", label: "Clipper" },
  { key: "library", icon: "▦", label: "Library" },
  { key: "export", icon: "⤓", label: "Export" },
  { key: "queue", icon: "◷", label: "Render Queue" },
  { key: "settings", icon: "⚙", label: "Settings" },
];

interface Props {
  active: NavKey;
  onNavigate: (k: NavKey) => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export function Sidebar({ active, onNavigate, theme, onToggleTheme }: Props) {
  return (
    <aside className="rail">
      <div className="brand">
        <div className="logo">CF</div>
        <div className="txt">
          <b>ClipForge</b>
          <small>Studio · offline</small>
        </div>
      </div>

      <nav className="nav">
        {ITEMS.map((it) => (
          <button
            key={it.key}
            className={it.key === active ? "active" : ""}
            onClick={() => onNavigate(it.key)}
          >
            <span className="ic" aria-hidden>{it.icon}</span>
            <span className="lbl">{it.label}</span>
          </button>
        ))}
      </nav>

      <div className="spacer" />
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
    </aside>
  );
}
