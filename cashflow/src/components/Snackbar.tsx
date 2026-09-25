import { createContext, useCallback, useContext, useRef, useState } from "react";

interface Snack { msg: string; error?: boolean; action?: { label: string; run: () => void } }
const Ctx = createContext<(s: Snack | string) => void>(() => {});
export const useSnack = () => useContext(Ctx);

export function SnackProvider({ children }: { children: React.ReactNode }) {
  const [snack, setSnack] = useState<Snack | null>(null);
  const [show, setShow] = useState(false);
  const timer = useRef<number>();
  const push = useCallback((s: Snack | string) => {
    const v = typeof s === "string" ? { msg: s } : s;
    setSnack(v); setShow(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShow(false), v.error ? 5000 : 3000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className={`snack${show ? " show" : ""}${snack?.error ? " err" : ""}`} role="status" aria-live="polite">
        <span>{snack?.msg}</span>
        {snack?.action && <button type="button" onClick={() => { snack.action!.run(); setShow(false); }}>{snack.action.label}</button>}
      </div>
    </Ctx.Provider>
  );
}
