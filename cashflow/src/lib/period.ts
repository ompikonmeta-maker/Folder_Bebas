import { toDate, ymd } from "./format";

export type Preset = "today" | "week" | "month" | "year" | "custom";
export interface Period { preset: Preset; from: string; to: string }

export const PRESETS: { id: Preset; label: string; icon: string }[] = [
  { id: "today", label: "Hari ini", icon: "today" },
  { id: "week", label: "Minggu ini", icon: "date_range" },
  { id: "month", label: "Bulan ini", icon: "calendar_month" },
  { id: "year", label: "Tahun ini", icon: "calendar_today" },
  { id: "custom", label: "Rentang khusus", icon: "edit_calendar" },
];

export function presetRange(p: Exclude<Preset, "custom">, now = new Date()): Period {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (p === "today") return { preset: p, from: ymd(now), to: ymd(now) };
  if (p === "week") {
    const dow = (now.getDay() + 6) % 7; // Monday = 0
    return { preset: p, from: ymd(new Date(y, m, d - dow)), to: ymd(new Date(y, m, d - dow + 6)) };
  }
  if (p === "month") return { preset: p, from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
  return { preset: p, from: ymd(new Date(y, 0, 1)), to: ymd(new Date(y, 11, 31)) };
}

export const periodLabel = (p: Period) =>
  p.preset === "custom"
    ? `${toDate(p.from).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – ${toDate(p.to).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" })}`
    : PRESETS.find(x => x.id === p.preset)!.label;
