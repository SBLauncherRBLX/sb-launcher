import { useEffect, useRef, useState } from "react";
import { ROOM_CHAT_LIMIT, ROOM_MESSAGE_LENGTH, type RoomMessage } from "@sb/contracts";
import { Button } from "@sb/ui";
import { community, message } from "../lib/content";
import { ContentNotice } from "./ContentTools";

export function RoomChat({ code, userId }: { code: string; userId: string }) {
  const [items, setItems] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [unread, setUnread] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const alive = useRef(false);
  const busy = useRef(false);
  const version = useRef(0);
  const pending = useRef<{ id: string; text: string } | null>(null);

  useEffect(() => {
    alive.current = true;
    let live = true, polling = false;
    async function poll() {
      if (!live || polling || busy.current || document.visibilityState === "hidden") return;
      polling = true;
      const current = version.current;
      try {
        const result = await community<{ items: RoomMessage[] }>("rooms.chat", { code });
        if (live && current === version.current) {
          setItems(result.items); setLoaded(true); setError("");
        }
      } catch (e) { if (live && current === version.current) setError(message(e)); }
      finally { polling = false; }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    const wake = () => void poll();
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      live = false; alive.current = false; version.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [code]);

  const lastId = items.at(-1)?.id;
  useEffect(() => {
    if (!lastId) return;
    if (nearBottom.current && list.current) list.current.scrollTop = list.current.scrollHeight;
    else setUnread(true);
  }, [lastId]);

  async function send() {
    const text = draft.trim();
    if (!text || busy.current) return;
    busy.current = true; version.current++; setSending(true); setError("");
    if (pending.current?.text !== text) pending.current = { id: crypto.randomUUID(), text };
    try {
      const result = await community<{ items: RoomMessage[] }>("rooms.message", { code, ...pending.current });
      if (!alive.current) return;
      nearBottom.current = true; setUnread(false); setItems(result.items); setLoaded(true);
      setDraft(""); pending.current = null;
    } catch (e) { if (alive.current) setError(message(e)); }
    finally { busy.current = false; if (alive.current) setSending(false); }
  }

  return <section className="sb-card content-panel room-chat" aria-label="Room chat">
    <div className="content-heading"><h3>Room chat</h3><span className="room-pill">Members only</span></div>
    <p className="sb-muted room-caption">Plan your next game together. Last {ROOM_CHAT_LIMIT} messages are kept.</p>
    <div ref={list} className="room-chat-messages" role="log" aria-label="Messages" aria-live="polite" aria-relevant="additions" onScroll={() => {
      const el = list.current; if (!el) return;
      nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      if (nearBottom.current) setUnread(false);
    }}>
      {!items.length && <div className="room-chat-empty"><strong>{loaded ? "Start the conversation" : "Connecting to chat…"}</strong><p>{loaded ? "Say hello or suggest what to play." : "Messages refresh automatically."}</p></div>}
      {items.map(item => <article key={`${item.authorId}:${item.id}`} className={`room-message${item.authorId === userId ? " is-mine" : ""}`}>
        <header><strong>{item.authorId === userId ? "You" : item.authorName}</strong><time dateTime={new Date(item.createdAt).toISOString()} title={new Date(item.createdAt).toLocaleString()}>{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></header>
        <p>{item.text}</p>
      </article>)}
    </div>
    {unread && <Button variant="secondary" onClick={() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; nearBottom.current = true; setUnread(false); }}>New messages ↓</Button>}
    <ContentNotice error={error}/>
    <form className="room-chat-compose" onSubmit={e => { e.preventDefault(); void send(); }}>
      <textarea className="sb-input" aria-label="Message to room" placeholder="Message your room…" rows={2} maxLength={ROOM_MESSAGE_LENGTH} disabled={sending} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
      }}/>
      <div className="content-heading"><small className="sb-muted">{draft.length}/{ROOM_MESSAGE_LENGTH} · Shift+Enter for a new line</small><Button disabled={sending || !draft.trim()}>{sending ? "Sending…" : "Send"}</Button></div>
    </form>
  </section>;
}
