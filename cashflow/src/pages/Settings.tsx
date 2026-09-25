import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "../lib/api";
import { useData, useLoad } from "../lib/data";
import { groupDigits, parseAmount } from "../lib/format";
import { Icon } from "../components/Icon";
import { useSnack } from "../components/Snackbar";
import type { PageProps } from "../nav";

export function SettingsPage(_: PageProps) {
  const { meta, bump } = useData();
  const snack = useSnack();
  const { data: s } = useLoad(() => api.settings(), []);
  const [addr, setAddr] = useState(0);
  const [qr, setQr] = useState<string | null>(null);
  const [opening, setOpening] = useState<Record<number, string>>({});
  const local = typeof location !== "undefined" && ["localhost", "127.0.0.1"].includes(location.hostname);

  useEffect(() => { if (meta) setOpening(Object.fromEntries(meta.wallets.map(w => [w.id, w.opening ? w.opening.toLocaleString("id-ID") : ""]))); }, [meta]);
  useEffect(() => {
    const url = s?.addresses[addr];
    if (!url) { setQr(null); return; }
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: "#001D34", light: "#FFFFFF" } }).then(setQr).catch(() => setQr(null));
  }, [s, addr]);

  const setLan = async (lan: boolean) => { await api.saveSettings({ lan }); bump(); snack(lan ? "Akses dari HP diaktifkan" : "Akses dari HP dimatikan"); };
  const saveOpening = async () => {
    await api.setOpening(Object.entries(opening).map(([id, v]) => ({ id: Number(id), opening: v ? parseAmount(v) || 0 : 0 })));
    bump(); snack("Saldo awal tersimpan");
  };
  const backup = async () => { const r = await api.backup(); bump(); snack(`Cadangan dibuat: ${r.name}`); };

  return (
    <>
      <article className="card span-7">
        <h3>Akses dari HP<span className="spacer" />
          <button className="switch" role="switch" aria-checked={!!s?.lan} aria-label="Izinkan akses dari HP" disabled={!local} title={local ? undefined : "Hanya bisa diubah dari laptop"} onClick={() => s && setLan(!s.lan)} />
        </h3>
        {s?.lan ? (
          s.addresses.length ? (
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
              {qr && <div className="qr"><img src={qr} alt={`QR code ${s.addresses[addr]}`} /></div>}
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <ol style={{ margin: "0 0 12px", paddingLeft: 20 }}>
                  <li>Sambungkan HP ke Wi-Fi atau hotspot yang sama dengan laptop. Tidak perlu internet.</li>
                  <li>Scan QR ini dengan kamera HP, atau ketik alamatnya di browser HP.</li>
                </ol>
                <p className="big num" style={{ fontSize: 24, margin: 0, overflowWrap: "anywhere" }}>{s.addresses[addr].replace("http://", "")}</p>
                {s.addresses.length > 1 && (
                  <div className="chips" style={{ marginTop: 10 }}>
                    {s.addresses.map((a, i) => <button key={a} className="chip" aria-pressed={i === addr} onClick={() => setAddr(i)}>{a.replace("http://", "")}</button>)}
                  </div>
                )}
                <p className="muted" style={{ fontSize: 13 }}>Kalau HP tidak bisa membuka: saat Windows pertama kali bertanya, izinkan CashFlow di jaringan <b>Private</b>.</p>
              </div>
            </div>
          ) : <p className="muted">Laptop belum tersambung ke jaringan apa pun. Nyalakan Wi-Fi atau hotspot, lalu buka halaman ini lagi.</p>
        ) : <p className="muted">Mati. Hanya laptop ini yang bisa membuka CashFlow.</p>}
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Tanpa PIN: siapa pun di jaringan yang sama bisa membuka. Matikan saat memakai Wi-Fi umum.</p>
      </article>

      <article className="card span-5">
        <h3>Saldo awal dompet</h3>
        <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>Isi saldo sebelum mulai mencatat, supaya saldo di Beranda sesuai kenyataan.</p>
        {meta?.wallets.map(w => (
          <div className="field" key={w.id} style={{ marginTop: 10 }}>
            <label htmlFor={`op-${w.id}`}><Icon n={w.icon} style={{ fontSize: 16, verticalAlign: -3 }} /> {w.name}</label>
            <input id={`op-${w.id}`} className="input num" inputMode="numeric" placeholder="0" value={opening[w.id] ?? ""} onChange={e => setOpening(o => ({ ...o, [w.id]: groupDigits(e.target.value) }))} />
          </div>
        ))}
        <div className="actions"><button className="btn tonal" onClick={saveOpening}><Icon n="check" />Simpan saldo awal</button></div>
      </article>

      <article className="card span-12">
        <h3>Data &amp; cadangan<span className="spacer" /><button className="btn tonal" onClick={backup}><Icon n="backup" />Cadangkan sekarang</button></h3>
        <div className="grid2">
          <div>
            <div className="kv"><span>Folder data</span><b className="num" style={{ overflowWrap: "anywhere", textAlign: "right" }}>{s?.dataDir}</b></div>
            <div className="kv"><span>Database</span><b>cashflow.db</b></div>
            <div className="kv"><span>Foto struk</span><b>struk/</b></div>
            <div className="kv"><span>Cadangan otomatis</span><b>Mingguan, simpan 8 terakhir</b></div>
          </div>
          <div>
            <p className="label" style={{ marginTop: 8 }}>Cadangan terakhir</p>
            {s?.backups.length ? <ul className="list">{s.backups.slice(0, 4).map(b => (
              <li key={b.name} className="row"><span className="av"><Icon n="database" /></span><span className="m"><b>{b.name}</b><span>{Math.max(1, Math.round(b.size / 1024))} KB</span></span></li>
            ))}</ul> : <p className="muted">Belum ada cadangan.</p>}
          </div>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Pindah laptop: salin seluruh folder CashFlow (termasuk CashFlowData) ke flashdisk. Untuk memulihkan cadangan, tutup CashFlow lalu ganti cashflow.db dengan file dari folder backup.</p>
      </article>
    </>
  );
}
