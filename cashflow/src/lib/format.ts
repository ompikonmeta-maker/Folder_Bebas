export const rp = (n: number) => "Rp " + Math.round(Math.abs(n)).toLocaleString("id-ID");
export const signed = (n: number, type: "in" | "out") => (type === "in" ? "+" : "−") + rp(n);
export const compact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace(".", ",").replace(",0", "") + " M";
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",").replace(",0", "") + " jt";
  if (a >= 1e3) return Math.round(n / 1e3) + " rb";
  return String(Math.round(n));
};
const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toDate = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const dayLabel = (s: string) => toDate(s).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
export const longDate = (s: string) => toDate(s).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const monthLabel = (ym: string) => toDate(ym + "-01").toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
export const pctChange = (cur: number, prev: number) => (prev ? (cur - prev) / prev : null);
export const FREQ_LABEL = { daily: "Harian", weekly: "Mingguan", monthly: "Bulanan" } as const;

/** Parse "38.000", "38rb", "1,5jt" style input into rupiah. */
export function parseAmount(s: string): number {
  const t = s.toLowerCase().replace(/\s|rp/g, "");
  const m = t.match(/^([\d.,]+)(rb|k|jt|m)?$/);
  if (!m) return NaN;
  let num = m[2] ? Number(m[1].replace(/\./g, "").replace(",", ".")) : Number(m[1].replace(/[.,]/g, ""));
  if (m[2] === "rb" || m[2] === "k") num *= 1e3;
  if (m[2] === "jt" || m[2] === "m") num *= 1e6;
  return Math.round(num);
}
export const groupDigits = (s: string) => {
  const digits = s.replace(/\D/g, "");
  return digits ? Number(digits).toLocaleString("id-ID") : "";
};
