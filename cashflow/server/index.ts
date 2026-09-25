import { networkInterfaces } from "node:os";
import { basename, join, resolve, extname } from "node:path";
import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { openDb, audit, getSetting, setSetting } from "./db";
import { BACKUP_DIR, COMPILED, DATA_DIR, RECEIPT_DIR, WEB_DIR, ensureDirs } from "./paths";
import { materialize, type Freq } from "./recurring";
import { forecast, insights, predictCategory, report, summary, upcomingRules } from "./analytics";
import { addDays, isDate, today, daysBetween } from "./dates";

ensureDirs();
const db = openDb();
materialize(db);
autoBackup();
setInterval(() => { materialize(db); autoBackup(); }, 30 * 60 * 1000);

// ───────── helpers ─────────
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
const json = (data: unknown, status = 200) => Response.json(data, { status });
const bad = (msg: string) => { throw new HttpError(400, msg); };

const TX_SELECT = `SELECT t.*, c.name AS category, c.icon AS category_icon, w.name AS wallet, w.icon AS wallet_icon
  FROM transactions t JOIN categories c ON c.id = t.category_id JOIN wallets w ON w.id = t.wallet_id`;

function range(u: URL) {
  const from = u.searchParams.get("from"), to = u.searchParams.get("to");
  if (!isDate(from) || !isDate(to) || from > to) bad("Rentang tanggal tidak valid");
  return { from: from!, to: to! };
}

interface TxInput { type: "in" | "out"; amount: number; category_id: number; wallet_id: number; date: string; note?: string; receipt?: string | null; repeat?: Freq | null }
function validateTx(b: any): TxInput {
  if (b?.type !== "in" && b?.type !== "out") bad("Jenis harus pemasukan atau pengeluaran");
  const amount = Math.round(Number(b.amount));
  if (!Number.isFinite(amount) || amount <= 0) bad("Nominal harus lebih dari 0");
  if (!isDate(b.date)) bad("Tanggal tidak valid");
  const cat = db.query("SELECT type FROM categories WHERE id = ?").get(b.category_id) as { type: string } | null;
  if (!cat) bad("Kategori tidak ditemukan");
  if (cat!.type !== b.type) bad("Kategori tidak cocok dengan jenis transaksi");
  if (!db.query("SELECT 1 FROM wallets WHERE id = ?").get(b.wallet_id)) bad("Dompet tidak ditemukan");
  if (b.repeat && !["daily", "weekly", "monthly"].includes(b.repeat)) bad("Frekuensi tidak valid");
  if (b.receipt && basename(b.receipt) !== b.receipt) bad("Nama file struk tidak valid");
  return { type: b.type, amount, category_id: b.category_id, wallet_id: b.wallet_id, date: b.date, note: String(b.note ?? "").trim().slice(0, 200), receipt: b.receipt || null, repeat: b.repeat || null };
}
const getTx = (id: number) => db.query(`${TX_SELECT} WHERE t.id = ?`).get(id) as any;
const describe = (t: { note?: string; amount: number; type: string }) =>
  `${t.note || (t.type === "in" ? "Pemasukan" : "Pengeluaran")} · Rp ${t.amount.toLocaleString("id-ID")}`;

function lanAddresses(port: number) {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) for (const a of list ?? [])
    if (a.family === "IPv4" && !a.internal) out.push(`http://${a.address}:${port}`);
  return out;
}

