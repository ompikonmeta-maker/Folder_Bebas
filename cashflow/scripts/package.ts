// Build a portable Windows folder: release/CashFlow/{CashFlow.exe, web/, BACA-SAYA.txt}.
// Run via `bun run package` (builds the frontend first). Data folder is created on first launch.
import { $ } from "bun";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const target = process.env.TARGET ?? "bun-windows-x64";
const out = "release/CashFlow";
if (!existsSync("dist/index.html")) throw new Error("dist/ belum ada. Jalankan `bun run build` dulu.");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const exe = target.includes("windows") ? "CashFlow.exe" : "CashFlow";
await $`bun build --compile --minify --target=${target} server/index.ts --outfile ${out}/${exe}`;
cpSync("dist", `${out}/web`, { recursive: true });
writeFileSync(`${out}/BACA-SAYA.txt`, `CashFlow: pencatat pemasukan & pengeluaran, offline.

MULAI
1. Klik dua kali ${exe}. Browser terbuka otomatis ke http://localhost:8080
2. Biarkan jendela hitam tetap terbuka selama memakai CashFlow. Tutup jendela itu untuk berhenti.
3. Saat Windows bertanya soal firewall, pilih "Private networks" supaya HP bisa mengakses.

DARI HP
- Sambungkan HP ke Wi-Fi/hotspot yang sama dengan laptop (tidak perlu internet).
- Buka CashFlow > Pengaturan di laptop, scan QR code-nya dengan HP.

DATA
- Semua data ada di folder CashFlowData di sebelah ${exe}:
  cashflow.db (database), struk/ (foto struk), backup/ (cadangan mingguan).
- Pindah laptop: salin seluruh folder CashFlow.
`.replace(/\n/g, "\r\n"));
console.log(`Selesai: ${out}/`);
