// All dates are local calendar days as "YYYY-MM-DD" strings.
const pad = (n: number) => String(n).padStart(2, "0");

export const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const today = () => fmt(new Date());
export const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return fmt(d);
};
export const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();

/** Same day-of-month as `anchorDay` in the month after `s`, clamped to month length. */
export const nextMonthly = (s: string, anchorDay: number) => {
  const d = parse(s);
  const y = d.getFullYear(), m = d.getMonth() + 1;
  const ny = m > 11 ? y + 1 : y, nm = m % 12;
  return fmt(new Date(ny, nm, Math.min(anchorDay, daysInMonth(ny, nm))));
};

export const monthStart = (s: string) => s.slice(0, 8) + "01";
export const monthEnd = (s: string) => {
  const d = parse(s);
  return fmt(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};
export const shiftMonth = (s: string, n: number) => {
  const d = parse(s);
  return fmt(new Date(d.getFullYear(), d.getMonth() + n, 1));
};
export const daysBetween = (a: string, b: string) =>
  Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
export const isDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parse(s).getTime());
