import type { CSSProperties } from "react";

type IconProps = { size?: number; className?: string; style?: CSSProperties };

function Wrap({ size = 28, className, style, children, id }: IconProps & { children: React.ReactNode; id: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={style} aria-hidden>
      <defs>
        <linearGradient id={`${id}-base`} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--sb-surface-container-high, #2b2930)" />
          <stop offset="1" stopColor="var(--sb-surface, #1d1b20)" />
        </linearGradient>
        <linearGradient id={`${id}-primary`} x1="7" y1="7" x2="25" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--sb-secondary, #efb8c8)" />
          <stop offset="1" stopColor="var(--sb-primary, #9a82db)" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.1" stdDeviation="1" floodColor="#000000" floodOpacity={0.35} />
        </filter>
        <filter id={`${id}-punched`} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0.7" stdDeviation="0.7" floodColor="#000000" floodOpacity={0.55} />
          <feDropShadow dx="0" dy="-0.3" stdDeviation="0.4" floodColor="#ffffff" floodOpacity={0.07} />
        </filter>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="9" fill={`url(#${id}-base)`} />
      {children}
    </svg>
  );
}

// Visuals sections
export function Presets3D(p: IconProps) {
  return (
    <Wrap id="presets" {...p}>
      <g filter="url(#presets-shadow)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5}>
        <rect x="9" y="9" width="6" height="6" rx="1.6" fill="url(#presets-primary)" />
        <rect x="17" y="9" width="6" height="6" rx="1.6" fill="url(#presets-primary)" opacity={0.85} />
        <rect x="9" y="17" width="6" height="6" rx="1.6" fill="url(#presets-primary)" opacity={0.85} />
        <rect x="17" y="17" width="6" height="6" rx="1.6" fill="url(#presets-primary)" />
      </g>
    </Wrap>
  );
}
export function Background3D(p: IconProps) {
  return (
    <Wrap id="bg" {...p}>
      <g filter="url(#bg-shadow)">
        <path d="M9 19 L13.5 13.5 L17 16.2 L19.5 14 L23 19 Z" fill="url(#bg-primary)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5} />
        <circle cx="19.5" cy="11.2" r="2.1" fill="#07080a" filter="url(#bg-punched)" stroke="#ffffff" strokeOpacity={0.06} strokeWidth={0.4} />
      </g>
    </Wrap>
  );
}
export function Effects3D(p: IconProps) {
  return (
    <Wrap id="effects" {...p}>
      <g filter="url(#effects-shadow)" fill="url(#effects-primary)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5}>
        <path d="M16 8.5 L16.9 13.2 L21.6 14.1 L16.9 15 L16 19.7 L15.1 15 L10.4 14.1 Z" />
        <circle cx="10.5" cy="10.2" r="1.2" opacity={0.9} />
        <circle cx="21.5" cy="18.8" r="1" opacity={0.85} />
      </g>
    </Wrap>
  );
}
export function Layout3D(p: IconProps) {
  return (
    <Wrap id="layout" {...p}>
      <g filter="url(#layout-shadow)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5}>
        <rect x="8" y="9" width="5.5" height="14" rx="1.4" fill="url(#layout-primary)" />
        <rect x="15" y="9" width="9" height="5.2" rx="1.4" fill="url(#layout-primary)" opacity={0.9} />
        <rect x="15" y="16.2" width="9" height="6.8" rx="1.4" fill="#06080a" filter="url(#layout-punched)" strokeOpacity={0.06} />
      </g>
    </Wrap>
  );
}
export function Scroll3D(p: IconProps) {
  return (
    <Wrap id="scroll" {...p}>
      <g filter="url(#scroll-shadow)">
        <rect x="14.2" y="8" width="3.6" height="16" rx="1.8" fill="url(#scroll-primary)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5} />
        <path d="M14.5 10.2 L16 8.2 L17.5 10.2" stroke="#07080a" strokeWidth={1.15} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
        <path d="M17.5 21.8 L16 23.8 L14.5 21.8" stroke="#07080a" strokeWidth={1.15} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
      </g>
    </Wrap>
  );
}
export function Colors3D(p: IconProps) {
  return (
    <Wrap id="colors" {...p}>
      <g filter="url(#colors-shadow)">
        <path d="M16 7.8 C20.6 7.8 24.2 10.9 24.2 15.2 C24.2 18.6 21.4 20.9 18.4 20.5 C17.1 20.3 16.3 21.3 17.1 22.3 C17.9 23.3 16.6 24.7 14.9 24.1 C10 22.5 7.8 19.1 7.8 15.2 C7.8 10.9 11.4 7.8 16 7.8 Z" fill="url(#colors-primary)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5} />
        <circle cx="12" cy="12.8" r="1.3" fill="#06080a" filter="url(#colors-punched)" stroke="#ffffff" strokeOpacity={0.06} strokeWidth={0.35} />
        <circle cx="16" cy="11.2" r="1.3" fill="#06080a" filter="url(#colors-punched)" stroke="#ffffff" strokeOpacity={0.06} strokeWidth={0.35} />
        <circle cx="20" cy="12.8" r="1.3" fill="#06080a" filter="url(#colors-punched)" stroke="#ffffff" strokeOpacity={0.06} strokeWidth={0.35} />
      </g>
    </Wrap>
  );
}
export function Visuals3D(p: IconProps) {
  return (
    <Wrap id="visuals" {...p}>
      <g filter="url(#visuals-shadow)">
        <path d="M16 7.8 C20.6 7.8 24.2 10.9 24.2 15.2 C24.2 18.6 21.4 20.9 18.4 20.5 C17.1 20.3 16.3 21.3 17.1 22.3 C17.9 23.3 16.6 24.7 14.9 24.1 C10 22.5 7.8 19.1 7.8 15.2 C7.8 10.9 11.4 7.8 16 7.8 Z" fill="url(#visuals-primary)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5} />
        <circle cx="12" cy="12.8" r="1.3" fill="#06080a" filter="url(#visuals-punched)" stroke="#ffffff" strokeOpacity={0.06} strokeWidth={0.35} />
        <circle cx="16" cy="11.2" r="1.3" fill="#06080a" filter="url(#visuals-punched)" stroke="#ffffff" strokeOpacity={0.06} strokeWidth={0.35} />
        <circle cx="20" cy="12.8" r="1.3" fill="#06080a" filter="url(#visuals-punched)" stroke="#ffffff" strokeOpacity={0.06} strokeWidth={0.35} />
      </g>
    </Wrap>
  );
}
export function Motion3D(p: IconProps) {
  return (
    <Wrap id="motion" {...p}>
      <g filter="url(#motion-shadow)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5}>
        <path d="M9 16.5 C11 13.2 13.2 20.8 15.5 16.5 C17.8 12.2 20.2 19 23 16.5" fill="none" stroke="url(#motion-primary)" strokeWidth={2.1} strokeLinecap="round" />
        <circle cx="9" cy="16.5" r="1.1" fill="url(#motion-primary)" />
        <circle cx="23" cy="16.5" r="1.1" fill="url(#motion-primary)" />
      </g>
    </Wrap>
  );
}
// Settings sections
export function Discord3D(p: IconProps) {
  return (
    <Wrap id="discord" {...p}>
      <g filter="url(#discord-shadow)">
        <path d="M8.2 12.2 C8.2 9.1 10.9 7.2 16 7.2 C21.1 7.2 23.8 9.1 23.8 12.2 L23.8 19 C23.8 22.1 21.1 24 16 24 C10.9 24 8.2 22.1 8.2 19 Z" fill="url(#discord-primary)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5} />
        <ellipse cx="13.1" cy="15.2" rx="1.5" ry="1.6" fill="#06080a" />
        <ellipse cx="18.9" cy="15.2" rx="1.5" ry="1.6" fill="#06080a" />
        <path d="M12.8 19.2 C13.8 20.1 14.9 20.5 16 20.5 C17.1 20.5 18.2 20.1 19.2 19.2" stroke="#06080a" strokeWidth={1.1} strokeLinecap="round" fill="none" />
      </g>
    </Wrap>
  );
}
export function Account3D(p: IconProps) {
  return (
    <Wrap id="account3d" {...p}>
      <g filter="url(#account3d-shadow)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5}>
        <circle cx="16" cy="11.6" r="3.6" fill="url(#account3d-primary)" />
        <path d="M9 22.8 C9 18.2 11.4 16.1 16 16.1 C20.6 16.1 23 18.2 23 22.8 Z" fill="url(#account3d-primary)" />
      </g>
    </Wrap>
  );
}
export function Player3D(p: IconProps) {
  return (
    <Wrap id="player" {...p}>
      <g filter="url(#player-shadow)" fill="url(#player-primary)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5}>
        <rect x="8" y="11.5" width="16" height="9" rx="3.2" />
        <circle cx="12.2" cy="15.2" r="1" fill="#06080a" />
        <circle cx="19.8" cy="15.2" r="1" fill="#06080a" />
        <rect x="15" y="14.2" width="2" height="4.6" rx="0.7" fill="#06080a" />
        <rect x="13.2" y="16" width="5.6" height="1" rx="0.5" fill="#06080a" />
      </g>
    </Wrap>
  );
}
export function Optimization3D(p: IconProps) {
  return (
    <Wrap id="opt" {...p}>
      <g filter="url(#opt-shadow)">
        <circle cx="16" cy="15.2" r="7.2" fill="none" stroke="url(#opt-primary)" strokeWidth={2} strokeLinecap="round" opacity={0.95} />
        <path d="M16 15.2 L20.2 12" stroke="url(#opt-primary)" strokeWidth={2} strokeLinecap="round" />
        <circle cx="16" cy="15.2" r="1.6" fill="#06080a" />
      </g>
    </Wrap>
  );
}
export function AppIcon3D(p: IconProps) {
  return (
    <Wrap id="appicon" {...p}>
      <g filter="url(#appicon-shadow)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5}>
        <rect x="8.5" y="8.5" width="15" height="15" rx="3.2" fill="url(#appicon-primary)" />
        <rect x="12.2" y="12.2" width="7.6" height="7.6" rx="1.6" fill="#06080a" />
      </g>
    </Wrap>
  );
}
export function Appearance3D(p: IconProps) {
  return (
    <Wrap id="appearance" {...p}>
      <g filter="url(#appearance-shadow)">
        <text x="11" y="20.2" fontSize="11" fontWeight="800" fill="url(#appearance-primary)" stroke="#ffffff" strokeOpacity={0.08} strokeWidth={0.3} fontFamily="800">A</text>
        <path d="M20.5 10.5 L22.1 14.2 L18.9 14.2 Z" fill="url(#appearance-primary)" stroke="#ffffff" strokeOpacity={0.12} strokeWidth={0.4} />
      </g>
    </Wrap>
  );
}
export function Overlay3D(p: IconProps) {
  return (
    <Wrap id="overlay" {...p}>
      <g filter="url(#overlay-shadow)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5}>
        <rect x="9" y="9.5" width="14" height="11" rx="2.2" fill="none" stroke="url(#overlay-primary)" strokeWidth={1.6} />
        <path d="M12.5 14.2 H19.5" stroke="url(#overlay-primary)" strokeWidth={1.2} strokeLinecap="round" opacity={0.95} />
        <circle cx="16" cy="17.2" r="1.2" fill="#06080a" />
      </g>
    </Wrap>
  );
}
