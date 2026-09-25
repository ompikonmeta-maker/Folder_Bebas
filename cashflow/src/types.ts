// Mirrors the SQLite schema in server/db.ts.
export type TxType = "in" | "out";
export type Freq = "daily" | "weekly" | "monthly";

export interface Category { id: number; name: string; icon: string; type: TxType }
export interface Wallet { id: number; name: string; icon: string; opening: number }
export interface Meta { categories: Category[]; wallets: Wallet[]; today: string }

export interface Tx {
  id: number; type: TxType; amount: number; category_id: number; wallet_id: number;
  date: string; note: string; receipt: string | null; recurring_id: number | null;
  created_at: string; updated_at: string;
  category: string; category_icon: string; wallet: string; wallet_icon: string;
}
export interface TxInput {
  type: TxType; amount: number; category_id: number; wallet_id: number; date: string;
  note: string; receipt: string | null; repeat?: Freq | null;
}
export interface Rule {
  id: number; type: TxType; amount: number; category_id: number; wallet_id: number; note: string;
  freq: Freq; start_date: string; last_date: string | null; active: number;
  category: string; category_icon: string; wallet: string;
}
export interface Upcoming { id: number; note: string; type: TxType; amount: number; category: string; icon: string; freq: Freq; date: string }
export interface WalletBalance { id: number; name: string; icon: string; opening: number; balance: number }
export interface Insight { icon: string; title: string; body: string; tone: "info" | "good" | "warn" }
export interface Totals { income: number; expense: number }
export interface Summary extends Totals {
  from: string; to: string; prev: Totals & { from: string; to: string };
  wallets: WalletBalance[]; upcoming: Upcoming[]; insight: Insight | null;
}
export interface Report extends Totals {
  from: string; to: string; granularity: "day" | "month"; prev: Totals & { from: string; to: string };
  byCategory: { id: number; name: string; icon: string; type: TxType; total: number; count: number }[];
  byWallet: { name: string; icon: string; income: number; expense: number }[];
  series: { key: string; income: number; expense: number }[];
}
export interface Forecast {
  month: string; basis: string; expense: number; income: number;
  items: { category_id: number; name: string; icon: string; type: TxType; recurring: number; variable: number; total: number }[];
}
export interface Prediction { category_id: number; name: string; icon: string; score: number; source: string }
export interface AuditEntry { id: number; at: string; action: "create" | "update" | "delete" | "auto"; entity: string; entity_id: number | null; summary: string }
export interface Settings { lan: boolean; addresses: string[]; port: number; dataDir: string; backups: { name: string; size: number }[] }
