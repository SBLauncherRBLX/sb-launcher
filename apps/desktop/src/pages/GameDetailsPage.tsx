import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { GameDetails, GameEvent, ServerInfo } from "@sb/contracts";
import { Badge, Button, EmptyState, LoadingState } from "@sb/ui";
import { api } from "../lib/api";
import { formatCount } from "../components/GameCard";
import { launchExperience } from "../lib/launch";
import { useAppStore } from "../store";

export function GameDetailsPage() {
  const { universeId = "" } = useParams();
  const session = useAppStore((s) => s.session);
  const friends = useAppStore((s) => s.friends);
  const [game, setGame] = useState<GameDetails | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [serversLoading, setServersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "lowPing" | "space">("all");
  const [favorited, setFavorited] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [details, eventPage] = await Promise.all([
          api.game(universeId),
          api.gameEvents(universeId).catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;
        setGame(details);
        setEvents(eventPage.items);
        setError(null);
        setServersLoading(true);
        const serverPage = await api.servers(details.placeId);
        if (cancelled) return;
        setServers(serverPage.items);
        setCursor(serverPage.nextCursor);
        if (session?.authenticated) {
          const fav = await api.favorites();
          setFavorited(fav.items.some((f) => String(f.universeId) === details.universeId));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load game");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setServersLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [universeId, session?.authenticated]);

  const filteredServers = useMemo(() => {
    let list = [...servers];
    if (filter === "lowPing") {
      list = list.filter((s) => (s.ping ?? 9999) <= 80).sort((a, b) => (a.ping ?? 9999) - (b.ping ?? 9999));
    } else if (filter === "space") {
      list = list.filter((s) => s.playing < s.maxPlayers);
    }
    return list;
  }, [servers, filter]);

  async function loadMore() {
    if (!game || !cursor) return;
    setServersLoading(true);
    try {
      const page = await api.servers(game.placeId, cursor);
      setServers((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setServersLoading(false);
    }
  }

  async function toggleFavorite() {
    if (!game || !session?.authenticated) return;
    if (favorited) {
      await api.removeFavorite(game.universeId);
      setFavorited(false);
    } else {
      await api.addFavorite({
        universeId: game.universeId,
        placeId: game.placeId,
        name: game.name,
        iconUrl: game.iconUrl,
      });
      setFavorited(true);
    }
  }

  async function openEvent(event: GameEvent) {
    if (window.sbDesktop?.openExternal) {
      await window.sbDesktop.openExternal(event.eventUrl);
    } else {
      window.open(event.eventUrl, "_blank", "noopener,noreferrer");
    }
  }

  if (loading) return <LoadingState label="Loading experience…" />;
  if (error || !game) return <EmptyState title="Experience unavailable" description={error ?? undefined} />;

  const bannerUrl =
    game.media.find((m) => m.id.startsWith("shot") && m.imageUrl)?.imageUrl ?? null;
  const coverUrl = game.iconUrl || game.thumbnailUrl;
  const friendsPlaying = friends.filter(
    (friend) =>
      friend.presenceType === "InGame" &&
      (friend.universeId === game.universeId || friend.placeId === game.placeId),
  );

  return (
    <div className="details-page">
      {bannerUrl ? (
        <div className="details-banner" aria-hidden>
          <img src={bannerUrl} alt="" />
        </div>
      ) : null}
      <div className={`details-hero ${bannerUrl ? "with-banner" : ""}`}>
        <div className="cover sb-card square">
          {coverUrl ? (
            <img src={coverUrl} alt={game.name} />
          ) : (
            <div className="sb-empty">No artwork</div>
          )}
        </div>
        <div>
          <h2>{game.name}</h2>
          <p className="sb-muted">by {game.creatorName}</p>
          <div className="stats">
            <Badge>{formatCount(game.playing)} playing</Badge>
            <Badge>{formatCount(game.visits)} visits</Badge>
            {game.genre ? <Badge>{game.genre}</Badge> : null}
          </div>
          {friendsPlaying.length ? (
            <div className="game-friends-playing">
              <div className="friend-avatar-stack">
                {friendsPlaying.slice(0, 5).map((friend) =>
                  friend.avatarUrl ? (
                    <img key={friend.userId} src={friend.avatarUrl} alt={friend.displayName} />
                  ) : null,
                )}
              </div>
              <strong>
                {friendsPlaying.map((friend) => friend.displayName).join(", ")}{" "}
                {friendsPlaying.length === 1 ? "is" : "are"} playing
              </strong>
            </div>
          ) : null}
          <p>{game.description || "No description provided."}</p>
          <div className="row-actions" style={{ marginTop: "1rem" }}>
            <Button
              onClick={() =>
                void launchExperience({
                  placeId: game.placeId,
                  universeId: game.universeId,
                  name: game.name,
                  iconUrl: game.iconUrl,
                  creatorName: game.creatorName,
                })
              }
            >
              Play
            </Button>
            <Button
              variant="secondary"
              disabled={!session?.authenticated}
              onClick={() => void toggleFavorite()}
            >
              {favorited ? "Unfavorite" : "Favorite"}
            </Button>
          </div>
        </div>
      </div>

      {events.length > 0 ? (
        <section className="rail events-section">
          <div className="rail-title">
            <div>
              <h3>Events</h3>
              <p className="sb-muted rail-subtitle">
                Live and upcoming events from the official Roblox experience page.
              </p>
            </div>
          </div>
          <div className="event-list">
            {events.map((event) => (
              <article key={event.id} className="sb-card event-card">
                <div className="event-art">
                  {event.thumbnailUrl ? (
                    <img src={event.thumbnailUrl} alt="" loading="lazy" />
                  ) : (
                    <div className="event-art-placeholder">EVENT</div>
                  )}
                  <Badge>{event.status === "live" ? "LIVE NOW" : "UPCOMING"}</Badge>
                </div>
                <div className="event-content">
                  <div>
                    <h4>{event.title}</h4>
                    {event.subtitle ? <strong className="event-subtitle">{event.subtitle}</strong> : null}
                    <p className="sb-muted event-time">{formatEventTime(event)}</p>
                  </div>
                  {event.description ? <p className="event-description">{event.description}</p> : null}
                  <div className="row-actions event-actions">
                    {event.status === "live" ? (
                      <Button
                        onClick={() =>
                          void launchExperience({
                            placeId: event.placeId,
                            universeId: event.universeId,
                            name: event.title,
                            iconUrl: event.thumbnailUrl,
                          })
                        }
                      >
                        Join Event
                      </Button>
                    ) : null}
                    <Button variant="secondary" onClick={() => void openEvent(event)}>
                      View on Roblox
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rail">
        <div className="rail-title">
          <h3>Servers</h3>
          <div className="chips">
            <button className={`chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
              All
            </button>
            <button
              className={`chip ${filter === "lowPing" ? "active" : ""}`}
              onClick={() => setFilter("lowPing")}
            >
              Low ping
            </button>
            <button
              className={`chip ${filter === "space" ? "active" : ""}`}
              onClick={() => setFilter("space")}
            >
              Has space
            </button>
          </div>
        </div>
        {friendsPlaying.some((friend) => friend.gameInstanceId) ? (
          <div className="friend-server-list">
            {friendsPlaying
              .filter((friend) => friend.gameInstanceId)
              .map((friend) => (
                <div key={`${friend.userId}-${friend.gameInstanceId}`} className="sb-card friend-server-row">
                  {friend.avatarUrl ? (
                    <img src={friend.avatarUrl} alt={friend.displayName} />
                  ) : null}
                  <div className="grow">
                    <strong>{friend.displayName} is in this experience</strong>
                    <div className="sb-muted">{friend.lastLocation ?? game.name}</div>
                  </div>
                  <Button
                    onClick={() =>
                      void launchExperience({
                        placeId: friend.placeId ?? game.placeId,
                        userId: friend.userId,
                        gameInstanceId: friend.gameInstanceId ?? undefined,
                        universeId: friend.universeId ?? game.universeId,
                        name: game.name,
                        iconUrl: game.iconUrl,
                        creatorName: game.creatorName,
                        serverType: "public",
                      })
                    }
                  >
                    Join friend
                  </Button>
                </div>
              ))}
          </div>
        ) : null}
        {serversLoading && servers.length === 0 ? <LoadingState label="Loading servers…" /> : null}
        {filteredServers.length === 0 && !serversLoading ? (
          <EmptyState
            title="No servers listed"
            description="Public server lists may require authentication or may be empty right now."
          />
        ) : (
          <div className="server-list">
            {filteredServers.map((server) => {
              const serverFriends = friendsPlaying.filter(
                (friend) => friend.gameInstanceId === server.id,
              );
              return (
                <div
                  key={server.id}
                  className={`sb-card server-row ${serverFriends.length ? "friend-server" : ""}`}
                >
                  <div className="grow">
                    <strong>
                      {server.playing}/{server.maxPlayers} players
                    </strong>
                    <div className="sb-muted">
                      Ping: {server.ping ?? "—"} ms
                    </div>
                    {serverFriends.length ? (
                      <div className="server-friends">
                        {serverFriends.map((friend) => (
                          <span key={friend.userId}>
                            {friend.avatarUrl ? (
                              <img src={friend.avatarUrl} alt="" />
                            ) : null}
                            {friend.displayName}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    variant="secondary"
                    disabled={server.playing >= server.maxPlayers}
                    onClick={() =>
                      void launchExperience({
                        placeId: game.placeId,
                        gameInstanceId: server.id,
                        universeId: game.universeId,
                        name: game.name,
                        iconUrl: game.iconUrl,
                        creatorName: game.creatorName,
                        serverType: "public",
                      })
                    }
                  >
                    {serverFriends.length ? "Join friends" : "Join"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {cursor ? (
          <div style={{ marginTop: "1rem" }}>
            <Button variant="ghost" disabled={serversLoading} onClick={() => void loadMore()}>
              Load more
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function formatEventTime(event: GameEvent): string {
  const start = new Date(event.startUtc);
  const end = new Date(event.endUtc);
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (event.status === "live") {
    return `Live now · ends ${date.format(end)}`;
  }
  const sameDay = start.toDateString() === end.toDateString();
  return sameDay
    ? `${date.format(start)} – ${time.format(end)}`
    : `${date.format(start)} – ${date.format(end)}`;
}
