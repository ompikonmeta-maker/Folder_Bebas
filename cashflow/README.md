# CashFlow

Pencatat pemasukan & pengeluaran yang **offline dan portable**. Server lokal (Bun + SQLite) plus UI React bergaya Material 3 Expressive. Bisa dibuka dari laptop, dan dari HP lewat Wi-Fi/hotspot yang sama (tanpa internet).

## Fitur
- **Catat:** pemasukan/pengeluaran, kategori, dompet (E-Wallet, Cash, Transfer), tanggal, catatan, foto struk (kamera HP).
- **Rutin:** harian / mingguan / bulanan, tercatat otomatis tanpa konfirmasi. Bisa dijeda, diubah, dihapus.
- **Prediksi:** kategori ditebak saat mengetik catatan (kata kunci + naive Bayes dari riwayatmu). Prediksi pengeluaran bulan depan (aturan rutin + rata-rata tertimbang 3 bulan).
- **Log:** daftar transaksi per hari dengan filter & pencarian, plus riwayat perubahan (dibuat/diubah/dihapus/otomatis).
- **Report:** grafik arus kas, per kategori, per dompet, perbandingan periode lalu. Ekspor CSV, cetak/PDF.
- **Insight:** kenaikan kategori, transaksi tidak biasa, proyeksi saldo akhir bulan, rasio tabungan, kebiasaan yang bisa dijadikan rutin.
- **Data:** satu folder `CashFlowData/` (`cashflow.db`, `struk/`, `backup/`), cadangan otomatis mingguan.

## Pakai (Windows)
Unduh folder `CashFlow` (hasil `bun run package` atau artifact GitHub Actions), lalu klik dua kali `CashFlow.exe`. Lihat `BACA-SAYA.txt`.

## Development
```bash
bun install
bun run dev:server     # API di :8080 (data di ./CashFlowData)
bun run dev:web        # UI di :5173, proxy ke :8080
bun run build          # typecheck (UI + server) + build UI ke dist/
bun run package        # release/CashFlow/CashFlow.exe + web/  (TARGET=bun-linux-x64 untuk Linux)
CASHFLOW_DATA=./demo-data bun scripts/seed.ts   # isi data contoh 4 bulan
```

## Struktur
- `server/`: `index.ts` (HTTP + API + file statis), `db.ts` (skema, migrasi idempoten), `recurring.ts` (materialisasi aturan rutin), `analytics.ts` (prediksi, forecast, insight, report), `paths.ts` (lokasi folder data).
- `src/`: `App.tsx` (shell, card reveal directional), `components/` (Sidebar, Dropdown, Dialog, Charts…), `pages/`, `lib/api.ts` (satu-satunya jalur ke server), `styles/tokens.css` (semua warna).
- Uang disimpan sebagai rupiah bulat (INTEGER). Tanggal disimpan sebagai `YYYY-MM-DD` waktu lokal.
