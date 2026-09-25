import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

/** True when running as the compiled CashFlow.exe (not `bun server/index.ts`). */
export const COMPILED = !/[\\/]bun(\.exe)?$/i.test(process.execPath);

/** Folder holding the exe (release) or the project root (dev). */
export const APP_DIR = COMPILED ? dirname(process.execPath) : process.cwd();
export const DATA_DIR = process.env.CASHFLOW_DATA ?? join(APP_DIR, "CashFlowData");
export const DB_PATH = join(DATA_DIR, "cashflow.db");
export const RECEIPT_DIR = join(DATA_DIR, "struk");
export const BACKUP_DIR = join(DATA_DIR, "backup");
export const WEB_DIR = COMPILED ? join(APP_DIR, "web") : join(process.cwd(), "dist");

export function ensureDirs() {
  for (const d of [DATA_DIR, RECEIPT_DIR, BACKUP_DIR]) mkdirSync(d, { recursive: true });
}
