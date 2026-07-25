import { useMemo, useState } from "react";
import type { VisualTheme } from "@sb/contracts";
import { useMotionEnabled } from "../lib/motion";

type Particle = {
  id: number;
  left: string;
  top: string;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  driftX: number;
  driftY: number;
  accent: boolean;
};

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DENSITY_COUNTS = {
  low: 28,
  medium: 52,
  high: 86,
} as const;

function createParticles(
  count: number,
  seed: number,
  sizeScale: number,
  speedScale: number,
  opacityScale: number,
): Particle[] {
  const rand = mulberry32(seed || 1);
  const particles: Particle[] = [];

  // Rejection sampling keeps points from collapsing into visible rows/columns.
  for (let id = 0; id < count; id++) {
    let left = 0;
    let top = 0;
    let attempts = 0;
    do {
      left = rand() * 100;
      top = rand() * 100;
      attempts += 1;
    } while (
      attempts < 12 &&
      particles.some((particle) => {
        const dx = Number.parseFloat(particle.left) - left;
        const dy = Number.parseFloat(particle.top) - top;
        return dx * dx + dy * dy < 2.8;
      })
    );

    const angle = rand() * Math.PI * 2;
    const distance = 18 + rand() * 70;
    particles.push({
      id,
      left: `${left.toFixed(3)}%`,
      top: `${top.toFixed(3)}%`,
      size: (1.2 + rand() * 4.2) * sizeScale,
      opacity: (0.2 + rand() * 0.8) * opacityScale,
      duration: (8 + rand() * 18) / Math.max(speedScale, 0.25),
      delay: -(rand() * 22),
      driftX: Math.cos(angle) * distance,
      driftY: Math.sin(angle) * distance,
      accent: rand() > 0.58,
    });
  }

  return particles;
}

export function ParticleField({ theme }: { theme: VisualTheme }) {
  const motionEnabled = useMotionEnabled(theme);
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000_000) + 1);
  const density = theme.effects?.particleDensity ?? "medium";
  const sizeScale = theme.effects?.particleSize ?? 1;
  const speedScale = theme.effects?.particleSpeed ?? 1;
  const opacityScale = theme.effects?.particleOpacity ?? 0.75;

  const particles = useMemo(
    () =>
      createParticles(
        DENSITY_COUNTS[density],
        seed,
        sizeScale,
        speedScale,
        opacityScale,
      ),
    [density, opacityScale, seed, sizeScale, speedScale],
  );

  return (
    <div
      className={`background-particles ${motionEnabled ? "animated" : "static"}`}
      aria-hidden
    >
      {particles.map((particle) => (
        <span
          key={particle.id}
          className={`background-particle ${particle.accent ? "accent" : ""}`}
          style={{
            left: particle.left,
            top: particle.top,
            width: particle.size,
            height: particle.size,
            opacity: particle.opacity,
            ["--sb-particle-duration" as string]: `${particle.duration}s`,
            ["--sb-particle-delay" as string]: `${particle.delay}s`,
            ["--sb-particle-x" as string]: `${particle.driftX.toFixed(1)}px`,
            ["--sb-particle-y" as string]: `${particle.driftY.toFixed(1)}px`,
          }}
        />
      ))}
    </div>
  );
}
