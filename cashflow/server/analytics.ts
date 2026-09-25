import type { DB } from "./db";
import { addDays, daysBetween, monthEnd, monthStart, parse, shiftMonth, today } from "./dates";
import { type Rule, upcoming } from "./recurring";

interface Cat { id: number; name: string; icon: string; type: "in" | "out"; keywords: string }

// ───────── Category prediction: keyword rules + naive Bayes on your own history ─────────

const STOP = new Set(["di", "ke", "dan", "yang", "untuk", "dari", "buat", "sama", "the", "rp", "ribu", "rb", "jt", "beli", "bayar"]);

export function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length >= 2 && !STOP.has(t) && !/^\d+$/.test(t));
}
const norm = (s: string) => tokenize(s).join(" ");

export function predictCategory(db: DB, note: string, type: "in" | "out") {
  const tokens = tokenize(note);
  if (!tokens.length) return [];
  const cats = db.query("SELECT * FROM categories WHERE type = ?").all(type) as Cat[];
  const text = " " + tokens.join(" ") + " ";

  // Rule score: share of tokens that hit a category keyword.
  const rule = new Map<number, number>();
  for (const c of cats) {
    const kws = c.keywords.split(/\s+/).filter(Boolean);
    let hits = 0;
    for (const k of kws) if (text.includes(" " + k + " ") || tokens.some(t => t.length >= 4 && t.startsWith(k) && k.length >= 4)) hits++;
    if (hits) rule.set(c.id, Math.min(1, hits / tokens.length + 0.3));
  }

  // Naive Bayes over past notes of the same type.
  const rows = db.query(
    "SELECT note, category_id FROM transactions WHERE type = ? AND note != '' ORDER BY id DESC LIMIT 3000"
  ).all(type) as { note: string; category_id: number }[];
  const nb = new Map<number, number>();
  const exact = new Map<number, number>();
  if (rows.length) {
    const target = tokens.join(" ");
    const docCount = new Map<number, number>();
    const tokCount = new Map<number, Map<string, number>>();
    const totals = new Map<number, number>();
    const vocab = new Set<string>();
    for (const r of rows) {
      const toks = tokenize(r.note);
      if (toks.join(" ") === target) exact.set(r.category_id, (exact.get(r.category_id) ?? 0) + 1);
      docCount.set(r.category_id, (docCount.get(r.category_id) ?? 0) + 1);
      const m = tokCount.get(r.category_id) ?? new Map();
      for (const t of toks) { m.set(t, (m.get(t) ?? 0) + 1); vocab.add(t); }
      tokCount.set(r.category_id, m);
      totals.set(r.category_id, (totals.get(r.category_id) ?? 0) + toks.length);
    }
    if (tokens.some(t => vocab.has(t))) {
      const V = vocab.size + 1;
      const logs: [number, number][] = [];
      for (const [cid, n] of docCount) {
        let lp = Math.log(n / rows.length);
        const m = tokCount.get(cid)!;
        for (const t of tokens) lp += Math.log(((m.get(t) ?? 0) + 1) / ((totals.get(cid) ?? 0) + V));
        logs.push([cid, lp]);
      }
      const max = Math.max(...logs.map(l => l[1]));
      const sum = logs.reduce((s, l) => s + Math.exp(l[1] - max), 0);
      for (const [cid, lp] of logs) nb.set(cid, Math.exp(lp - max) / sum);
    }
  }

  const scores = cats.map(c => {
    const e = exact.size ? (exact.get(c.id) ?? 0) / [...exact.values()].reduce((a, b) => a + b, 0) : 0;
    const s = exact.size ? 0.6 * e + 0.25 * (nb.get(c.id) ?? 0) + 0.15 * (rule.get(c.id) ?? 0)
      : nb.size ? 0.6 * (nb.get(c.id) ?? 0) + 0.4 * (rule.get(c.id) ?? 0)
      : rule.get(c.id) ?? 0;
    const source = exact.get(c.id) ? "riwayat" : nb.get(c.id) && (nb.get(c.id)! > (rule.get(c.id) ?? 0)) ? "riwayat" : "kata kunci";
    return { category_id: c.id, name: c.name, icon: c.icon, score: Math.round(s * 100) / 100, source };
  }).filter(s => s.score >= 0.15).sort((a, b) => b.score - a.score);
  return scores.slice(0, 3);
}

// ───────── Aggregates ─────────

function sumBy(db: DB, from: string, to: string) {
  return db.query(`SELECT
      COALESCE(SUM(CASE WHEN type='in' THEN amount END),0) AS income,
      COALESCE(SUM(CASE WHEN type='out' THEN amount END),0) AS expense
    FROM transactions WHERE date BETWEEN ? AND ?`).get(from, to) as { income: number; expense: number };
}

