import { create } from "zustand";
export const LIQUID_DEFAULTS = {
  enabled: false, refraction: 20, bezel: 18, blur: 0.4, saturation: 1,
  tint: 0.06, highlight: 0.17, shadow: 0.2, duration: 320, press: 0.94,
  radius: 48, quality: 1, navigation: true, buttons: true,
  panels: true, cards: true, controls: true, animate: true, frostedLiquidControls: false,
};
export type LiquidSettings = typeof LIQUID_DEFAULTS;
const key = "sb-liquid-demo-v2";
export function sanitizeLiquid(input: unknown): LiquidSettings {
  const result = { ...LIQUID_DEFAULTS };
  if (!input || typeof input !== "object") return result;
  const bounds: Record<string, [number, number]> = {refraction:[0,60],bezel:[4,40],blur:[0,20],saturation:[0,3],tint:[0,0.65],highlight:[0,1],shadow:[0,0.6],duration:[100,800],press:[0.9,1],radius:[8,48],quality:[0.5,1.5]};
  for (const name of Object.keys(result) as (keyof LiquidSettings)[]) {
    const value = (input as Record<string, unknown>)[name];
    if (typeof result[name] === "boolean" && typeof value === "boolean") (result as Record<string, boolean | number>)[name] = value;
    if (typeof value === "number" && Number.isFinite(value) && bounds[name]) (result as Record<string, boolean | number>)[name] = Math.max(bounds[name][0], Math.min(bounds[name][1], value));
  }
  return result;
}
function load() { try { return sanitizeLiquid(JSON.parse(localStorage.getItem(key) || "null")); } catch { return {...LIQUID_DEFAULTS}; } }
export const useLiquid = create<{settings:LiquidSettings; patch:(patch:Partial<LiquidSettings>)=>void; reset:()=>void}>((set)=>({
  settings:load(),
  patch:patch=>set(state=>{const settings=sanitizeLiquid({...state.settings,...patch}); try {localStorage.setItem(key,JSON.stringify(settings));} catch {} return {settings};}),
  reset:()=>set(()=>{try {localStorage.removeItem(key);} catch {} return {settings:{...LIQUID_DEFAULTS}};}),
}));
/** Rounded-box normal field; neutral centre leaves the flat lens undistorted. */
export function displacementPixels(w:number,h:number,radius:number,bezel:number) {
  const data = new Uint8ClampedArray(w*h*4);
  const r=Math.min(radius,w/2,h/2), band=Math.max(1,Math.min(bezel,r));
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const px=x+0.5-w/2, py=y+0.5-h/2;
    const qx=Math.abs(px)-(w/2-r), qy=Math.abs(py)-(h/2-r);
    const ox=Math.max(qx,0),oy=Math.max(qy,0),len=Math.hypot(ox,oy);
    const d=len+Math.min(Math.max(qx,qy),0)-r;
    let nx=0,ny=0;
    if(len>0){nx=ox/len*Math.sign(px);ny=oy/len*Math.sign(py);} else if(qx>qy) nx=Math.sign(px); else ny=Math.sign(py);
    const t=Math.max(0,Math.min(1,1+d/band));
    const bend=d<=0 ? Math.sin(t*Math.PI/2)*0.48 : 0;
    const i=(y*w+x)*4; data[i]=Math.round(128+nx*bend*255);data[i+1]=Math.round(128+ny*bend*255);data[i+2]=128;data[i+3]=255;
  }
  return data;
}
