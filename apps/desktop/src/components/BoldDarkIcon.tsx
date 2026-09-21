import { useId, type CSSProperties } from "react";
import { useAppStore } from "../store";
import { useLiquid } from "../lib/liquid";
import { MaterialSymbol } from "./MaterialSymbol";

export type IconProps = { size?: number; className?: string; style?: CSSProperties };
export type IconName = "home" | "discover" | "friends" | "visuals" | "settings" | "about" | "presets" | "background" | "effects" | "layout" | "scroll" | "colors" | "motion" | "discord" | "account" | "player" | "optimization" | "appicon" | "appearance" | "overlay";

const accents: Record<IconName, string> = {
  home: "#ffd522", discover: "#22b9f4", friends: "#30d55b", visuals: "#d77ef3",
  settings: "#bfc2c9", about: "#35b8ff", presets: "#ffb62a", background: "#48d9bc",
  effects: "#c884ff", layout: "#39b6ff", scroll: "#ff9e2b", colors: "#ff6489",
  motion: "#40d9ef", discord: "#929aff", account: "#28bbff", player: "#34d865",
  optimization: "#ffad21", appicon: "#ebedff", appearance: "#ec83ec", overlay: "#5dc8ff",
};

const materialNames: Record<IconName,string> = {
  home:"home",discover:"explore",friends:"groups",visuals:"palette",settings:"settings",about:"info",
  presets:"view_carousel",background:"image",effects:"auto_awesome",layout:"dashboard",scroll:"swap_vert",
  colors:"palette",motion:"speed",discord:"chat",account:"account_circle",player:"sports_esports",
  optimization:"tune",appicon:"widgets",appearance:"auto_stories",overlay:"smart_display",
};