export function balances(db: DB, upTo = today()) {
  return db.query(`SELECT w.id, w.name, w.icon, w.opening,
      w.opening + COALESCE(SUM(CASE WHEN t.type='in' THEN t.amount WHEN t.type='out' THEN -t.amount END),0) AS balance
    FROM wallets w LEFT JOIN transactions t ON t.wallet_id = w.id AND t.date <= ?
    GROUP BY w.id ORDER BY w.id`).all(upTo) as { id: number; name: string; icon: string; opening: number; balance: number }[];
}

function prevRange(from: string, to: string) {
  const len = daysBetween(from, to) + 1;
  // Whole calendar months compare against the previous whole month(s).
  if (from === monthStart(from) && to === monthEnd(to)) {
    const months = (parse(to).getFullYear() - parse(from).getFullYear()) * 12 + parse(to).getMonth() - parse(from).getMonth() + 1;
    const pf = shiftMonth(from, -months);
    return { from: pf, to: addDays(from, -1) };
  }
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

export function upcomingRules(db: DB, limit = 5) {
  const t = today();
  const rules = db.query(`SELECT r.*, c.name AS category, c.icon FROM recurring r JOIN categories c ON c.id = r.category_id WHERE r.active = 1`).all() as (Rule & { category: string; icon: string })[];
  return rules.map(r => ({ id: r.id, note: r.note, type: r.type, amount: r.amount, category: r.category, icon: r.icon, freq: r.freq, date: upcoming(r, t) }))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}

export function summary(db: DB, from: string, to: string) {
  const cur = sumBy(db, from, to);
  const p = prevRange(from, to);
  const prev = sumBy(db, p.from, p.to);
  return { from, to, ...cur, prev: { ...prev, ...p }, wallets: balances(db) };
}

export function report(db: DB, from: string, to: string) {
  const days = daysBetween(from, to) + 1;
  const byCat = db.query(`SELECT c.id, c.name, c.icon, t.type, SUM(t.amount) AS total, COUNT(*) AS count
    FROM transactions t JOIN categories c ON c.id = t.category_id
    WHERE t.date BETWEEN ? AND ? GROUP BY c.id, t.type ORDER BY total DESC`).all(from, to);
  const byWallet = db.query(`SELECT w.name, w.icon,
      COALESCE(SUM(CASE WHEN t.type='in' THEN t.amount END),0) AS income,
      COALESCE(SUM(CASE WHEN t.type='out' THEN t.amount END),0) AS expense
    FROM wallets w LEFT JOIN transactions t ON t.wallet_id = w.id AND t.date BETWEEN ? AND ?
    GROUP BY w.id ORDER BY w.id`).all(from, to);
  const monthly = days > 62;
  const key = monthly ? "substr(date,1,7)" : "date";
  const rows = db.query(`SELECT ${key} AS k,
      COALESCE(SUM(CASE WHEN type='in' THEN amount END),0) AS income,
      COALESCE(SUM(CASE WHEN type='out' THEN amount END),0) AS expense
    FROM transactions WHERE date BETWEEN ? AND ? GROUP BY k`).all(from, to) as { k: string; income: number; expense: number }[];
  const map = new Map(rows.map(r => [r.k, r]));
  const series: { key: string; income: number; expense: number }[] = [];
  if (monthly) {
    for (let d = monthStart(from); d <= to; d = shiftMonth(d, 1)) {
      const k = d.slice(0, 7);
      series.push({ key: k, income: map.get(k)?.income ?? 0, expense: map.get(k)?.expense ?? 0 });
    }
  } else {
    for (let d = from; d <= to; d = addDays(d, 1)) series.push({ key: d, income: map.get(d)?.income ?? 0, expense: map.get(d)?.expense ?? 0 });
  }
  const p = prevRange(from, to);
  return { from, to, granularity: monthly ? "month" : "day", ...sumBy(db, from, to), prev: { ...sumBy(db, p.from, p.to), ...p }, byCategory: byCat, byWallet, series };
}

// ───────── Forecast: recurring rules + weighted average of the last 3 months ─────────

const MONTHLY_FACTOR = { daily: 365 / 12, weekly: 52 / 12, monthly: 1 } as const;

export function forecast(db: DB) {
  const t = today();
  const m0 = monthStart(t);
  const first = (db.query("SELECT MIN(date) AS d FROM transactions").get() as { d: string | null }).d;
  const cats = db.query("SELECT * FROM categories").all() as Cat[];
  const weights = [3, 2, 1];
  const hist = new Map<number, number>();
  let wsum = 0;
  for (let i = 0; i < 3; i++) {
    const from = shiftMonth(m0, -(i + 1)), to = monthEnd(from);
    if (!first || first > to) break;
    wsum += weights[i];
    const rows = db.query(`SELECT category_id, SUM(amount) AS s FROM transactions
      WHERE date BETWEEN ? AND ? AND recurring_id IS NULL GROUP BY category_id`).all(from, to) as { category_id: number; s: number }[];
    for (const r of rows) hist.set(r.category_id, (hist.get(r.category_id) ?? 0) + r.s * weights[i]);
  }
  // No full month yet: extrapolate the current month so far.
  if (!wsum && first) {
    const elapsed = daysBetween(m0 > first ? m0 : first, t) + 1;
    const rows = db.query(`SELECT category_id, SUM(amount) AS s FROM transactions
      WHERE date BETWEEN ? AND ? AND recurring_id IS NULL GROUP BY category_id`).all(m0, t) as { category_id: number; s: number }[];
    for (const r of rows) hist.set(r.category_id, (r.s / elapsed) * 30);
    wsum = 1;
  }
  const rules = db.query("SELECT * FROM recurring WHERE active = 1").all() as Rule[];
  const rec = new Map<number, number>();
  for (const r of rules) rec.set(r.category_id, (rec.get(r.category_id) ?? 0) + r.amount * MONTHLY_FACTOR[r.freq]);

  const items = cats.map(c => {
    const avg = wsum ? (hist.get(c.id) ?? 0) / wsum : 0;
    const recurring = rec.get(c.id) ?? 0;
    return { category_id: c.id, name: c.name, icon: c.icon, type: c.type, recurring: Math.round(recurring), variable: Math.round(avg), total: Math.round(avg + recurring) };
  }).filter(i => i.total > 0).sort((a, b) => b.total - a.total);
  const month = shiftMonth(m0, 1).slice(0, 7);
  return {
    month,
    basis: first ? "riwayat" : "kosong",
    expense: items.filter(i => i.type === "out").reduce((s, i) => s + i.total, 0),
    income: items.filter(i => i.type === "in").reduce((s, i) => s + i.total, 0),
    items,
  };
}

// ───────── Insights ─────────

export interface Insight { icon: string; title: string; body: string; tone: "info" | "good" | "warn" }

const rp = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");
const pct = (n: number) => Math.round(n * 100) + "%";

export function insights(db: DB): Insight[] {
  const out: Insight[] = [];
  const t = today();
  const m0 = monthStart(t);
  const day = parse(t).getDate();
  const prevStart = shiftMonth(m0, -1);
  const prevSame = addDays(prevStart, Math.min(day, parse(monthEnd(prevStart)).getDate()) - 1);
  const count = (db.query("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n;
  if (!count) {
    return [{ icon: "edit_note", title: "Belum ada data", body: "Catat beberapa transaksi dulu. Insight dan prediksi muncul setelah ada riwayat.", tone: "info" }];
  }

  // 1. Category change vs the same days of last month.
  const catSum = (from: string, to: string) => new Map((db.query(`SELECT c.id, c.name, SUM(t.amount) AS s FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE t.type='out' AND t.date BETWEEN ? AND ? GROUP BY c.id`).all(from, to) as { id: number; name: string; s: number }[]).map(r => [r.id, r]));
  const cur = catSum(m0, t), prev = catSum(prevStart, prevSame);
  const changes = [...cur.values()].map(c => ({ ...c, p: prev.get(c.id)?.s ?? 0 }))
    .filter(c => c.p > 0 && Math.abs(c.s - c.p) >= 50000 && Math.abs(c.s - c.p) / c.p >= 0.2)
    .sort((a, b) => Math.abs(b.s - b.p) - Math.abs(a.s - a.p)).slice(0, 2);
  for (const c of changes) {
    const up = c.s > c.p;
    out.push({ icon: up ? "trending_up" : "trending_down", tone: up ? "warn" : "good",
      title: `${c.name} ${up ? "naik" : "turun"} ${pct(Math.abs(c.s - c.p) / c.p)}`,
      body: `${rp(c.s)} di tanggal 1–${day} bulan ini, dibanding ${rp(c.p)} pada periode yang sama bulan lalu.` });
  }

  // 2. End-of-month projection.
  const bal = balances(db).reduce((s, w) => s + w.balance, 0);
  const varOut = (db.query(`SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE type='out' AND recurring_id IS NULL AND date BETWEEN ? AND ?`).get(m0, t) as { s: number }).s;
  const end = monthEnd(t);
  const remaining = daysBetween(t, end);
  const rules = db.query("SELECT * FROM recurring WHERE active = 1").all() as Rule[];
  let recNet = 0;
  for (const r of rules) {
    let d = upcoming(r, t), g = 0;
    while (d <= end && g++ < 40) { recNet += r.type === "in" ? r.amount : -r.amount; d = upcoming({ ...r, last_date: d }, d); }
  }
  const projected = bal - (varOut / day) * remaining + recNet;
  out.push({ icon: "savings", tone: projected >= 0 ? "info" : "warn",
    title: `Proyeksi saldo ${parse(end).getDate()} ${parse(end).toLocaleString("id-ID", { month: "short" })}: ${rp(projected)}`,
    body: `Saldo sekarang ${rp(bal)}. Pengeluaran harian rata-rata ${rp(varOut / day)}${recNet ? `, ditambah transaksi rutin ${recNet >= 0 ? "+" : "−"}${rp(Math.abs(recNet))}` : ""}.` });

  // 3. Unusual transactions this month (≥ 2× median of the category over 90 days).
  const recent = db.query(`SELECT t.id, t.amount, t.note, t.date, t.category_id, c.name FROM transactions t JOIN categories c ON c.id=t.category_id
      WHERE t.type='out' AND t.recurring_id IS NULL AND t.date BETWEEN ? AND ? ORDER BY t.amount DESC LIMIT 50`).all(m0, t) as { id: number; amount: number; note: string; date: string; category_id: number; name: string }[];
  let anomalies = 0;
  for (const r of recent) {
    if (anomalies >= 2) break;
    const others = (db.query(`SELECT amount FROM transactions WHERE type='out' AND category_id = ? AND id != ? AND date BETWEEN ? AND ? ORDER BY amount`)
      .all(r.category_id, r.id, addDays(t, -90), t) as { amount: number }[]).map(o => o.amount);
    if (others.length < 4) continue;
    const med = others[Math.floor(others.length / 2)];
    if (r.amount >= med * 2 && r.amount - med >= 50000) {
      anomalies++;
      out.push({ icon: "warning", tone: "warn", title: "Transaksi tidak biasa",
        body: `${r.note || r.name} ${rp(r.amount)} pada ${parse(r.date).getDate()} ${parse(r.date).toLocaleString("id-ID", { month: "short" })}, ${(r.amount / med).toFixed(1).replace(".", ",")}× biasanya untuk ${r.name}.` });
    }
  }

  // 4. Savings rate + top category.
  const s = sumBy(db, m0, t);
  if (s.income > 0) {
    const rate = (s.income - s.expense) / s.income;
    out.push({ icon: rate >= 0.2 ? "check_circle" : "info", tone: rate >= 0.2 ? "good" : rate < 0 ? "warn" : "info",
      title: `Rasio tabungan bulan ini ${pct(rate)}`,
      body: rate >= 0.2 ? "Di atas 20%. Pertahankan." : rate < 0 ? "Pengeluaran melebihi pemasukan bulan ini." : "Di bawah 20%. Coba tekan pengeluaran variabel." });
  }
  const top = [...cur.values()].sort((a, b) => b.s - a.s)[0];
  if (top && s.expense > 0) out.push({ icon: "donut_large", tone: "info", title: `Terbesar: ${top.name}`, body: `${pct(top.s / s.expense)} dari pengeluaran bulan ini (${rp(top.s)}).` });

  // 5. Repeated notes that look like a routine.
  const rows = db.query(`SELECT note, category_id FROM transactions WHERE type='out' AND recurring_id IS NULL AND note != '' AND date >= ?`).all(addDays(t, -45)) as { note: string }[];
  const freq = new Map<string, { n: number; note: string }>();
  for (const r of rows) { const k = norm(r.note); if (!k) continue; const f = freq.get(k) ?? { n: 0, note: r.note }; f.n++; freq.set(k, f); }
  const ruleNotes = new Set(rules.map(r => norm(r.note)));
  const rep = [...freq.entries()].filter(([k, f]) => f.n >= 4 && !ruleNotes.has(k)).sort((a, b) => b[1].n - a[1].n)[0];
  if (rep) out.push({ icon: "event_repeat", tone: "info", title: "Kebiasaan rutin terdeteksi", body: `"${rep[1].note}" tercatat ${rep[1].n}× dalam 45 hari. Bisa dijadikan transaksi rutin.` });

  // 6. No-spend days.
  const spendDays = (db.query(`SELECT COUNT(DISTINCT date) AS n FROM transactions WHERE type='out' AND recurring_id IS NULL AND date BETWEEN ? AND ?`).get(m0, t) as { n: number }).n;
  if (day - spendDays >= 3) out.push({ icon: "celebration", tone: "good", title: `${day - spendDays} hari tanpa belanja`, body: `Bulan ini ada ${day - spendDays} dari ${day} hari tanpa pengeluaran harian.` });

  // 7. Next month forecast.
  const f = forecast(db);
  const topF = f.items.filter(i => i.type === "out").slice(0, 2).map(i => `${i.name} ${rp(i.total)}`).join(", ");
  if (f.expense) out.push({ icon: "auto_awesome", tone: "info", title: `Prediksi pengeluaran ${parse(f.month + "-01").toLocaleString("id-ID", { month: "long" })}: ${rp(f.expense)}`, body: `Terbesar: ${topF}.` });

  return out;
}
