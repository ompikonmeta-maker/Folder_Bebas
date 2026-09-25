import { Database } from "bun:sqlite";
import { DB_PATH } from "./paths";

export type DB = Database;

const WALLETS: [string, string][] = [
  ["E-Wallet", "smartphone"],
  ["Cash", "payments"],
  ["Transfer", "account_balance"],
];

// [name, icon, type, keywords]
const CATEGORIES: [string, string, "in" | "out", string][] = [
  ["Makan & Minum", "restaurant", "out", "makan minum kopi nasi ayam bakso mie warteg padang resto restoran cafe kafe jajan snack gofood grabfood shopeefood roti teh sarapan siang malam martabak"],
  ["Transportasi", "directions_car", "out", "gojek grab maxim bensin pertalite pertamax solar parkir tol ojek ojol taksi krl kereta mrt lrt bus busway transjakarta angkot servis bengkel oli"],
  ["Belanja Rumah", "shopping_basket", "out", "indomaret alfamart alfamidi beras minyak sabun sayur pasar supermarket gula telur galon gas elpiji deterjen sampo odol tisu"],
  ["Tagihan", "receipt_long", "out", "listrik pln token pdam air wifi internet indihome biznet pulsa kuota paket data bpjs cicilan kredit sewa kos kontrakan iuran"],
  ["Hiburan", "movie", "out", "netflix spotify youtube disney vidio bioskop cgv xxi game steam nonton liburan konser wisata"],
  ["Kesehatan", "medical_services", "out", "obat apotek dokter klinik puskesmas vitamin masker periksa lab"],
  ["Pendidikan", "school", "out", "buku sekolah kursus spp les kuliah seminar pelatihan udemy"],
  ["Belanja Pribadi", "checkroom", "out", "baju celana sepatu tas shopee tokopedia lazada skincare kosmetik potong rambut barbershop"],
  ["Sosial", "volunteer_activism", "out", "sedekah zakat infaq infak kondangan hadiah kado arisan donasi sumbangan"],
  ["Lainnya", "category", "out", ""],
  ["Gaji", "payments", "in", "gaji salary upah honor thr"],
  ["Bonus", "redeem", "in", "bonus insentif komisi tunjangan"],
  ["Usaha & Freelance", "work", "in", "proyek project freelance jualan penjualan order klien jasa desain"],
  ["Investasi", "trending_up", "in", "dividen bunga reksadana saham deposito emas"],
  ["Pemasukan Lain", "add_card", "in", "kiriman hadiah refund cashback pengembalian"],
];

export function openDb(path = DB_PATH): DB {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

/** Idempotent: safe to run on every launch. */
export function migrate(db: DB) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL,
      opening INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('in','out')),
      keywords TEXT NOT NULL DEFAULT '',
      UNIQUE (name, type)
    );
    CREATE TABLE IF NOT EXISTS recurring (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('in','out')),
      amount INTEGER NOT NULL CHECK (amount > 0),
      category_id INTEGER NOT NULL REFERENCES categories(id),
      wallet_id INTEGER NOT NULL REFERENCES wallets(id),
      note TEXT NOT NULL DEFAULT '',
      freq TEXT NOT NULL CHECK (freq IN ('daily','weekly','monthly')),
      start_date TEXT NOT NULL,
      last_date TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('in','out')),
      amount INTEGER NOT NULL CHECK (amount > 0),
      category_id INTEGER NOT NULL REFERENCES categories(id),
      wallet_id INTEGER NOT NULL REFERENCES wallets(id),
      date TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      receipt TEXT,
      recurring_id INTEGER REFERENCES recurring(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_tx_cat ON transactions(category_id);
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY,
      at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      action TEXT NOT NULL CHECK (action IN ('create','update','delete','auto')),
      entity TEXT NOT NULL,
      entity_id INTEGER,
      summary TEXT NOT NULL,
      data TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const addW = db.prepare("INSERT OR IGNORE INTO wallets (name, icon) VALUES (?, ?)");
  for (const w of WALLETS) addW.run(...w);
  const addC = db.prepare("INSERT OR IGNORE INTO categories (name, icon, type, keywords) VALUES (?, ?, ?, ?)");
  for (const c of CATEGORIES) addC.run(...c);
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('lan', '1')").run();
}

export function getSetting(db: DB, key: string): string | null {
  const r = db.query("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | null;
  return r?.value ?? null;
}
export function setSetting(db: DB, key: string, value: string) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function audit(db: DB, action: "create" | "update" | "delete" | "auto", entity: string, id: number | null, summary: string, data?: unknown) {
  db.prepare("INSERT INTO audit_log (action, entity, entity_id, summary, data) VALUES (?, ?, ?, ?, ?)")
    .run(action, entity, id, summary, data === undefined ? null : JSON.stringify(data));
}
