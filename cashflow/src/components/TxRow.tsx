import type { Tx } from "../types";
import { dayLabel, signed } from "../lib/format";
import { Icon } from "./Icon";

export function TxRow({ t, onClick, showDate = true }: { t: Tx; onClick?: () => void; showDate?: boolean }) {
  const content = (
    <>
      <span className={`av${t.type === "in" ? " in" : ""}`}><Icon n={t.category_icon} /></span>
      <span className="m">
        <b>{t.note || t.category}{t.recurring_id && <span className="tag">RUTIN</span>}{t.receipt && <span className="tag">STRUK</span>}</b>
        <span>{t.category} · {t.wallet}{showDate ? ` · ${dayLabel(t.date)}` : ""}</span>
      </span>
      <span className={`amt num${t.type === "in" ? " in" : ""}`}>{signed(t.amount, t.type)}</span>
    </>
  );
  return <li>{onClick ? <button type="button" className="row" onClick={onClick}>{content}</button> : <div className="row">{content}</div>}</li>;
}
