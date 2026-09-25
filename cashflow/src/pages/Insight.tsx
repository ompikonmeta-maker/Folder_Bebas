import { api } from "../lib/api";
import { useLoad } from "../lib/data";
import { rp, toDate } from "../lib/format";
import { Icon } from "../components/Icon";
import type { PageProps } from "../nav";

export function InsightPage({ go }: PageProps) {
  const { data } = useLoad(() => api.insights(), []);
  const f = data?.forecast;
  const outItems = f?.items.filter(i => i.type === "out") ?? [];
  const month = f ? toDate(f.month + "-01").toLocaleDateString("id-ID", { month: "long", year: "numeric" }) : "";

  return (
    <>
      <article className="card span-5 hero" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, width: "100%" }}>
          <p className="label">Prediksi pengeluaran {month}</p>
          <div className="big num">{f ? rp(f.expense) : "…"}</div>
          <p style={{ margin: "8px 0 0", opacity: .85 }}>
            {f?.basis === "kosong" ? "Belum ada riwayat untuk diprediksi." : "Dari transaksi rutin ditambah rata-rata tertimbang 3 bulan terakhir (bulan terbaru bobotnya paling besar)."}
          </p>
          {f && f.income > 0 && <p style={{ margin: "8px 0 0" }}>Perkiraan pemasukan: <b className="num">{rp(f.income)}</b></p>}
        </div>
      </article>
      <article className="card span-7">
        <h3>Rincian prediksi per kategori</h3>
        {outItems.length ? (
          <ul className="list">
            {outItems.slice(0, 8).map(i => (
              <li key={i.category_id} className="row">
                <span className="av"><Icon n={i.icon} /></span>
                <span className="m"><b>{i.name}</b><span className="num">{[i.recurring && `rutin ${rp(i.recurring)}`, i.variable && `tidak rutin ≈ ${rp(i.variable)}`].filter(Boolean).join(" · ")}</span></span>
                <span className="amt num">{rp(i.total)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted">Catat transaksi selama beberapa minggu agar prediksi muncul.</p>}
      </article>
      {data?.items.map((x, i) => (
        <article key={i} className={`card span-4 insight-card${x.tone === "warn" ? " tone-warn" : x.tone === "good" ? " tone-good" : ""}`}>
          <Icon n={x.icon} className="big-ic" />
          <h3>{x.title}</h3>
          <p>{x.body}</p>
          {x.icon === "event_repeat" && <button className="btn text" style={{ marginLeft: -14, marginTop: 8 }} onClick={() => go("recurring")}>Atur transaksi rutin<Icon n="arrow_forward" /></button>}
        </article>
      ))}
    </>
  );
}