function backup(): string {
  const d = new Date();
  const name = `cashflow-${today()}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}.db`;
  const file = join(BACKUP_DIR, name);
  if (existsSync(file)) unlinkSync(file);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  setSetting(db, "last_backup", today());
  const all = readdirSync(BACKUP_DIR).filter(f => f.endsWith(".db")).sort();
  for (const old of all.slice(0, Math.max(0, all.length - 8))) unlinkSync(join(BACKUP_DIR, old));
  return name;
}
function autoBackup() {
  const last = getSetting(db, "last_backup");
  const hasData = (db.query("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n > 0;
  if (hasData && (!last || daysBetween(last, today()) >= 7)) backup();
}

const isLoopback = (ip: string) => ip === "::1" || ip.startsWith("127.") || ip.startsWith("::ffff:127.");

function csvCell(v: unknown) { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

// ───────── API ─────────
async function api(req: Request, u: URL, port: number): Promise<Response> {
  const p = u.pathname.replace(/^\/api/, "");
  const m = req.method;
  let mm: RegExpMatchArray | null;

  if (p === "/meta" && m === "GET") {
    return json({
      categories: db.query("SELECT id, name, icon, type FROM categories ORDER BY type DESC, id").all(),
      wallets: db.query("SELECT id, name, icon, opening FROM wallets ORDER BY id").all(),
      today: today(),
    });
  }

  if (p === "/transactions" && m === "GET") {
    const q = u.searchParams;
    const where: string[] = [], args: any[] = [];
    const from = q.get("from"), to = q.get("to");
    if (isDate(from) && isDate(to)) { where.push("t.date BETWEEN ? AND ?"); args.push(from, to); }
    if (q.get("type") === "in" || q.get("type") === "out") { where.push("t.type = ?"); args.push(q.get("type")); }
    if (q.get("wallet")) { where.push("t.wallet_id = ?"); args.push(Number(q.get("wallet"))); }
    if (q.get("category")) { where.push("t.category_id = ?"); args.push(Number(q.get("category"))); }
    if (q.get("recurring") === "1") where.push("t.recurring_id IS NOT NULL");
    if (q.get("receipt") === "1") where.push("t.receipt IS NOT NULL");
    if (q.get("q")) { where.push("(t.note LIKE ? OR c.name LIKE ?)"); const s = `%${q.get("q")}%`; args.push(s, s); }
    const limit = Math.min(500, Number(q.get("limit") ?? 200)), offset = Number(q.get("offset") ?? 0);
    const w = where.length ? " WHERE " + where.join(" AND ") : "";
    const rows = db.query(`${TX_SELECT}${w} ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
    const total = db.query(`SELECT COUNT(*) AS n FROM transactions t JOIN categories c ON c.id = t.category_id${w}`).get(...args) as { n: number };
    return json({ rows, total: total.n });
  }

  if (p === "/transactions" && m === "POST") {
    const b = validateTx(await req.json());
    let id = 0;
    db.transaction(() => {
      if (b.repeat) {
        const r = db.prepare("INSERT INTO recurring (type, amount, category_id, wallet_id, note, freq, start_date) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(b.type, b.amount, b.category_id, b.wallet_id, b.note!, b.repeat, b.date);
        audit(db, "create", "recurring", Number(r.lastInsertRowid), `Aturan rutin: ${describe(b)}`, b);
      } else {
        const r = db.prepare("INSERT INTO transactions (type, amount, category_id, wallet_id, date, note, receipt) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(b.type, b.amount, b.category_id, b.wallet_id, b.date, b.note!, b.receipt ?? null);
        id = Number(r.lastInsertRowid);
        audit(db, "create", "transaction", id, describe(b), b);
      }
    })();
    if (b.repeat) {
      materialize(db);
      // Attach the receipt to the first occurrence, if it was recorded.
      const first = db.query("SELECT id FROM transactions WHERE recurring_id = (SELECT MAX(id) FROM recurring) ORDER BY date LIMIT 1").get() as { id: number } | null;
      if (first) { id = first.id; if (b.receipt) db.prepare("UPDATE transactions SET receipt = ? WHERE id = ?").run(b.receipt, id); }
    }
    return json(id ? getTx(id) : { scheduled: true }, 201);
  }

  if ((mm = p.match(/^\/transactions\/(\d+)$/))) {
    const id = Number(mm[1]);
    const before = getTx(id);
    if (!before) throw new HttpError(404, "Transaksi tidak ditemukan");
    if (m === "GET") return json(before);
    if (m === "PUT") {
      const b = validateTx(await req.json());
      db.prepare("UPDATE transactions SET type=?, amount=?, category_id=?, wallet_id=?, date=?, note=?, receipt=?, updated_at=datetime('now','localtime') WHERE id=?")
        .run(b.type, b.amount, b.category_id, b.wallet_id, b.date, b.note!, b.receipt ?? null, id);
      const after = getTx(id);
      const changes: string[] = [];
      if (before.amount !== after.amount) changes.push(`nominal ${before.amount.toLocaleString("id-ID")} → ${after.amount.toLocaleString("id-ID")}`);
      if (before.category !== after.category) changes.push(`kategori ${before.category} → ${after.category}`);
      if (before.wallet !== after.wallet) changes.push(`dompet ${before.wallet} → ${after.wallet}`);
      if (before.date !== after.date) changes.push(`tanggal ${before.date} → ${after.date}`);
      if (before.note !== after.note) changes.push("catatan");
      if (before.receipt !== after.receipt) changes.push("struk");
      if (before.receipt && before.receipt !== after.receipt) removeReceipt(before.receipt);
      audit(db, "update", "transaction", id, `${after.note || after.category}: ${changes.join(", ") || "tanpa perubahan"}`, { before, after });
      return json(after);
    }
    if (m === "DELETE") {
      db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
      if (before.receipt) removeReceipt(before.receipt);
      audit(db, "delete", "transaction", id, describe(before), before);
      return json({ ok: true });
    }
  }

  if (p === "/recurring" && m === "GET") {
    const rows = db.query(`SELECT r.*, c.name AS category, c.icon AS category_icon, w.name AS wallet
      FROM recurring r JOIN categories c ON c.id = r.category_id JOIN wallets w ON w.id = r.wallet_id ORDER BY r.active DESC, r.id DESC`).all();
    return json({ rows, upcoming: upcomingRules(db, 50) });
  }
  if (p === "/recurring" && m === "POST") {
    const raw = await req.json() as any;
    const b = validateTx({ ...raw, date: raw.start_date, repeat: raw.freq });
    if (!b.repeat) bad("Frekuensi wajib diisi");
    const r = db.prepare("INSERT INTO recurring (type, amount, category_id, wallet_id, note, freq, start_date) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(b.type, b.amount, b.category_id, b.wallet_id, b.note!, b.repeat!, b.date);
    audit(db, "create", "recurring", Number(r.lastInsertRowid), `Aturan rutin: ${describe(b)}`, b);
    materialize(db);
    return json({ id: Number(r.lastInsertRowid) }, 201);
  }
  if ((mm = p.match(/^\/recurring\/(\d+)$/))) {
    const id = Number(mm[1]);
    const before = db.query("SELECT * FROM recurring WHERE id = ?").get(id) as any;
    if (!before) throw new HttpError(404, "Aturan rutin tidak ditemukan");
    if (m === "PUT") {
      const raw = await req.json() as any;
      if (Object.keys(raw).length === 1 && "active" in raw) {
        db.prepare("UPDATE recurring SET active = ? WHERE id = ?").run(raw.active ? 1 : 0, id);
        audit(db, "update", "recurring", id, `${before.note || "Aturan rutin"}: ${raw.active ? "diaktifkan" : "dijeda"}`);
        // Resuming skips the paused period instead of back-filling it.
        if (raw.active) db.prepare("UPDATE recurring SET last_date = MAX(COALESCE(last_date, ''), ?) WHERE id = ? AND start_date < ?").run(addDays(today(), -1), id, today());
      } else {
        const b = validateTx({ ...raw, date: raw.start_date, repeat: raw.freq });
        db.prepare("UPDATE recurring SET type=?, amount=?, category_id=?, wallet_id=?, note=?, freq=?, start_date=? WHERE id=?")
          .run(b.type, b.amount, b.category_id, b.wallet_id, b.note!, b.repeat!, b.date, id);
        audit(db, "update", "recurring", id, `Aturan rutin diubah: ${describe(b)}`, { before, after: b });
      }
      materialize(db);
      return json({ ok: true });
    }
    if (m === "DELETE") {
      db.prepare("DELETE FROM recurring WHERE id = ?").run(id);
      audit(db, "delete", "recurring", id, `Aturan rutin dihapus: ${describe(before)}`, before);
      return json({ ok: true });
    }
  }

  if (p === "/wallets" && m === "PUT") {
    const b = await req.json() as { id: number; opening: number }[];
    const upd = db.prepare("UPDATE wallets SET opening = ? WHERE id = ?");
    db.transaction(() => { for (const w of b) upd.run(Math.round(Number(w.opening) || 0), w.id); })();
    audit(db, "update", "wallet", null, "Saldo awal dompet diubah", b);
    return json({ ok: true });
  }

  if (p === "/summary" && m === "GET") { const r = range(u); return json({ ...summary(db, r.from, r.to), upcoming: upcomingRules(db, 4), insight: insights(db)[0] ?? null }); }
  if (p === "/report" && m === "GET") { const r = range(u); return json(report(db, r.from, r.to)); }
  if (p === "/insights" && m === "GET") return json({ items: insights(db), forecast: forecast(db) });
  if (p === "/predict" && m === "GET") {
    const type = u.searchParams.get("type") === "in" ? "in" : "out";
    return json(predictCategory(db, u.searchParams.get("note") ?? "", type));
  }
  if (p === "/audit" && m === "GET") {
    const limit = Math.min(500, Number(u.searchParams.get("limit") ?? 100));
    return json(db.query("SELECT id, at, action, entity, entity_id, summary FROM audit_log ORDER BY id DESC LIMIT ?").all(limit));
  }

  if (p === "/export.csv" && m === "GET") {
    const r = range(u);
    const rows = db.query(`${TX_SELECT} WHERE t.date BETWEEN ? AND ? ORDER BY t.date, t.id`).all(r.from, r.to) as any[];
    const head = ["Tanggal", "Jenis", "Kategori", "Dompet", "Nominal", "Catatan", "Rutin", "Struk"];
    const lines = [head.join(";"), ...rows.map(t => [t.date, t.type === "in" ? "Pemasukan" : "Pengeluaran", t.category, t.wallet, t.type === "in" ? t.amount : -t.amount, t.note, t.recurring_id ? "ya" : "", t.receipt ?? ""].map(csvCell).join(";"))];
    return new Response("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="cashflow_${r.from}_${r.to}.csv"` } });
  }

  if (p === "/receipts" && m === "POST") {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) bad("File struk tidak ada");
    const f = file as Blob;
    if (!f.type.startsWith("image/")) bad("Struk harus berupa gambar");
    if (f.size > 15 * 1024 * 1024) bad("Foto terlalu besar (maks 15 MB)");
    const ext = ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic" } as Record<string, string>)[f.type] ?? ".jpg";
    const name = `${today()}_${crypto.randomUUID().slice(0, 8)}${ext}`;
    await Bun.write(join(RECEIPT_DIR, name), f);
    return json({ name }, 201);
  }

  if (p === "/settings" && m === "GET") {
    const backups = readdirSync(BACKUP_DIR).filter(f => f.endsWith(".db")).sort().reverse()
      .map(f => ({ name: f, size: statSync(join(BACKUP_DIR, f)).size }));
    return json({ lan: getSetting(db, "lan") === "1", addresses: lanAddresses(port), port, dataDir: DATA_DIR, backups });
  }
  if (p === "/settings" && m === "PUT") {
    const b = await req.json() as { lan?: boolean };
    if (typeof b.lan === "boolean") setSetting(db, "lan", b.lan ? "1" : "0");
    return json({ ok: true });
  }
  if (p === "/backup" && m === "POST") return json({ name: backup() }, 201);

  throw new HttpError(404, "Tidak ditemukan");
}

