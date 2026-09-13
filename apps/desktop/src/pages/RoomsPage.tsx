import { useEffect, useRef, useState } from "react";
import type { FriendRoom, ServerInfo } from "@sb/contracts";
import { Button } from "@sb/ui";
import { community, message } from "../lib/content";
import { launchExperience } from "../lib/launch";
import { api } from "../lib/api";
import { useAppStore } from "../store";
import { ContentGate, ContentNotice, GamePicker } from "../components/ContentTools";

export function RoomsPage(){return <ContentGate><Rooms/></ContentGate>;}
function Rooms(){
  const userId=useAppStore(s=>s.session?.user?.id);
  const [rooms,setRooms]=useState<FriendRoom[]>([]),[room,setRoom]=useState<FriendRoom|null>(null),[name,setName]=useState("Game night"),[code,setCode]=useState(""),[error,setError]=useState(""),[status,setStatus]=useState(""),[busy,setBusy]=useState(false);
  const [serverSettings,setServerSettings]=useState({minFree:1,maxPlaying:0,maxPing:0,sort:"ping" as "ping"|"space"});
  const mutationVersion=useRef(0),busyRef=useRef(false);
  const refresh=async()=>{try{setRooms((await community<{items:FriendRoom[]}>("rooms.mine")).items);setError("");}catch(e){setError(message(e));}};
  useEffect(()=>{void refresh();},[]);
  useEffect(()=>{
    if(!room?.code)return;
    let live=true,inFlight=false;
    const poll=async()=>{
      if(inFlight||busyRef.current)return;
      const version=mutationVersion.current;
      inFlight=true;
      try{const next=await community<FriendRoom>("rooms.get",{code:room.code});if(live&&version===mutationVersion.current){setRoom(next);setError("");}}
      catch(e){if(live)setError(message(e));}
      finally{inFlight=false;}
    };
    void poll();
    const timer=setInterval(()=>void poll(),1500);
    return()=>{live=false;clearInterval(timer);};
  },[room?.code]);
  useEffect(()=>{
    if(!room)return;
    setServerSettings(settings=>({...settings,minFree:Math.max(room.members.length,settings.minFree)}));
  },[room?.members.length]);
  async function act(action:string,input:Record<string,unknown>={}){
    if(busyRef.current)return;
    const previous=room;
    mutationVersion.current+=1;busyRef.current=true;
    if(action==="rooms.ready"&&room&&userId){
      const ready=input.ready===true;
      setRoom({...room,members:room.members.map(member=>member.id===userId?{...member,ready}:member)});
    }
    setBusy(true);setError("");
    try{const result=await community<FriendRoom|{left:true}>(action,{...(room?{code:room.code}:{}),...input});if("left"in result){setRoom(null);await refresh();}else setRoom(result);}
    catch(e){if(action==="rooms.ready")setRoom(previous);setError(message(e));}
    finally{busyRef.current=false;setBusy(false);}
  }
  async function launchRoom(){
    if(!room||!selected||room.ownerId!==userId||busyRef.current)return;
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),15000);
    mutationVersion.current+=1;busyRef.current=true;
    setBusy(true);setError("");setStatus("Looking for a server matching your settings…");
    try{
      const requiredFree=Math.max(room.members.length,serverSettings.minFree);
      const matches=(items:ServerInfo[])=>items.filter(server=>{
        const freeSlots=server.maxPlayers-server.playing;
        const pingAllowed=!serverSettings.maxPing||(server.ping!=null&&server.ping>=0&&server.ping<=serverSettings.maxPing);
        const playerCountAllowed=!serverSettings.maxPlaying||server.playing<=serverSettings.maxPlaying;
        return Boolean(server.id&&freeSlots>=requiredFree&&pingAllowed&&playerCountAllowed);
      });
      const rank=(a:ServerInfo,b:ServerInfo)=>serverSettings.sort==="space"
        ? (b.maxPlayers-b.playing)-(a.maxPlayers-a.playing)
        : (a.ping??Number.POSITIVE_INFINITY)-(b.ping??Number.POSITIVE_INFINITY);
      let cursor:string|null=null;let candidate:ServerInfo|null=null;
      for(let page=0;page<3&&!candidate;page++){
        setStatus(page?`Checking more servers… (${page+1}/3)`:"Looking for a server matching your settings…");
        const result=await api.servers(selected.placeId,cursor,100,controller.signal);
        candidate=matches(result.items).sort(rank)[0]??null;
        cursor=result.nextCursor;
        if(!cursor)break;
      }
      if(!candidate)throw new Error(`Could not find a server matching the selected settings with ${requiredFree} free slots. Try another ping or player limit.`);
      setStatus("Server found. Starting the room…");
      const updated=await community<FriendRoom>("rooms.launch",{code:room.code,gameInstanceId:candidate.id,placeId:selected.placeId,universeId:selected.universeId,name:selected.name,iconUrl:selected.iconUrl??null,maxPlayers:candidate.maxPlayers,playing:candidate.playing});
      setRoom(updated);setStatus("Server found. Choose Join shared server when you are ready.");
    }catch(e){setStatus("");setError(e instanceof DOMException&&e.name==="AbortError"?"Server search timed out. Try again.":message(e));}finally{window.clearTimeout(timeout);busyRef.current=false;setBusy(false);}
  }
  async function joinSharedServer(plan: NonNullable<FriendRoom["launchPlan"]>){
    if(busyRef.current)return;
    busyRef.current=true;setBusy(true);setError("");setStatus("Opening the selected Roblox server…");
    try{
      const result=await launchExperience({placeId:plan.placeId,gameInstanceId:plan.gameInstanceId,universeId:plan.universeId,name:plan.name,iconUrl:plan.iconUrl,serverType:"public"});
      setStatus(result?"Roblox is joining the shared server.":"Shared launch was cancelled.");
    }catch(e){setStatus("");setError(message(e));}
    finally{busyRef.current=false;setBusy(false);}
  }
  const selected=room?.queue.find(g=>g.id===room.selected);
  const me=room?.members.find(m=>m.id===userId);
  return <div className="content-page"><header className="content-heading"><div><h2>{room?room.name:"Rooms"}</h2><p className="sb-muted">An invite-only queue, votes and ready checks for your group.</p></div>{room&&<Button variant="secondary" onClick={()=>{setRoom(null);void refresh();}}>My rooms</Button>}</header><ContentNotice error={error}/>{status&&<p role="status">{status}</p>}
    {!room?<><section className="sb-card content-panel"><h3>Start a room</h3><form className="content-toolbar" onSubmit={e=>{e.preventDefault();void act("rooms.create",{name});}}><input className="sb-input" aria-label="Room name" value={name} onChange={e=>setName(e.target.value)} maxLength={60}/><Button disabled={busy||!name.trim()}>Create room</Button></form><h3>Join with an invite code</h3><form className="content-toolbar" onSubmit={e=>{e.preventDefault();void act("rooms.join",{code:code.trim().toUpperCase()});}}><input className="sb-input" placeholder="12-character code" aria-label="Room invite code" maxLength={12} value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/><Button disabled={busy||!/^[A-F0-9]{12}$/.test(code)}>Join room</Button></form></section><section className="sb-card content-panel"><div className="content-heading"><h3>My rooms</h3><Button variant="ghost" onClick={()=>void refresh()}>Refresh</Button></div>{rooms.map(r=><button className="room-list-item" key={r.code} onClick={()=>void act("rooms.get",{code:r.code})}><strong>{r.name}</strong><span>{r.members.length} members · {r.queue.length} games</span></button>)}{!rooms.length&&<p className="sb-muted">Create a room and send its code to your friends. Inactive rooms expire after 7 days.</p>}</section></>:<>
      <section className="sb-card content-panel"><div className="content-toolbar"><strong className="invite-code">{room.code}</strong><Button variant="secondary" onClick={()=>void navigator.clipboard.writeText(room.code).then(()=>setStatus("Invite code copied.")).catch(()=>setError("Could not copy. Select and copy the code above."))}>Copy invite</Button><Button disabled={busy} variant="ghost" onClick={()=>void act("rooms.leave")}>Leave room</Button>{room.ownerId===userId&&<Button disabled={busy} variant="ghost" onClick={()=>void act("rooms.close")}>Close room</Button>}</div><p className="sb-muted">Anyone with this code can join. Ready states and launches refresh automatically.</p><div className="room-members">{room.members.map(m=><div key={m.id}><span className={m.ready?"ready-dot is-ready":"ready-dot"}/><strong>{m.name}</strong><small>{m.id===room.ownerId?"Host · ":""}{m.ready?"Ready":"Not ready"}</small></div>)}</div><Button disabled={busy} onClick={()=>void act("rooms.ready",{ready:!me?.ready})}>{me?.ready?"Not ready":"I'm ready"}</Button></section>
      {selected&&<section className="sb-card content-panel room-selected"><h3>{selected.name}</h3><p>{room.members.filter(m=>m.ready).length}/{room.members.length} ready</p>{room.ownerId===userId&&!room.launchPlan?<div className="room-server-settings"><h4>Server settings</h4><div className="form-grid"><label>Minimum free slots<input className="sb-input" type="number" min={room.members.length} max={200} value={Math.max(room.members.length,serverSettings.minFree)} onChange={e=>setServerSettings(s=>({...s,minFree:Math.min(200,Math.max(room.members.length,Number(e.target.value)||room.members.length))}))}/></label><label>Maximum players (0 = any)<input className="sb-input" type="number" min={0} max={200} value={serverSettings.maxPlaying} onChange={e=>setServerSettings(s=>({...s,maxPlaying:Math.min(200,Math.max(0,Number(e.target.value)||0))}))}/></label><label>Maximum ping, ms (0 = any)<input className="sb-input" type="number" min={0} max={2000} value={serverSettings.maxPing} onChange={e=>setServerSettings(s=>({...s,maxPing:Math.min(2000,Math.max(0,Number(e.target.value)||0))}))}/></label><label>Prefer<select className="sb-input" value={serverSettings.sort} onChange={e=>setServerSettings(s=>({...s,sort:e.target.value as "ping"|"space"}))}><option value="ping">Lowest ping</option><option value="space">Most free slots</option></select></label></div><p className="sb-muted">Roblox reports ping per server. The group size always takes priority over the free slot setting.</p></div>:null}{room.launchPlan?<><p role="status">Shared server selected. Join only when you press the button.</p><Button disabled={busy} onClick={()=>void joinSharedServer(room.launchPlan!)}>{busy?"Opening Roblox…":"Join shared server"}</Button></>:room.ownerId===userId?<Button disabled={busy||room.members.some(m=>!m.ready)} onClick={()=>void launchRoom()}>{busy?"Finding a server…":"Launch everyone together"}</Button>:<p className="sb-muted">{room.members.some(m=>!m.ready)?"Waiting until everyone is ready…":"Everyone is ready. Waiting for the host to launch."}</p>}<p className="sb-muted">The host starts the selected game after everyone is ready. SB Launcher searches public servers using the selected settings. Each member joins the selected server with the button above.</p></section>}
      <section className="sb-card content-panel"><h3>Game queue</h3>{!room.queue.length&&<p className="sb-muted">Add a game below to start the vote.</p>}{[...room.queue].sort((a,b)=>b.votes.length-a.votes.length).map(g=><div className="room-queue-row" key={g.id}><strong>{g.name}</strong><div className="content-toolbar"><Button variant="secondary" disabled={busy} onClick={()=>void act("rooms.vote",{id:g.id})}>{g.votes.includes(userId??"")?"Voted":"Vote"} · {g.votes.length}</Button>{room.ownerId===userId&&<Button disabled={busy} onClick={()=>void act("rooms.select",{id:g.id})}>{room.selected===g.id?"Selected":"Pick game"}</Button>}{(room.ownerId===userId||g.addedBy===userId)&&<Button variant="ghost" disabled={busy} onClick={()=>void act("rooms.remove",{id:g.id})}>Remove</Button>}</div></div>)}<GamePicker disabled={busy} onPick={game=>void act("rooms.add",{game})}/></section>
    </>}
  </div>;
}
