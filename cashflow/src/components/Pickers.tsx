import { useData } from "../lib/data";
import type { Freq, TxType } from "../types";
import { Dropdown } from "./Dropdown";

export function CategoryPicker({ type, value, onChange, id }: { type: TxType; value: number; onChange: (id: number) => void; id?: string }) {
  const { meta } = useData();
  const opts = (meta?.categories ?? []).filter(c => c.type === type).map(c => ({ value: c.id, label: c.name, icon: c.icon }));
  return <Dropdown<number> id={id} value={value} options={opts} onChange={onChange} />;
}

export function WalletPicker({ value, onChange, id }: { value: number; onChange: (id: number) => void; id?: string }) {
  const { meta } = useData();
  return <Dropdown<number> id={id} value={value} options={(meta?.wallets ?? []).map(w => ({ value: w.id, label: w.name, icon: w.icon }))} onChange={onChange} />;
}

export const REPEAT_OPTS: { value: Freq | "once"; label: string; icon: string }[] = [
  { value: "once", label: "Sekali saja", icon: "looks_one" },
  { value: "daily", label: "Setiap hari", icon: "event_repeat" },
  { value: "weekly", label: "Setiap minggu", icon: "event_repeat" },
  { value: "monthly", label: "Setiap bulan", icon: "event_repeat" },
];

export function TypeToggle({ value, onChange }: { value: TxType; onChange: (t: TxType) => void }) {
  return (
    <div className="seg" role="group" aria-label="Jenis transaksi">
      <button type="button" aria-pressed={value === "out"} onClick={() => onChange("out")}><span className="ms" aria-hidden="true">remove</span>Pengeluaran</button>
      <button type="button" aria-pressed={value === "in"} onClick={() => onChange("in")}><span className="ms" aria-hidden="true">add</span>Pemasukan</button>
    </div>
  );
}
