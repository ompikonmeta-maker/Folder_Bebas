import { api } from "../lib/api";
import { useLoad } from "../lib/data";
import { dayLabel, pctChange, rp } from "../lib/format";
import { Icon } from "../components/Icon";
import { FlowChart, ShareBars } from "../components/Charts";
import type { PageProps } from "../nav";

export function ReportPage({ from, to, periodLabel }: PageProps) {
  const { data: r, loading } = useLoad(() => api.report(from, to), [from, to]);
  const net = r ? r.income - r.expense : 0;
  const outCats = r?.byCategory.filter(c => c.type === "out") ?? [];
  const inCats = r?.byCategory.filter(c => c.type === "in") ?? [];
  const change = (cur: number, prev: number) => {
    const c = pctChange(cur, prev);
    return c === null ? "—" : `${c > 0 ? "+" : ""}${Math.round(c * 100)}%`;
  };

  return (
    <>
      <article className={`card span-8${loading ? " loading" : ""}`}>
        <h3>Pemasukan vs pengeluaran</h3>
        <div className="legend"><span><i style={{ background: "var(--chart-a)" }} />Pemasukan</span><span><i style={{ background: "var(--chart-b)" }} />Pengeluaran</span>
          <span>{r?.granularity === "month" ? "per bulan" : "per hari"}</span></div>
        {r && (r.income || r.expense ? <FlowChart series={r.series} granularity={r.granularity} /> :
          <div className="empty"><Icon n="bar_chart" /><span>Belum ada transaksi di periode ini.</span></div>)}
      </article>
      <article className="card span-4">
        <h3>Ringkasan</h3>
        <p className="muted" style={{ marginTop: -8, fontSize: 13 }}>{periodLabel} · {r ? `${dayLabel(r.from)} – ${dayLabel(r.to)}` : ""}</p>
        {r && <>
          <div className="kv"><span>Pemasukan</span><b className="num amt in">+{rp(r.income)}</b></div>
          <div className="kv"><span>Pengeluaran</span><b className="num">−{rp(r.expense)}</b></div>
          <div className="kv"><span>Selisih</span><b className="num" style={{ color: net < 0 ? "var(--expense)" : undefined }}>{net < 0 ? "−" : "+"}{rp(net)}</b></div>
          <div className="kv"><span>Rasio tabungan</span><b className="num">{r.income ? Math.round((net / r.income) * 100) + "%" : "—"}</b></div>
          <div className="kv"><span>Pengeluaran vs periode lalu</span><b className="num">{change(r.expense, r.prev.expense)}</b></div>
          <div className="kv"><span>Pemasukan vs periode lalu</span><b className="num">{change(r.income, r.prev.income)}</b></div>
        </>}
        <div className="actions no-print">
          <a className="btn tonal" href={api.exportUrl(from, to)} download><Icon n="download" />CSV</a>
          <button className="btn tonal" onClick={() => window.print()}><Icon n="print" />Cetak / PDF</button>
        </div>
      </article>
      <article className="card span-7">
        <h3>Pengeluaran per kategori</h3>
        {outCats.length ? <ShareBars items={outCats} total={r!.expense} /> : <p className="muted">Belum ada pengeluaran.</p>}
      </article>
      <article className="card span-5">
        <h3>Pemasukan per kategori</h3>
        {inCats.length ? <ShareBars items={inCats} total={r!.income} alt /> : <p className="muted">Belum ada pemasukan.</p>}
      </article>
      <article className="card span-12">
        <h3>Per dompet</h3>
        <div className="grid2">
          {r?.byWallet.map(w => (
            <div key={w.name} className="row" style={{ background: "var(--surface)", borderRadius: 20 }}>
              <span className="av"><Icon n={w.icon} /></span>
              <span className="m"><b>{w.name}</b><span className="num">masuk {rp(w.income)} · keluar {rp(w.expense)}</span></span>
            </div>
          ))}
        </div>
      </article>
    </>
  );
}
