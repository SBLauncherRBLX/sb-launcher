import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLocation } from "react-router-dom";
import { useAppStore } from "../store";
import { BootSplash } from "./BootSplash";

type Phase = "loading" | "dismissed";
const StartupContext = createContext({ settled: () => {} });

export function useStartupHomeReady(ready: boolean) {
  const { settled } = useContext(StartupContext);
  useEffect(() => { if (ready) settled(); }, [ready, settled]);
}

export function StartupExperience({ children }: PropsWithChildren) {
  const ready = useAppStore(s => s.ready);
  const theme = useAppStore(s => s.theme);
  const { pathname } = useLocation();
  const systemReduced = useReducedMotion();
  const reduced = !!systemReduced || !!theme.reducedMotion || !theme.animations;
  const [phase, setPhase] = useState<Phase>("loading");
  const [homeReady, setHomeReady] = useState(false);
  const settled = useCallback(() => setHomeReady(true), []);

  // A route render failure must never leave the whole launcher behind the curtain.
  useEffect(() => {
    if (!ready || homeReady) return;
    const timer = window.setTimeout(settled, 31_000);
    return () => window.clearTimeout(timer);
  }, [ready, homeReady, settled]);

  useEffect(() => {
    if (!ready || (!homeReady && pathname === "/") || phase !== "loading") return;
    let cancelled = false;
    void Promise.resolve(window.sbDesktop?.finishStartup?.()).catch(() => {}).then(() => {
      if (!cancelled) setPhase("dismissed");
    });
    return () => { cancelled = true; };
  }, [ready, homeReady, pathname, phase]);

  return <StartupContext.Provider value={{ settled }}>
    <div className="startup-content" ref={element => { if (element) element.inert = phase === "loading"; }}>{children}</div>
    <AnimatePresence>
      {phase === "loading" && <motion.div key="loader" className="startup-loading-layer"
        style={{ background: theme.background }} exit={{ opacity: 0 }}
        transition={{ duration: reduced ? 0 : .45, ease: [.22, 1, .36, 1] }}>
        <BootSplash theme={theme} />
      </motion.div>}
    </AnimatePresence>
  </StartupContext.Provider>;
}
