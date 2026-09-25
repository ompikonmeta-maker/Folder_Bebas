import { useState } from "react";
import { Sidebar, type NavKey } from "./components/Sidebar";
import { Workspace } from "./pages/Workspace";
import { applyTheme, getInitialTheme, type Theme } from "./lib/theme";

export default function App() {
  const [nav, setNav] = useState<NavKey>("projects");
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    const t = getInitialTheme();
    applyTheme(t);
    return t;
  });

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <div className={"app" + (collapsed ? " collapsed" : "")}>
      <Sidebar active={nav} onNavigate={setNav} theme={theme} onToggleTheme={toggleTheme} />
      <Workspace onToggleSidebar={() => setCollapsed((v) => !v)} />
    </div>
  );
}
