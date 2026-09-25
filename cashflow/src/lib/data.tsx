import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Meta } from "../types";
import { api } from "./api";

interface DataCtx { meta: Meta | null; version: number; bump: () => void }
const Ctx = createContext<DataCtx>({ meta: null, version: 0, bump: () => {} });
export const useData = () => useContext(Ctx);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => { api.meta().then(setMeta).catch(() => setTimeout(bump, 2000)); }, [version]);
  // Another device (laptop ↔ phone) may have changed data: refresh when the tab comes back.
  useEffect(() => {
    const on = () => { if (document.visibilityState === "visible") bump(); };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return <Ctx.Provider value={{ meta, version, bump }}>{children}</Ctx.Provider>;
}

/** Load data and re-load whenever `deps` or the global data version change. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const { version } = useData();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn().then(d => { if (alive) { setData(d); setError(null); } })
      .catch(e => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [...deps, version]);
  return { data, error, loading };
}
