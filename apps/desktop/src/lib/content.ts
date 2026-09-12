import { useCallback, useEffect, useRef, useState } from "react";
import { CONTENT_STORAGE_BYTES, ContentDataSchema, LocalImageSchema, type ContentData, type ContentDocument, type PlaySession } from "@sb/contracts";
import { request } from "./api";
import { useAppStore } from "../store";

export const community = <T>(action: string, input: Record<string, unknown> = {}) => request<T>("/api/community", { method:"POST",body:JSON.stringify({action,input}) });
export const getSessions = () => request<{items:PlaySession[]}>("/api/play-sessions");
export function useContent() {
  const userId=useAppStore(s=>s.session?.user?.id);
  const [doc,setDoc]=useState<ContentDocument|null>(null), [busy,setBusy]=useState(false), [loading,setLoading]=useState(true), [error,setError]=useState("");
  const currentUser=useRef(userId); currentUser.current=userId;
  const locked=useRef(false);
  const reload=useCallback(async()=>{
    if(!userId){setDoc(null);setLoading(false);return;}
    setLoading(true);setError("");
    try { const result=await request<ContentDocument>("/api/content");if(currentUser.current===userId)setDoc(result); }
    catch(e){if(currentUser.current===userId)setError(message(e));}finally{if(currentUser.current===userId)setLoading(false);}
  },[userId]);
  useEffect(()=>{setDoc(null);void reload();},[reload]);
  async function save(change:(data:ContentData)=>void) {
    if(!doc||locked.current)return false;
    locked.current=true;setBusy(true);setError("");
    try{
      const data=structuredClone(doc.data);change(data);ContentDataSchema.parse(data);
      if(new Blob([JSON.stringify(data)]).size>CONTENT_STORAGE_BYTES)throw new Error("Local library and journal storage is full (32 MB including image encoding). Remove some images first.");
      const result=await request<ContentDocument>("/api/content",{method:"PUT",body:JSON.stringify({revision:doc.revision,data})});
      if(currentUser.current===userId)setDoc(result);return true;
    }catch(e){if(currentUser.current===userId)setError(message(e));return false;}
    finally{locked.current=false;if(currentUser.current===userId)setBusy(false);}
  }
  return {data:doc?.data??null,busy,loading,error,save,reload,userId};
}
export function message(error:unknown){return error instanceof Error?error.message:"Something went wrong. Please try again.";}
export async function readImage(file:File):Promise<string>{
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>1_000_000)throw new Error("Choose a PNG, JPEG or WebP image under 1 MB.");
  const value=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Could not read image."));reader.readAsDataURL(file);});
  return LocalImageSchema.parse(value);
}
export function formatDuration(seconds:number){const minutes=Math.floor(seconds/60);return minutes>=60?`${Math.floor(minutes/60)}h ${minutes%60}m`:`${minutes}m`;}

export async function startPlaySession(game:{universeId?:string;placeId?:string;name?:string}){
  const userId=useAppStore.getState().session?.user?.id;
  if(!userId||!game.universeId||!game.placeId||!window.sbDesktop?.isRobloxRunning)return;
  try{const {id}=await request<{id:string}>("/api/play-sessions",{method:"POST",body:JSON.stringify({...game,name:game.name||"Roblox"})});localStorage.setItem(`sb-play-session:${userId}`,id);}catch{ /* Launching must still succeed if statistics are unavailable. */ }
}
export function SessionTracker(){
  const userId=useAppStore(s=>s.session?.user?.id);
  useEffect(()=>{
    if(!userId||!window.sbDesktop?.isRobloxRunning)return;
    let stopped=false,inFlight=false;
    const tick=async()=>{if(inFlight||stopped)return;const key=`sb-play-session:${userId}`,id=localStorage.getItem(key);if(!id)return;inFlight=true;
      try{const running=await window.sbDesktop!.isRobloxRunning!();if(stopped)return;const row=await request<PlaySession>(`/api/play-sessions/${encodeURIComponent(id)}/pulse`,{method:"POST",body:JSON.stringify({running})});if(row.ended&&localStorage.getItem(key)===id)localStorage.removeItem(key);}catch{/* Recover on the next pulse. */}finally{inFlight=false;}};
    void tick();const timer=window.setInterval(()=>void tick(),15000);return()=>{stopped=true;clearInterval(timer);};
  },[userId]);return null;
}
