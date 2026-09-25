import { useEffect, useState } from "react";
import { PAGES, type Go, type Page } from "../nav";
import { Icon } from "./Icon";
import { Dropdown } from "./Dropdown";
import { api } from "../lib/api";

export function Sidebar({ page, go, expanded, setExpanded }: { page: Page; go: Go; expanded: boolean; setExpanded: (f: (e: boolean) => boolean) => void }) {
  const [lan, setLan] = useState<string | null>(null);
  useEffect(() => { api.settings().then(s => setLan(s.lan ? s.addresses[0]?.replace("http://", "") ?? null : null)).catch(() => {}); }, []);

  return (
    <nav className="rail" aria-label="Navigasi utama">
      <div className="rail-top">
        <button className="icon-btn" aria-label={expanded ? "Ciutkan sidebar" : "Lebarkan sidebar"} aria-expanded={expanded} onClick={() => setExpanded(e => !e)}>
          <Icon n={expanded ? "menu_open" : "menu"} />
        </button>
        <span className="brand"><img src="/favicon.svg" alt="" />CashFlow</span>
      </div>
      <button className="fab" onClick={() => go("entry")} aria-label="Catat transaksi"><Icon n="edit" fill /><span className="lbl">Catat</span></button>
      <ul className="nav">
        {PAGES.map(p => (
          <li key={p.id} className={p.desk ? "desk" : undefined}>
            <button className="nav-item" aria-current={page === p.id ? "page" : undefined} onClick={() => go(p.id)}>
              <span className="pill"><Icon n={p.icon} /></span><span className="t">{p.title}</span>
            </button>
          </li>
        ))}
        <li>
          <Dropdown<Page> value={page} onChange={p => go(p)}
            options={PAGES.filter(p => p.desk && p.id !== "entry").map(p => ({ value: p.id, label: p.title, icon: p.icon }))}
            trigger={({ ref, open, toggle }) => (
              <button ref={ref} className="nav-item mob" aria-haspopup="menu" aria-expanded={open} onClick={toggle}
                aria-current={page === "recurring" || page === "settings" ? "page" : undefined}>
                <span className="pill"><Icon n="more_horiz" /></span><span className="t">Lainnya</span>
              </button>
            )} />
        </li>
      </ul>
      <div className="rail-foot">
        {lan && <div className="lan" title="Buka alamat ini di HP (satu jaringan)"><Icon n="wifi" />HP: <b className="num">{lan}</b></div>}
      </div>
    </nav>
  );
}