function removeReceipt(name: string) {
  const f = join(RECEIPT_DIR, basename(name));
  if (existsSync(f)) try { unlinkSync(f); } catch {}
}

function serveFile(dir: string, rel: string): Response | null {
  const root = resolve(dir);
  const f = resolve(root, "." + decodeURIComponent(rel));
  if (!f.startsWith(root)) return null;
  if (!existsSync(f) || !statSync(f).isFile()) return null;
  const long = /\.(woff2|js|css)$/.test(f) && f.includes(`${join(root, "assets")}`);
  return new Response(Bun.file(f), { headers: long ? { "Cache-Control": "public, max-age=31536000, immutable" } : {} });
}

// ───────── server ─────────
function start(port: number) {
  return Bun.serve({
    port,
    hostname: "0.0.0.0",
    maxRequestBodySize: 20 * 1024 * 1024,
    async fetch(req, server) {
      const ip = server.requestIP(req)?.address ?? "";
      if (!isLoopback(ip) && getSetting(db, "lan") !== "1")
        return new Response("Akses dari perangkat lain dimatikan. Aktifkan di CashFlow → Pengaturan pada laptop.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      const u = new URL(req.url);
      try {
        if (u.pathname.startsWith("/api/")) return await api(req, u, server.port!);
        if (u.pathname.startsWith("/struk/")) return serveFile(RECEIPT_DIR, "/" + basename(u.pathname)) ?? new Response("Tidak ditemukan", { status: 404 });
        return serveFile(WEB_DIR, u.pathname === "/" ? "/index.html" : u.pathname)
          ?? serveFile(WEB_DIR, "/index.html")
          ?? new Response("Tampilan belum di-build. Jalankan `bun run build`.", { status: 500 });
      } catch (e) {
        if (e instanceof HttpError) return json({ error: e.message }, e.status);
        if (e instanceof SyntaxError) return json({ error: "Data yang dikirim tidak valid" }, 400);
        console.error(e);
        return json({ error: "Terjadi kesalahan di server" }, 500);
      }
    },
  });
}

let server: ReturnType<typeof start> | null = null;
const base = Number(process.env.PORT ?? 8080);
for (let port = base; port < base + 10 && !server; port++) {
  try { server = start(port); } catch { /* port busy, try next */ }
}
if (!server) { console.error(`Tidak ada port kosong di ${base}–${base + 9}.`); process.exit(1); }

const local = `http://localhost:${server.port}`;
console.log(`\n  CashFlow berjalan\n  Laptop : ${local}`);
for (const a of lanAddresses(server.port!)) console.log(`  HP     : ${a}`);
console.log(`  Data   : ${DATA_DIR}\n  Tutup jendela ini untuk berhenti.\n`);

if (COMPILED && !process.argv.includes("--no-open")) {
  const cmd = process.platform === "win32" ? ["cmd", "/c", "start", "", local] : process.platform === "darwin" ? ["open", local] : ["xdg-open", local];
  try { Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" }); } catch {}
}
