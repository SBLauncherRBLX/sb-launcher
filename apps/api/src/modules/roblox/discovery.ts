import type { DiscoveryCategory, DiscoverySort, GameSummary } from "@sb/contracts";
import { bayesianRating } from "@sb/contracts";
import { cacheGet, cacheSet } from "../../lib/cache.js";
import { fetchJson } from "../../lib/http.js";
import { randomUUID } from "node:crypto";
import { enrichGames, mapChartRow, mapSearchRow } from "./client.js";

const SESSION_TTL = 120_000;
let sessionCache: { id: string; expires: number } | null = null;

function sessionId(): string {
  const now = Date.now();
  if (sessionCache && sessionCache.expires > now) return sessionCache.id;
  const id = randomUUID();
  sessionCache = { id, expires: now + SESSION_TTL };
  return id;
}

export async function listSorts(): Promise<DiscoverySort[]> {
  const cacheKey = "discovery:sorts";
  const cached = await cacheGet<DiscoverySort[]>(cacheKey);
  if (cached) return cached;

  const url = new URL("https://apis.roblox.com/explore-api/v1/get-sorts");
  url.searchParams.set("sessionId", sessionId());
  const data = await fetchJson<{
    sorts?: Array<{
      sortId?: string;
      sortDisplayName?: string;
      gameSetTypeId?: number;
      contentType?: string;
      gameSetTargetId?: number;
      primarySortId?: string;
      gameCount?: number;
    }>;
  }>(url.toString());

  const sorts = (data.sorts ?? [])
    .filter((s) => s.contentType === "Games" && s.sortId && s.sortDisplayName)
    .map((s) => ({
      sortId: String(s.sortId),
      displayName: String(s.sortDisplayName),
      gameCount: typeof s.gameCount === "number" ? s.gameCount : undefined,
    }));

  await cacheSet(cacheKey, sorts, 300_000);
  return sorts;
}

export async function listSortContent(
  sortId: string,
  limit = 100,
): Promise<GameSummary[]> {
  const cacheKey = `discovery:sort:v2:${sortId}:${limit}`;
  const cached = await cacheGet<GameSummary[]>(cacheKey);
  if (cached) return cached;

  const url = new URL("https://apis.roblox.com/explore-api/v1/get-sort-content");
  url.searchParams.set("sessionId", sessionId());
  url.searchParams.set("sortId", sortId);
  const data = await fetchJson<{ games?: Array<Record<string, unknown>> }>(url.toString());
  const games = (data.games ?? []).slice(0, limit).map(mapChartRow);
  const enriched = await enrichGames(games);
  await cacheSet(cacheKey, enriched, 120_000);
  return enriched;
}

const PAID_ACCESS_SORT: DiscoverySort = {
  sortId: "top-paid-access",
  displayName: "Paid Places",
};

export async function listAllCategories(limitPerSort = 100): Promise<DiscoveryCategory[]> {
  const cacheKey = `discovery:all:v2:${limitPerSort}`;
  const cached = await cacheGet<DiscoveryCategory[]>(cacheKey);
  if (cached) return cached;

  const sorts = await listSorts();
  // Explore get-sorts often omits paid access — always surface it in Discover.
  const withPaid = sorts.some((s) => s.sortId === PAID_ACCESS_SORT.sortId)
    ? sorts
    : [PAID_ACCESS_SORT, ...sorts];

  const categories = await Promise.all(
    withPaid.map(async (sort) => ({
      sort: sort.sortId === PAID_ACCESS_SORT.sortId ? { ...sort, displayName: "Paid Places" } : sort,
      games: await listSortContent(sort.sortId, limitPerSort),
    })),
  );
  await cacheSet(cacheKey, categories, 120_000);
  return categories;
}

export async function searchGamesPaginated(
  query: string,
  limit = 40,
  cursor?: string | null,
): Promise<{ items: GameSummary[]; nextCursor: string | null }> {
  const cacheKey = `discovery:search:${query}:${limit}:${cursor ?? "0"}`;
  const cached = await cacheGet<{ items: GameSummary[]; nextCursor: string | null }>(cacheKey);
  if (cached) return cached;

  const url = new URL("https://apis.roblox.com/search-api/omni-search");
  url.searchParams.set("searchQuery", query);
  url.searchParams.set("sessionId", sessionId());
  url.searchParams.set("pageType", "all");
  if (cursor) url.searchParams.set("pageToken", cursor);

  const data = await fetchJson<{
    searchResults?: Array<{
      contentGroupType?: string;
      contents?: Array<Record<string, unknown>>;
    }>;
    nextPageToken?: string | null;
  }>(url.toString());

  // Roblox returns search as many one-item Game groups rather than one
  // consolidated group. Flatten every group to match the website results.
  const seen = new Set<string>();
  const rows = (data.searchResults ?? [])
    .filter((group) => group.contentGroupType === "Game")
    .flatMap((group) => group.contents ?? [])
    .map(mapSearchRow)
    .filter((game) => {
      if (!game.universeId || seen.has(game.universeId)) return false;
      seen.add(game.universeId);
      return true;
    })
    .slice(0, limit);
  const items = await enrichGames(rows);
  const result = {
    items,
    nextCursor: data.nextPageToken ?? null,
  };
  await cacheSet(cacheKey, result, 30_000);
  return result;
}

