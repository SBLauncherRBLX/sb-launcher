import { useEffect, useRef, useState } from "react";
import { useLiquid } from "../lib/liquid";
import { useAppStore } from "../store";
import { useMotionEnabled } from "../lib/motion";
import "../liquid.css";
import { installLiquidRenderer } from "../lib/liquidRenderer";
import { APP_VERSION } from "../lib/version";

export function LiquidGlassDemo() {
  const s=useLiquid(x=>x.settings);
  const theme=useAppStore(x=>x.theme);
  const motion=useMotionEnabled(theme);
  const renderer=useRef<ReturnType<typeof installLiquidRenderer>|null>(null);
  useEffect(()=>{
    // Older demo profiles could enable both renderers; one material owns the backdrop now.
    if(s.enabled&&theme.effects?.glass){const current=useAppStore.getState().theme;useAppStore.getState().setTheme({...current,effects:{...current.effects!,glass:false}});}
  },[s.enabled,theme.effects?.glass]);
  useEffect(()=>{
    const root=document.documentElement;
    const frostedControls=Boolean(theme.effects?.glass)&&s.frostedLiquidControls;
    const active=s.enabled||frostedControls;
    const rendererSettings=s.enabled?s:{...s,navigation:false,panels:false,buttons:true,controls:true};
    root.dataset.liquid=active ? "on" : "off";
    root.dataset.liquidControls=(s.enabled?s.controls:frostedControls) ? "on" : "off";
    root.dataset.liquidMotion=s.animate&&motion ? "on" : "off";
    for(const [name,value] of Object.entries({tint:s.tint,highlight:s.highlight,shadow:s.shadow,press:s.press,duration:`${s.duration}ms`,radius:`${s.radius}px`,"panel-blur":`${s.panelBlur}px`})) root.style.setProperty(`--lg-${name}`,String(value));
    if(active){
      if(!renderer.current)renderer.current=installLiquidRenderer(rendererSettings);
      else renderer.current.update(rendererSettings);
    }else{renderer.current?.dispose();renderer.current=null;}
  },[s,motion,theme.effects?.glass]);
  useEffect(()=>()=>{renderer.current?.dispose();renderer.current=null;},[]);
  return null;
}
const ranges = [
  ["refraction","Refraction",0,60,1], ["bezel","Lens edge width",4,40,1],
  ["blur","Lens frost / blur",0,20,0.1], ["panelBlur","Panel backdrop blur",0,18,0.5], ["saturation","Saturation",0,3,0.05],
  ["tint","Theme tint",0,0.65,0.01], ["highlight","Rim light",0,1,0.01],
  ["shadow","Shadow depth",0,0.6,0.01], ["radius","Panel corners",8,48,1],
  ["duration","Animation duration (ms)",100,800,10], ["press","Press scale",0.9,1,0.01],
  ["quality","Map resolution",0.5,1.5,0.25],
] as const;
const toggles=[["animate","Elastic animations"],["navigation","Navigation bubble"],["buttons","Buttons"],["controls","Sliders & switches"],["panels","Panels & menus"]] as const;

export function LiquidPreview({liquid=true}:{liquid?:boolean}) {
  const area=useRef<HTMLDivElement>(null);
  const drag=useRef<{id:number;x:number;y:number}|null>(null);
  const [position,setPosition]=useState({x:0.5,y:0.5});
  const clamp=(n:number)=>Math.max(0,Math.min(1,n));
  return <>
    <p className="sb-muted" id="liquid-preview-help">Drag the glass across the preview. Arrow keys move it; Home recentres it.</p>
    <div className="liquid-preview" ref={area}><span>SB / GLASS / {APP_VERSION}</span>
      <button type="button" className={`liquid-preview-lens ${liquid ? "" : "frosted-preview-lens"}`} aria-describedby="liquid-preview-help"
        style={{left:`calc((100% - 190px) * ${position.x})`,top:`calc((100% - 66px) * ${position.y})`}}
        onPointerDown={e=>{if(e.button!==0)return;const rect=e.currentTarget.getBoundingClientRect();drag.current={id:e.pointerId,x:e.clientX-rect.left,y:e.clientY-rect.top};e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{const grab=drag.current;if(!grab||grab.id!==e.pointerId||!area.current)return;const bounds=area.current.getBoundingClientRect();setPosition({x:clamp((e.clientX-bounds.left-grab.x)/Math.max(1,bounds.width-e.currentTarget.offsetWidth)),y:clamp((e.clientY-bounds.top-grab.y)/Math.max(1,bounds.height-e.currentTarget.offsetHeight))});}}
        onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
        onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}
        onKeyDown={e=>{if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home"].includes(e.key))return;e.preventDefault();setPosition(p=>e.key==="Home"?{x:0.5,y:0.5}:{x:clamp(p.x+(e.key==="ArrowRight"?0.05:e.key==="ArrowLeft"?-0.05:0)),y:clamp(p.y+(e.key==="ArrowDown"?0.1:e.key==="ArrowUp"?-0.1:0))});}}
      >{liquid ? "Liquid Glass" : "Frosted Glass"}</button>
    </div>
  </>;
}
export function LiquidControls(){
  const {settings:s,patch,reset}=useLiquid();
  return <section className="liquid-settings">

    {s.enabled && <>
    <p className="sb-muted">Changes preview instantly and are saved on this device.</p>

    <div className="liquid-settings-grid">{toggles.map(([key,label])=><label className="liquid-setting" key={key}><span>{label}</span><input type="checkbox" checked={s[key]} onChange={e=>patch({[key]:e.target.checked})}/></label>)}</div>
    <div className="liquid-settings-grid">{ranges.map(([key,label,min,max,step])=><label className="liquid-setting-range" key={key}><span>{label}<output>{s[key]}</output></span><input type="range" aria-label={label} min={min} max={max} step={step} value={s[key]} onChange={e=>patch({[key]:Number(e.target.value)})}/></label>)}</div>
    <div className="row-actions"><button className="sb-button" onClick={()=>patch({refraction:18,blur:3,tint:0.16,highlight:0.35,quality:0.75})}>Balanced</button><button className="sb-button" onClick={()=>patch({refraction:36,blur:0.5,tint:0.06,highlight:0.7,quality:1})}>Crystal</button><button className="sb-button" onClick={()=>patch({refraction:12,blur:12,tint:0.22,highlight:0.4})}>Frosted</button><button className="sb-button secondary" onClick={()=>{reset();patch({enabled:true});}}>Reset liquid</button></div>
    </>}
  </section>;
}
