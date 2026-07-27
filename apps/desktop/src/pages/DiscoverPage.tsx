import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { DiscoveryCategory, GameSummary, UserSearchResult } from "@sb/contracts";
import { Button, EmptyState, LoadingState } from "@sb/ui";
import { api } from "../lib/api";
import { GameCard } from "../components/GameCard";
import { GameRail } from "../components/GameRail";
import { LauncherNickBadge } from "../components/LauncherNickBadge";
import { useAppStore } from "../store";

type SearchTab = "experiences" | "people";

type CachedSearch =
  | { tab: "experiences"; items: GameSummary[]; cursor: string | null }
  | { tab: "people"; items: UserSearchResult[]; cursor: string | null };

function isRateLimitError(message: string): boolean {
  return /limiting search|too many requests|rate.?limit/i.test(message);
}

async function applyOwnedFlags(
  games: GameSummary[],
  canCheckInventory: boolean,
): Promise<GameSummary[]> {
  if (!canCheckInventory) return games;
  const paid = games.filter(
    (game) => game.isForSale && (game.priceInRobux ?? 0) > 0 && game.placeId,
  );
  if (!paid.length) return games;
  try {
    const { owned } = await api.gamePlayability(
      paid.map((game) => ({ universeId: game.universeId, placeId: game.placeId })),
    );
    return games.map((game) =>
      game.universeId in owned ? { ...game, owned: owned[game.universeId] } : game,
    );
  } catch {
    return games;
  }
}

async function applyOwnedToCategories(
  categories: DiscoveryCategory[],
  canCheckInventory: boolean,
): Promise<DiscoveryCategory[]> {
  if (!canCheckInventory) return categories;
  const paid = categories.flatMap((category) =>
    category.games.filter(
      (game) => game.isForSale && (game.priceInRobux ?? 0) > 0 && game.placeId,
    ),
  );
  if (!paid.length) return categories;
  try {
    const { owned } = await api.gamePlayability(
      paid.map((game) => ({ universeId: game.universeId, placeId: game.placeId })),
    );
    return categories.map((category) => ({
      ...category,
      games: category.games.map((game) =>
        game.universeId in owned ? { ...game, owned: owned[game.universeId] } : game,
      ),
    }));
  } catch {
    return categories;
  }
}

