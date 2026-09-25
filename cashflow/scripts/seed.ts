// Fill a database with ~4 months of sample data, for trying the app out.
// Usage: CASHFLOW_DATA=./demo-data bun scripts/seed.ts   (refuses to touch a DB that already has data)
import { ensureDirs, DB_PATH } from "../server/paths";
import { openDb } from "../server/db";
import { materialize } from "../server/recurring";
import { addDays, shiftMonth, today, monthStart } from "../server/dates";

ensureDirs();
const db = openDb();
if ((db.query("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n > 0) {
  console.error(`${DB_PATH} sudah berisi data. Seed dibatalkan.`);
  process.exit(1);
}
const cat = (name: string) => (db.query("SELECT id FROM categories WHERE name = ?").get(name) as { id: number }).id;
const wal = (name: string) => (db.query("SELECT id FROM wallets WHERE name = ?").get(name) as { id: number }).id;
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const round = (n: number) => Math.round(n / 500) * 500;

db.prepare("UPDATE wallets SET opening = ? WHERE name = ?").run(2500000, "Transfer");
db.prepare("UPDATE wallets SET opening = ? WHERE name = ?").run(300000, "Cash");
db.prepare("UPDATE wallets SET opening = ? WHERE name = ?").run(150000, "E-Wallet");

const start = shiftMonth(monthStart(today()), -4);
const rule = db.prepare("INSERT INTO recurring (type, amount, category_id, wallet_id, note, freq, start_date) VALUES (?, ?, ?, ?, ?, ?, ?)");
rule.run("in", 9500000, cat("Gaji"), wal("Transfer"), "Gaji bulanan", "monthly", start);
rule.run("out", 350000, cat("Tagihan"), wal("Transfer"), "Internet rumah", "monthly", addDays(start, 27));
rule.run("out", 780000, cat("Tagihan"), wal("Transfer"), "Cicilan motor", "monthly", addDays(start, 4));
rule.run("out", 65000, cat("Hiburan"), wal("E-Wallet"), "Netflix", "monthly", addDays(start, 19));
rule.run("out", 50000, cat("Transportasi"), wal("Cash"), "Bensin mingguan", "weekly", addDays(start, 5));

const tx = db.prepare("INSERT INTO transactions (type, amount, category_id, wallet_id, note, date) VALUES (?, ?, ?, ?, ?, ?)");
const t = today();
for (let d = start; d < t; d = addDays(d, 1)) {
  const dow = new Date(d).getDay();
  if (dow >= 1 && dow <= 5) {
    if (rnd() < 0.7) tx.run("out", round(18000 + rnd() * 20000), cat("Makan & Minum"), wal("E-Wallet"), pick(["Kopi susu", "Kopi susu & roti", "Sarapan bubur"]), d);
    if (rnd() < 0.6) tx.run("out", round(15000 + rnd() * 15000), cat("Transportasi"), wal("E-Wallet"), pick(["Gojek ke kantor", "Grab pulang"]), d);
  }
  if (rnd() < 0.55) tx.run("out", round(20000 + rnd() * 35000), cat("Makan & Minum"), wal("Cash"), pick(["Makan siang padang", "Warteg", "Bakso", "Nasi goreng"]), d);
  if (rnd() < 0.12) tx.run("out", round(80000 + rnd() * 200000), cat("Belanja Rumah"), wal("Cash"), pick(["Indomaret", "Belanja pasar", "Beras 5kg & minyak"]), d);
  if (rnd() < 0.04) tx.run("out", round(50000 + rnd() * 150000), cat("Kesehatan"), wal("Cash"), "Apotek", d);
  if (rnd() < 0.05) tx.run("out", round(100000 + rnd() * 300000), cat("Belanja Pribadi"), wal("E-Wallet"), pick(["Shopee: kaos", "Tokopedia: sepatu"]), d);
  if (rnd() < 0.06) tx.run("in", round(500000 + rnd() * 1500000), cat("Usaha & Freelance"), wal("Transfer"), pick(["Proyek desain logo", "Jasa edit video"]), d);
  if (rnd() < 0.08) tx.run("out", round(100000 + rnd() * 100000), cat("Tagihan"), wal("E-Wallet"), pick(["Token listrik", "Pulsa & kuota"]), d);
}
tx.run("out", 685000, cat("Belanja Rumah"), wal("Transfer"), "Indomaret: stok bulanan", addDays(t, -1));
const n = materialize(db);
console.log(`Seed selesai. ${n} transaksi rutin + data harian di ${DB_PATH}`);
