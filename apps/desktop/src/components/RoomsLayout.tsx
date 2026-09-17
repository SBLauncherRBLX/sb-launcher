import { useState } from "react";
import type { FriendRoom } from "@sb/contracts";
import { Button } from "@sb/ui";
import { useAppStore } from "../store";
import { ContentNotice, GamePicker } from "./ContentTools";
import { RoomChat } from "./RoomChat";

export type RoomServerSettings = { minFree: number; maxPlaying: number; maxPing: number; sort: "ping" | "space" };
type Props = {
  rooms: FriendRoom[]; room: FriendRoom | null; busy: boolean; error: string; status: string;
  settings: RoomServerSettings; setSettings: (settings: RoomServerSettings) => void;
  act: (action: string, input?: Record<string, unknown>) => Promise<void>;
  refresh: () => Promise<void>; back: () => void; launch: () => Promise<void>;
  join: (plan: NonNullable<FriendRoom["launchPlan"]>) => Promise<void>;
};
export function RoomsLayout({ rooms, room, busy, error, status, settings, setSettings, act, refresh, back, launch, join }: Props) {
  const user = useAppStore(s => s.session?.user);
  const friends = useAppStore(s => s.friends);
  const [name, setName] = useState("Game night"), [code, setCode] = useState("");
  const [rename, setRename] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"rooms.leave" | "rooms.close" | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const host = room?.ownerId === user?.id;
  const ready = room?.members.filter(m => m.ready).length ?? 0;
  const me = room?.members.find(m => m.id === user?.id);
  const selected = room?.queue.find(g => g.id === room.selected);
  return <div className="content-page rooms-page">
    <header className="content-heading"><div><h2>{room?.name ?? "Rooms"}</h2><p className="sb-muted">Your friends. Your next game. One shared server.</p></div>{room && <Button variant="secondary" onClick={back}>My rooms</Button>}</header>
    <ContentNotice error={error}/>{status && <p className="room-status" role="status">{status}</p>}
    {!room ? <>
      <div className="room-entry-grid">
        <section className="sb-card content-panel room-entry"><span className="room-entry-symbol" aria-hidden>＋</span><h3>Bring everyone together</h3><p className="sb-muted">Create a private lobby, choose a game and get ready together.</p><form onSubmit={e => { e.preventDefault(); void act("rooms.create", { name }); }}><label>Room name<input className="sb-input" value={name} onChange={e => setName(e.target.value)} maxLength={60}/></label><Button disabled={busy || !name.trim()}>Create room</Button></form></section>
        <section className="sb-card content-panel room-entry"><span className="room-entry-symbol" aria-hidden>↗</span><h3>Your invite is waiting</h3><p className="sb-muted">Have a code? Join your friends and jump into the conversation.</p><form onSubmit={e => { e.preventDefault(); void act("rooms.join", { code }); }}><label>Invite code<input className="sb-input invite-code" placeholder="12-character code" value={code} onChange={e => setCode(e.target.value.replace(/\s/g, "").toUpperCase())} maxLength={12}/></label><Button disabled={busy || !/^[A-F0-9]{12}$/.test(code)}>Join room</Button></form></section>
      </div>
      <section className="sb-card content-panel"><div className="content-heading"><h3>My rooms <span className="sb-muted">· {rooms.length}</span></h3><Button variant="ghost" disabled={busy} onClick={() => void refresh()}>Refresh</Button></div>
        <div className="room-lobby-list">{rooms.map(r => <button disabled={busy} className="room-lobby-card" key={r.code} onClick={() => void act("rooms.get", { code: r.code })}><span className="room-pill">{r.ownerId === user?.id ? "Hosting" : "Member"}</span><strong>{r.name}</strong><span>{r.members.length}/16 members · {r.queue.length} games</span><span className="room-lobby-names">{r.members.slice(0, 3).map(m => m.name).join(", ")}{r.members.length > 3 ? ` +${r.members.length - 3}` : ""}</span><span className="room-lobby-open">Open room →</span></button>)}</div>
        {!rooms.length && <p className="content-empty">Create a room or use an invite code to find your squad.</p>}<p className="sb-muted room-caption">Inactive rooms and their chat expire after 7 days.</p>
      </section>
    </> : <>
      <section className="sb-card content-panel room-roster">
        <div className="content-heading"><div><h3>The squad <span className="sb-muted">· {room.members.length}/16</span></h3><p className="sb-muted">{ready === room.members.length ? "Everyone is ready." : `${room.members.length - ready} waiting to get ready.`}</p></div><div className="room-invite"><span className="invite-code">{room.code}</span><Button variant="secondary" onClick={() => void navigator.clipboard.writeText(room.code).then(() => setCopyStatus("Invite copied.")).catch(() => setCopyStatus("Select and copy the code manually."))}>Copy invite</Button></div></div>
        {copyStatus && <small role="status">{copyStatus}</small>}
        <div className="room-roster-grid">{room.members.map(m => {
          const avatar = m.id === user?.id ? user.avatarUrl : friends.find(f => f.userId === m.id)?.avatarUrl;
          return <article key={m.id} className={`room-member-card${m.ready ? " is-ready" : ""}`}><div className="room-member-avatar"><span aria-hidden>{m.name.slice(0, 2).toUpperCase()}</span>{avatar && <img src={avatar} alt="" onError={e => { e.currentTarget.style.display = "none"; }}/>}</div><strong title={m.name}>{m.name}</strong><small>{m.id === room.ownerId ? "Host" : "Member"}{m.id === user?.id ? " · You" : ""}</small><span className="room-member-state"><span className={`ready-dot${m.ready ? " is-ready" : ""}`}/>{m.ready ? "Ready to play" : "Not ready yet"}</span></article>;
        })}</div>
        <div className="room-ready-footer"><div><div className="content-heading"><strong>{ready} of {room.members.length} ready</strong><span className="sb-muted">{selected ? "Game selected" : "Choose a game below"}</span></div><progress aria-label="Members ready" max={room.members.length} value={ready}/></div><Button disabled={busy} variant={me?.ready ? "secondary" : "primary"} onClick={() => void act("rooms.ready", { ready: !me?.ready })}>{me?.ready ? "Cancel ready" : "I'm ready"}</Button></div>
      </section>
      <div className="room-workspace"><div className="room-main-column">
        <section className="sb-card content-panel room-selected">
          <div className="room-game-heading">{selected?.iconUrl && <img src={selected.iconUrl} alt=""/>}<div><span className="room-pill">{room.launchPlan ? "Server found" : "Up next"}</span><h3>{selected?.name ?? "What are we playing?"}</h3><p className="sb-muted">{selected ? "Join the same public server, when you're ready." : "Add a game to the queue. The host picks what to play."}</p></div></div>
          {selected && <>
            {host && !room.launchPlan && <details className="room-server-settings"><summary>Server preferences</summary><div className="room-settings-grid">
              <label>Minimum free slots<input className="sb-input" type="number" disabled={busy} min={room.members.length} max={200} value={Math.max(room.members.length, settings.minFree)} onChange={e => setSettings({ ...settings, minFree: Math.min(200, Math.max(room.members.length, Number(e.target.value) || room.members.length)) })}/></label>
              <label>Maximum players<input className="sb-input" type="number" disabled={busy} min={0} max={200} value={settings.maxPlaying} onChange={e => setSettings({ ...settings, maxPlaying: Math.min(200, Math.max(0, Number(e.target.value) || 0)) })}/></label>
              <label>Maximum ping (ms)<input className="sb-input" type="number" disabled={busy} min={0} max={2000} value={settings.maxPing} onChange={e => setSettings({ ...settings, maxPing: Math.min(2000, Math.max(0, Number(e.target.value) || 0)) })}/></label>
              <label>Prefer<select className="sb-input" disabled={busy} value={settings.sort} onChange={e => setSettings({ ...settings, sort: e.target.value as "ping" | "space" })}><option value="ping">Lowest ping</option><option value="space">Most free slots</option></select></label>
            </div><p className="sb-muted room-caption">0 means no player or ping limit. Ping is reported by Roblox; your latency may differ. Space for the whole group is always required.</p></details>}
            <div className="content-toolbar">{room.launchPlan ? <><Button disabled={busy} onClick={() => void join(room.launchPlan!)}>Join shared server</Button>{host && <Button disabled={busy} variant="secondary" onClick={() => void act("rooms.reset")}>Choose another server</Button>}</> : host ? <Button disabled={busy || ready !== room.members.length} onClick={() => void launch()}>{busy ? "Please wait…" : "Find a shared server"}</Button> : <p className="sb-muted">{ready === room.members.length ? "Waiting for the host to find a server." : "Waiting until everyone is ready."}</p>}</div>
            <p className="sb-muted room-caption">Roblox opens only when you press Join shared server.</p>
          </>}
        </section>
        <section className="sb-card content-panel"><div className="content-heading"><h3>Game queue</h3><span className="room-pill">{room.queue.length}/25</span></div><p className="sb-muted room-caption">Vote for your favourites. The host makes the final pick.</p>
          {!room.queue.length && <p className="content-empty">No games yet. Find your first pick below.</p>}
          {[...room.queue].sort((a, b) => b.votes.length - a.votes.length).map(g => <article className={`room-game-row${room.selected === g.id ? " is-selected" : ""}`} key={g.id}><div className="room-game-heading">{g.iconUrl && <img src={g.iconUrl} alt="" loading="lazy"/>}<div><strong>{g.name}</strong>{room.selected === g.id && <small>Selected for the squad</small>}</div></div><div className="content-toolbar"><Button variant="secondary" disabled={busy} aria-pressed={g.votes.includes(user?.id ?? "")} onClick={() => void act("rooms.vote", { id: g.id })}>{g.votes.includes(user?.id ?? "") ? "Voted" : "Vote"} · {g.votes.length}</Button>{host && <Button variant="secondary" disabled={busy || room.selected === g.id} onClick={() => void act("rooms.select", { id: g.id })}>{room.selected === g.id ? "Selected" : "Pick game"}</Button>}{(host || g.addedBy === user?.id) && <Button variant="ghost" disabled={busy} onClick={() => void act("rooms.remove", { id: g.id })}>Remove</Button>}</div></article>)}
          <GamePicker disabled={busy || room.queue.length >= 25} onPick={game => void act("rooms.add", { game })}/>
        </section>
      </div><RoomChat key={room.code} code={room.code} userId={user?.id ?? ""}/></div>
      <details className="sb-card content-panel room-management"><summary>Manage room</summary><div className="content-toolbar">{host && <Button variant="secondary" disabled={busy} onClick={() => setRename(room.name)}>Rename room</Button>}<Button variant="ghost" disabled={busy} onClick={() => setConfirm("rooms.leave")}>Leave room</Button>{host && <Button variant="ghost" disabled={busy} onClick={() => setConfirm("rooms.close")}>Close room for everyone</Button>}</div>
        {rename !== null && <form className="content-toolbar" onSubmit={e => { e.preventDefault(); void act("rooms.rename", { name: rename }); }}><input aria-label="New room name" className="sb-input" maxLength={60} value={rename} onChange={e => setRename(e.target.value)}/><Button disabled={busy || !rename.trim()}>Save name</Button><Button type="button" variant="ghost" onClick={() => setRename(null)}>Cancel</Button></form>}
        {confirm && <div className="room-confirm"><p>{confirm === "rooms.close" ? "Close this room for everyone and delete its chat?" : host ? "Leave this room? The next member will become the host." : "Leave this room? You can rejoin with its invite code."}</p><div className="content-toolbar"><Button disabled={busy} onClick={() => void act(confirm)}>Confirm</Button><Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button></div></div>}
      </details>
    </>}
  </div>;
}