export async function getSimilarGames(universeId: string, limit = 12): Promise<GameSummary[]> {
  const cacheKey = `discovery:similar:${universeId}:${limit}`;
  const cached = await cacheGet<GameSummary[]>(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchJson<{
      data?: Array<{
        id: number;
        rootPlaceId?: number;
        name?: string;
        playerCount?: number;
        totalUpVotes?: number;
        totalDownVotes?: number;
      }>;
    }>(`https://games.roblox.com/v1/games/recommendations/game/${universeId}`);
    const games = (data.data ?? []).slice(0, limit).map((g) => ({
      universeId: String(g.id),
      placeId: String(g.rootPlaceId ?? ""),
      name: String(g.name ?? "Untitled"),
      description: "",
      creatorName: "",
      playing: Number(g.playerCount ?? 0),
      visits: 0,
      upVotes: Number(g.totalUpVotes ?? 0),
      downVotes: Number(g.totalDownVotes ?? 0),
      thumbnailUrl: null,
      iconUrl: null,
    })) as GameSummary[];
    const enriched = await enrichGames(games);
    await cacheSet(cacheKey, enriched, 120_000);
    return enriched;
  } catch {
    return [];
  }
}

export async function pickSurpriseMe(excludeIds: string[] = []): Promise<{
  game: GameSummary | null;
  reason?: string;
}> {
  const exclude = new Set(excludeIds);
  const sorts = await listSorts();
  const candidateSorts = sorts.filter((s) =>
    ["up-and-coming", "top-trending", "fun-with-friends", "top-revisited"].some((id) =>
      s.sortId.toLowerCase().includes(id.replaceAll("-", "")) || s.sortId === id,
    ),
  );
  const pools = await Promise.all(
    (candidateSorts.length ? candidateSorts : sorts.slice(0, 3)).map((s) =>
      listSortContent(s.sortId, 100),
    ),
  );
  const merged = new Map<string, GameSummary>();
  for (const pool of pools) {
    for (const game of pool) {
      if (!exclude.has(game.universeId)) merged.set(game.universeId, game);
    }
  }

  const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
  const qualified = [...merged.values()].filter((game) => {
    const up = game.upVotes ?? 0;
    const down = game.downVotes ?? 0;
    const totalVotes = up + down;
    const rating = bayesianRating(up, down);
    const createdAt = game.created ? Date.parse(game.created) : NaN;
    const isRecent = Number.isFinite(createdAt) ? createdAt >= twoYearsAgo : true;
    return (
      game.playing <= 2000 &&
      game.playing > 0 &&
      totalVotes >= 500 &&
      rating >= 0.85 &&
      game.visits >= 50_000 &&
      isRecent
    );
  });

  if (!qualified.length) {
    return {
      game: null,
      reason: "No hidden gems matched the filters right now. Try again later.",
    };
  }

  const game = qualified[Math.floor(Math.random() * qualified.length)] ?? null;
  return { game };
}

export async function buildForYou(
  history: Array<{ universeId: string; launchedAt: Date }>,
  limit = 24,
): Promise<GameSummary[]> {
  if (!history.length) return [];

  const weights = new Map<string, number>();
  const now = Date.now();
  for (const entry of history) {
    const ageDays = Math.max(0, (now - entry.launchedAt.getTime()) / (24 * 60 * 60 * 1000));
    const recency = Math.max(0.2, 1 - ageDays / 30);
    weights.set(entry.universeId, (weights.get(entry.universeId) ?? 0) + 1 + recency);
  }

  const topPlayed = [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  const [details, similarBatches] = await Promise.all([
    enrichGames(
      topPlayed.map((universeId) => ({
        universeId,
        placeId: "",
        name: "",
        description: "",
        creatorName: "",
        playing: 0,
        visits: 0,
        thumbnailUrl: null,
        iconUrl: null,
      })),
    ),
    Promise.all(topPlayed.map((id) => getSimilarGames(id, 16))),
  ]);

  const genreWeights = new Map<string, number>();
  for (const game of details) {
    const weight = weights.get(game.universeId) ?? 1;
    for (const tag of [game.genreL1, game.genreL2, game.genre].filter(Boolean)) {
      genreWeights.set(String(tag), (genreWeights.get(String(tag)) ?? 0) + weight);
    }
  }

  const playedSet = new Set(topPlayed);
  const candidates = new Map<string, GameSummary>();
  for (const batch of similarBatches) {
    for (const game of batch) {
      if (!playedSet.has(game.universeId)) candidates.set(game.universeId, game);
    }
  }

  const upAndComing = await listSortContent("up-and-coming", 60).catch(() => []);
  for (const game of upAndComing) {
    if (!playedSet.has(game.universeId)) candidates.set(game.universeId, game);
  }

  const ranked = [...candidates.values()]
    .map((game) => {
      let score = bayesianRating(game.upVotes ?? 0, game.downVotes ?? 0);
      for (const tag of [game.genreL1, game.genreL2, game.genre].filter(Boolean)) {
        score += (genreWeights.get(String(tag)) ?? 0) * 0.05;
      }
      if (game.playing > 0) score += Math.log10(game.playing + 1) * 0.02;
      return { game, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.game);

  return ranked;
}
