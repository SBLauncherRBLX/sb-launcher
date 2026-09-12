import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@sb/ui";
import type { PlaySession } from "@sb/contracts";
import { getSessions, formatDuration, message } from "../lib/content";
import { ContentGate, ContentNotice } from "../components/ContentTools";

export function ActivityPage(){return <ContentGate><Activity/></ContentGate>;}
function Activity(){
  const [items,setItems]=useState<PlaySession[]>([]),[range,setRange]=useState(7),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function load(){setBusy(true);try{setItems((await getSessions()).items);setError("");}catch(e){setError(message(e));}finally{setBusy(false);}}
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),30000);return()=>clearInterval(timer);},[]);
  const cutoff=range?Date.now()-range*86400000:0;
  const list=items.filter(s=>s.startedAt>=cutoff&&s.seconds>0),total=list.reduce((n,s)=>n+s.seconds,0);
  const games=new Map<string,{name:string;seconds:number;count:number}>();
  list.forEach(s=>{const g=games.get(s.universeId)??{name:s.name,seconds:0,count:0};g.seconds+=s.seconds;g.count++;games.set(s.universeId,g);});
  const top=[...games.entries()].sort((a,b)=>b[1].seconds-a[1].seconds);
  const days=Array.from({length:7},(_,i)=>{const day=new Date();day.setHours(0,0,0,0);day.setDate(day.getDate()-6+i);const next=new Date(day);next.setDate(day.getDate()+1);return {label:day.toLocaleDateString("en-GB",{weekday:"short"}),count:items.filter(s=>s.seconds>0&&s.startedAt>=day.getTime()&&s.startedAt<next.getTime()).length};});
  const max=Math.max(1,...days.map(d=>d.count));
  return <div className="content-page"><header className="content-heading"><div><h2>Activity</h2><p className="sb-muted">Sessions launched through SB, tracked while the launcher is open.</p></div><Button disabled={busy} onClick={()=>void load()}>{busy?"Refreshing…":"Refresh"}</Button></header><ContentNotice error={error}/>
    <label className="content-toolbar">Sessions started<select className="sb-input" value={range} onChange={e=>setRange(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={0}>All recorded sessions</option></select></label>
    <div className="activity-metrics"><article><span>Tracked playtime</span><strong>{formatDuration(total)}</strong></article><article><span>Sessions</span><strong>{list.length}</strong></article><article><span>Games played</span><strong>{games.size}</strong></article><article><span>Average session</span><strong>{formatDuration(list.length?total/list.length:0)}</strong></article></div>
    <section className="sb-card content-panel"><h3>Sessions started · last 7 days</h3><div className="activity-chart" role="img" aria-label={days.map(d=>`${d.label}: ${d.count} sessions`).join(", ")}>{days.map((d,i)=><div key={i}><span>{d.count}</span><div className="activity-bar-track"><div className="activity-bar" style={{height:`${d.count/max*100}%`}}/></div><span>{d.label}</span></div>)}</div><p className="sb-muted">Vertical axis: sessions. Horizontal axis: local calendar day.</p></section>
    <section className="sb-card content-panel"><h3>Most played</h3>{!top.length&&<p className="sb-muted">Launch a game from SB to start recording. Old launch history has no duration data.</p>}{top.slice(0,10).map(([id,g])=><div className="activity-row" key={id}><Link to={`/game/${id}`}>{g.name}</Link><span>{g.count} sessions</span><strong>{formatDuration(g.seconds)}</strong></div>)}</section>
    <section className="sb-card content-panel"><h3>Session history</h3>{list.slice(0,100).map(s=><div className="activity-row" key={s.id}><div><Link to={`/game/${s.universeId}`}>{s.name}</Link><small>{new Date(s.startedAt).toLocaleString()}{!s.ended?" · Tracking":""}</small></div><strong>{formatDuration(s.seconds)}</strong></div>)}</section>
  </div>;
}
