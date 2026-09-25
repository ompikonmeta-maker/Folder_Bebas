import { useState } from "react";
import { compact, monthLabel, rp, toDate } from "../lib/format";

/** Grouped income/expense bars on one shared scale. */
export function FlowChart({ series, granularity }: { series: { key: string; income: number; expense: number }[]; granularity: "day" | "month" }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const W = Math.max(560, series.length * (granularity === "day" ? 22 : 56)), H = 260, L = 52, B = 28, T = 12;
  const rawMax = Math.max(1, ...series.flatMap(s => [s.income, s.expense]));
  const step = niceStep(rawMax / 4);
  const max = Math.ceil(rawMax / step) * step;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const gw = (W - L) / series.length;
  const bw = Math.max(3, Math.min(22, gw / 2.6));
  const label = (k: string) => granularity === "month" ? monthLabel(k) : String(toDate(k).getDate());
  const every = granularity === "day" ? Math.ceil(series.length / 16) : 1;
  const bar = (x: number, v: number, fill: string, text: string, key: string) => {
    if (v <= 0) return null;
    const h = y(0) - y(v), r = Math.min(4, bw / 2, h);
    return <path key={key} className="bar" fill={fill}
      d={`M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z`}
      onPointerMove={e => setTip({ x: e.clientX, y: e.clientY, text })} onPointerLeave={() => setTip(null)} />;
  };
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1; v += step) ticks.push(v);
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: Math.min(W, 520) }} role="img" aria-label="Grafik pemasukan dan pengeluaran">
        {ticks.map(v => <g key={v}>
          <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" strokeWidth="1" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end">{v ? compact(v) : "0"}</text>
        </g>)}
        {series.map((s, i) => {
          const cx = L + gw * i + gw / 2;
          const name = granularity === "month" ? monthLabel(s.key) : toDate(s.key).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
          return <g key={s.key}>
            {bar(cx - bw - 1, s.income, "var(--chart-a)", `${name} · pemasukan ${rp(s.income)}`, "i")}
            {bar(cx + 1, s.expense, "var(--chart-b)", `${name} · pengeluaran ${rp(s.expense)}`, "e")}
            {i % every === 0 && <text x={cx} y={H - 8} textAnchor="middle">{label(s.key)}</text>}
          </g>;
        })}
      </svg>
      {tip && <div className="tip" style={{ left: tip.x + 12, top: tip.y - 36 }}>{tip.text}</div>}
    </div>
  );
}

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** Horizontal share bars; one hue, magnitude only. */
export function ShareBars({ items, total, alt }: { items: { name: string; icon: string; total: number }[]; total: number; alt?: boolean }) {
  const max = Math.max(1, ...items.map(i => i.total));
  return (
    <div>
      {items.map(i => (
        <div className="hbar" key={i.name}>
          <span className="n"><span className="ms" aria-hidden="true">{i.icon}</span><span>{i.name}</span></span>
          <span className="track"><span className={`fillb${alt ? " b" : ""}`} style={{ width: `${(i.total / max) * 100}%` }} /></span>
          <span className="v num">{rp(i.total)} · {total ? Math.round((i.total / total) * 100) : 0}%</span>
        </div>
      ))}
    </div>
  );
}
