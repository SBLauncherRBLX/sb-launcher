import type { CSSProperties, ButtonHTMLAttributes, PropsWithChildren } from "react";
import type { VisualTheme } from "@sb/contracts";
import { DEFAULT_THEME_EFFECTS } from "@sb/contracts";
import { resolveFontStack } from "./fonts";

export { FONT_OPTIONS, DEFAULT_FONT_ID, resolveFontStack } from "./fonts";
export type { FontOption } from "./fonts";

export function themeToCssVars(theme: VisualTheme): CSSProperties {
  const effects = { ...DEFAULT_THEME_EFFECTS, ...(theme.effects ?? {}) };
  const radius = theme.cornerRadius;
  const glassOn = effects.glass ? 1 : 0;
  const glassBlur = effects.glassBlur ?? theme.blur;
  const glassTint = effects.glassTintColor || theme.accent;
  return {
    ["--sb-font" as string]: resolveFontStack(theme.fontId),
    ["--sb-accent" as string]: theme.accent,
    ["--sb-accent-secondary" as string]: theme.accentSecondary,
    ["--sb-bg" as string]: theme.background,
    ["--sb-surface" as string]: theme.surface,
    ["--sb-surface-elevated" as string]: theme.surfaceElevated,
    ["--sb-text" as string]: theme.text,
    ["--sb-text-muted" as string]: theme.textMuted,
    ["--sb-border" as string]: theme.border,
    ["--sb-radius" as string]: `${radius}px`,
    ["--sb-blur" as string]: `${theme.blur}px`,
    ["--sb-opacity" as string]: String(theme.opacity),
    ["--sb-gradient-from" as string]: theme.gradientFrom,
    ["--sb-gradient-to" as string]: theme.gradientTo,
    ["--sb-wallpaper-opacity" as string]: String(theme.wallpaperOpacity ?? 0.35),
    ["--sb-wallpaper-blur" as string]: `${theme.wallpaperBlur ?? 0}px`,
    ["--sb-wallpaper-dim" as string]: String(theme.wallpaperDim ?? 0.45),
    ["--sb-motion-scale" as string]:
      theme.motionIntensity === "low"
        ? "0.75"
        : theme.motionIntensity === "high"
          ? "1.15"
          : "1",
    ["--sb-motion-duration" as string]:
      theme.motionIntensity === "low"
        ? "0.18s"
        : theme.motionIntensity === "high"
          ? "0.42s"
          : "0.28s",
    ["--sb-motion-duration-short" as string]:
      theme.motionIntensity === "low"
        ? "0.12s"
        : theme.motionIntensity === "high"
          ? "0.22s"
          : "0.16s",
    ["--sb-motion-duration-enter" as string]:
      theme.motionIntensity === "low"
        ? "0.28s"
        : theme.motionIntensity === "high"
          ? "0.55s"
          : "0.38s",
    ["--sb-motion-duration-exit" as string]:
      theme.motionIntensity === "low"
        ? "0.14s"
        : theme.motionIntensity === "high"
          ? "0.28s"
          : "0.2s",
    ["--sb-motion-duration-hover" as string]:
      theme.motionIntensity === "low"
        ? "0.12s"
        : theme.motionIntensity === "high"
          ? "0.22s"
          : "0.16s",
    ["--sb-motion-duration-press" as string]: "0.1s",
    ["--sb-button-style" as string]: theme.buttonStyle ?? "gradient",
    ["--sb-card-style" as string]: theme.cardStyle ?? "glass",
    ["--sb-effect-glass" as string]: String(glassOn),
    ["--sb-glass-blur" as string]: `${glassBlur}px`,
    ["--sb-glass-opacity" as string]: String(effects.glassOpacity),
    ["--sb-glass-saturate" as string]: String(effects.glassSaturation),
    ["--sb-glass-brightness" as string]: String(effects.glassBrightness),
    ["--sb-glass-contrast" as string]: String(effects.glassContrast),
    ["--sb-glass-border" as string]: String(effects.glassBorder),
    ["--sb-glass-specular" as string]: String(effects.glassSpecular),
    ["--sb-glass-shadow" as string]: String(effects.glassShadow),
    ["--sb-glass-tint-strength" as string]: String(effects.glassTintStrength),
    ["--sb-glass-tint" as string]: glassTint,
    ["--sb-glass-cards" as string]: effects.glass && effects.glassCards ? "1" : "0",
    ["--sb-glass-sidebar" as string]: effects.glass && effects.glassSidebar ? "1" : "0",
    ["--sb-glass-topbar" as string]: effects.glass && effects.glassTopbar ? "1" : "0",
    ["--sb-effect-noise" as string]: effects.noise ? "1" : "0",
    ["--sb-effect-vignette" as string]: effects.vignette ? "1" : "0",
    ["--sb-effect-glow" as string]: effects.glow ? "1" : "0",
    ["--sb-effect-particles" as string]: effects.particles ? "1" : "0",
    ["--sb-effect-parallax" as string]: effects.parallax ? "1" : "0",
    // Material You 3 color roles (derived from the existing theme seed).
    ["--sb-primary" as string]: theme.accent,
    ["--sb-on-primary" as string]: theme.background,
    ["--sb-primary-container" as string]: `color-mix(in srgb, ${theme.accent} 28%, ${theme.surfaceElevated})`,
    ["--sb-on-primary-container" as string]: `color-mix(in srgb, ${theme.accent} 72%, ${theme.text})`,
    ["--sb-secondary" as string]: theme.accentSecondary,
    ["--sb-on-secondary" as string]: theme.background,
    ["--sb-secondary-container" as string]: `color-mix(in srgb, ${theme.accentSecondary} 22%, ${theme.surfaceElevated})`,
    ["--sb-on-secondary-container" as string]: `color-mix(in srgb, ${theme.accentSecondary} 70%, ${theme.text})`,
    ["--sb-surface-dim" as string]: theme.background,
    ["--sb-surface-bright" as string]: theme.surfaceElevated,
    ["--sb-surface-container-lowest" as string]: `color-mix(in srgb, ${theme.background} 88%, #000)`,
    ["--sb-surface-container-low" as string]: theme.surface,
    ["--sb-surface-container" as string]: `color-mix(in srgb, ${theme.surfaceElevated} 55%, ${theme.surface})`,
    ["--sb-surface-container-high" as string]: theme.surfaceElevated,
    ["--sb-surface-container-highest" as string]: `color-mix(in srgb, ${theme.surfaceElevated} 82%, ${theme.text})`,
    ["--sb-on-surface" as string]: theme.text,
    ["--sb-on-surface-variant" as string]: theme.textMuted,
    ["--sb-outline" as string]: theme.border,
    ["--sb-outline-variant" as string]: `color-mix(in srgb, ${theme.border} 55%, transparent)`,
    ["--sb-shape-xs" as string]: `${Math.max(8, Math.round(radius * 0.3))}px`,
    ["--sb-shape-sm" as string]: `${Math.max(12, Math.round(radius * 0.45))}px`,
    ["--sb-shape-md" as string]: `${Math.max(16, Math.round(radius * 0.6))}px`,
    ["--sb-shape-lg" as string]: `${radius}px`,
    ["--sb-shape-xl" as string]: `${Math.round(radius * 1.2)}px`,
  };
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <button
      className={`sb-button ${variant === "primary" ? "" : variant} ${className}`.trim()}
      {...props}
    />
  );
}

