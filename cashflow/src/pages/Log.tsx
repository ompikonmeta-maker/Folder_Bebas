import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useData, useLoad } from "../lib/data";
import { longDate, rp } from "../lib/format";
import { Icon } from "../components/Icon";
import { Dropdown } from "../components/Dropdown";
import { TxRow } from "../components/TxRow";
import type { PageProps } from "../nav";
import type { Tx } from "../types";

const FILTERS = [
  { id: "all", label: "Semua" },
  { id: "in", label: "Pemasukan" },
  { id: "out", label: "Pengeluaran" },
  { id: "rec", label: "Rutin" },
  { id: "rcp", label: "Ada struk" },
] as const;
type F = typeof FILTERS[number]["id"];

const ACTION: Record<string, { icon: string; label: string }> = {
  create: { icon: "add", label: "Dibuat" },
  update: { icon: "edit", label: "Diubah" },
  delete: { icon: "delete", label: "Dihapus" },
  auto: { icon: "autorenew", label: "Otomatis" },
};

export function Log({ go, from, to, periodLabel }: PageProps) {
  const { meta } = useData();
  const [filter, setFilter] = useState<F>("all");
  const [wallet, setWallet] = useState(0);
  const [category, setCategory] = useState(0);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => { const t = setTimeout(() => setQuery(q), 250); return () => clearTimeout(t); }, [q]);

  const { data, loading } = useLoad(() => api.transactions({
    from, to, q: query, wallet: wallet || undefined, category: category || undefined,
    type: filter === "in" || filter === "out" ? filter : undefined, recurring: filter === "rec", receipt: filter === "rcp", limit: 500,
  }), [from, to, query, wallet, category, filter]);
  const { data: audit } = useLoad(() => api.audit(60), []);

  const groups: [string, Tx[]][] = [];
  for (const t of data?.rows ?? []) {
    const g = groups[groups.length - 1];
    if (g && g[0] === t.date) g[1].push(t); else groups.push([t.date, [t]]);
  }
  const sumIn = data?.rows.filter(t => t.type === "in").reduce((s, t) => s + t.amount, 0) ?? 0;
  const sumOut = data?.rows.filter(t => t.type === "out").reduce((s, t) => s + t.amount, 0) ?? 0;

  return (
    <>
      <article className="card span-8">
        <div className="toolbar">
          <label className="search"><Icon n="search" /><input id="log-q" placeholder="Cari catatan atau kategori" value={q} onChange={e => setQ(e.target.value)} aria-label="Cari" /></label>
          <Dropdown<number> value={wallet} onChange={setWallet} ariaLabel="Dompet"
            options={[{ value: 0, label: "Semua dompet", icon: "wallet" }, ...(meta?.wallets ?? []).map(w => ({ value: w.id, label: w.name, icon: w.icon }))]} />
          <Dropdown<number> value={category} onChange={setCategory} ariaLabel="Kategori"
            options={[{ value: 0, label: "Semua kategori", icon: "category" }, ...(meta?.categories ?? []).map(c => ({ value: c.id, label: c.name, icon: c.icon, group: c.type === "in" ? "Pemasukan" : "Pengeluaran" }))]} />
        </div>
        <div className="chips" style={{ marginBottom: 8 }}>
          {FILTERS.map(x => (
            <button key={x.id} type="button" className="chip" aria-pressed={filter === x.id} onClick={() => setFilter(x.id)}>
              {filter === x.id && <Icon n="done" />}{x.label}
            </button>
          ))}
        </div>
        <p className="muted num" style={{ fontSize: 13, margin: "4px 8px" }}>
          {data ? `${data.total} transaksi · ${periodLabel} · masuk ${rp(sumIn)} · keluar ${rp(sumOut)}` : "Memuat…"}
          {data && data.total > data.rows.length && ` (menampilkan ${data.rows.length} terbaru)`}
        </p>
        <div className={loading ? "loading" : undefined}>
          {data && !data.rows.length && <div className="empty"><Icon n="search_off" /><b>Tidak ada transaksi</b><span>Coba ubah periode atau filter.</span></div>}
          {groups.map(([date, rows]) => {
            const net = rows.reduce((s, t) => s + (t.type === "in" ? t.amount : -t.amount), 0);
            return (
              <section key={date}>
                <div className="day-head"><span>{longDate(date)}</span><span className="num">{net >= 0 ? "+" : "−"}{rp(net)}</span></div>
                <ul className="list">{rows.map(t => <TxRow key={t.id} t={t} showDate={false} onClick={() => go("entry", { editId: t.id })} />)}</ul>
              </section>
            );
          })}
        </div>
      </article>
      <article className="card span-4">
        <h3>Riwayat perubahan</h3>
        {audit && !audit.length && <p className="muted">Setiap tambah, ubah, hapus, dan pencatatan otomatis akan muncul di sini.</p>}
        <ul className="list">
          {audit?.map(a => (
            <li key={a.id} className="row">
              <span className="av"><Icon n={ACTION[a.action].icon} /></span>
              <span className="m"><b>{ACTION[a.action].label}{a.entity === "recurring" && <span className="tag">RUTIN</span>}</b><span>{a.summary}<br />{a.at.slice(0, 16).replace(" ", " · ")}</span></span>
            </li>
          ))}
        </ul>
      </article>
    </>
  );
}
