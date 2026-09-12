import { ContentDialog } from "./ContentDialog";
import {useEffect,useState} from "react";
import {Button} from "@sb/ui";
import {getApiBase,request} from "../lib/api";
import {useAppStore} from "../store";
import {message} from "../lib/content";
type Capture={id:string;filename:string;createdAt:number;gameName:string|null;universeId:string|null;kind:"image"|"video";extension:string;url:string};
type Payload={enabled:boolean;configured:boolean;items:Capture[]};
const event="sb-captures-updated";
let importError="";
export function CaptureTracker(){
  const userId=useAppStore(s=>s.session?.user?.id);
  useEffect(()=>{
    if(!userId)return;let stopped=false,busy=false;importError="";
    const tick=async()=>{if(busy||stopped)return;busy=true;try{await request("/api/captures/sync",{method:"POST"});importError="";}catch(e){if(!stopped)importError=message(e);}finally{busy=false;if(!stopped)window.dispatchEvent(new Event(event));}};
    void tick();const timer=setInterval(()=>void tick(),15000);return()=>{stopped=true;clearInterval(timer);};
  },[userId]);return null;
}
export function JournalCaptures({gameId}:{gameId:string}){
  const [data,setData]=useState<Payload|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[preview,setPreview]=useState<Capture|null>(null);
  const load=async()=>{try{setData(await request<Payload>("/api/captures"));setError(importError);}catch(e){setError(message(e));}};
  useEffect(()=>{let live=true;const update=()=>{if(live)void load();};update();window.addEventListener(event,update);return()=>{live=false;window.removeEventListener(event,update);};},[]);
  useEffect(()=>{if(!preview)return;const key=(e:KeyboardEvent)=>{if(e.key==="Escape")setPreview(null);};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[preview]);
  const items=data?.items.filter(c=>!gameId||c.universeId===gameId)??[];
  return <section className="sb-card content-panel"><div className="content-heading"><h3>Roblox captures</h3><Button variant="ghost" onClick={()=>void load()}>Refresh captures</Button></div>
    <p className="sb-muted">New screenshots and recordings saved to Pictures/Roblox and Videos/Roblox are copied here automatically while SB Launcher is open. Files appear after recording finishes. Captures without a known game appear under All games.</p>
    <label className="check-row"><input type="checkbox" checked={data?.enabled??true} disabled={!data||busy||!data.configured} onChange={async e=>{setBusy(true);try{await request("/api/captures/settings",{method:"PUT",body:JSON.stringify({enabled:e.target.checked})});await load();}catch(e){setError(message(e));}finally{setBusy(false);}}}/>Automatically save new Roblox captures</label>
    {data&&!data.configured&&<p className="sb-muted">Automatic capture import is available in the Windows launcher.</p>}
    {error&&<p role="alert" className="content-error">{error}</p>}
    {!items.length&&<p className="sb-muted">No captures yet. Save a screenshot or finish a recording in Roblox.</p>}
    <div className="capture-grid">{items.map(c=><article key={c.id}><div className="capture-preview">{c.kind==="image"?<button onClick={()=>setPreview(c)} aria-label={`Open ${c.filename}`}><img loading="lazy" src={getApiBase()+c.url} alt={c.filename}/></button>:c.extension===".wmv"?<a href={getApiBase()+c.url} download>Download WMV recording</a>:<video controls preload="none" src={getApiBase()+c.url}/>}</div><strong>{c.gameName??"Roblox capture"}</strong><small>{new Date(c.createdAt).toLocaleString()}</small><p className="sb-muted">{c.filename}</p></article>)}</div>
    {preview&&<ContentDialog onClose={()=>setPreview(null)}><div className="journal-lightbox"><Button autoFocus onClick={()=>setPreview(null)}>Close</Button><img src={getApiBase()+preview.url} alt={preview.filename}/></div></ContentDialog>}
  </section>;
}
