import { useEffect, useRef, useState } from "react";
import type { FriendRoom, ServerInfo } from "@sb/contracts";
import { community, message } from "../lib/content";
import { launchExperience } from "../lib/launch";
import { api } from "../lib/api";
import { useAppStore } from "../store";
import { ContentGate } from "../components/ContentTools";
import { RoomsLayout } from "../components/RoomsLayout";

export function RoomsPage(){const id=useAppStore(s=>s.session?.user?.id);return <ContentGate><Rooms key={id}/></ContentGate>;}
function Rooms(){
  const userId=useAppStore(s=>s.session?.user?.id);
  const [rooms,setRooms]=useState<FriendRoom[]>([]),[room,setRoom]=useState<FriendRoom|null>(null),[error,setError]=useState(""),[status,setStatus]=useState(""),[busy,setBusy]=useState(false);
  const ROOM_SETTINGS_KEY = "sb-room-server-settings-v1";
  const [serverSettings,setServerSettings]=useState<{minFree:number;maxPlaying:number;maxPing:number;sort:"ping"|"space"}>(()=>{
    try{
      const raw=localStorage.getItem(ROOM_SETTINGS_KEY);
      if(raw){
        const saved=JSON.parse(raw);
        return {
          minFree: Math.max(1, Math.min(200, Number(saved.minFree) || 1)),
          maxPlaying: Math.max(0, Math.min(200, Number(saved.maxPlaying) || 0)),
          maxPing: Math.max(0, Math.min(2000, Number(saved.maxPing) || 0)),
          sort: saved.sort==="space"?"space":"ping",
        };
      }
    }catch{}
    return {minFree:1,maxPlaying:0,maxPing:0,sort:"ping"};
  });
  useEffect(()=>{
    try{ localStorage.setItem(ROOM_SETTINGS_KEY, JSON.stringify(serverSettings)); }catch{}
  },[serverSettings]);
  const mutationVersion=useRef(0),busyRef=useRef(false);
  const alive=useRef(true),search=useRef<AbortController|null>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;mutationVersion.current++;search.current?.abort();};},[]);
  function back(){mutationVersion.current++;search.current?.abort();busyRef.current=false;setBusy(false);setRoom(null);setStatus("");setError("");void refresh();}
  const listVersion=useRef(0);
  const refresh=async()=>{const version=++listVersion.current;const mutation=mutationVersion.current;try{const result=await community<{items:FriendRoom[]}>("rooms.mine");if(alive.current&&version===listVersion.current&&mutation===mutationVersion.current){setRooms(result.items);setError("");}}catch(e){if(alive.current&&version===listVersion.current&&mutation===mutationVersion.current)setError(message(e));}};
  useEffect(()=>{void refresh();},[]);
  useEffect(()=>{
    if(!room?.code)return;
    let live=true,inFlight=false;
    const poll=async()=>{
      if(inFlight||busyRef.current||document.visibilityState==="hidden")return;
      const version=mutationVersion.current;
      inFlight=true;
      try{const next=await community<FriendRoom>("rooms.get",{code:room.code});if(live&&version===mutationVersion.current){setRoom(next);setError("");}}
      catch(e){if(live&&version===mutationVersion.current)setError(message(e));}
      finally{inFlight=false;}
    };
    void poll();
    const timer=setInterval(()=>void poll(),2000);
    const wake=()=>void poll();window.addEventListener("focus",wake);document.addEventListener("visibilitychange",wake);
    return()=>{live=false;clearInterval(timer);window.removeEventListener("focus",wake);document.removeEventListener("visibilitychange",wake);};
  },[room?.code]);
  useEffect(()=>{
    if(!room)return;
    setServerSettings(settings=>({...settings,minFree:Math.max(room.members.length,settings.minFree)}));
  },[room?.members.length]);
  async function act(action:string,input:Record<string,unknown>={}){
    if(busyRef.current)return;
    const previous=room;
    const version=++mutationVersion.current;busyRef.current=true;
    if(action==="rooms.ready"&&room&&userId){
      const ready=input.ready===true;
      setRoom({...room,members:room.members.map(member=>member.id===userId?{...member,ready}:member)});
    }
    setBusy(true);setError("");
    try{const result=await community<FriendRoom|{left:true}>(action,{...(room?{code:room.code}:{}),...input});if(!alive.current||version!==mutationVersion.current)return;if("left"in result){setRoom(null);await refresh();}else setRoom(result);setStatus("");}
    catch(e){if(alive.current&&version===mutationVersion.current){if(action==="rooms.ready")setRoom(previous);setError(message(e));}}
    finally{if(alive.current&&version===mutationVersion.current){busyRef.current=false;setBusy(false);}}
  }
  async function launchRoom(){
    if(!room||!selected||room.ownerId!==userId||busyRef.current)return;
    const controller=new AbortController();
    search.current=controller;
    const timeout=window.setTimeout(()=>controller.abort(),15000);
    const version=++mutationVersion.current;busyRef.current=true;
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
        if(!alive.current||version!==mutationVersion.current)return;
        candidate=matches(result.items).sort(rank)[0]??null;
        cursor=result.nextCursor;
        if(!cursor)break;
      }
      if(!candidate)throw new Error(`Could not find a server matching the selected settings with ${requiredFree} free slots. Try another ping or player limit.`);
      setStatus("Server found. Starting the room…");
      const updated=await community<FriendRoom>("rooms.launch",{code:room.code,gameInstanceId:candidate.id,placeId:selected.placeId,universeId:selected.universeId,name:selected.name,iconUrl:selected.iconUrl??null,maxPlayers:candidate.maxPlayers,playing:candidate.playing});
      if(alive.current&&version===mutationVersion.current){setRoom(updated);setStatus("Server found. Choose Join shared server when you are ready.");}
    }catch(e){if(alive.current&&version===mutationVersion.current){setStatus("");setError(controller.signal.aborted?"Server search timed out. Try again.":message(e));}}finally{window.clearTimeout(timeout);if(search.current===controller)search.current=null;if(alive.current&&version===mutationVersion.current){busyRef.current=false;setBusy(false);}}
  }
  async function joinSharedServer(plan: NonNullable<FriendRoom["launchPlan"]>){
    if(busyRef.current)return;
    const version=++mutationVersion.current;
    busyRef.current=true;setBusy(true);setError("");setStatus("Opening the selected Roblox server…");
    try{
      const result=await launchExperience({placeId:plan.placeId,gameInstanceId:plan.gameInstanceId,universeId:plan.universeId,name:plan.name,iconUrl:plan.iconUrl,serverType:"public"});
      if(alive.current&&version===mutationVersion.current)setStatus(result?"Roblox is joining the shared server.":"Shared launch was cancelled.");
    }catch(e){if(alive.current&&version===mutationVersion.current){setStatus("");setError(message(e));}}
    finally{if(alive.current&&version===mutationVersion.current){busyRef.current=false;setBusy(false);}}
  }
  const selected=room?.queue.find(g=>g.id===room.selected);
  return <RoomsLayout key={room?.code ?? "lobby"} rooms={rooms} room={room} busy={busy} error={error} status={status} settings={serverSettings} setSettings={setServerSettings} act={act} refresh={refresh} back={back} launch={launchRoom} join={joinSharedServer}/>;
}
