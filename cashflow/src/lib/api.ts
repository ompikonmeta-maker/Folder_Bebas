// Single boundary to the local CashFlow server. All data lives in its SQLite file.
import type { AuditEntry, Forecast, Insight, Meta, Prediction, Report, Rule, Settings, Summary, Tx, TxInput, Upcoming, Wallet } from "../types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api" + path, { ...init, headers: init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined });
  } catch {
    throw new Error("Tidak tersambung ke CashFlow. Pastikan CashFlow.exe masih berjalan di laptop.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Gagal (${res.status})`);
  return data as T;
}
const body = (method: string, b: unknown): RequestInit => ({ method, body: JSON.stringify(b) });
const qs = (o: Record<string, string | number | undefined | null | false>) =>
  "?" + Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

export interface TxFilter { from?: string; to?: string; type?: string; wallet?: number; category?: number; q?: string; recurring?: boolean; receipt?: boolean; limit?: number }

export const api = {
  meta: () => req<Meta>("/meta"),
  summary: (from: string, to: string) => req<Summary>(`/summary${qs({ from, to })}`),
  report: (from: string, to: string) => req<Report>(`/report${qs({ from, to })}`),
  insights: () => req<{ items: Insight[]; forecast: Forecast }>("/insights"),
  predict: (note: string, type: string) => req<Prediction[]>(`/predict${qs({ note, type })}`),
  transactions: (f: TxFilter) => req<{ rows: Tx[]; total: number }>(`/transactions${qs({ ...f, recurring: f.recurring && 1, receipt: f.receipt && 1 })}`),
  transaction: (id: number) => req<Tx>(`/transactions/${id}`),
  createTx: (t: TxInput) => req<Tx | { scheduled: true }>("/transactions", body("POST", t)),
  updateTx: (id: number, t: TxInput) => req<Tx>(`/transactions/${id}`, body("PUT", t)),
  deleteTx: (id: number) => req<{ ok: true }>(`/transactions/${id}`, { method: "DELETE" }),
  recurring: () => req<{ rows: Rule[]; upcoming: Upcoming[] }>("/recurring"),
  createRule: (r: Omit<TxInput, "date" | "receipt"> & { start_date: string; freq: string }) => req<{ id: number }>("/recurring", body("POST", r)),
  updateRule: (id: number, r: object) => req<{ ok: true }>(`/recurring/${id}`, body("PUT", r)),
  deleteRule: (id: number) => req<{ ok: true }>(`/recurring/${id}`, { method: "DELETE" }),
  setOpening: (w: Pick<Wallet, "id" | "opening">[]) => req<{ ok: true }>("/wallets", body("PUT", w)),
  audit: (limit = 100) => req<AuditEntry[]>(`/audit${qs({ limit })}`),
  settings: () => req<Settings>("/settings"),
  saveSettings: (s: { lan: boolean }) => req<{ ok: true }>("/settings", body("PUT", s)),
  backup: () => req<{ name: string }>("/backup", { method: "POST" }),
  uploadReceipt: (file: Blob) => { const f = new FormData(); f.append("file", file, "struk.jpg"); return req<{ name: string }>("/receipts", { method: "POST", body: f }); },
  exportUrl: (from: string, to: string) => `/api/export.csv${qs({ from, to })}`,
};
