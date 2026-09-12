import { useState, type ReactNode } from "react";
import { LibraryGameSchema, type LibraryGame } from "@sb/contracts";
import { Button } from "@sb/ui";
import { api } from "../lib/api";
import { message } from "../lib/content";
import { useAppStore } from "../store";

export function ContentGate({children}:{children:ReactNode}){
  const signedIn=useAppStore(s=>s.session?.authenticated);
  return signedIn?<>{children}</>:<section className="sb-card content-empty"><h2>Your space in SB Launcher</h2><p>Sign in with Roblox to open activity, rooms and journal.</p><p className="sb-muted">Your journal is stored on this PC for your account.</p></section>;
}
export function ContentNotice({error}:{error:string}){return error?<p className="content-error" role="alert">{error}</p>:null;}
export function GamePicker({onPick,disabled=false}:{onPick:(game:LibraryGame)=>void;disabled?:boolean}){
  const [query,setQuery]=useState(""),[results,setResults]=useState<LibraryGame[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
  return <div className="game-picker"><form className="content-toolbar" onSubmit={async e=>{e.preventDefault();if(!query.trim()||busy)return;setBusy(true);setError("");try{const page=await api.searchGames(query.trim(),null,12);setResults(page.items.map(g=>LibraryGameSchema.parse(g)));if(!page.items.length)setError("No games found. Try a different name.");}catch(e){setError(message(e));}finally{setBusy(false);}}}>
    <input className="sb-input" aria-label="Find a game" placeholder="Find a game to add…" value={query} onChange={e=>setQuery(e.target.value)} maxLength={100}/><Button disabled={busy||disabled||!query.trim()}>{busy?"Searching…":"Search"}</Button>
  </form><ContentNotice error={error}/>{results.length>0&&<div className="game-picker-results">{results.map(g=><button type="button" key={g.universeId} disabled={disabled} onClick={()=>onPick(g)}>{g.iconUrl&&<img src={g.iconUrl} alt=""/>}<span>{g.name}</span><span aria-hidden>＋</span></button>)}</div>}</div>;
}
