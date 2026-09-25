import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { GameEvent, GameSummary } from "@sb/contracts";
import { Button } from "@sb/ui";
import { api } from "../lib/api";
import { useAppStore } from "../store";
import { useMotionEnabled } from "../lib/motion";

type FeaturedEvent = { game: GameSummary; event: GameEvent };
const gameEventCache = new Map<string, { items: GameEvent[]; fetchedAt: number }>();
const BATCH_SIZE = 4;
const PAGE_SIZE = 3;

export function HomeEvents({ games }: { games: GameSummary[] }) {
  const candidates = [...new Map(games.filter(game => game.universeId).map(game => [game.universeId, game])).values()].slice(0, 24);
  const key = candidates.map(game => game.universeId).join(",");
  const [events, setEvents] = useState<FeaturedEvent[]>([]);
  const [cursor, setCursor] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const generation = useRef(0);
  const loadingRef = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const theme = useAppStore(state => state.theme);
  const motionEnabled = useMotionEnabled(theme);

  async function loadBatch(start: number) {
    if (loadingRef.current || start >= candidates.length) return;
    const current = generation.current;
    loadingRef.current = true;
    setLoading(true);
    const batch = candidates.slice(start, start + BATCH_SIZE);
    try {
      const found = await Promise.all(batch.map(async game => {
        const cached = gameEventCache.get(game.universeId);
        let items = cached && Date.now() - cached.fetchedAt < 300_000 ? cached.items : undefined;
        if (!items) {
          try { items = (await api.gameEvents(game.universeId)).items; gameEventCache.set(game.universeId, { items, fetchedAt: Date.now() }); }
          catch { items = []; }
        }
        return items.filter(event => event.status !== "ended").map(event => ({ game, event }));
      }));
      if (current !== generation.current) return;
      setEvents(previous => [...previous, ...found.flat()].sort((a, b) =>
        Number(b.event.status === "live") - Number(a.event.status === "live") || Date.parse(a.event.startUtc) - Date.parse(b.event.startUtc)));
      setCursor(start + batch.length);
    } finally {
      if (current === generation.current) { loadingRef.current = false; setLoading(false); }
    }
  }

  useEffect(() => {
    generation.current++;
    loadingRef.current = false;
    setEvents([]);
    setCursor(0);
    setVisibleCount(PAGE_SIZE);
    if (key) void loadBatch(0);
    return () => { generation.current++; };
  }, [key]);

  const shown = events.slice(0, visibleCount);
  const hasMore = visibleCount < events.length || cursor < candidates.length;
  const updateScroll = () => {
    const element = scroller.current;
    if (!element) return;
    setCanScrollLeft(element.scrollLeft > 4);
    setCanScrollRight(element.scrollLeft < element.scrollWidth - element.clientWidth - 4);
  };
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    updateScroll();
    const observer = new ResizeObserver(updateScroll);
    observer.observe(element);
    element.addEventListener("scroll", updateScroll, { passive: true });
    return () => { observer.disconnect(); element.removeEventListener("scroll", updateScroll); };
  }, [shown.length]);

  function scroll(direction: -1 | 1) {
    scroller.current?.scrollBy({ left: direction * Math.max((scroller.current?.clientWidth ?? 0) * .88, 320), behavior: motionEnabled ? "smooth" : "auto" });
  }
  async function showMore() {
    if (loadingRef.current) return;
    if (visibleCount < events.length) { setVisibleCount(count => count + PAGE_SIZE); return; }
    await loadBatch(cursor);
    setVisibleCount(count => count + PAGE_SIZE);
  }

  if (!candidates.length || (!loading && !events.length && !hasMore)) return null;
  return <section className="rail home-events">
    <div className="rail-title">
      <div className="rail-title-text"><h3>Events in your games</h3><p className="sb-muted rail-subtitle">Live and upcoming events in games you play and games picked for you.</p></div>
      {(canScrollLeft || canScrollRight) && <div className="rail-arrows" role="group" aria-label="Scroll events">
        <button type="button" className="rail-arrow" aria-label="Previous events" disabled={!canScrollLeft} onClick={() => scroll(-1)}>‹</button>
        <button type="button" className="rail-arrow" aria-label="Next events" disabled={!canScrollRight} onClick={() => scroll(1)}>›</button>
      </div>}
    </div>
    {shown.length ? <div className="home-events-scroll" ref={scroller}>{shown.map(({ game, event }) =>
      <Link key={`${game.universeId}:${event.id}`} className="home-event-banner" to={`/game/${game.universeId}`} aria-label={`${event.title} in ${game.name}`}>
        {event.thumbnailUrl || game.thumbnailUrl || game.iconUrl ? <img src={event.thumbnailUrl ?? game.thumbnailUrl ?? game.iconUrl ?? ""} alt="" loading="lazy" /> : null}
        <div className="home-event-shade" />
        <span className={`home-event-status${event.status === "live" ? " is-live" : ""}`}>{event.status === "live" ? "Live now" : "Upcoming"}</span>
        <div className="home-event-copy"><small>{game.name} · {new Date(event.startUtc).toLocaleDateString()}</small><strong>{event.title}</strong>{event.subtitle && <p>{event.subtitle}</p>}<span>Explore event →</span></div>
      </Link>)}</div> : <p className="sb-muted">{loading ? "Finding events…" : "No events in these games yet. Search more games below."}</p>}
    {hasMore && <div className="home-events-more"><Button variant="secondary" disabled={loading} onClick={() => void showMore()}>{loading ? "Loading events…" : "Load more events"}</Button></div>}
  </section>;
}
