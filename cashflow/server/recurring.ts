import { type DB, audit } from "./db";
import { addDays, nextMonthly, parse, today } from "./dates";

export type Freq = "daily" | "weekly" | "monthly";
export interface Rule {
  id: number; type: "in" | "out"; amount: number; category_id: number; wallet_id: number;
  note: string; freq: Freq; start_date: string; last_date: string | null; active: number;
}

export function nextDate(rule: Pick<Rule, "freq" | "start_date">, after: string): string {
  if (rule.freq === "daily") return addDays(after, 1);
  if (rule.freq === "weekly") return addDays(after, 7);
  return nextMonthly(after, parse(rule.start_date).getDate());
}

/** First occurrence strictly after `from` (or the start date itself if later). */
export function upcoming(rule: Rule, from: string): string {
  let d = rule.last_date ? nextDate(rule, rule.last_date) : rule.start_date;
  let guard = 0;
  while (d <= from && guard++ < 5000) d = nextDate(rule, d);
  return d;
}

const MAX_PER_RUN = 2000;

/** Record every due occurrence up to today. Rules are auto-recorded without confirmation. */
export function materialize(db: DB, until = today()): number {
  const rules = db.query("SELECT * FROM recurring WHERE active = 1").all() as Rule[];
  const insert = db.prepare(
    "INSERT INTO transactions (type, amount, category_id, wallet_id, date, note, recurring_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const setLast = db.prepare("UPDATE recurring SET last_date = ? WHERE id = ?");
  let count = 0;
  db.transaction(() => {
    for (const r of rules) {
      let d = r.last_date ? nextDate(r, r.last_date) : r.start_date;
      let last: string | null = null;
      while (d <= until && count < MAX_PER_RUN) {
        const res = insert.run(r.type, r.amount, r.category_id, r.wallet_id, d, r.note, r.id);
        audit(db, "auto", "transaction", Number(res.lastInsertRowid), `${r.note || "Transaksi rutin"} (${d})`, { ...r, date: d });
        last = d;
        count++;
        d = nextDate(r, d);
      }
      if (last) setLast.run(last, r.id);
    }
  })();
  return count;
}