function Symbol({ name }: { name: IconName }) {
  switch (name) {
    case "home": return <path d="m16 7-9 7.6q-.9.8.3 1.5H9v7.1q0 1.4 1.4 1.4h3.1v-6.4q0-.9.9-.9h3.2q.9 0 .9.9v6.4h3.1q1.4 0 1.4-1.4v-7.1h1.7q1.2-.7.3-1.5Z" />;
    case "discover": return <><circle cx="16" cy="16" r="9.5" fill="#55585d" /><path d="m16 6 1.2 7.2L24 8l-5.2 6.8L26 16l-7.2 1.2L24 24l-6.8-5.2L16 26l-1.2-7.2L8 24l5.2-6.8L6 16l7.2-1.2L8 8l6.8 5.2Z" fill="#73767a"/><path d="m22.6 8.3-4 10-5.3-5.3Z" fill="#ff4b52"/><path d="m9.4 23.7 4-10 5.3 5.3Z" fill="#fff"/></>;
    case "friends": return <><circle cx="21" cy="11.5" r="3.3" opacity=".55"/><path d="M16 24v-3c0-3 1.7-5 5-5s5.3 2 5.3 5v3Z" opacity=".55"/><circle cx="12.6" cy="11.2" r="4"/><path d="M5.6 24v-2.2c0-4.1 2.6-6.1 7-6.1s7 2 7 6.1V24Z"/></>;
    case "visuals": case "colors": return <>{["#ff595f", "#ffad1c", "#ffdc16", "#37ce53", "#20c5ce", "#278ef7", "#a36cea", "#f15aae"].map((color, i) => <ellipse key={color} cx="16" cy="11.3" rx="3.25" ry="5.8" transform={`rotate(${i * 45} 16 16)`} fill={color} opacity=".88"/>)}<circle cx="16" cy="16" r="3.2" fill="#252526"/></>;
    case "settings": return <><g>{Array.from({ length: 12 }, (_, i) => <rect key={i} x="14.4" y="5.3" width="3.2" height="5.4" rx="1" transform={`rotate(${i * 30} 16 16)`}/>)}</g><circle cx="16" cy="16" r="8.7"/><circle cx="16" cy="16" r="6.3" fill="#3a3a3c"/><circle cx="16" cy="16" r="4.3" fill="none" stroke="currentColor" strokeWidth="1.7"/></>;
    case "about": return <><circle cx="16" cy="16" r="10"/><circle cx="16" cy="10.8" r="1.6" fill="#fff"/><path d="M16 15v7" stroke="#fff" strokeWidth="3" strokeLinecap="round"/></>;
    case "presets": return <><rect x="6" y="9" width="13" height="16" rx="3" fill="#f06b87" transform="rotate(-14 12 17)"/><rect x="10" y="7" width="13" height="17" rx="3" fill="#3dcbe6"/><rect x="15" y="7" width="11" height="17" rx="3" transform="rotate(13 20 15)"/><path d="m18 15 1.8 2 3-4" stroke="#604316" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></>;
    case "background": return <><rect x="6.5" y="7.5" width="19" height="17" rx="3.5"/><circle cx="20.5" cy="12" r="2.1" fill="#e9ffb2"/><path d="m7.5 22 5.2-7 4.2 5 3.4-3.4 4.2 5.4Z" fill="#087f81"/></>;
    case "effects": return <><path d="M16 6.5c1.5 6.2 2.4 7.1 8.5 8.5-6.1 1.4-7 2.3-8.5 8.5-1.5-6.2-2.4-7.1-8.5-8.5 6.1-1.4 7-2.3 8.5-8.5Z"/><path d="m24 6 .8 2.5 2.7 1-2.7 1L24 13l-.8-2.5-2.7-1 2.7-1Z" fill="#f1c7ff"/><circle cx="8" cy="23" r="1.7"/></>;
    case "layout": return <><rect x="6.5" y="7.5" width="6" height="17" rx="2"/><rect x="14.5" y="7.5" width="11" height="6" rx="2" opacity=".85"/><rect x="14.5" y="15.5" width="11" height="9" rx="2" opacity=".45"/></>;
    case "scroll": return <><path d="M12 8v16m-4-4 4 4 4-4M21 24V8m-4 4 4-4 4 4" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></>;
    case "motion": return <path d="M6.5 17h3l2.7-8 5.2 15 3.3-10 2.2 3h2.6" stroke="currentColor" strokeWidth="2.7" fill="none" strokeLinecap="round" strokeLinejoin="round"/>;
    case "discord": return <><path d="M10 9.5q6-2 12 0 3 4.5 3.5 11-2.5 2.3-5.5 2.5l-1-2q-3 .8-6 0l-1 2q-3-.2-5.5-2.5Q7 14 10 9.5Z"/><ellipse cx="12.5" cy="16" rx="1.65" ry="2" fill="#292a3c"/><ellipse cx="19.5" cy="16" rx="1.65" ry="2" fill="#292a3c"/></>;
    case "account": return <><circle cx="16" cy="11" r="4.5"/><path d="M7 25v-2.2c0-4.4 3.1-6.7 9-6.7s9 2.3 9 6.7V25Z"/></>;
    case "player": return <><path d="M11 10h10q4 0 5 5l1 6q0 3-2.5 3-1.4 0-4.5-4h-8q-3.1 4-4.5 4Q5 24 5 21l1-6q1-5 5-5Z"/><path d="M11 13v6m-3-3h6" stroke="#14592c" strokeWidth="1.9" strokeLinecap="round"/><circle cx="21" cy="14" r="1.4" fill="#e6ffed"/><circle cx="23.5" cy="17" r="1.4" fill="#14592c"/></>;
    case "optimization": return <><path d="M8 24a10 10 0 1 1 16 0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="m16 18 5-7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/><circle cx="16" cy="18" r="2.4"/><path d="M9 17H7m9-9V6m7 11h2" stroke="#353536" strokeWidth="1.5"/></>;
    case "appicon": return <path fillRule="evenodd" d="m9.3 5.4 17.3 4-4 17.2-17.2-4Zm4.1 7.1-1 4.6 4.6 1 1-4.6Z"/>;
    case "appearance": return <><path d="m7 23 5.5-15L18 23M9 18h7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 15h5m-2.5 0v8" fill="none" stroke="#f8dfff" strokeWidth="2.2" strokeLinecap="round"/></>;
    case "overlay": return <><rect x="6.5" y="7.5" width="19" height="17" rx="3"/><path d="M8.5 12.5h15" stroke="#225977" strokeWidth="1.4"/><circle cx="10" cy="10" r=".8" fill="#fff"/><path d="m14 15 6 3-6 3Z" fill="#164967"/></>;
  }
}