function PersonAvatar({
  displayName,
  avatarUrl,
}: {
  displayName: string;
  avatarUrl: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const initial = displayName.slice(0, 1).toUpperCase();

  if (!avatarUrl || failed) {
    return <span>{initial}</span>;
  }

  return (
    <img
      src={avatarUrl}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export function DiscoverPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const tab = (params.get("tab") === "people" ? "people" : "experiences") as SearchTab;
  const session = useAppStore((s) => s.session);
  const [categories, setCategories] = useState<DiscoveryCategory[]>([]);
  const [searchItems, setSearchItems] = useState<GameSummary[]>([]);
  const [peopleItems, setPeopleItems] = useState<UserSearchResult[]>([]);
  const [searchCursor, setSearchCursor] = useState<string | null>(null);
  const [peopleCursor, setPeopleCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [searchNonce, setSearchNonce] = useState(0);
  const [activeSort, setActiveSort] = useState<string | null>(null);
  const [sortGames, setSortGames] = useState<GameSummary[]>([]);
  const searchCache = useRef(new Map<string, CachedSearch>());
  const navigate = useNavigate();

  function setTab(next: SearchTab) {
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", next);
    if (q) nextParams.set("q", q);
    setParams(nextParams, { replace: true });
  }

  function retrySearch() {
    if (q) searchCache.current.delete(`${tab}:${q.toLowerCase()}`);
    setSearchNonce((value) => value + 1);
  }

  useEffect(() => {
    let cancelled = false;
    void fetch("/build-info.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((info: { buildId?: string } | null) => {
        if (cancelled || !info?.buildId) return;
        const previous = sessionStorage.getItem("sb-build-id");
        if (previous && previous !== info.buildId) {
          searchCache.current.clear();
        }
        sessionStorage.setItem("sb-build-id", info.buildId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        setRateLimited(false);

        if (q) {
          const cacheKey = `${tab}:${q.toLowerCase()}`;
          const cached = searchCache.current.get(cacheKey);
          if (cached) {
            if (cached.tab === "people") {
              setPeopleItems(cached.items);
              setPeopleCursor(cached.cursor);
            } else {
              setSearchItems(cached.items);
              setSearchCursor(cached.cursor);
            }
            setCategories([]);
            setLoading(false);
            return;
          }

          setLoading(true);
          if (tab === "people") {
            const data = await api.searchUsers(q);
            if (!cancelled) {
              setPeopleItems(data.items);
              setPeopleCursor(data.nextCursor);
              setSearchItems([]);
              setSearchCursor(null);
              setCategories([]);
              searchCache.current.set(cacheKey, {
                tab: "people",
                items: data.items,
                cursor: data.nextCursor,
              });
            }
          } else {
            const data = await api.searchGames(q);
            if (!cancelled) {
              const items = session?.authenticated
                ? await applyOwnedFlags(data.items, Boolean(session.capabilities.inventory))
                : data.items;
              if (cancelled) return;
              setSearchItems(items);
              setSearchCursor(data.nextCursor);
              setPeopleItems([]);
              setPeopleCursor(null);
              setCategories([]);
              searchCache.current.set(cacheKey, {
                tab: "experiences",
                items,
                cursor: data.nextCursor,
              });
            }
          }
        } else {
          setLoading(true);
          const data = await api.discover();
          if (!cancelled) {
            const categoriesWithOwned = session?.authenticated
              ? await applyOwnedToCategories(
                  data.categories,
                  Boolean(session.capabilities.inventory),
                )
              : data.categories;
            if (cancelled) return;
            setCategories(categoriesWithOwned);
            setSearchItems([]);
            setPeopleItems([]);
            setSearchCursor(null);
            setPeopleCursor(null);
            setActiveSort(null);
            setSortGames([]);
          }
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Discover failed";
          setError(message);
          setRateLimited(isRateLimitError(message));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q, tab, searchNonce, session?.authenticated, session?.capabilities.inventory]);

  async function loadMoreSearch() {
    if (!q) return;
    setLoadingMore(true);
    try {
      if (tab === "people") {
        if (!peopleCursor) return;
        const data = await api.searchUsers(q, peopleCursor);
        setPeopleItems((current) => {
          const next = [...current, ...data.items];
          searchCache.current.set(`${tab}:${q.toLowerCase()}`, {
            tab: "people",
            items: next,
            cursor: data.nextCursor,
          });
          return next;
        });
        setPeopleCursor(data.nextCursor);
      } else {
        if (!searchCursor) return;
        const data = await api.searchGames(q, searchCursor);
        setSearchItems((current) => {
          const next = [...current, ...data.items];
          searchCache.current.set(`${tab}:${q.toLowerCase()}`, {
            tab: "experiences",
            items: next,
            cursor: data.nextCursor,
          });
          return next;
        });
        setSearchCursor(data.nextCursor);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load more";
      setError(message);
      setRateLimited(isRateLimitError(message));
    } finally {
      setLoadingMore(false);
    }
  }

  async function openCategory(sortId: string) {
    setActiveSort(sortId);
    setLoading(true);
    try {
      const data = await api.discoverSort(sortId, 100);
      const games = session?.authenticated
        ? await applyOwnedFlags(data.items, Boolean(session.capabilities.inventory))
        : data.items;
      setSortGames(games);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load category");
    } finally {
      setLoading(false);
    }
  }

  const moreCursor = tab === "people" ? peopleCursor : searchCursor;
  const loadingLabel =
    q && tab === "people" ? "Searching people…" : q ? "Searching experiences…" : "Loading discover…";

  return (
    <div className="discover-page">
      <div className="page-header">
        <div>
          <h2>Discover</h2>
          <p className="sb-muted">
            {q
              ? `Search results for “${q}”`
              : "Full Roblox catalog with live categories, ratings, and hidden gems."}
          </p>
        </div>
        {!q ? (
          <Button variant="secondary" onClick={() => navigate("/")}>
            Back to Home
          </Button>
        ) : null}
      </div>

      {q ? (
        <div className="search-scope chips" role="tablist" aria-label="Search in">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "experiences"}
            className={`chip ${tab === "experiences" ? "active" : ""}`}
            onClick={() => setTab("experiences")}
          >
            Experiences
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "people"}
            className={`chip ${tab === "people" ? "active" : ""}`}
            onClick={() => setTab("people")}
          >
            People
          </button>
        </div>
      ) : null}

      {loading ? <LoadingState label={loadingLabel} /> : null}
      {error ? (
        <div className="discover-error">
          <EmptyState
            title={rateLimited ? "Too many requests" : "Discover unavailable"}
            description={error}
          />
          {rateLimited ? (
            <div className="load-more-row">
              <Button variant="secondary" onClick={() => retrySearch()}>
                Try again
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && q && tab === "experiences" ? (
        <>
          {searchItems.length === 0 ? (
            <EmptyState
              title="No experiences found"
              description="Try another name, or switch to People."
            />
          ) : (
            <div className="grid-games">
              {searchItems.map((game) => (
                <GameCard key={game.universeId} game={game} />
              ))}
            </div>
          )}
          {moreCursor ? (
            <div className="load-more-row">
              <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMoreSearch()}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {!loading && !error && q && tab === "people" ? (
        <>
          {peopleItems.length === 0 ? (
            <EmptyState
              title="No people found"
              description="Try another username, or switch to Experiences."
            />
          ) : (
            <div className="people-search-list">
              {peopleItems.map((person) => (
                <button
                  key={person.userId}
                  type="button"
                  className="sb-card people-search-row"
                  onClick={() => navigate(`/profile/${person.userId}`)}
                >
                  <div className="people-search-avatar">
                    <PersonAvatar
                      displayName={person.displayName}
                      avatarUrl={person.avatarUrl}
                    />
                  </div>
                  <div className="people-search-meta">
                    <strong>
                      {person.displayName}
                      {person.hasVerifiedBadge ? <span className="verified-badge" title="Verified">✓</span> : null}
                      <LauncherNickBadge
                        registeredViaLauncher={person.registeredViaLauncher}
                        mode={person.launcherBadgeMode}
                        customUrl={person.launcherBadgeUrl}
                      />
                    </strong>
                    <span className="sb-muted">@{person.username}</span>
                    {person.previousUsernames.length ? (
                      <span className="sb-muted people-prev-names">
                        Also known as {person.previousUsernames.slice(0, 2).join(", ")}
                      </span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}
          {moreCursor ? (
            <div className="load-more-row">
              <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMoreSearch()}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {!loading && !error && !q && activeSort ? (
        <section className="rail">
          <div className="rail-title">
            <div>
              <h3>{categories.find((c) => c.sort.sortId === activeSort)?.sort.displayName}</h3>
              <button className="chip" onClick={() => setActiveSort(null)}>
                Back to all categories
              </button>
            </div>
          </div>
          <div className="grid-games">
            {sortGames.map((game) => (
              <GameCard key={game.universeId} game={game} />
            ))}
          </div>
        </section>
      ) : null}

      {!loading && !error && !q && !activeSort
        ? categories.map((category) => (
            <GameRail
              key={category.sort.sortId}
              title={category.sort.displayName}
              subtitle={`${category.games.length} experiences`}
              games={category.games.slice(0, 24)}
              action={
                category.games.length > 24 ? (
                  <Button variant="ghost" onClick={() => void openCategory(category.sort.sortId)}>
                    See all
                  </Button>
                ) : null
              }
            />
          ))
        : null}
    </div>
  );
}
