import type { CSSProperties } from "react";

type IconProps = { size?: number; style?: CSSProperties; className?: string };

function BaseDefs({ idBase }: { idBase: string }) {
  return (
    <>
      <linearGradient id={`${idBase}-base`} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="var(--sb-surface-container-high, #2b2930)" />
        <stop offset="1" stopColor="var(--sb-surface, #1d1b20)" />
      </linearGradient>
      <linearGradient id={`${idBase}-primary`} x1="7" y1="6" x2="25" y2="26" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="var(--sb-secondary, #efb8c8)" />
        <stop offset="1" stopColor="var(--sb-primary, #9a82db)" />
      </linearGradient>
      <filter id={`${idBase}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1.1" stdDeviation="1" floodColor="#000000" floodOpacity={0.35} />
      </filter>
    </>
  );
}

export function Home3D({ size = 28, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={style} aria-hidden>
      <defs>
        <BaseDefs idBase="home-dyn" />
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="9" fill="url(#home-dyn-base)" />
      <g filter="url(#home-dyn-shadow)">
        <path d="M16 7.2 L24.3 14.3 C24.9 14.8 24.6 15.8 23.8 15.8 L8.2 15.8 C7.4 15.8 7.1 14.8 7.7 14.3 Z" fill="url(#home-dyn-primary)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5} />
        <rect x="9" y="15" width="14" height="9.8" rx="3" fill="url(#home-dyn-primary)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5} />
      </g>
      <circle cx="16" cy="11.6" r="1.5" fill="url(#home-dyn-base)" />
      <rect x="13.4" y="19.4" width="5.2" height="5.4" rx="1.8" fill="url(#home-dyn-base)" />
    </svg>
  );
}

export function Discover3D({ size = 28, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={style} aria-hidden>
      <defs>
        <linearGradient id="disc-dyn-base" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--sb-surface-container-high, #2b2930)" />
          <stop offset="1" stopColor="var(--sb-surface, #1d1b20)" />
        </linearGradient>
        <linearGradient id="disc-dyn-primary" x1="7" y1="6.5" x2="25" y2="25.5" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--sb-primary, #9a82db)" />
          <stop offset="1" stopColor="var(--sb-secondary, #5b4b95)" />
        </linearGradient>
        <filter id="disc-dyn-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.1" stdDeviation="1" floodColor="#000000" floodOpacity={0.35} />
        </filter>
        <filter id="disc-dyn-needle-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0.6" stdDeviation="0.4" floodColor="#000000" floodOpacity={0.5} />
        </filter>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="9" fill="url(#disc-dyn-base)" />
      <circle cx="16" cy="16" r="9.4" fill="url(#disc-dyn-primary)" filter="url(#disc-dyn-shadow)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5} />
      <path d="M16 9 L16 16 L13 16 Z" fill="#07080a" stroke="#ffffff" strokeOpacity={0.07} strokeWidth={0.35} filter="url(#disc-dyn-needle-shadow)" />
      <path d="M16 16 L19 16 L16 23 Z" fill="#07080a" stroke="#ffffff" strokeOpacity={0.07} strokeWidth={0.35} filter="url(#disc-dyn-needle-shadow)" />
      <circle cx="16" cy="16" r="1.5" fill="url(#disc-dyn-base)" stroke="#ffffff" strokeOpacity={0.12} strokeWidth={0.4} />
    </svg>
  );
}

export function Friends3D({ size = 28, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={style} aria-hidden>
      <defs>
        <linearGradient id="fr-dyn-base" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--sb-surface-container-high, #2b2930)" />
          <stop offset="1" stopColor="var(--sb-surface, #1d1b20)" />
        </linearGradient>
        <linearGradient id="fr-dyn-back" x1="15" y1="8" x2="25" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--sb-primary, #a78fce)" />
          <stop offset="1" stopColor="var(--sb-accent, #6f5aa8)" />
        </linearGradient>
        <linearGradient id="fr-dyn-front" x1="7" y1="9" x2="18" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--sb-secondary, #efb8c8)" />
          <stop offset="1" stopColor="var(--sb-primary, #9a82db)" />
        </linearGradient>
        <filter id="fr-dyn-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.1" stdDeviation="1" floodColor="#000000" floodOpacity={0.35} />
        </filter>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="9" fill="url(#fr-dyn-base)" />
      <g stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5}>
        <circle cx="20" cy="11.6" r="3.3" fill="url(#fr-dyn-back)" />
        <path d="M14.9 24.6 C14.9 18.9 17 16.3 20 16.3 C23 16.3 25.1 18.9 25.1 24.6 Z" fill="url(#fr-dyn-back)" />
        <g filter="url(#fr-dyn-shadow)">
          <circle cx="12.2" cy="13.1" r="3.8" fill="url(#fr-dyn-front)" />
          <path d="M6.4 25.4 C6.4 18.5 8.8 15.6 12.2 15.6 C15.6 15.6 18 18.5 18 25.4 Z" fill="url(#fr-dyn-front)" />
        </g>
      </g>
    </svg>
  );
}

export function Visuals3D({ size = 28, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={style} aria-hidden>
      <defs>
        <linearGradient id="vis-dyn-base" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--sb-surface-container-high, #2b2930)" />
          <stop offset="1" stopColor="var(--sb-surface, #1d1b20)" />
        </linearGradient>
        <linearGradient id="vis-dyn-primary" x1="7" y1="7" x2="25" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--sb-primary, #9a82db)" />
          <stop offset="1" stopColor="var(--sb-accent, #6f5aa8)" />
        </linearGradient>
        <filter id="vis-dyn-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.1" stdDeviation="1" floodColor="#000000" floodOpacity={0.35} />
        </filter>
        <filter id="vis-dyn-punched" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0.7" stdDeviation="0.7" floodColor="#000000" floodOpacity={0.55} />
          <feDropShadow dx="0" dy="-0.3" stdDeviation="0.4" floodColor="#ffffff" floodOpacity={0.07} />
        </filter>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="9" fill="url(#vis-dyn-base)" />
      <path d="M16 7.4 C21 7.4 25 10.6 25 15.1 C25 19.1 22.1 21.1 18.7 20.9 C17.4 20.8 16.8 21.8 17.5 22.8 C18.3 23.9 17.1 25.2 15.4 24.6 C10.2 22.9 7 19.3 7 15.1 C7 10.6 11 7.4 16 7.4 Z" fill="url(#vis-dyn-primary)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5} filter="url(#vis-dyn-shadow)" />
      <circle cx="18.7" cy="19.3" r="1.65" fill="url(#vis-dyn-base)" />
      <circle cx="12" cy="12" r="1.5" fill="#06080a" filter="url(#vis-dyn-punched)" stroke="#ffffff" strokeOpacity={0.06} strokeWidth={0.4} />
      <circle cx="16" cy="10.3" r="1.5" fill="#06080a" filter="url(#vis-dyn-punched)" stroke="#ffffff" strokeOpacity={0.06} strokeWidth={0.4} />
      <circle cx="20" cy="12.3" r="1.5" fill="#06080a" filter="url(#vis-dyn-punched)" stroke="#ffffff" strokeOpacity={0.06} strokeWidth={0.4} />
    </svg>
  );
}

export function Settings3D({ size = 28, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={style} aria-hidden>
      <defs>
        <linearGradient id="set-dyn-base" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--sb-surface-container-high, #2b2930)" />
          <stop offset="1" stopColor="var(--sb-surface, #1d1b20)" />
        </linearGradient>
        <linearGradient id="set-dyn-primary" x1="7" y1="6" x2="25" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--sb-secondary, #efb8c8)" />
          <stop offset="1" stopColor="var(--sb-primary, #9a82db)" />
        </linearGradient>
        <filter id="set-dyn-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.1" stdDeviation="1" floodColor="#000000" floodOpacity={0.35} />
        </filter>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="9" fill="url(#set-dyn-base)" />
      <g filter="url(#set-dyn-shadow)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5}>
        <g fill="url(#set-dyn-primary)">
          <rect x="14.7" y="4.6" width="2.6" height="4.2" rx="1.3" transform="rotate(0 16 16)" />
          <rect x="14.7" y="4.6" width="2.6" height="4.2" rx="1.3" transform="rotate(45 16 16)" />
          <rect x="14.7" y="4.6" width="2.6" height="4.2" rx="1.3" transform="rotate(90 16 16)" />
          <rect x="14.7" y="4.6" width="2.6" height="4.2" rx="1.3" transform="rotate(135 16 16)" />
          <rect x="14.7" y="4.6" width="2.6" height="4.2" rx="1.3" transform="rotate(180 16 16)" />
          <rect x="14.7" y="4.6" width="2.6" height="4.2" rx="1.3" transform="rotate(225 16 16)" />
          <rect x="14.7" y="4.6" width="2.6" height="4.2" rx="1.3" transform="rotate(270 16 16)" />
          <rect x="14.7" y="4.6" width="2.6" height="4.2" rx="1.3" transform="rotate(315 16 16)" />
        </g>
        <circle cx="16" cy="16" r="8" fill="url(#set-dyn-primary)" />
      </g>
      <circle cx="16" cy="16" r="4.4" fill="url(#set-dyn-base)" />
    </svg>
  );
}

export function About3D({ size = 28, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={style} aria-hidden>
      <defs>
        <linearGradient id="ab-dyn-base" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--sb-surface-container-high, #2b2930)" />
          <stop offset="1" stopColor="var(--sb-surface, #1d1b20)" />
        </linearGradient>
        <linearGradient id="ab-dyn-primary" x1="7" y1="6.5" x2="25" y2="25.5" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--sb-primary, #9a82db)" />
          <stop offset="1" stopColor="var(--sb-secondary, #efb8c8)" />
        </linearGradient>
        <filter id="ab-dyn-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.1" stdDeviation="1" floodColor="#000000" floodOpacity={0.35} />
        </filter>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="9" fill="url(#ab-dyn-base)" />
      <circle cx="16" cy="16" r="9.4" fill="url(#ab-dyn-primary)" filter="url(#ab-dyn-shadow)" stroke="#ffffff" strokeOpacity={0.15} strokeWidth={0.5} />
      <circle cx="16" cy="11.4" r="1.7" fill="url(#ab-dyn-base)" />
      <rect x="14.5" y="14.6" width="3" height="8" rx="1.5" fill="url(#ab-dyn-base)" />
    </svg>
  );
}
