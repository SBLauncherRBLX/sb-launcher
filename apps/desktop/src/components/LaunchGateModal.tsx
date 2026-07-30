import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@sb/ui";
import {
  answerLaunchGate,
  getLaunchGateState,
  subscribeLaunchGate,
  type LaunchGateState,
} from "../lib/launchGate";
import { springSoft, springSnappy, useMotionEnabled } from "../lib/motion";
import { useAppStore } from "../store";

export function LaunchGateModal() {
  const [state, setState] = useState<LaunchGateState>(getLaunchGateState);
  const theme = useAppStore((s) => s.theme);
  const motionEnabled = useMotionEnabled(theme);

  useEffect(() => subscribeLaunchGate(() => setState(getLaunchGateState())), []);

  const activeLabel = state.activeDisplayName
    ? `${state.activeDisplayName} (@${state.activeUsername})`
    : `@${state.activeUsername}`;
  const playerLabel = state.playerDisplayName
    ? `${state.playerDisplayName}${state.playerUsername ? ` (@${state.playerUsername})` : ""}`
    : state.playerUsername
      ? `@${state.playerUsername}`
      : `User ${state.playerUserId}`;

  return (
    <AnimatePresence>
      {state.open ? (
        <motion.div
          className="about-update-modal-backdrop launch-gate-backdrop"
          role="presentation"
          initial={motionEnabled ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={motionEnabled ? { opacity: 0 } : undefined}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="about-update-modal launch-gate-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="launch-gate-title"
            initial={motionEnabled ? { opacity: 0, y: 18, scale: 0.96 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={motionEnabled ? { opacity: 0, y: 12, scale: 0.98 } : undefined}
            transition={springSoft}
          >
            <div className="about-update-modal-header">
              <h2 id="launch-gate-title">Different Roblox account</h2>
              <p>
                SB Launcher is on <strong>{activeLabel}</strong>, but Roblox Player looks signed in
                as <strong>{playerLabel}</strong>.
              </p>
            </div>
            <div className="about-update-modal-body">
              <p className="sb-muted" style={{ margin: 0 }}>
                Switch Roblox Player to the active launcher account, then try again. We don&apos;t
                store Roblox cookies — this check only compares account IDs on your PC.
              </p>
            </div>
            <div className="about-update-modal-actions">
              <motion.div whileTap={motionEnabled ? { scale: 0.98 } : undefined} transition={springSnappy}>
                <Button variant="secondary" onClick={() => answerLaunchGate("cancel")}>
                  Cancel
                </Button>
              </motion.div>
              <motion.div whileTap={motionEnabled ? { scale: 0.98 } : undefined} transition={springSnappy}>
                <Button variant="secondary" onClick={() => answerLaunchGate("anyway")}>
                  Launch anyway
                </Button>
              </motion.div>
              <motion.div whileTap={motionEnabled ? { scale: 0.98 } : undefined} transition={springSnappy}>
                <Button variant="secondary" onClick={() => answerLaunchGate("openLogin")}>
                  Open Roblox login
                </Button>
              </motion.div>
              <motion.div whileTap={motionEnabled ? { scale: 0.98 } : undefined} transition={springSnappy}>
                <Button onClick={() => answerLaunchGate("retry")}>I switched — check again</Button>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
