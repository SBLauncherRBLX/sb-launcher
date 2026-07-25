import type { FriendPresence, GameSummary, HomePayload } from "@sb/contracts";
import { enrichGames } from "../roblox/client.js";
import {
  buildForYou,
  listSortContent,
  listAllCategories,
  pickSurpriseMe,
} from "../roblox/discovery.js";

type HistoryRow = {
  universeId: string;
  placeId: string;
  name: string;
  iconUrl: string | null;
  launchedAt: Date;
};

type FavoriteRow = {
  universeId: string;
  placeId: string;
  name: string;
  iconUrl: string | null;
};

/** Instant rails from local DB / friends cache — icons fetched in one small batch. */
export async function buildHomeLightPayload(input: {
  history: HistoryRow[];
  favorites: FavoriteRow[];
  friends?: FriendPresence[];
}): Promise<HomePayload> {
  const historyRows = dedupeHistory(input.history).slice(0, 12);
  const friendsPlaying = await enrichGames(
    buildFriendsPlayingRail(input.friends ?? []),
    "icons",
  ).catch(() => buildFriendsPlayingRail(input.friends ?? []));

  return {
    continuePlaying: historyRows.map((row) => ({
      universeId: row.universeId,
      placeId: row.placeId,
      name: row.name,
      description: "",
      creatorName: "",
      playing: 0,
      visits: 0,
      thumbnailUrl: row.iconUrl,
      iconUrl: row.iconUrl,
    })),
    favorites: input.favorites.slice(0, 24).map((f) => ({
      universeId: f.universeId,
      placeId: f.placeId,
      name: f.name,
      description: "",
      creatorName: "",
      playing: 0,
      visits: 0,
      thumbnailUrl: f.iconUrl,
      iconUrl: f.iconUrl,
    })),
    friendsPlaying,
    forYou: [],
    upAndComing: [],
    surpriseMe: null,
  };
}

export async function buildHomePayload(input: {
  userId?: string | null;
  history: HistoryRow[];
  favorites: FavoriteRow[];
  friends?: FriendPresence[];
  lightOnly?: boolean;
}): Promise<HomePayload> {
  if (input.lightOnly) return buildHomeLightPayload(input);

  const historyRows = dedupeHistory(input.history).slice(0, 12);
  const enrichedHistory = await enrichGames(
    historyRows.map((row) => ({
      universeId: row.universeId,
      placeId: row.placeId,
      name: row.name,
      description: "",
      creatorName: "",
      playing: 0,
      visits: 0,
      thumbnailUrl: row.iconUrl,
      iconUrl: row.iconUrl,
    })),
  ).catch(() =>
    historyRows.map((row) => ({
      universeId: row.universeId,
      placeId: row.placeId,
      name: row.name,
      description: "",
      creatorName: "",
      playing: 0,
      visits: 0,
      thumbnailUrl: row.iconUrl,
      iconUrl: row.iconUrl,
    })),
  );

  const continuePlaying = enrichedHistory;

  const favoriteGames = await enrichGames(
    input.favorites.slice(0, 24).map((f) => ({
      universeId: f.universeId,
      placeId: f.placeId,
      name: f.name,
      description: "",
      creatorName: "",
      playing: 0,
      visits: 0,
      thumbnailUrl: f.iconUrl,
      iconUrl: f.iconUrl,
    })),
  );

  const friendsPlaying = await enrichGames(
    buildFriendsPlayingRail(input.friends ?? []),
    "icons",
  ).catch(() => buildFriendsPlayingRail(input.friends ?? []));

  const historyForRecs = dedupeHistory(input.history).map((row) => ({
    universeId: row.universeId,
    launchedAt: row.launchedAt,
  }));

  // Classic home recommendations (pre-update algorithms).
  const [forYou, upAndComing, surprise] = await Promise.all([
    buildForYou(historyForRecs, 24).catch(() => []),
    listSortContent("up-and-coming", 12).catch(() => []),
    pickSurpriseMe(historyForRecs.map((h) => h.universeId)).catch(() => ({
      game: null,
      reason: "Roblox discovery is temporarily unavailable.",
    })),
  ]);

  return {
    continuePlaying,
    favorites: favoriteGames,
    friendsPlaying,
    forYou,
    upAndComing,
    surpriseMe: surprise.game,
  };
}

export async function buildDiscoverPayload() {
  const categories = await listAllCategories(100);
  return { categories };
}

function buildFriendsPlayingRail(friends: FriendPresence[]): GameSummary[] {
  const byUniverse = new Map<
    string,
    { placeId: string; name: string; iconUrl: string | null; friendCount: number }
  >();

  for (const friend of friends) {
    if (friend.presenceType !== "InGame" || !friend.universeId) continue;
    const existing = byUniverse.get(friend.universeId);
    const name = friend.lastLocation?.trim() || existing?.name || "Experience";
    if (existing) {
      existing.friendCount += 1;
      if (!existing.name || existing.name === "Experience") existing.name = name;
      continue;
    }
    byUniverse.set(friend.universeId, {
      placeId: friend.placeId ?? "",
      name,
      iconUrl: null,
      friendCount: 1,
    });
  }

  return [...byUniverse.entries()]
    .sort((a, b) => b[1].friendCount - a[1].friendCount)
    .slice(0, 16)
    .map(([universeId, row]) => ({
      universeId,
      placeId: row.placeId,
      name:
        row.friendCount > 1
          ? `${row.name} · ${row.friendCount} friends`
          : row.name,
      description: "",
      creatorName: "",
      playing: row.friendCount,
      visits: 0,
      thumbnailUrl: row.iconUrl,
      iconUrl: row.iconUrl,
    }));
}

function dedupeHistory(rows: HistoryRow[]): HistoryRow[] {
  const seen = new Set<string>();
  const result: HistoryRow[] = [];
  for (const row of rows) {
    if (seen.has(row.universeId)) continue;
    seen.add(row.universeId);
    result.push(row);
  }
  return result;
}