function MonoSymbol({name}:{name:IconName}) {
  const paths:Partial<Record<IconName,string>> = {
    home:"M6 15 16 6l10 9M9 13v13h5v-8h4v8h5V13",
    friends:"M19 25v-3a6 6 0 0 0-12 0v3M17 10a4 4 0 1 1-8 0 4 4 0 1 1 8 0ZM23 7a4 4 0 0 1 0 8m0 3a5 5 0 0 1 5 5v2",
    account:"M26 16a10 10 0 1 1-20 0 10 10 0 1 1 20 0ZM20 13a4 4 0 1 1-8 0 4 4 0 1 1 8 0ZM9 24c0-8 14-8 14 0",
    layout:"M5 6h22v20H5ZM12 6v20m0-13h15",
    scroll:"M16 5v22m-5-17 5-5 5 5m-10 12 5 5 5-5",
    motion:"M4 17h5l4-10 6 18 4-8h5",
    appicon:"M11 5h10q6 0 6 6v10q0 6-6 6H11q-6 0-6-6V11q0-6 6-6ZM12 12h8v8h-8Z",
    about:"M26 16a10 10 0 1 1-20 0 10 10 0 1 1 20 0ZM16 11h.01M16 16v6",
    discover:"M26 16a10 10 0 1 1-20 0 10 10 0 1 1 20 0ZM21 11l-3 7-7 3 3-7Z",
    settings:"M16 7v3m0 12v3M7 16h3m12 0h3M9 9l3 3m8 8 3 3M9 23l3-3m8-8 3-3M23 16a7 7 0 1 1-14 0 7 7 0 1 1 14 0ZM18 16a2 2 0 1 1-4 0 2 2 0 1 1 4 0Z",
    visuals:"M16 7c-8 0-12 9-8 15 3 5 8 4 9 1 1-3-3-3-1-5 2-2 9 2 10-3S22 7 16 7ZM11 13h.01M16 11h.01M21 13h.01M10 19h.01",
    presets:"M9 8h12v17H9ZM6 12H4v15h12m7-20h5v17h-3M12 13h6m-6 4h6m-6 4h3",
    background:"M7 8h18v17H7ZM7 22l6-7 5 6 3-4 4 5M21 12h.01",
    player:"M11 10h10q4 0 5 5l1 6q0 3-3 3l-4-4h-8l-4 4q-3 0-3-3l1-6q1-5 5-5ZM11 13v6m-3-3h6M21 14h.01M24 17h.01",
    discord:"M10 10q6-2 12 0l4 12-6 2-1-3h-6l-1 3-6-2ZM12 16h.01M20 16h.01",
    optimization:"M8 24a10 10 0 1 1 16 0M16 18l5-7M9 17H7m9-9V6m7 11h2M14 23h4",
    appearance:"M6 24l6-16 6 16M9 18h6m5-3h7m-3.5 0v9",
    overlay:"M7 8h18v17H7Zm0 5h18M14 16l6 3-6 3Z",
    effects:"M16 6l3 7 7 3-7 3-3 7-3-7-7-3 7-3ZM25 5v4m-2-2h4",
    colors:"M16 6C10 6 6 10 6 16c0 6 4 10 10 10h3.2c1.5 0 2.8-1.2 2.8-2.7 0-1.1-.7-2.1-1.7-2.5-.8-.3-1.2-1.2-.8-2 .3-.7 1-1.1 1.8-1.1H24c2.2 0 4-1.8 4-4C28 9.9 22.6 6 16 6ZM11 14h.01M15 10h.01M20 12h.01M11 19h.01",
  };
  const d=paths[name==="colors"?"visuals":name];
  return d?<path d={d} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/>:<Symbol name={name}/>;
}

/** Single-color glyphs retain cutouts and contrast at white and black tints. */
export function BoldDarkIcon({ name, size = 28, className, style }: IconProps & { name: IconName }) {
  const id = `bold-${useId().replace(/:/g, "")}`;
  const mode = useAppStore(s => s.theme.iconColorMode);
  const tint = useAppStore(s => s.theme.iconColor) ?? "#a78bfa";
  const textured = useAppStore(s => Boolean(s.theme.effects?.glass));
  const liquid = useLiquid(s => s.settings.enabled);
  if (!textured && !liquid) return <MaterialSymbol name={materialNames[name]} size={size} className={className} style={style}/>;
  const [red = .65, green = .65, blue = .65] = [1, 3, 5].map(i => Number.parseInt(tint.slice(i, i + 2), 16) / 255).map(value => Number.isFinite(value) ? value : .65);
  const luminance=red*.2126 + green*.7152 + blue*.0722;
  const lightTile = mode === "custom" && luminance < .24;
  const iconTint = mode === "custom" && !lightTile && luminance < .36 ? "#f4f4f6" : tint;
  return <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={style} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop stopColor={lightTile?"#e3e3e7":"#474749"}/><stop offset=".5" stopColor={lightTile?"#c9c9d0":"#303032"}/><stop offset="1" stopColor={lightTile?"#b5b5be":"#262628"}/></linearGradient>
      <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fff" stopOpacity=".17"/><stop offset=".5" stopColor="#fff" stopOpacity=".025"/><stop offset="1" stopColor="#000" stopOpacity=".25"/></linearGradient>
    </defs>
    <rect x="1" y="1" width="30" height="30" rx="7.4" fill={`url(#${id})`} stroke={`url(#${id}-rim)`} strokeWidth=".5"/>
    <g fill={mode==="custom"?iconTint:accents[name]} color={mode==="custom"?iconTint:accents[name]}>{mode==="custom"?<MonoSymbol name={name}/>:<Symbol name={name}/>}</g>
  </svg>;
}
