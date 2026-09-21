import { useState } from "react";
import type { ThemeEffects } from "@sb/contracts";
import { DEFAULT_THEME_EFFECTS } from "@sb/contracts";
import { useAppStore } from "../store";
import { useLiquid } from "../lib/liquid";
import { LiquidControls, LiquidPreview } from "./LiquidGlassDemo";

const frostedRanges = [
  ["glassBlur","Frost / blur",0,100,1], ["glassOpacity","Fill opacity",0,1,.01],
  ["glassSaturation","Saturation",0,3,.05], ["glassBrightness","Brightness",.4,1.8,.02],
  ["glassContrast","Contrast",.5,1.8,.02], ["glassBorder","Border",0,1,.01],
  ["glassSpecular","Rim light",0,1,.01], ["glassShadow","Shadow depth",0,1,.01],
  ["glassTintStrength","Tint strength",0,1,.01],
] as const;

export function GlassSettings() {
  const theme=useAppStore(x=>x.theme),setTheme=useAppStore(x=>x.setTheme);
  const {settings:liquid,patch:patchLiquid}=useLiquid();
  const [preferred,setPreferred]=useState<"frosted"|"liquid">(()=>{try{return localStorage.getItem("sb-glass-mode-v1")==="frosted"?"frosted":"liquid";}catch{return "liquid";}});
  const [exampleEnabled,setExampleEnabled]=useState(true),[exampleValue,setExampleValue]=useState(50);
  const enabled=liquid.enabled||Boolean(theme.effects?.glass);
  const mode=liquid.enabled?"liquid":theme.effects?.glass?"frosted":preferred;
  function patchEffects(value:Partial<ThemeEffects>){const current=useAppStore.getState().theme;setTheme({...current,effects:{...DEFAULT_THEME_EFFECTS,...current.effects,...value}});}
  function selectMode(next:"liquid"|"frosted",on=enabled){
    setPreferred(next);
    try{localStorage.setItem("sb-glass-mode-v1",next);}catch{/* Preferences still work for this session. */}
    patchLiquid({enabled:on&&next==="liquid"});
    const current=useAppStore.getState().theme;
    const frosted=on&&next==="frosted";
    setTheme({...current,buttonStyle:frosted?"glass":current.buttonStyle==="glass"?"solid":current.buttonStyle,
      effects:{...DEFAULT_THEME_EFFECTS,...current.effects,glass:frosted}});
  }
  return <section className="glass-settings">
    <label className="liquid-setting"><strong>Glass</strong><input type="checkbox" aria-label="Enable glass" checked={enabled} onChange={e=>selectMode(mode,e.target.checked)}/></label>
    <p className="sb-muted">Choose a material. Both modes use the same preview; turning glass off restores Material You.</p>
    <div className="row-actions" role="group" aria-label="Glass material">
      <button className={`chip ${mode==="frosted"?"active":""}`} aria-pressed={mode==="frosted"} onClick={()=>selectMode("frosted")}>Frosted</button>
      <button className={`chip ${mode==="liquid"?"active":""}`} aria-pressed={mode==="liquid"} onClick={()=>selectMode("liquid")}>Liquid Glass</button>
    </div>
    {enabled&&<>
      {mode==="frosted"&&<label className="glass-control-style">Buttons, switches & sliders
        <select className="sb-input" aria-label="Control style" value={liquid.frostedLiquidControls?"liquid":"material"} onChange={e=>patchLiquid({frostedLiquidControls:e.target.value==="liquid"})}>
          <option value="material">Material You</option><option value="liquid">Liquid Glass</option>
        </select>
      </label>}
      <h3>Live preview</h3>
      <LiquidPreview liquid={mode==="liquid"}/>
      <div className="glass-preview-controls">
        <button className="sb-button" type="button">Sample button</button>
        <label className="liquid-setting">Sample switch<input type="checkbox" checked={exampleEnabled} onChange={e=>setExampleEnabled(e.target.checked)}/></label>
        <label>Sample slider<input type="range" min={0} max={100} value={exampleValue} onChange={e=>setExampleValue(Number(e.target.value))}/></label>
      </div>
      {mode==="liquid"?<LiquidControls/>:<>
        <div className="liquid-settings-grid">
          {([["glassCards","Cards"],["glassSidebar","Sidebar"],["glassTopbar","Top bar & buttons"]] as const).map(([key,label])=><label className="liquid-setting" key={key}>{label}<input type="checkbox" checked={theme.effects?.[key]??true} onChange={e=>patchEffects({[key]:e.target.checked})}/></label>)}
        </div>
        <div className="liquid-settings-grid">
          {frostedRanges.map(([key,label,min,max,step])=><label key={key} className="liquid-setting-range"><span>{label}<output>{theme.effects?.[key]??DEFAULT_THEME_EFFECTS[key]}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={theme.effects?.[key]??DEFAULT_THEME_EFFECTS[key]} onChange={e=>patchEffects({[key]:Number(e.target.value)})}/></label>)}
          <label>Tint color<input type="color" value={theme.effects?.glassTintColor??theme.accent} onChange={e=>patchEffects({glassTintColor:e.target.value})}/></label>
          <label>Panel corners ({theme.cornerRadius}px)<input aria-label="Panel corners" type="range" min={0} max={48} value={theme.cornerRadius} onChange={e=>setTheme({...theme,cornerRadius:Number(e.target.value)})}/></label>
          <label>Panel opacity ({theme.opacity.toFixed(2)})<input aria-label="Panel opacity" type="range" min={.05} max={1} step={.01} value={theme.opacity} onChange={e=>setTheme({...theme,opacity:Number(e.target.value)})}/></label>
        </div>
        <button className="sb-button secondary" onClick={()=>patchEffects({...DEFAULT_THEME_EFFECTS,glass:true})}>Reset frosted</button>
      </>}
    </>}
  </section>;
}