export function Card({
  children,
  className = "",
  onClick,
}: PropsWithChildren<{ className?: string; onClick?: () => void }>) {
  return (
    <div
      className={`sb-card ${className}`.trim()}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

export function Badge({ children }: PropsWithChildren) {
  return <span className="sb-badge">{children}</span>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="sb-empty">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function ErrorState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="sb-error">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  const markPath =
    "M 1.95 49.90 L 2.93 44.04 L 5.18 39.45 L 8.20 35.64 L 11.82 32.32 L 15.72 29.39 L 19.63 26.46 L 23.14 23.14 L 26.46 19.63 L 29.39 15.72 L 32.32 11.82 L 35.64 8.20 L 39.45 5.18 L 44.04 2.93 L 50.00 1.95 L 55.86 2.93 L 60.45 5.18 L 64.26 8.30 L 67.58 11.82 L 70.51 15.72 L 73.44 19.63 L 76.76 23.14 L 80.27 26.46 L 84.18 29.39 L 88.09 32.32 L 91.60 35.64 L 94.73 39.45 L 96.97 44.04 L 97.95 50.00 L 96.97 55.86 L 94.73 60.45 L 91.70 64.26 L 88.09 67.58 L 84.18 70.51 L 80.27 73.44 L 76.66 76.66 L 73.44 80.27 L 70.51 84.18 L 67.58 88.09 L 64.26 91.70 L 60.45 94.73 L 55.86 96.97 L 49.90 97.95 L 44.04 96.97 L 39.45 94.73 L 35.64 91.70 L 32.32 88.09 L 29.39 84.18 L 26.46 80.27 L 23.24 76.66 L 19.63 73.44 L 15.72 70.51 L 11.82 67.58 L 8.20 64.26 L 5.18 60.45 L 2.93 55.86 Z";

  return (
    <div className="sb-loading" role="status" aria-live="polite">
      <div className="sb-loading-mark" aria-hidden>
        <svg className="sb-loading-ring" viewBox="0 0 100 100">
          <path className="sb-loading-ring-track" d={markPath} pathLength={100} />
          <path className="sb-loading-ring-snake" d={markPath} pathLength={100} />
        </svg>
      </div>
      <span className="sb-loading-label">{label}</span>
    </div>
  );
}

export const THEME_PRESETS: VisualTheme[] = [
  {
    id: "sb-midnight",
    name: "SB Midnight",
    accent: "#9a82db",
    accentSecondary: "#efb8c8",
    background: "#141218",
    surface: "#1d1b20",
    surfaceElevated: "#2b2930",
    text: "#e6e1e5",
    textMuted: "#cac4d0",
    border: "#49454f",
    gradientFrom: "#9a82db40",
    gradientTo: "#efb8c828",
    blur: 20,
    opacity: 1,
    cornerRadius: 28,
    density: "comfortable",
    animations: true,
    reducedMotion: false,
    sidebarStyle: "solid",
    backgroundImage: null,
    backgroundMode: "gradient",
    wallpaperId: null,
    wallpaperOpacity: 0.18,
    wallpaperBlur: 0,
    wallpaperDim: 0.45,
    effects: {
      ...DEFAULT_THEME_EFFECTS,
      glass: false,
      noise: false,
      vignette: false,
      glow: true,
      particles: false,
      parallax: false,
    },
    motionIntensity: "high",
    buttonStyle: "tonal",
    cardStyle: "solid",
  },
  {
    id: "pulse-midnight",
    name: "Pulse Midnight",
    accent: "#7c5cff",
    accentSecondary: "#00d4ff",
    background: "#0b0d14",
    surface: "#141825",
    surfaceElevated: "#1c2233",
    text: "#f4f6fb",
    textMuted: "#9aa3b5",
    border: "#2a3348",
    gradientFrom: "#7c5cff33",
    gradientTo: "#00d4ff22",
    blur: 18,
    opacity: 0.92,
    cornerRadius: 16,
    density: "comfortable",
    animations: true,
    reducedMotion: false,
    sidebarStyle: "glass",
    backgroundImage: null,
    backgroundMode: "gradient",
    wallpaperId: "sb-nebula",
    wallpaperOpacity: 0.42,
    wallpaperBlur: 0,
    wallpaperDim: 0.5,
    effects: { ...DEFAULT_THEME_EFFECTS, glass: true, noise: true, vignette: true, glow: true, particles: true, parallax: false },
    motionIntensity: "medium",
    buttonStyle: "gradient",
    cardStyle: "glass",
  },
  {
    id: "flat-charcoal",
    name: "Flat Charcoal",
    accent: "#8b93ff",
    accentSecondary: "#c7cbff",
    background: "#101114",
    surface: "#17181d",
    surfaceElevated: "#20222a",
    text: "#f5f6fa",
    textMuted: "#a2a7b4",
    border: "#2d3039",
    gradientFrom: "#00000000",
    gradientTo: "#00000000",
    blur: 0,
    opacity: 1,
    cornerRadius: 12,
    density: "compact",
    animations: true,
    reducedMotion: false,
    sidebarStyle: "solid",
    backgroundImage: null,
    backgroundMode: "solid",
    wallpaperId: null,
    wallpaperOpacity: 0,
    wallpaperBlur: 0,
    wallpaperDim: 0,
    effects: { ...DEFAULT_THEME_EFFECTS, glass: false, noise: false, vignette: false, glow: false, particles: false, parallax: false },
    motionIntensity: "low",
    buttonStyle: "solid",
    cardStyle: "solid",
  },
  {
    id: "ember-forge",
    name: "Ember Forge",
    accent: "#ff6b35",
    accentSecondary: "#ffd166",
    background: "#140d0a",
    surface: "#221611",
    surfaceElevated: "#2f1d16",
    text: "#fff4ec",
    textMuted: "#c9a793",
    border: "#4a2f24",
    gradientFrom: "#ff6b3533",
    gradientTo: "#ffd16622",
    blur: 14,
    opacity: 0.95,
    cornerRadius: 12,
    density: "compact",
    animations: true,
    reducedMotion: false,
    sidebarStyle: "solid",
    backgroundImage: null,
    backgroundMode: "layered",
    wallpaperId: "ember-waves",
    wallpaperOpacity: 0.55,
    wallpaperBlur: 2,
    wallpaperDim: 0.35,
    effects: { ...DEFAULT_THEME_EFFECTS, glass: true, noise: true, vignette: true, glow: true, particles: false, parallax: true },
    motionIntensity: "medium",
    buttonStyle: "gradient",
    cardStyle: "glass",
  },
  {
    id: "arctic-glass",
    name: "Arctic Glass",
    accent: "#4cc9f0",
    accentSecondary: "#80ffdb",
    background: "#081018",
    surface: "#102033",
    surfaceElevated: "#163049",
    text: "#e8f7ff",
    textMuted: "#8fb4c9",
    border: "#274861",
    gradientFrom: "#4cc9f033",
    gradientTo: "#80ffdb22",
    blur: 24,
    opacity: 0.88,
    cornerRadius: 20,
    density: "spacious",
    animations: true,
    reducedMotion: false,
    sidebarStyle: "glass",
    backgroundImage: null,
    backgroundMode: "image",
    wallpaperId: "arctic-bloom",
    wallpaperOpacity: 0.5,
    wallpaperBlur: 4,
    wallpaperDim: 0.4,
    effects: { ...DEFAULT_THEME_EFFECTS, glass: true, noise: false, vignette: true, glow: true, particles: true, parallax: true },
    motionIntensity: "high",
    buttonStyle: "tonal",
    cardStyle: "glass",
  },
  {
    id: "mono-ink",
    name: "Mono Ink",
    accent: "#e8eaed",
    accentSecondary: "#9aa0a6",
    background: "#0e0e10",
    surface: "#17171a",
    surfaceElevated: "#222226",
    text: "#f1f3f4",
    textMuted: "#9aa0a6",
    border: "#303036",
    gradientFrom: "#ffffff10",
    gradientTo: "#ffffff08",
    blur: 0,
    opacity: 1,
    cornerRadius: 14,
    density: "compact",
    animations: true,
    reducedMotion: false,
    sidebarStyle: "minimal",
    backgroundImage: null,
    backgroundMode: "solid",
    wallpaperId: null,
    wallpaperOpacity: 0,
    wallpaperBlur: 0,
    wallpaperDim: 0,
    effects: { ...DEFAULT_THEME_EFFECTS, glass: false, noise: false, vignette: false, glow: false, particles: false, parallax: false },
    motionIntensity: "low",
    buttonStyle: "solid",
    cardStyle: "outline",
  },
  {
    id: "forest-night",
    name: "Forest Night",
    accent: "#81c995",
    accentSecondary: "#a8dab5",
    background: "#0f1511",
    surface: "#172019",
    surfaceElevated: "#223028",
    text: "#e6f4ea",
    textMuted: "#9bb5a4",
    border: "#2f4338",
    gradientFrom: "#81c99528",
    gradientTo: "#a8dab518",
    blur: 10,
    opacity: 1,
    cornerRadius: 24,
    density: "comfortable",
    animations: true,
    reducedMotion: false,
    sidebarStyle: "solid",
    backgroundImage: null,
    backgroundMode: "gradient",
    wallpaperId: "mono-lines",
    wallpaperOpacity: 0.25,
    wallpaperBlur: 0,
    wallpaperDim: 0.6,
    effects: { ...DEFAULT_THEME_EFFECTS, glass: false, noise: true, vignette: true, glow: false, particles: false, parallax: false },
    motionIntensity: "medium",
    buttonStyle: "tonal",
    cardStyle: "solid",
  },
];
