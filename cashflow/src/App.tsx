import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Icon } from "./components/Icon";
import { Dropdown } from "./components/Dropdown";
import { Dialog } from "./components/Dialog";
import { PAGES, type Page } from "./nav";
import { PRESETS, type Period, type Preset, periodLabel, presetRange } from "./lib/period";
import { isDark, toggleTheme } from "./lib/theme";
import { Home } from "./pages/Home";
import { Entry } from "./pages/Entry";
import { Log } from "./pages/Log";
import { ReportPage } from "./pages/Report";
import { InsightPage } from "./pages/Insight";
import { Recurring } from "./pages/Recurring";
import { SettingsPage } from "./pages/Settings";

const PERIOD_PAGES: Page[] = ["home", "log", "report"];

export function App() {
  const [page, setPage] = useState<Page>("home");
  const [editId, setEditId] = useState<number | undefined>();
  const [phase, setPhase] = useState<"enter" | "leave">("enter");
  const [animKey, setAnimKey] = useState(0);
  const [dir, setDir] = useState(1);
  const [period, setPeriod] = useState<Period>(() => presetRange("month"));
  const [custom, setCustom] = useState<{ open: boolean; from: string; to: string }>({ open: false, from: period.from, to: period.to });
  const [dark, setDark] = useState(isDark());
  // Rail width is a per-device display preference.
  const [expanded, setExpanded] = useState(() => { try { return localStorage.getItem("cashflow-rail") !== "0"; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem("cashflow-rail", expanded ? "1" : "0"); } catch {} }, [expanded]);
  const timer = useRef<number>();
  const canvas = useRef<HTMLElement>(null);

  const go = (p: Page, opts?: { editId?: number }) => {
    if (p === page && opts?.editId === editId) return;
    const from = PAGES.findIndex(x => x.id === page), to = PAGES.findIndex(x => x.id === p);
    setDir(to >= from ? 1 : -1);
    setPhase("leave");
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setPage(p); setEditId(opts?.editId); setPhase("enter"); setAnimKey(k => k + 1);
    }, 150);
  };

  // Stagger index for the directional reveal.
  useEffect(() => {
    [...(canvas.current?.children ?? [])].forEach((el, i) => (el as HTMLElement).style.setProperty("--i", String(i)));
  }, [animKey]);

  useEffect(() => { document.title = `${PAGES.find(p => p.id === page)!.title} · CashFlow`; }, [page]);

  const mobile = typeof matchMedia !== "undefined" && matchMedia("(max-width: 760px)").matches;
  const title = page === "entry" && editId ? "Ubah transaksi" : PAGES.find(p => p.id === page)!.title;
  const label = periodLabel(period);
  const props = { go, from: period.from, to: period.to, periodLabel: label };

  const pickPreset = (p: Preset) => {
    if (p === "custom") setCustom({ open: true, from: period.from, to: period.to });
    else setPeriod(presetRange(p));
  };

  return (
    <div className={`app${expanded ? " expanded" : ""}`}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs><clipPath id="cookie" clipPathUnits="objectBoundingBox"><path d={COOKIE} /></clipPath></defs>
      </svg>
      <Sidebar page={page} go={go} expanded={expanded} setExpanded={setExpanded} />
      <main className="main">
        <header className="topbar">
          <h1 className="page-title">{title}</h1>
          <span className="spacer" />
          {PERIOD_PAGES.includes(page) && (
            <Dropdown<Preset> value={period.preset} onChange={pickPreset} ariaLabel="Periode"
              options={PRESETS.map(p => ({ value: p.id, label: p.label, icon: p.icon }))}>
              <Icon n="calendar_month" />{label}
            </Dropdown>
          )}
          <button className="icon-btn theme-btn" aria-label={dark ? "Pakai tema terang" : "Pakai tema gelap"}
            onClick={e => { const r = e.currentTarget.getBoundingClientRect(); toggleTheme(r.left + r.width / 2, r.top + r.height / 2, () => setDark(isDark())); }}>
            <Icon n={dark ? "light_mode" : "dark_mode"} style={{ transform: `rotate(${dark ? -180 : 0}deg)` }} />
          </button>
        </header>
        <section key={animKey} ref={canvas} className={`canvas ${phase}`}
          style={{ "--dx": mobile ? 56 * dir : 0, "--dy": mobile ? 0 : 64 * dir } as React.CSSProperties}>
          {page === "home" && <Home {...props} />}
          {page === "entry" && <Entry {...props} editId={editId} />}
          {page === "log" && <Log {...props} />}
          {page === "report" && <ReportPage {...props} />}
          {page === "insight" && <InsightPage {...props} />}
          {page === "recurring" && <Recurring {...props} />}
          {page === "settings" && <SettingsPage {...props} />}
        </section>
      </main>
      {page !== "entry" && <button className="fab mob-fab" onClick={() => go("entry")}><Icon n="edit" fill /><span className="lbl">Catat</span></button>}

      <Dialog open={custom.open} onClose={() => setCustom(c => ({ ...c, open: false }))} title="Rentang tanggal">
        <form onSubmit={e => { e.preventDefault(); if (custom.from <= custom.to) { setPeriod({ preset: "custom", from: custom.from, to: custom.to }); setCustom(c => ({ ...c, open: false })); } }}>
          <div className="grid2">
            <div className="field"><label htmlFor="rf">Dari</label><input id="rf" className="input" type="date" required value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} /></div>
            <div className="field"><label htmlFor="rt">Sampai</label><input id="rt" className="input" type="date" required value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} /></div>
          </div>
          {custom.from > custom.to && <p className="error">Tanggal awal harus sebelum tanggal akhir.</p>}
          <div className="actions">
            <button type="button" className="btn text" onClick={() => setCustom(c => ({ ...c, open: false }))}>Batal</button>
            <button className="btn" disabled={custom.from > custom.to}>Terapkan</button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

// M3 Expressive 9-sided "cookie" shape.
const COOKIE = (() => {
  const pts: string[] = [];
  for (let i = 0; i <= 360; i += 2) {
    const a = (i * Math.PI) / 180, r = 0.5 - 0.045 * Math.cos(9 * a);
    pts.push(`${(0.5 + r * Math.cos(a)).toFixed(4)},${(0.5 + r * Math.sin(a)).toFixed(4)}`);
  }
  return "M" + pts.join("L") + "Z";
})();
