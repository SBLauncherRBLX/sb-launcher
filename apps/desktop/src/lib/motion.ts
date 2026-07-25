import { useMemo } from "react";
import type { VisualTheme } from "@sb/contracts";

export function useMotionEnabled(theme: VisualTheme): boolean {
  const systemReduced = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  if (!theme.animations || theme.reducedMotion || systemReduced) return false;
  return theme.motionIntensity !== "off";
}

export function motionDuration(theme: VisualTheme): number {
  switch (theme.motionIntensity) {
    case "low":
      return 0.22;
    case "high":
      return 0.48;
    case "medium":
    default:
      return 0.36;
  }
}

/** Soft spring for list/page enters */
export const springSoft = {
  type: "spring" as const,
  stiffness: 280,
  damping: 30,
  mass: 0.85,
};

/** Snappier spring for presses / small UI */
export const springSnappy = {
  type: "spring" as const,
  stiffness: 520,
  damping: 36,
  mass: 0.75,
};

export function fadeUp(index = 0, enabled = true) {
  if (!enabled) return {};
  return {
    initial: { opacity: 0, y: 16, scale: 0.96 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { delay: index * 0.04, ...springSoft },
  };
}

export function pageTransition(enabled = true) {
  if (!enabled) return {};
  return {
    initial: { opacity: 0, x: 24, scale: 0.97 },
    animate: { opacity: 1, x: 0, scale: 1 },
    exit: { opacity: 0, x: -16, scale: 0.985 },
    transition: springSoft,
  };
}
