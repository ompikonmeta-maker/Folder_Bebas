export type Page = "home" | "entry" | "log" | "report" | "insight" | "recurring" | "settings";
export const PAGES: { id: Page; title: string; icon: string; desk?: boolean }[] = [
  { id: "home", title: "Beranda", icon: "home" },
  { id: "entry", title: "Catat", icon: "add_circle", desk: true },
  { id: "log", title: "Log", icon: "receipt_long" },
  { id: "report", title: "Report", icon: "bar_chart" },
  { id: "insight", title: "Insight", icon: "lightbulb" },
  { id: "recurring", title: "Rutin", icon: "event_repeat", desk: true },
  { id: "settings", title: "Pengaturan", icon: "settings", desk: true },
];
export type Go = (p: Page, opts?: { editId?: number }) => void;
export interface PageProps { go: Go; from: string; to: string; periodLabel: string }
