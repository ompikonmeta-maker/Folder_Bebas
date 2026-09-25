import { useState } from "react";
import { api } from "../lib/api";
import { useData, useLoad } from "../lib/data";
import { FREQ_LABEL, dayLabel, groupDigits, longDate, parseAmount, signed, ymd } from "../lib/format";
import { Icon } from "../components/Icon";
import { Dropdown } from "../components/Dropdown";
import { Confirm, Dialog } from "../components/Dialog";
import { CategoryPicker, REPEAT_OPTS, TypeToggle, WalletPicker } from "../components/Pickers";
import { useSnack } from "../components/Snackbar";
import type { PageProps } from "../nav";
import type { Freq, Rule, TxType } from "../types";

interface RForm { id?: number; type: TxType; amount: string; note: string; category_id: number; wallet_id: number; freq: Freq; start_date: string }

export function Recurring(_: PageProps) {
  const { meta, bump } = useData();
  const snack = useSnack();
  const { data } = useLoad(() => api.recurring(), []);
  const [form, setForm] = useState<RForm | null>(null);
  const [del, setDel] = useState<Rule | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = (r?: Rule) => {
    setError(null);
    setForm(r ? { id: r.id, type: r.type, amount: r.amount.toLocaleString("id-ID"), note: r.note, category_id: r.category_id, wallet_id: r.wallet_id, freq: r.freq, start_date: r.start_date }
      : { type: "out", amount: "", note: "", category_id: meta?.categories.find(c => c.type === "out")?.id ?? 0, wallet_id: meta?.wallets[0]?.id ?? 0, freq: "monthly", start_date: ymd(new Date()) });
  };
  const save = async () => {
    if (!form) return;
    const amount = parseAmount(form.amount);
    if (!amount) { setError("Isi nominal dulu."); return; }
    const body = { type: form.type, amount, note: form.note.trim(), category_id: form.category_id, wallet_id: form.wallet_id, freq: form.freq, start_date: form.start_date };
    try {
      if (form.id) await api.updateRule(form.id, body); else await api.createRule(body);
      setForm(null); bump(); snack(form.id ? "Aturan rutin diperbarui" : "Aturan rutin dibuat");
    } catch (e) { setError((e as Error).message); }
  };
  const toggle = async (r: Rule) => { await api.updateRule(r.id, { active: !r.active }); bump(); snack(r.active ? "Aturan dijeda" : "Aturan aktif lagi"); };
  const remove = async () => { if (!del) return; await api.deleteRule(del.id); setDel(null); bump(); snack("Aturan dihapus. Transaksi yang sudah tercatat tetap ada."); };
  const next = new Map(data?.upcoming.map(u => [u.id, u.date]));

  return (
    <>
      <article className="card span-8">
        <h3>Aturan rutin<span className="spacer" /><button className="btn tonal" onClick={() => open()}><Icon n="add" />Tambah</button></h3>
        <p className="muted" style={{ margin: "-6px 0 12px" }}>Tercatat otomatis pada jadwalnya, tanpa konfirmasi.</p>
        {data && !data.rows.length && <div className="empty"><Icon n="event_repeat" /><b>Belum ada aturan</b><span>Contoh: gaji tiap bulan, cicilan, uang makan harian.</span></div>}
        <ul className="list">
          {data?.rows.map(r => (
            <li key={r.id} className="row" style={{ opacity: r.active ? 1 : .6 }}>
              <span className={`av${r.type === "in" ? " in" : ""}`}><Icon n={r.category_icon} /></span>
              <span className="m">
                <b>{r.note || r.category}</b>
                <span>{FREQ_LABEL[r.freq]} · {r.wallet} · {r.active ? `berikutnya ${dayLabel(next.get(r.id) ?? r.start_date)}` : "dijeda"}</span>
              </span>
              <span className={`amt num${r.type === "in" ? " in" : ""}`}>{signed(r.amount, r.type)}</span>
              <button className="switch" role="switch" aria-checked={!!r.active} aria-label={r.active ? "Jeda" : "Aktifkan"} onClick={() => toggle(r)} />
              <button className="icon-btn sm" aria-label="Ubah" onClick={() => open(r)}><Icon n="edit" /></button>
              <button className="icon-btn sm danger" aria-label="Hapus" onClick={() => setDel(r)}><Icon n="delete" /></button>
            </li>
          ))}
        </ul>
      </article>
      <article className="card span-4">
        <h3>Jadwal terdekat</h3>
        {data && !data.upcoming.length && <p className="muted">Kosong.</p>}
        <ul className="list">
          {data?.upcoming.slice(0, 10).map(u => (
            <li key={u.id + u.date} className="row">
              <span className="m"><b>{u.note || u.category}</b><span>{longDate(u.date)}</span></span>
              <span className={`amt num${u.type === "in" ? " in" : ""}`}>{signed(u.amount, u.type)}</span>
            </li>
          ))}
        </ul>
      </article>

      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.id ? "Ubah aturan rutin" : "Aturan rutin baru"}>
        {form && (
          <form onSubmit={e => { e.preventDefault(); save(); }}>
            <TypeToggle value={form.type} onChange={t => setForm({ ...form, type: t, category_id: meta?.categories.find(c => c.type === t)?.id ?? 0 })} />
            <label className="amount"><span>Rp</span>
              <input inputMode="numeric" className="num" placeholder="0" aria-label="Nominal" value={form.amount}
                onChange={e => setForm({ ...form, amount: /[a-z]/i.test(e.target.value) ? e.target.value : groupDigits(e.target.value) })} /></label>
            <div className="field"><label htmlFor="rn">Catatan</label><input id="rn" className="input" value={form.note} placeholder="mis. Gaji, Internet rumah" onChange={e => setForm({ ...form, note: e.target.value })} /></div>
            <div className="grid2">
              <div className="field"><span className="flabel">Kategori</span><CategoryPicker type={form.type} value={form.category_id} onChange={id => setForm({ ...form, category_id: id })} /></div>
              <div className="field"><span className="flabel">Dompet</span><WalletPicker value={form.wallet_id} onChange={id => setForm({ ...form, wallet_id: id })} /></div>
              <div className="field"><span className="flabel">Frekuensi</span>
                <Dropdown<Freq> value={form.freq} onChange={v => setForm({ ...form, freq: v })} options={REPEAT_OPTS.filter(o => o.value !== "once") as { value: Freq; label: string; icon: string }[]} /></div>
              <div className="field"><label htmlFor="rs">Mulai</label><input id="rs" type="date" className="input" required value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
            </div>
            {!form.id && form.start_date < ymd(new Date()) && <p className="muted" style={{ fontSize: 13 }}>Tanggal mulai di masa lalu: semua jadwal sejak tanggal itu akan langsung tercatat.</p>}
            {error && <p className="error">{error}</p>}
            <div className="actions">
              <button type="button" className="btn text" onClick={() => setForm(null)}>Batal</button>
              <button className="btn">Simpan</button>
            </div>
          </form>
        )}
      </Dialog>
      <Confirm open={!!del} title="Hapus aturan rutin?" danger action="Hapus"
        body={<>Aturan <b>{del?.note || del?.category}</b> berhenti mencatat. Transaksi yang sudah tercatat tidak ikut terhapus.</>}
        onCancel={() => setDel(null)} onConfirm={remove} />
    </>
  );
}
