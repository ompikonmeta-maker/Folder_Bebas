import { api } from "../lib/api";
import { useLoad } from "../lib/data";
import { FREQ_LABEL, dayLabel, pctChange, rp, signed } from "../lib/format";
import { Icon } from "../components/Icon";
import { TxRow } from "../components/TxRow";
import type { PageProps } from "../nav";

function Delta({ cur, prev, goodWhenUp }: { cur: number; prev: number; goodWhenUp: boolean }) {
  const c = pctChange(cur, prev);
  if (c === null) return <span className="delta neutral">Belum ada pembanding</span>;
  const up = c > 0, flat = Math.abs(c) < 0.005;
  const cls = flat ? "neutral" : up === goodWhenUp ? "good" : "bad";
  return <span className={`delta ${cls}`}><Icon n={flat ? "trending_flat" : up ? "arrow_upward" : "arrow_downward"} />{Math.abs(Math.round(c * 100))}% vs periode lalu</span>;
}

export function Home({ go, from, to, periodLabel }: PageProps) {
  const { data: s } = useLoad(() => api.summary(from, to), [from, to]);
  const { data: recent } = useLoad(() => api.transactions({ limit: 6 }), []);
  const total = s?.wallets.reduce((a, w) => a + w.balance, 0) ?? 0;
  const net = s ? s.income - s.expense : 0;

  return (
    <>
      <article className="card span-8 hero">
        <div className="shape"><Icon n="account_balance_wallet" fill /></div>
        <div style={{ minWidth: 0 }}>
          <p className="label">Saldo semua dompet</p>
          <div className="big num">{s ? (total < 0 ? "−" : "") + rp(total) : "…"}</div>
          <div className="wallets">{s?.wallets.map(w => <span key={w.id}><Icon n={w.icon} />{w.name} <b className="num">{(w.balance < 0 ? "−" : "") + rp(w.balance)}</b></span>)}</div>
        </div>
      </article>
      <article className={`card span-4 insight${s?.insight?.tone === "warn" ? " tone-warn" : ""}`}>
        <p className="label">Insight</p>
        {s?.insight ? <><p className="title">{s.insight.title}</p><p>{s.insight.body}</p></> : <p className="title">Menyiapkan insight…</p>}
        <button className="btn text" style={{ marginTop: 8, marginLeft: -14, color: "inherit" }} onClick={() => go("insight")}>Lihat semua<Icon n="arrow_forward" /></button>
      </article>

      <article className="card span-4 stat hoverable">
        <p className="label">Pemasukan · {periodLabel}</p>
        <div className="v num">{s ? rp(s.income) : "…"}</div>
        {s && <Delta cur={s.income} prev={s.prev.income} goodWhenUp />}
      </article>
      <article className="card span-4 stat hoverable">
        <p className="label">Pengeluaran · {periodLabel}</p>
        <div className="v num">{s ? rp(s.expense) : "…"}</div>
        {s && <Delta cur={s.expense} prev={s.prev.expense} goodWhenUp={false} />}
      </article>
      <article className="card span-4 stat hoverable">
        <p className="label">Selisih · {periodLabel}</p>
        <div className="v num" style={{ color: net < 0 ? "var(--expense)" : undefined }}>{s ? (net < 0 ? "−" : "+") + rp(net) : "…"}</div>
        {s && s.income > 0 && <span className={`delta ${net / s.income >= 0.2 ? "good" : net < 0 ? "bad" : "neutral"}`}>Rasio tabungan {Math.round((net / s.income) * 100)}%</span>}
      </article>

      <article className="card span-8">
        <h3>Transaksi terakhir<span className="spacer" /><button className="btn text" onClick={() => go("log")}>Semua log</button></h3>
        {recent && recent.rows.length === 0 ? (
          <div className="empty"><Icon n="receipt_long" /><b>Belum ada transaksi</b><span>Mulai dengan mencatat pemasukan atau pengeluaran pertama.</span>
            <button className="btn" onClick={() => go("entry")}><Icon n="add" />Catat sekarang</button></div>
        ) : (
          <ul className="list">{recent?.rows.map(t => <TxRow key={t.id} t={t} onClick={() => go("entry", { editId: t.id })} />)}</ul>
        )}
      </article>
      <article className="card span-4">
        <h3>Rutin berikutnya</h3>
        {s && s.upcoming.length === 0 ? (
          <div className="empty" style={{ padding: "16px 8px" }}><Icon n="event_repeat" /><span>Belum ada transaksi rutin. Pilih "Ulangi" saat mencatat.</span></div>
        ) : (
          <ul className="list">{s?.upcoming.map(u => (
            <li key={u.id} className="row">
              <span className={`av${u.type === "in" ? " in" : ""}`}><Icon n={u.icon} /></span>
              <span className="m"><b>{u.note || u.category}</b><span>{dayLabel(u.date)} · {FREQ_LABEL[u.freq]}</span></span>
              <span className={`amt num${u.type === "in" ? " in" : ""}`}>{signed(u.amount, u.type)}</span>
            </li>
          ))}</ul>
        )}
      </article>
    </>
  );
}
