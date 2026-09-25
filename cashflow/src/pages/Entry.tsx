import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useData } from "../lib/data";
import { groupDigits, longDate, parseAmount, ymd } from "../lib/format";
import { compressImage } from "../lib/image";
import { Icon } from "../components/Icon";
import { Dropdown } from "../components/Dropdown";
import { Confirm } from "../components/Dialog";
import { CategoryPicker, REPEAT_OPTS, TypeToggle, WalletPicker } from "../components/Pickers";
import { useSnack } from "../components/Snackbar";
import type { PageProps } from "../nav";
import type { Freq, Prediction, Tx, TxType } from "../types";

interface Form { type: TxType; amount: string; note: string; category_id: number; wallet_id: number; date: string; repeat: Freq | "once"; receipt: string | null }

export function Entry({ go, editId }: PageProps & { editId?: number }) {
  const { meta, bump } = useData();
  const snack = useSnack();
  const firstCat = (t: TxType) => meta?.categories.find(c => c.type === t)?.id ?? 0;
  const blank = (keep?: Partial<Form>): Form => ({
    type: keep?.type ?? "out", amount: "", note: "", category_id: firstCat(keep?.type ?? "out"),
    wallet_id: keep?.wallet_id ?? meta?.wallets[0]?.id ?? 0, date: keep?.date ?? ymd(new Date()), repeat: "once", receipt: null,
  });
  const [f, setF] = useState<Form>(blank);
  const [original, setOriginal] = useState<Tx | null>(null);
  const [catTouched, setCatTouched] = useState(false);
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [over, setOver] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(p => ({ ...p, [k]: v }));

  // Fill defaults once meta arrives; load the transaction when editing.
  useEffect(() => { if (meta && !f.category_id && !editId) setF(p => ({ ...blank(p), amount: p.amount, note: p.note })); }, [meta]);
  useEffect(() => {
    if (!editId) { amountRef.current?.focus(); return; }
    api.transaction(editId).then(t => {
      setOriginal(t);
      setCatTouched(true);
      setF({ type: t.type, amount: t.amount.toLocaleString("id-ID"), note: t.note, category_id: t.category_id, wallet_id: t.wallet_id, date: t.date, repeat: "once", receipt: t.receipt });
    }).catch(e => setError(e.message));
  }, [editId]);

  // Category prediction while typing the note.
  useEffect(() => {
    if (!f.note.trim()) { setPreds([]); return; }
    const t = setTimeout(() => {
      api.predict(f.note, f.type).then(p => {
        setPreds(p);
        if (!catTouched && p[0]) setF(prev => ({ ...prev, category_id: p[0].category_id }));
      }).catch(() => {});
    }, 220);
    return () => clearTimeout(t);
  }, [f.note, f.type]);

  const changeType = (t: TxType) => { setF(p => ({ ...p, type: t, category_id: firstCat(t) })); setCatTouched(false); };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Struk harus berupa foto atau gambar."); return; }
    setUploading(true); setError(null);
    try {
      const { name } = await api.uploadReceipt(await compressImage(file));
      set("receipt", name);
    } catch (e) { setError((e as Error).message); }
    finally { setUploading(false); }
  };

  const save = async (again: boolean) => {
    const amount = parseAmount(f.amount);
    if (!amount || amount <= 0) { setError("Isi nominal dulu, misalnya 25.000 atau 25rb."); amountRef.current?.focus(); return; }
    if (!f.category_id || !f.wallet_id) { setError("Pilih kategori dan dompet."); return; }
    setBusy(true); setError(null);
    const body = { type: f.type, amount, category_id: f.category_id, wallet_id: f.wallet_id, date: f.date, note: f.note.trim(), receipt: f.receipt, repeat: f.repeat === "once" ? null : f.repeat };
    try {
      if (editId) {
        await api.updateTx(editId, body);
        snack("Perubahan tersimpan");
        bump();
        go("log");
        return;
      }
      const res = await api.createTx(body);
      bump();
      snack("scheduled" in res ? `Aturan rutin dibuat. Tercatat otomatis mulai ${longDate(f.date)}.` : f.repeat !== "once" ? "Tersimpan dan dijadikan transaksi rutin" : "Transaksi tersimpan");
      if (again) { setF(blank({ type: f.type, wallet_id: f.wallet_id, date: f.date })); setCatTouched(false); setPreds([]); amountRef.current?.focus(); }
      else go("home");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const del = async () => {
    setConfirmDel(false);
    try { await api.deleteTx(editId!); bump(); snack("Transaksi dihapus. Tercatat di riwayat perubahan."); go("log"); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <form className="card span-8" onSubmit={e => { e.preventDefault(); save(false); }}>
        <TypeToggle value={f.type} onChange={changeType} />
        <label className="amount">
          <span>Rp</span>
          <input ref={amountRef} id="amount" inputMode="numeric" autoComplete="off" className="num" placeholder="0" aria-label="Nominal"
            value={f.amount} onChange={e => set("amount", /[a-z]/i.test(e.target.value) ? e.target.value : groupDigits(e.target.value))} />
        </label>
        <div className="field">
          <label htmlFor="note">Catatan</label>
          <input id="note" className="input" autoComplete="off" maxLength={200} placeholder="mis. gojek ke kantor, token listrik, gaji" value={f.note} onChange={e => set("note", e.target.value)} />
        </div>
        <div className="predict" aria-live="polite">
          <Icon n="auto_awesome" style={{ fontSize: 18 }} />
          {preds.length ? <>
            <span>Tebakan kategori:</span>
            {preds.map(p => (
              <button type="button" key={p.category_id} className="chip hit" aria-pressed={f.category_id === p.category_id} title={`Dari ${p.source}, skor ${Math.round(p.score * 100)}%`}
                onClick={() => { set("category_id", p.category_id); setCatTouched(true); }}>
                <Icon n={p.icon} />{p.name}
              </button>
            ))}
          </> : <span>{f.note.trim() ? "Belum ada tebakan. Pilih kategori manual, nanti aplikasi belajar dari pilihanmu." : "Ketik catatan, kategori ditebak otomatis."}</span>}
        </div>
        <div className="grid2">
          <div className="field"><span className="flabel">Kategori</span><CategoryPicker type={f.type} value={f.category_id} onChange={id => { set("category_id", id); setCatTouched(true); }} /></div>
          <div className="field"><span className="flabel">Dompet</span><WalletPicker value={f.wallet_id} onChange={id => set("wallet_id", id)} /></div>
          <div className="field"><label htmlFor="date">Tanggal</label><input id="date" type="date" className="input" required value={f.date} onChange={e => set("date", e.target.value)} /></div>
          {!editId && <div className="field"><span className="flabel">Ulangi</span><Dropdown value={f.repeat} options={REPEAT_OPTS} onChange={v => set("repeat", v)} /></div>}
        </div>
        {f.repeat !== "once" && <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Mulai {longDate(f.date)}, lalu tercatat otomatis {REPEAT_OPTS.find(o => o.value === f.repeat)!.label.toLowerCase()} tanpa konfirmasi. Atur di menu Rutin.</p>}
        {original?.recurring_id && <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Transaksi ini dibuat otomatis dari aturan rutin. Perubahan di sini hanya untuk transaksi ini.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn" disabled={busy || uploading}><Icon n="check" />{editId ? "Simpan perubahan" : "Simpan"}</button>
          {!editId && <button type="button" className="btn tonal" disabled={busy || uploading} onClick={() => save(true)}>Simpan &amp; catat lagi</button>}
          {editId && <>
            <button type="button" className="btn text" onClick={() => go("log")}>Batal</button>
            <span className="spacer" />
            <button type="button" className="btn text" style={{ color: "var(--expense)" }} onClick={() => setConfirmDel(true)}><Icon n="delete" />Hapus</button>
          </>}
        </div>
      </form>

      <article className="card span-4">
        <h3>Foto struk</h3>
        <label className={`dropzone${over ? " over" : ""}`}
          onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]); }}>
          {f.receipt ? <img src={`/struk/${f.receipt}`} alt="Foto struk" /> : <>
            <Icon n={uploading ? "hourglass_top" : "photo_camera"} />
            <b>{uploading ? "Mengunggah…" : "Ambil atau pilih foto"}</b>
            <span style={{ fontSize: 13 }}>Di HP langsung membuka kamera. Foto disimpan di folder CashFlowData/struk di laptop.</span>
          </>}
          <input type="file" accept="image/*" capture="environment" aria-label="Foto struk" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {f.receipt && (
          <div className="receipt-bar">
            <a className="btn tonal" href={`/struk/${f.receipt}`} target="_blank" rel="noreferrer"><Icon n="open_in_new" />Buka</a>
            <button type="button" className="btn text" onClick={() => set("receipt", null)}><Icon n="close" />Lepas foto</button>
          </div>
        )}
      </article>

      <Confirm open={confirmDel} title="Hapus transaksi?" danger action="Hapus"
        body={<>Transaksi <b>{f.note || "ini"}</b> akan dihapus dari database. Catatan penghapusannya tetap ada di riwayat perubahan.</>}
        onCancel={() => setConfirmDel(false)} onConfirm={del} />
    </>
  );
}
