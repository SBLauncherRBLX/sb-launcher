import { useState } from "react";
import { Button } from "@sb/ui";
import type { ServerFilter } from "@sb/contracts";
import { useContent } from "../lib/content";
import { ContentNotice } from "./ContentTools";
export const DEFAULT_SERVER_FILTER:ServerFilter={id:"default",name:"Default",maxPing:0,minFps:0,minFree:1,maxOccupancy:100,sort:"ping"};
export function SmartServerControls({value,onChange,count,loaded,onJoin}:{value:ServerFilter;onChange:(f:ServerFilter)=>void;count:number;loaded:number;onJoin:()=>void}){
  const c=useContent(),[name,setName]=useState("");
  const patch=(p:Partial<ServerFilter>)=>onChange({...value,...p});
  return <div className="sb-card content-panel smart-server-controls"><div className="content-heading"><div><h3>Find your server</h3><p className="sb-muted">{count} matching / {loaded} loaded. Load more below to search further.</p></div><Button disabled={!count} onClick={onJoin}>Join best match</Button></div><div className="form-grid">
    <label>Maximum ping, ms (0 = any)<input className="sb-input" type="number" min={0} max={2000} value={value.maxPing} onChange={e=>patch({maxPing:Math.min(2000,Math.max(0,Number(e.target.value)))})}/></label>
    <label>Minimum FPS (0 = any)<input className="sb-input" type="number" min={0} max={240} value={value.minFps} onChange={e=>patch({minFps:Math.min(240,Math.max(0,Number(e.target.value)))})}/></label>
    <label>Free player slots<input className="sb-input" type="number" min={1} max={200} value={value.minFree} onChange={e=>patch({minFree:Math.min(200,Math.max(1,Number(e.target.value)))})}/></label>
    <label>Maximum occupancy, % (100 = any)<input className="sb-input" type="number" min={1} max={100} value={value.maxOccupancy} onChange={e=>{const v=Math.min(100,Math.max(1,Number(e.target.value)||100)); patch({maxOccupancy:v});}}/></label>
    <label>Sort by<select className="sb-input" value={value.sort} onChange={e=>patch({sort:e.target.value as ServerFilter["sort"]})}><option value="ping">Lowest reported ping</option><option value="fps">Highest reported FPS</option><option value="space">Most free slots</option></select></label>
    <label>Saved filters<select className="sb-input" aria-label="Saved server filters" value="" onChange={e=>{const f=c.data?.filters.find(f=>f.id===e.target.value);if(f)onChange(f);}}><option value="">Choose a filter…</option>{c.data?.filters.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
  </div><p className="sb-muted">Ping and FPS are reported by Roblox, not measured from your PC. Servers with missing metrics are excluded when that threshold is enabled.</p><div className="content-toolbar"><Button variant="ghost" onClick={()=>onChange(DEFAULT_SERVER_FILTER)}>Reset filters</Button>{c.userId&&<><input className="sb-input" placeholder="Filter name" aria-label="Filter name" maxLength={50} value={name} onChange={e=>setName(e.target.value)}/><Button variant="secondary" disabled={c.busy||!c.data||!name.trim()} onClick={async()=>{if(await c.save(d=>{d.filters.push({...value,id:crypto.randomUUID(),name:name.trim()});}))setName("");}}>Save filter</Button></>}</div>{c.data?.filters.length? <details><summary>Manage saved filters</summary>{c.data.filters.map(f=><div className="content-toolbar" key={f.id}><span>{f.name}</span><Button variant="ghost" disabled={c.busy} onClick={()=>void c.save(d=>{d.filters=d.filters.filter(v=>v.id!==f.id);})}>Remove</Button></div>)}</details>:null}<ContentNotice error={c.error}/></div>;
}
