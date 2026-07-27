import type {
  AvatarAsset,
  AvatarState,
  Capabilities,
  FriendPresence,
  GameDetails,
  GameSummary,
  ServerInfo,
  UserProfile,
  UserProfileDetails,
  UserSearchResult,
  Avatar3DModel,
} from "@sb/contracts";
import { DEFAULT_CAPABILITIES } from "@sb/contracts";
import { cacheGet, cacheSet } from "../../lib/cache.js";
import { fetchJson, RobloxApiError, sleep } from "../../lib/http.js";
import { fetchLauncherPresenceBatch, fetchPlayersBatchRemote } from "../sbCloud.js";

function scopesToCapabilities(scopes: string[]): Capabilities {
  const set = new Set(scopes);
  return {
    profile: set.has("openid") || set.has("profile"),
    friends: set.has("user.social") || set.has("user.social:read"),
    presence: set.has("user.social") || set.has("user.social:read"),
    avatarWrite: false,
    inventory: set.has("user.inventory-item:read"),
    servers: true,
  };
}

export function detectCapabilities(scopeString: string): Capabilities {
  const scopes = scopeString.split(/\s+/).filter(Boolean);
  return scopesToCapabilities(scopes);
}

function ratingPercent(upVotes: number, downVotes: number): number | undefined {
  const total = upVotes + downVotes;
  if (!total) return undefined;
  return Math.round((upVotes / total) * 100);
}

export function mapChartRow(g: Record<string, unknown>): GameSummary {
  const upVotes = Number(g.totalUpVotes ?? 0);
  const downVotes = Number(g.totalDownVotes ?? 0);
  return {
    universeId: String(g.universeId ?? ""),
    placeId: String(g.rootPlaceId ?? ""),
    name: String(g.name ?? "Untitled"),
    description: "",
    creatorName: "",
    playing: Number(g.playerCount ?? 0),
    visits: Number(g.visits ?? 0),
    genre: typeof g.genreL1 === "string" ? g.genreL1 : undefined,
    genreL1: typeof g.genreL1 === "string" ? g.genreL1 : undefined,
    genreL2: typeof g.genreL2 === "string" ? g.genreL2 : undefined,
    upVotes,
    downVotes,
    ratingPercent: ratingPercent(upVotes, downVotes),
    thumbnailUrl: null,
    iconUrl: null,
  };
}

export function mapSearchRow(g: Record<string, unknown>): GameSummary {
  const upVotes = Number(g.totalUpVotes ?? 0);
  const downVotes = Number(g.totalDownVotes ?? 0);
  return {
    universeId: String(g.universeId ?? g.contentId ?? ""),
    placeId: String(g.rootPlaceId ?? ""),
    name: String(g.name ?? "Untitled"),
    description: String(g.description ?? ""),
    creatorName: String(g.creatorName ?? "Unknown"),
    playing: Number(g.playerCount ?? 0),
    visits: Number(g.visits ?? 0),
    maxPlayers: Number(g.maxPlayers ?? 0) || undefined,
    genre: typeof g.genreL1 === "string" ? g.genreL1 : undefined,
    genreL1: typeof g.genreL1 === "string" ? g.genreL1 : undefined,
    genreL2: typeof g.genreL2 === "string" ? g.genreL2 : undefined,
    upVotes,
    downVotes,
    ratingPercent: ratingPercent(upVotes, downVotes),
    thumbnailUrl: null,
    iconUrl: null,
  };
}

export type EnrichMode = "none" | "icons" | "full";

export async function enrichGames(
  games: GameSummary[],
  mode: EnrichMode = "full",
): Promise<GameSummary[]> {
  const ids = games.map((g) => g.universeId).filter(Boolean);
  if (!ids.length || mode === "none") return games;

  if (mode === "icons") {
    const icons = await thumbnails("GameIcon", ids, "150x150").catch(
      () => ({}) as Record<string, string | null>,
    );
    return games.map((game) => ({
      ...game,
      iconUrl: icons[game.universeId] ?? game.iconUrl,
      thumbnailUrl: icons[game.universeId] ?? game.thumbnailUrl ?? game.iconUrl,
    }));
  }

  const [icons, details, products] = await Promise.all([
    thumbnails("GameIcon", ids, "512x512").catch(
      () => ({}) as Record<string, string | null>,
    ),
    batchGameDetails(ids).catch(
      () => ({}) as Awaited<ReturnType<typeof batchGameDetails>>,
    ),
    batchGameProductInfo(ids).catch(
      () => ({}) as Awaited<ReturnType<typeof batchGameProductInfo>>,
    ),
  ]);

  return games.map((game) => {
    const detail = details[game.universeId];
    const product = products[game.universeId];
    return {
      ...game,
      placeId: game.placeId || detail?.placeId || game.placeId,
      name: game.name || detail?.name || game.name,
      description: game.description || detail?.description || "",
      creatorName: game.creatorName || detail?.creatorName || "",
      playing: detail?.playing ?? game.playing,
      visits: detail?.visits ?? game.visits,
      maxPlayers: detail?.maxPlayers ?? game.maxPlayers,
      genre: detail?.genre ?? game.genre,
      genreL1: detail?.genreL1 ?? game.genreL1,
      genreL2: detail?.genreL2 ?? game.genreL2,
      created: detail?.created ?? game.created,
      updated: detail?.updated ?? game.updated,
      upVotes: game.upVotes ?? detail?.upVotes,
      downVotes: game.downVotes ?? detail?.downVotes,
      ratingPercent:
        game.ratingPercent ??
        (detail?.upVotes !== undefined && detail?.downVotes !== undefined
          ? ratingPercent(detail.upVotes, detail.downVotes)
          : game.ratingPercent),
      iconUrl: icons[game.universeId] ?? game.iconUrl,
      thumbnailUrl: icons[game.universeId] ?? game.thumbnailUrl,
      isForSale: product?.isForSale ?? game.isForSale,
      priceInRobux:
        product?.isForSale && product.price > 0
          ? product.price
          : (product?.price === 0 ? null : game.priceInRobux ?? null),
      productId: product?.productId ?? game.productId ?? null,
    };
  });
}

export async function batchGameProductInfo(
  universeIds: string[],
): Promise<
  Record<string, { isForSale: boolean; price: number; productId: string | null }>
> {
  const unique = [...new Set(universeIds.filter(Boolean))];
  if (!unique.length) return {};

  const cacheKey = `game-products:${unique.join(",")}`;
  const cached = await cacheGet<
    Record<string, { isForSale: boolean; price: number; productId: string | null }>
  >(cacheKey);
  if (cached) return cached;

  const CHUNK = 50;
  const map: Record<
    string,
    { isForSale: boolean; price: number; productId: string | null }
  > = {};
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    try {
      const url = new URL("https://games.roblox.com/v1/games/games-product-info");
      url.searchParams.set("universeIds", chunk.join(","));
      const data = await fetchJson<{
        data?: Array<{
          universeId?: number;
          isForSale?: boolean;
          price?: number;
          productId?: number | null;
        }>;
      }>(url.toString());
      for (const row of data.data ?? []) {
        if (!row.universeId) continue;
        map[String(row.universeId)] = {
          isForSale: Boolean(row.isForSale),
          price: typeof row.price === "number" ? Math.max(0, row.price) : 0,
          productId: row.productId != null ? String(row.productId) : null,
        };
      }
    } catch {
      // ignore chunk failures
    }
  }

  await cacheSet(cacheKey, map, 60_000);
  return map;
}

/**
 * Check paid-access ownership via inventory (Place asset), which matches
 * MarketplaceService:PlayerOwnsAsset(placeId). Playability status needs a
 * website cookie and always returns GuestProhibited for OAuth Bearer.
 */
export async function batchPaidAccessOwned(
  targets: Array<{ universeId: string; placeId: string }>,
  userId: string,
  accessToken?: string | null,
  capabilities?: Pick<Capabilities, "inventory"> | null,
): Promise<Record<string, boolean>> {
  const token = accessToken?.trim();
  if (!token || !userId?.trim() || !targets.length) return {};

  const placeToUniverses = new Map<string, string[]>();
  for (const target of targets) {
    const placeId = target.placeId?.trim();
    const universeId = target.universeId?.trim();
    if (!placeId || !universeId) continue;
    const list = placeToUniverses.get(placeId) ?? [];
    list.push(universeId);
    placeToUniverses.set(placeId, list);
  }

  const placeIds = [...placeToUniverses.keys()];
  if (!placeIds.length) return {};

  const owned: Record<string, boolean> = {};
  const mark = (placeId: string, value: boolean) => {
    for (const universeId of placeToUniverses.get(placeId) ?? []) {
      owned[universeId] = value;
    }
  };

  // Open Cloud inventory (needs user.inventory-item:read for purchased places).
  if (capabilities?.inventory !== false) {
    try {
      const CHUNK = 40;
      let cloudOk = false;
      for (let i = 0; i < placeIds.length; i += CHUNK) {
        const chunk = placeIds.slice(i, i + CHUNK);
        // Keep commas in filter unencoded — Roblox rejects %2C in assetIds lists.
        const url =
          `https://apis.roblox.com/cloud/v2/users/${encodeURIComponent(userId)}/inventory-items` +
          `?maxPageSize=100&filter=assetIds=${chunk.join(",")}`;
        const data = await fetchJson<{
          inventoryItems?: Array<{
            assetDetails?: { assetId?: string | number };
            placeDetails?: { placeId?: string | number };
            path?: string;
          }>;
        }>(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        cloudOk = true;

        for (const item of data.inventoryItems ?? []) {
          const assetId =
            item.placeDetails?.placeId != null
              ? String(item.placeDetails.placeId)
              : item.assetDetails?.assetId != null
                ? String(item.assetDetails.assetId)
                : item.path?.match(/(?:assets|places)\/(\d+)/i)?.[1];
          if (!assetId || !placeToUniverses.has(assetId)) continue;
          mark(assetId, true);
        }
      }
      if (cloudOk) {
        for (const placeId of placeIds) {
          const universeIds = placeToUniverses.get(placeId) ?? [];
          if (universeIds.some((id) => owned[id] === true)) continue;
          mark(placeId, false);
        }
        return owned;
      }
    } catch {
      // Fall through.
    }
  }

  // Purchased places tabs (classic inventory; placesTab is 0–5).
  try {
    const purchased = await listPurchasedPlaceIds(userId, token);
    if (purchased) {
      for (const placeId of placeIds) {
        mark(placeId, purchased.has(placeId));
      }
      return owned;
    }
  } catch {
    // Fall through to per-item checks.
  }

  await Promise.all(
    placeIds.map(async (placeId) => {
      const isOwned = await checkPlaceOwnedClassic(userId, placeId, token).catch(() => null);
      if (isOwned == null) return;
      mark(placeId, isOwned);
    }),
  );

  return owned;
}

async function listPurchasedPlaceIds(
  userId: string,
  accessToken: string,
): Promise<Set<string> | null> {
  const ids = new Set<string>();
  // Website "Places > Purchased" is typically tab 1; also scan neighbors.
  const tabs = [1, 2, 0, 3];
  let anyOk = false;
  for (const tab of tabs) {
    let cursor: string | number | null = 1;
    for (let page = 0; page < 8; page++) {
      const url = new URL(
        `https://inventory.roblox.com/v1/users/${encodeURIComponent(userId)}/places/inventory`,
      );
      url.searchParams.set("placesTab", String(tab));
      url.searchParams.set("itemsPerPage", "100");
      url.searchParams.set("cursor", String(cursor ?? 1));
      try {
        const data = await fetchJson<{
          data?: Array<{ placeId?: number; universeId?: number; id?: number }>;
          nextPageCursor?: string | number | null;
        }>(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        anyOk = true;
        for (const row of data.data ?? []) {
          const placeId = row.placeId ?? row.id;
          if (placeId != null) ids.add(String(placeId));
        }
        cursor = data.nextPageCursor ?? null;
        if (cursor == null || cursor === "") break;
      } catch {
        break;
      }
    }
  }
  return anyOk ? ids : null;
}

async function checkPlaceOwnedClassic(
  userId: string,
  placeId: string,
  accessToken: string,
): Promise<boolean | null> {
  const endpoints = [
    `https://inventory.roblox.com/v1/users/${encodeURIComponent(userId)}/items/Asset/${encodeURIComponent(placeId)}/is-owned`,
    `https://inventory.roblox.com/v1/users/${encodeURIComponent(userId)}/items/Place/${encodeURIComponent(placeId)}/is-owned`,
    `https://inventory.roblox.com/v1/users/${encodeURIComponent(userId)}/items/0/${encodeURIComponent(placeId)}/is-owned`,
  ];
  for (const endpoint of endpoints) {
    try {
      const data = await fetchJson<boolean | { isOwned?: boolean }>(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (typeof data === "boolean") return data;
      if (typeof data?.isOwned === "boolean") return data.isOwned;
    } catch {
      // try next shape
    }
  }
  return null;
}

async function batchGameDetails(
  universeIds: string[],
): Promise<
  Record<
    string,
    {
      placeId: string;
      name: string;
      description: string;
      creatorName: string;
      playing: number;
      visits: number;
      maxPlayers?: number;
      genre?: string;
      genreL1?: string;
      genreL2?: string;
      created?: string;
      updated?: string;
      upVotes?: number;
      downVotes?: number;
    }
  >
> {
  const unique = [...new Set(universeIds.filter(Boolean))];
  if (!unique.length) return {};

  const cacheKey = `batch-details:${unique.join(",")}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return cached as Awaited<ReturnType<typeof batchGameDetails>>;

  // games.roblox.com rejects large universeIds batches, so chunk requests.
  const CHUNK_SIZE = 40;
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + CHUNK_SIZE));
  }

  type BatchGameRow = {
    id: number;
    rootPlaceId: number;
    name: string;
    description?: string;
    creator?: { name?: string };
    playing?: number;
    visits?: number;
    maxPlayers?: number;
    genre?: string;
    genre_l1?: string;
    genre_l2?: string;
    created?: string;
    updated?: string;
    upVotes?: number;
    downVotes?: number;
  };

  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const url = new URL("https://games.roblox.com/v1/games");
        url.searchParams.set("universeIds", chunk.join(","));
        const data = await fetchJson<{ data?: BatchGameRow[] }>(url.toString());
        return data.data ?? [];
      } catch {
        return [] as BatchGameRow[];
      }
    }),
  );

  const map: Awaited<ReturnType<typeof batchGameDetails>> = {};
  for (const g of chunkResults.flat()) {
    map[String(g.id)] = {
      placeId: String(g.rootPlaceId),
      name: g.name,
      description: g.description ?? "",
      creatorName: g.creator?.name ?? "Unknown",
      playing: g.playing ?? 0,
      visits: g.visits ?? 0,
      maxPlayers: g.maxPlayers,
      genre: g.genre,
      genreL1: g.genre_l1,
      genreL2: g.genre_l2,
      created: g.created,
      updated: g.updated,
      upVotes: g.upVotes,
      downVotes: g.downVotes,
    };
  }
  await cacheSet(cacheKey, map, 60_000);
  return map;
}

async function thumbnails(
  type: "GameIcon" | "Avatar" | "AvatarHeadShot" | "Asset" | "GameThumbnail",
  ids: string[],
  size = "150x150",
): Promise<Record<string, string | null>> {
  // GameIcon max supported by Roblox is 512x512 — larger sizes fail and look soft.
  const gameIconSizes = new Set(["50x50", "128x128", "150x150", "256x256", "420x420", "512x512"]);
  const resolvedSize =
    type === "GameIcon" && !gameIconSizes.has(size) ? "512x512" : size;
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return {};
  const cacheKey = `thumbs:${type}:${resolvedSize}:${uniqueIds.join(",")}`;
  const cached = await cacheGet<Record<string, string | null>>(cacheKey);
  if (cached) return cached;

  const map: Record<string, string | null> = Object.fromEntries(
    uniqueIds.map((id) => [id, null]),
  );
  const CHUNK = 100;
  for (let index = 0; index < uniqueIds.length; index += CHUNK) {
    const chunk = uniqueIds.slice(index, index + CHUNK);
    try {
      const body = chunk.map((id) => ({
        requestId: id,
        type,
        targetId: Number(id),
        format: "png",
        size: resolvedSize,
      }));
      const data = await fetchJson<{
        data: Array<{ requestId: string; imageUrl?: string; state: string }>;
      }>("https://thumbnails.roblox.com/v1/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      for (const item of data.data ?? []) {
        map[item.requestId] =
          item.state === "Completed" && item.imageUrl ? item.imageUrl : null;
      }
    } catch {
      // Keep null only for the failed chunk instead of losing every thumbnail.
    }
  }

  // Dedicated icons endpoint as a fallback for any missing GameIcon entries.
  if (type === "GameIcon") {
    const missing = uniqueIds.filter((id) => !map[id]);
    if (missing.length) {
      try {
        const url = new URL("https://thumbnails.roblox.com/v1/games/icons");
        url.searchParams.set("universeIds", missing.join(","));
        url.searchParams.set("size", resolvedSize);
        url.searchParams.set("format", "Png");
        const data = await fetchJson<{
          data?: Array<{ targetId: number; state?: string; imageUrl?: string }>;
        }>(url.toString());
        for (const item of data.data ?? []) {
          if (item.state === "Completed" && item.imageUrl) {
            map[String(item.targetId)] = item.imageUrl;
          }
        }
      } catch {
        // ignore fallback errors
      }
    }
  }

  await cacheSet(cacheKey, map, 60_000);
  return map;
}

async function gameScreenshots(
  universeId: string,
  count = 6,
  size = "768x432",
): Promise<string[]> {
  const cacheKey = `game-shots:${universeId}:${count}:${size}`;
  const cached = await cacheGet<string[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = new URL("https://thumbnails.roblox.com/v1/games/multiget/thumbnails");
    url.searchParams.set("universeIds", universeId);
    url.searchParams.set("countPerUniverse", String(count));
    url.searchParams.set("defaults", "true");
    url.searchParams.set("size", size);
    url.searchParams.set("format", "Png");
    const data = await fetchJson<{
      data?: Array<{
        universeId: number;
        thumbnails?: Array<{ targetId?: number; state?: string; imageUrl?: string }>;
      }>;
    }>(url.toString());
    const shots = (data.data?.[0]?.thumbnails ?? [])
      .filter((t) => t.state === "Completed" && t.imageUrl)
      .map((t) => String(t.imageUrl));
    await cacheSet(cacheKey, shots, 300_000);
    return shots;
  } catch {
    return [];
  }
}

async function assetMetadata(
  ids: string[],
): Promise<Record<string, { name: string; assetType: string }>> {
  const entries = await Promise.all(
    ids.map(async (id) => {
      try {
        const details = await fetchJson<{
          AssetId?: number;
          Name?: string;
          AssetTypeId?: number;
        }>(`https://economy.roblox.com/v2/assets/${id}/details`, {}, 1);
        return [
          id,
          {
            name: details.Name ?? `Asset ${id}`,
            assetType: details.AssetTypeId
              ? `Asset type ${details.AssetTypeId}`
              : "Wearable",
          },
        ] as const;
      } catch {
        return [id, { name: `Asset ${id}`, assetType: "Wearable" }] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

const userSearchInflight = new Map<
  string,
  Promise<{ items: UserSearchResult[]; nextCursor: string | null }>
>();
let lastUserSearchAt = 0;

export async function searchUsers(
  query: string,
  limit = 10,
  cursor?: string | null,
): Promise<{ items: UserSearchResult[]; nextCursor: string | null }> {
  const q = query.trim();
  if (!q) return { items: [], nextCursor: null };

  // Roblox only allows these page sizes for /v1/users/search.
  const allowed = [10, 25, 50, 100] as const;
  const capped = allowed.reduce((best, value) =>
    Math.abs(value - limit) < Math.abs(best - limit) ? value : best,
  allowed[0]);
  const cacheKey = `user-search:v3:${q.toLowerCase()}:${capped}:${cursor ?? ""}`;
  const cached = await cacheGet<{ items: UserSearchResult[]; nextCursor: string | null }>(
    cacheKey,
  );
  if (cached) return cached;

  const inflight = userSearchInflight.get(cacheKey);
  if (inflight) return inflight;

  const task = (async () => {
    const gap = 900 - (Date.now() - lastUserSearchAt);
    if (gap > 0) await sleep(gap);
    lastUserSearchAt = Date.now();

    const url = new URL("https://users.roblox.com/v1/users/search");
    url.searchParams.set("keyword", q);
    url.searchParams.set("limit", String(capped));
    if (cursor) url.searchParams.set("cursor", cursor);

    const data = await fetchJson<{
      previousPageCursor?: string | null;
      nextPageCursor?: string | null;
      data?: Array<{
        id: number;
        name?: string;
        displayName?: string;
        hasVerifiedBadge?: boolean;
        previousUsernames?: string[];
      }>;
    }>(url.toString(), {}, 4);

    const rows = data.data ?? [];
    const ids = rows.map((row) => String(row.id));
    const avatars = await thumbnails("AvatarHeadShot", ids, "150x150").catch(
      () => ({}) as Record<string, string | null>,
    );

    const items: UserSearchResult[] = rows.map((row) => {
      const userId = String(row.id);
      const username = row.name ?? `user_${userId}`;
      return {
        userId,
        username,
        displayName: row.displayName || username,
        avatarUrl: avatars[userId] ?? null,
        hasVerifiedBadge: Boolean(row.hasVerifiedBadge),
        previousUsernames: row.previousUsernames ?? [],
        profileUrl: `https://www.roblox.com/users/${userId}/profile`,
        registeredViaLauncher: false,
        launcherBadgeMode: "off" as const,
        launcherBadgeUrl: null,
      };
    });

    const launcherPlayers = await Promise.race([
      fetchPlayersBatchRemote(ids).catch(
        () => ({}) as Awaited<ReturnType<typeof fetchPlayersBatchRemote>>,
      ),
      new Promise<Awaited<ReturnType<typeof fetchPlayersBatchRemote>>>((resolve) =>
        setTimeout(() => resolve({}), 150),
      ),
    ]);
    for (const item of items) {
      const remote = launcherPlayers[item.userId];
      if (!remote?.registered) continue;
      const badge = remote.cosmetics?.badge;
      const badgeMode =
        badge?.mode === "custom" || badge?.mode === "off" || badge?.mode === "launcher"
          ? badge.mode
          : ("launcher" as const);
      item.registeredViaLauncher = true;
      item.launcherBadgeMode = badgeMode;
      item.launcherBadgeUrl =
        badgeMode === "custom" && typeof badge?.customUrl === "string"
          ? badge.customUrl
          : null;
    }

    const result = { items, nextCursor: data.nextPageCursor ?? null };
    await cacheSet(cacheKey, result, 180_000);
    return result;
  })();

  userSearchInflight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    userSearchInflight.delete(cacheKey);
  }
}

export async function getUserProfileDetails(
  userId: string,
  accessToken?: string,
): Promise<UserProfileDetails> {
  const cacheKey = `user-profile:${userId}`;
  const cached = await cacheGet<UserProfileDetails>(cacheKey);
  if (cached) return cached;

  // Keep profile requests lean — enrichGames + many parallel counts trigger 429s
  // after the friends list already consumed the rate budget.
  const user = await fetchOpenCloudUser(userId, accessToken);

  const [fullBodies, headshots, presence] = await Promise.all([
    thumbnails("Avatar", [userId], "420x420").catch(
      () => ({}) as Record<string, string | null>,
    ),
    thumbnails("AvatarHeadShot", [userId], "420x420").catch(
      () => ({}) as Record<string, string | null>,
    ),
    accessToken
      ? batchFriendPresence(accessToken, [userId]).catch(() => ({
          userPresences: [],
        }))
      : Promise.resolve({ userPresences: [] }),
  ]);

  const bodyUrl = fullBodies[userId] ?? null;
  const headUrl = headshots[userId] ?? null;
  const avatarUrl = bodyUrl ?? headUrl;
  const fullBodyAvatarUrl = bodyUrl ?? headUrl;

  let gamesFetchFailed = false;
  const gamesPage = await fetchJson<{
    data?: Array<{
      id: number;
      name?: string;
      description?: string;
      rootPlace?: { id?: number };
      placeVisits?: number;
      created?: string;
      updated?: string;
    }>;
  }>(
    `https://games.roblox.com/v2/users/${userId}/games?accessFilter=2&limit=10&sortOrder=Desc`,
  ).catch(() => {
    gamesFetchFailed = true;
    return { data: [] };
  });

  const lightGames = (gamesPage.data ?? []).slice(0, 10).map((game) => ({
    universeId: String(game.id),
    placeId: String(game.rootPlace?.id ?? ""),
    name: game.name ?? "Untitled experience",
    description: game.description ?? "",
    creatorName: user.displayName,
    playing: 0,
    visits: game.placeVisits ?? 0,
    created: game.created,
    updated: game.updated,
    thumbnailUrl: null as string | null,
    iconUrl: null as string | null,
  }));

  const icons = await thumbnails(
    "GameIcon",
    lightGames.map((game) => game.universeId),
    "512x512",
  ).catch(() => ({}) as Record<string, string | null>);

  const games = lightGames.map((game) => ({
    ...game,
    iconUrl: icons[game.universeId] ?? null,
    thumbnailUrl: icons[game.universeId] ?? null,
  }));

  const rawPresence = presence.userPresences?.[0];
  const presenceType =
    rawPresence?.userPresenceType === 2
      ? ("InGame" as const)
      : rawPresence?.userPresenceType === 3
        ? ("InStudio" as const)
        : rawPresence?.userPresenceType === 1
          ? ("Online" as const)
          : rawPresence
            ? ("Offline" as const)
            : ("Unknown" as const);
  const placeId = rawPresence?.placeId ?? rawPresence?.rootPlaceId;
  let lastLocation = normalizeLocationName(rawPresence?.lastLocation);
  let universeId = rawPresence?.universeId ? String(rawPresence.universeId) : null;
  let resolvedPlaceId = placeId ? String(placeId) : null;

  if (
    (presenceType === "InGame" || presenceType === "InStudio") &&
    !lastLocation
  ) {
    if (!universeId && resolvedPlaceId) {
      const places = await batchPlaceDetails([resolvedPlaceId]).catch(() => ({}));
      const meta = places[resolvedPlaceId];
      if (meta?.universeId) universeId = meta.universeId;
      if (meta?.name) lastLocation = normalizeLocationName(meta.name);
    }
    if (universeId && !lastLocation) {
      const games = await batchGameDetails([universeId]).catch(() => ({}));
      const game = games[universeId];
      if (game?.name) lastLocation = normalizeLocationName(game.name);
      if (!resolvedPlaceId && game?.placeId) resolvedPlaceId = game.placeId;
    }
  }

  const profile: UserProfileDetails = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    description: user.description,
    createdAt: user.createdAt,
    avatarUrl,
    fullBodyAvatarUrl,
    profileUrl: `https://www.roblox.com/users/${user.id}/profile`,
    isBanned: user.isBanned,
    hasVerifiedBadge: user.hasVerifiedBadge,
    friendCount: 0,
    followerCount: 0,
    followingCount: 0,
    presenceType,
    isOnline: presenceType !== "Offline" && presenceType !== "Unknown",
    lastLocation,
    placeId: resolvedPlaceId,
    universeId,
    gameInstanceId: rawPresence?.gameId ?? null,
    canJoin: presenceType === "InGame",
    registeredViaLauncher: false,
    launcherBadgeMode: "launcher",
    launcherBadgeUrl: null,
    launcherAvatarMode: "roblox",
    launcherAvatarUrl: null,
    launcherBanner: null,
    games,
  };

  // Social counts are optional and rate-limit heavy — fill when available.
  const [friendCount, followerCount, followingCount] = await Promise.all([
    fetchCount(`https://friends.roblox.com/v1/users/${userId}/friends/count`),
    fetchCount(`https://friends.roblox.com/v1/users/${userId}/followers/count`),
    fetchCount(`https://friends.roblox.com/v1/users/${userId}/followings/count`),
  ]);
  profile.friendCount = friendCount;
  profile.followerCount = followerCount;
  profile.followingCount = followingCount;

  // Avoid caching empty experiences after a failed games request.
  // Also avoid sticky null avatars when Roblox thumbs are temporarily pending.
  const ttl = gamesFetchFailed || !avatarUrl ? 15_000 : 5 * 60_000;
  await cacheSet(cacheKey, profile, ttl);
  return profile;
}

async function fetchOpenCloudUser(
  userId: string,
  accessToken?: string,
): Promise<{
  id: string;
  username: string;
  displayName: string;
  description: string;
  createdAt: string | null;
  isBanned: boolean;
  hasVerifiedBadge: boolean;
}> {
  // Prefer the public users API first — Open Cloud /cloud/v2/users is tightly
  // rate-limited (~10/min) and is the main source of profile 429 errors.
  try {
    const legacy = await fetchJson<{
      id: number;
      name?: string;
      displayName?: string;
      description?: string;
      created?: string;
      isBanned?: boolean;
      hasVerifiedBadge?: boolean;
    }>(`https://users.roblox.com/v1/users/${encodeURIComponent(userId)}`);
    return {
      id: String(legacy.id),
      username: legacy.name ?? `user_${legacy.id}`,
      displayName: legacy.displayName ?? legacy.name ?? `User ${legacy.id}`,
      description: legacy.description ?? "",
      createdAt: legacy.created ?? null,
      isBanned: legacy.isBanned ?? false,
      hasVerifiedBadge: legacy.hasVerifiedBadge ?? false,
    };
  } catch {
    const authHeaders = accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : {};
    const cloud = await fetchJson<{
      id?: string;
      name?: string;
      displayName?: string;
      about?: string;
      createTime?: string;
      idVerified?: boolean;
    }>(`https://apis.roblox.com/cloud/v2/users/${encodeURIComponent(userId)}`, authHeaders);
    return {
      id: String(cloud.id ?? userId),
      username: cloud.name ?? `user_${userId}`,
      displayName: cloud.displayName ?? cloud.name ?? `User ${userId}`,
      description: cloud.about ?? "",
      createdAt: cloud.createTime ?? null,
      isBanned: false,
      hasVerifiedBadge: cloud.idVerified ?? false,
    };
  }
}

async function fetchCount(url: string): Promise<number> {
  try {
    const data = await fetchJson<{ count?: number }>(url);
    return Math.max(0, Number(data.count ?? 0));
  } catch {
    return 0;
  }
}

async function getAvatar3DModel(
  accessToken: string,
  userId: string,
): Promise<Avatar3DModel | null> {
  try {
    const render = await fetchJson<{
      state?: string;
      imageUrl?: string | null;
    }>(
      `https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (render.state !== "Completed" || !render.imageUrl) return null;

    const manifest = await fetchJson<{
      obj?: string;
      mtl?: string;
      camera?: {
        position?: { x?: number; y?: number; z?: number };
        direction?: { x?: number; y?: number; z?: number };
      };
    }>(render.imageUrl);
    if (!manifest.obj) return null;

    return {
      objUrl: robloxCdnUrl(manifest.obj),
      mtlUrl: manifest.mtl ? robloxCdnUrl(manifest.mtl) : null,
      cameraPosition: vector3(manifest.camera?.position),
      cameraDirection: vector3(manifest.camera?.direction),
    };
  } catch {
    return null;
  }
}

function vector3(
  value?: { x?: number; y?: number; z?: number },
): [number, number, number] | null {
  if (
    typeof value?.x !== "number" ||
    typeof value.y !== "number" ||
    typeof value.z !== "number"
  ) {
    return null;
  }
  return [value.x, value.y, value.z];
}

function robloxCdnUrl(hash: string): string {
  let shard = 31;
  for (let index = 0; index < Math.min(hash.length, 38); index++) {
    shard ^= hash.charCodeAt(index);
  }
  return `https://t${Math.abs(shard) % 8}.rbxcdn.com/${hash}`;
}

export async function fetchUserInfo(accessToken: string): Promise<UserProfile> {
  const info = await fetchJson<{
    sub: string;
    name?: string;
    nickname?: string;
    preferred_username?: string;
    picture?: string | null;
    profile?: string;
    created_at?: number;
  }>("https://apis.roblox.com/oauth/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return {
    id: String(info.sub),
    username: info.preferred_username || info.nickname || info.name || `user_${info.sub}`,
    displayName: info.name || info.nickname || info.preferred_username || `User ${info.sub}`,
    avatarUrl: info.picture ?? null,
    profileUrl: info.profile || `https://www.roblox.com/users/${info.sub}/profile`,
    createdAt: info.created_at ? new Date(info.created_at * 1000).toISOString() : null,
  };
}

export async function searchGames(query: string, limit = 24): Promise<GameSummary[]> {
  const { searchGamesPaginated } = await import("./discovery.js");
  const result = await searchGamesPaginated(query, limit);
  return result.items;
}

export async function listCharts(limit = 24): Promise<GameSummary[]> {
  const { listSortContent } = await import("./discovery.js");
  return listSortContent("top-playing-now", limit);
}

export async function getGameDetails(universeId: string): Promise<GameDetails> {
  const cacheKey = `game:v2:${universeId}`;
  const cached = await cacheGet<GameDetails>(cacheKey);
  if (cached) return cached;

  const url = new URL("https://games.roblox.com/v1/games");
  url.searchParams.set("universeIds", universeId);
  const data = await fetchJson<{
    data: Array<{
      id: number;
      rootPlaceId: number;
      name: string;
      description?: string;
      creator?: { name?: string };
      playing?: number;
      visits?: number;
      maxPlayers?: number;
      genre?: string;
      genre_l1?: string;
      genre_l2?: string;
      created?: string;
      updated?: string;
      favoritedCount?: number;
      upVotes?: number;
      downVotes?: number;
    }>;
  }>(url.toString());
  const g = data.data?.[0];
  if (!g) throw new RobloxApiError("Game not found", 404, "NOT_FOUND");

  const [icons, screenshots, products] = await Promise.all([
    thumbnails("GameIcon", [String(g.id)], "512x512"),
    gameScreenshots(String(g.id), 6, "768x432"),
    batchGameProductInfo([String(g.id)]).catch(
      () => ({}) as Awaited<ReturnType<typeof batchGameProductInfo>>,
    ),
  ]);
  const upVotes = g.upVotes ?? 0;
  const downVotes = g.downVotes ?? 0;
  const iconUrl = icons[String(g.id)] ?? null;
  const product = products[String(g.id)];
  const details: GameDetails = {
    universeId: String(g.id),
    placeId: String(g.rootPlaceId),
    rootPlaceId: String(g.rootPlaceId),
    name: g.name,
    description: g.description ?? "",
    creatorName: g.creator?.name ?? "Unknown",
    playing: g.playing ?? 0,
    visits: g.visits ?? 0,
    maxPlayers: g.maxPlayers,
    genre: g.genre,
    genreL1: g.genre_l1,
    genreL2: g.genre_l2,
    upVotes,
    downVotes,
    ratingPercent: ratingPercent(upVotes, downVotes),
    created: g.created,
    updated: g.updated,
    favoritedCount: g.favoritedCount,
    thumbnailUrl: iconUrl,
    iconUrl,
    isForSale: product?.isForSale,
    priceInRobux:
      product?.isForSale && product.price > 0 ? product.price : null,
    productId: product?.productId ?? null,
    media: screenshots.length
      ? screenshots.map((imageUrl, index) => ({ id: `shot-${index}`, imageUrl }))
      : [{ id: "icon", imageUrl: iconUrl }],
  };
  await cacheSet(cacheKey, details, 60_000);
  return details;
}

export async function listServers(
  placeId: string,
  cursor?: string | null,
  limit = 25,
): Promise<{ items: ServerInfo[]; nextCursor: string | null }> {
  const url = new URL(`https://games.roblox.com/v1/games/${placeId}/servers/0`);
  url.searchParams.set("sortOrder", "2");
  url.searchParams.set("excludeFullGames", "false");
  url.searchParams.set("limit", String(limit));
  if (cursor) url.searchParams.set("cursor", cursor);

  try {
    const data = await fetchJson<{
      data?: Array<{
        id: string;
        maxPlayers: number;
        playing: number;
        fps?: number;
        ping?: number;
        playerTokens?: string[];
      }>;
      nextPageCursor?: string | null;
    }>(url.toString());

    const items: ServerInfo[] = (data.data ?? []).map((s) => ({
      id: s.id,
      maxPlayers: s.maxPlayers,
      playing: s.playing,
      fps: s.fps ?? null,
      ping: s.ping ?? null,
      region: "unavailable" as const,
      regionNote: "Roblox does not expose server region via public APIs.",
      playerTokens: s.playerTokens ?? [],
    }));
    return { items, nextCursor: data.nextPageCursor ?? null };
  } catch (err) {
    if (err instanceof RobloxApiError && err.status === 401) {
      return {
        items: [],
        nextCursor: null,
      };
    }
    throw err;
  }
}

export async function peekCachedFriends(userId: string): Promise<FriendPresence[]> {
  const cacheKey = `friends-presence:v3:${userId}`;
  const cached = await cacheGet<FriendPresence[]>(cacheKey);
  return cached ? sortFriendsByPresence(cached) : [];
}

export async function listFriends(
  _accessToken: string,
  userId: string,
  capabilities: Capabilities,
): Promise<FriendPresence[]> {
  if (!capabilities.friends) return [];
  const cacheKey = `friends-presence:v3:${userId}`;
  const cached = await cacheGet<FriendPresence[]>(cacheKey);
  if (cached) {
    // Cache already stores hydrated rows — re-hydrating on every hit made Friends/Home crawl.
    return sortFriendsByPresence(cached);
  }

  try {
    const data = await fetchJson<{
      data?: Array<{
        id?: number;
        name?: string;
        displayName?: string;
        isOnline?: boolean;
      }>;
      PageItems?: Array<{
        id?: number;
        name?: string;
        displayName?: string;
      }>;
    }>(`https://friends.roblox.com/v1/users/${userId}/friends`, {
      headers: { Authorization: `Bearer ${_accessToken}` },
    });

    const friendsRaw = data.data ?? data.PageItems ?? [];
    const friendIds = friendsRaw
      .map((f) => String(f.id ?? ""))
      .filter(Boolean);
    if (!friendIds.length) return [];

    const [thumbs, profiles, presenceData, launcherPresence] = await Promise.all([
      // Use the same full-body avatar style as the built-in profile page.
      thumbnails("Avatar", friendIds, "150x150").catch(
        () => ({}) as Record<string, string | null>,
      ),
      batchUserProfiles(friendIds, _accessToken).catch(
        () => ({}) as Record<string, { username: string; displayName: string }>,
      ),
      batchFriendPresence(_accessToken, friendIds),
      Promise.race([
        fetchLauncherPresenceBatch(_accessToken, friendIds).catch(
          () => ({}) as Awaited<ReturnType<typeof fetchLauncherPresenceBatch>>,
        ),
        new Promise<Awaited<ReturnType<typeof fetchLauncherPresenceBatch>>>((resolve) =>
          setTimeout(() => resolve({}), 400),
        ),
      ]),
    ]);

    // Badges are lazy — never gate the friends list on cloud cosmetics.
    const launcherPlayersPromise = fetchPlayersBatchRemote(friendIds).catch(
      () => ({}) as Awaited<ReturnType<typeof fetchPlayersBatchRemote>>,
    );

    const presenceByUser = new Map(
      (presenceData.userPresences ?? []).map((presence) => [
        String(presence.userId),
        presence,
      ]),
    );
    const missingAvatarIds = friendIds.filter((id) => !thumbs[id]);
    if (missingAvatarIds.length) {
      const headshots = await thumbnails("AvatarHeadShot", missingAvatarIds, "150x150");
      for (const id of missingAvatarIds) {
        thumbs[id] = headshots[id] ?? null;
      }
    }
    await hydrateMissingUserProfiles(profiles, friendIds);

    const result = friendsRaw
      .filter((f) => f.id)
      .map((f) => {
        const id = String(f.id);
        const profile = profiles[id];
        const presence = presenceByUser.get(id);
        const launcher = launcherPresence[id];
        const inLauncher = Boolean(launcher?.online);
        let presenceType =
          presence?.userPresenceType === 2
            ? ("InGame" as const)
            : presence?.userPresenceType === 3
              ? ("InStudio" as const)
              : presence?.userPresenceType === 1
                ? ("Online" as const)
                : ("Offline" as const);
        // Keep friends visible as Online in SB Launcher while their launcher is open,
        // even if Roblox presence briefly reports Offline (e.g. between places).
        if (presenceType === "Offline" && inLauncher) {
          presenceType = "Online";
        }
        const placeIdRaw = presence?.placeId ?? presence?.rootPlaceId;
        const universeIdRaw = presence?.universeId;
        const rawLocation = normalizeLocationName(presence?.lastLocation);
        const canJoin = presenceType === "InGame";
        let lastLocation =
          presenceType === "InGame" || presenceType === "InStudio"
            ? rawLocation
            : inLauncher && (!rawLocation || presenceType === "Online")
              ? launcher?.robloxOpen
                ? "SB Launcher · Roblox open"
                : "SB Launcher"
              : rawLocation;
        // Presence often returns InGame with an empty lastLocation string — keep null so we hydrate.
        if (
          (presenceType === "InGame" || presenceType === "InStudio") &&
          !lastLocation
        ) {
          lastLocation = null;
        }
        return {
          userId: id,
          username: f.name || profile?.username || `user_${id}`,
          displayName: f.displayName || profile?.displayName || f.name || `User ${id}`,
          avatarUrl: thumbs[id] ?? null,
          isOnline: presenceType !== "Offline",
          presenceType,
          lastLocation,
          placeId: placeIdRaw ? String(placeIdRaw) : null,
          universeId: universeIdRaw ? String(universeIdRaw) : null,
          gameInstanceId: presence?.gameId ?? null,
          canJoin,
          inLauncher,
          registeredViaLauncher: false,
          launcherBadgeMode: "off" as const,
          launcherBadgeUrl: null as string | null,
          joinDisabledReason: canJoin
            ? null
            : presenceType === "Offline"
              ? "Friend is offline."
              : "Friend is not in a joinable experience or privacy settings block joining.",
        };
      });

    // Optional quick badge merge — never wait long for cloud.
    const launcherPlayers = await Promise.race([
      launcherPlayersPromise,
      new Promise<Awaited<ReturnType<typeof fetchPlayersBatchRemote>>>((resolve) =>
        setTimeout(() => resolve({}), 200),
      ),
    ]);
    applyLauncherBadges(result, launcherPlayers);

    // Game-name hydration is best-effort and must not block first paint.
    const hydrated = await Promise.race([
      hydrateFriendGameNames(result),
      new Promise<FriendPresence[]>((resolve) => setTimeout(() => resolve(result), 250)),
    ]);
    sortFriendsByPresence(hydrated);
    void cacheSet(cacheKey, hydrated, 45_000).catch(() => undefined);
    // Finish hydration + badges in background for the next cache hit.
    void (async () => {
      const [fullPlayers, fullHydrated] = await Promise.all([
        launcherPlayersPromise.catch(() => ({})),
        hydrateFriendGameNames(hydrated).catch(() => hydrated),
      ]);
      applyLauncherBadges(fullHydrated, fullPlayers);
      sortFriendsByPresence(fullHydrated);
      await cacheSet(cacheKey, fullHydrated, 45_000).catch(() => undefined);
    })();
    return hydrated;
  } catch {
    return [];
  }
}

function applyLauncherBadges(
  items: FriendPresence[],
  launcherPlayers: Awaited<ReturnType<typeof fetchPlayersBatchRemote>>,
): void {
  for (const item of items) {
    const remotePlayer = launcherPlayers[item.userId];
    if (!remotePlayer?.registered) continue;
    const badge = remotePlayer.cosmetics?.badge;
    const badgeMode =
      badge?.mode === "custom" || badge?.mode === "off" || badge?.mode === "launcher"
        ? badge.mode
        : ("launcher" as const);
    item.registeredViaLauncher = true;
    item.launcherBadgeMode = badgeMode;
    item.launcherBadgeUrl =
      badgeMode === "custom" && typeof badge?.customUrl === "string"
        ? badge.customUrl
        : null;
  }
}

function normalizeLocationName(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  // Roblox sometimes returns these placeholders instead of a real experience name.
  const lower = trimmed.toLowerCase();
  if (
    lower === "website" ||
    lower === "online" ||
    lower === "playing" ||
    lower === "mobile" ||
    lower === "studio"
  ) {
    return null;
  }
  return trimmed;
}

async function hydrateFriendGameNames(items: FriendPresence[]): Promise<FriendPresence[]> {
  const inExperience = items.filter(
    (item) => item.presenceType === "InGame" || item.presenceType === "InStudio",
  );
  // Fill missing universeId even when Roblox already sent a location name —
  // Last Played history requires universeId + placeId on /api/launch.
  const needsMeta = inExperience
    .filter(
      (item) =>
        (!item.universeId && item.placeId) || !normalizeLocationName(item.lastLocation),
    )
    .slice(0, 40);
  if (!needsMeta.length) return items;

  const placeOnly = [
    ...new Set(
      needsMeta
        .filter((item) => !item.universeId && item.placeId)
        .map((item) => item.placeId!)
        .filter(Boolean),
    ),
  ];
  const placeMeta = await batchPlaceDetails(placeOnly).catch(
    () => ({}) as Awaited<ReturnType<typeof batchPlaceDetails>>,
  );

  const universeIds = [
    ...new Set(
      needsMeta
        .map((item) => item.universeId || (item.placeId ? placeMeta[item.placeId]?.universeId : null))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const games = await batchGameDetails(universeIds).catch(
    () => ({}) as Awaited<ReturnType<typeof batchGameDetails>>,
  );

  return items.map((item) => {
    if (item.presenceType !== "InGame" && item.presenceType !== "InStudio") return item;

    let universeId = item.universeId;
    let placeId = item.placeId;
    const placeInfo = placeId ? placeMeta[placeId] : undefined;
    if (!universeId && placeInfo?.universeId) {
      universeId = placeInfo.universeId;
      placeId = placeInfo.placeId || placeId;
    }

    const existingName = normalizeLocationName(item.lastLocation);
    if (existingName && universeId) {
      return {
        ...item,
        universeId,
        placeId: placeId ?? item.placeId ?? (games[universeId]?.placeId ?? null),
      };
    }

    const fromPlace = placeId ? placeMeta[placeId]?.name : null;
    const fromUniverse = universeId ? games[universeId]?.name : null;
    const name = normalizeLocationName(fromUniverse || fromPlace);
    if (!name && !universeId) return item;

    return {
      ...item,
      lastLocation: name ?? item.lastLocation,
      universeId: universeId ?? item.universeId,
      placeId: placeId ?? item.placeId ?? (universeId ? games[universeId]?.placeId ?? null : null),
    };
  });
}

/** Resolve enough game fields to write a Last Played (history) row for a launch. */
export async function resolveLaunchHistoryMeta(input: {
  placeId?: string | null;
  universeId?: string | null;
  name?: string | null;
  iconUrl?: string | null;
  userId?: string | null;
  accessToken?: string | null;
}): Promise<{
  universeId: string;
  placeId: string;
  name: string;
  iconUrl: string | null;
} | null> {
  let placeId = input.placeId?.trim() || "";
  let universeId = input.universeId?.trim() || "";
  let name = normalizeLocationName(input.name) || "";
  let iconUrl = input.iconUrl?.trim() || null;

  // Follow-user joins often omit place/universe; re-read friend presence.
  if ((!placeId || !universeId || !name) && input.userId?.trim() && input.accessToken?.trim()) {
    const presence = await batchFriendPresence(input.accessToken, [input.userId.trim()]).catch(
      () => ({ userPresences: [] as RobloxFriendPresence[] }),
    );
    const row = presence.userPresences?.[0];
    if (row) {
      if (!placeId) {
        const raw = row.placeId ?? row.rootPlaceId;
        placeId = raw ? String(raw) : placeId;
      }
      if (!universeId && row.universeId) universeId = String(row.universeId);
      if (!name) name = normalizeLocationName(row.lastLocation) || name;
    }
  }

  if (!universeId && placeId) {
    const places = await batchPlaceDetails([placeId]).catch(
      () => ({}) as Awaited<ReturnType<typeof batchPlaceDetails>>,
    );
    const meta = places[placeId];
    if (meta?.universeId) universeId = meta.universeId;
    if (!name && meta?.name) name = normalizeLocationName(meta.name) || name;
    if (meta?.placeId) placeId = meta.placeId;
  }

  if (universeId && (!placeId || !name)) {
    const games = await batchGameDetails([universeId]).catch(
      () => ({}) as Awaited<ReturnType<typeof batchGameDetails>>,
    );
    const game = games[universeId];
    if (game) {
      if (!placeId && game.placeId) placeId = game.placeId;
      if (!name && game.name) name = normalizeLocationName(game.name) || name;
    }
  }

  if (!universeId || !placeId) return null;
  if (!name) name = "Experience";

  if (!iconUrl) {
    const icons = await thumbnails("GameIcon", [universeId], "150x150").catch(
      () => ({}) as Record<string, string | null>,
    );
    iconUrl = icons[universeId] ?? null;
  }

  return { universeId, placeId, name, iconUrl };
}

async function batchPlaceDetails(
  placeIds: string[],
): Promise<Record<string, { name: string; universeId: string; placeId: string }>> {
  const unique = [...new Set(placeIds.filter(Boolean))];
  if (!unique.length) return {};

  const cacheKey = `place-details:v2:${unique.join(",")}`;
  const cached = await cacheGet<Record<string, { name: string; universeId: string; placeId: string }>>(
    cacheKey,
  );
  if (cached) return cached;

  // games.roblox.com/v1/games/multiget-place-details requires auth (401 anonymously).
  // Public place → universe mapping works without cookies.
  const map: Record<string, { name: string; universeId: string; placeId: string }> = {};
  await Promise.all(
    unique.map(async (placeId) => {
      try {
        const data = await fetchJson<{ universeId?: number }>(
          `https://apis.roblox.com/universes/v1/places/${encodeURIComponent(placeId)}/universe`,
        );
        if (!data.universeId) return;
        map[placeId] = {
          placeId,
          universeId: String(data.universeId),
          name: "",
        };
      } catch {
        // ignore individual place failures
      }
    }),
  );

  const universeIds = [...new Set(Object.values(map).map((row) => row.universeId))];
  if (universeIds.length) {
    const games = await batchGameDetails(universeIds).catch(
      () => ({}) as Awaited<ReturnType<typeof batchGameDetails>>,
    );
    for (const row of Object.values(map)) {
      const game = games[row.universeId];
      if (game?.name) row.name = game.name;
    }
  }

  // Only cache successful lookups so transient failures are not sticky for 60s.
  if (Object.keys(map).length) {
    await cacheSet(cacheKey, map, 60_000);
  }
  return map;
}

function sortFriendsByPresence(items: FriendPresence[]) {
  const presenceRank: Record<FriendPresence["presenceType"], number> = {
    InGame: 0,
    InStudio: 1,
    Online: 2,
    Offline: 3,
    Unknown: 4,
  };
  return items.sort(
    (a, b) =>
      presenceRank[a.presenceType] - presenceRank[b.presenceType] ||
      a.displayName.localeCompare(b.displayName),
  );
}

type RobloxFriendPresence = {
  userId: number;
  userPresenceType?: number;
  lastLocation?: string;
  placeId?: number | null;
  rootPlaceId?: number | null;
  universeId?: number | null;
  gameId?: string | null;
};

async function batchFriendPresence(
  accessToken: string,
  userIds: string[],
): Promise<{ userPresences: RobloxFriendPresence[] }> {
  const CHUNK = 50;
  const chunks: string[][] = [];
  for (let index = 0; index < userIds.length; index += CHUNK) {
    chunks.push(userIds.slice(index, index + CHUNK));
  }
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const response = await fetchJson<{ userPresences?: RobloxFriendPresence[] }>(
          "https://presence.roblox.com/v1/presence/users",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ userIds: chunk.map(Number) }),
          },
        );
        return response.userPresences ?? [];
      } catch {
        return [] as RobloxFriendPresence[];
      }
    }),
  );
  return { userPresences: results.flat() };
}

async function batchUserProfiles(
  userIds: string[],
  accessToken?: string,
): Promise<Record<string, { username: string; displayName: string }>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return {};

  const CHUNK = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK) chunks.push(unique.slice(i, i + CHUNK));

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const data = await fetchJson<{
          data?: Array<{ id: number; name?: string; displayName?: string }>;
        }>("https://users.roblox.com/v1/users", {
          method: "POST",
          headers: {
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userIds: chunk.map(Number),
            excludeBannedUsers: true,
          }),
        });
        return data.data ?? [];
      } catch {
        return [];
      }
    }),
  );

  const map: Record<string, { username: string; displayName: string }> = {};
  for (const user of results.flat()) {
    map[String(user.id)] = {
      username: user.name ?? `user_${user.id}`,
      displayName: user.displayName ?? user.name ?? `User ${user.id}`,
    };
  }
  return map;
}

async function hydrateMissingUserProfiles(
  profiles: Record<string, { username: string; displayName: string }>,
  userIds: string[],
): Promise<void> {
  const missing = userIds.filter((id) => !profiles[id]);
  const CHUNK = 20;
  for (let index = 0; index < missing.length; index += CHUNK) {
    await Promise.all(
      missing.slice(index, index + CHUNK).map(async (id) => {
        const cacheKey = `friend-profile:${id}`;
        const cached = await cacheGet<{ username: string; displayName: string }>(cacheKey);
        if (cached) {
          profiles[id] = cached;
          return;
        }
        try {
          const user = await fetchJson<{
            name?: string;
            displayName?: string;
          }>(`https://users.roblox.com/v1/users/${encodeURIComponent(id)}`);
          const profile = {
            username: user.name ?? `user_${id}`,
            displayName: user.displayName ?? user.name ?? `User ${id}`,
          };
          profiles[id] = profile;
          await cacheSet(cacheKey, profile, 10 * 60_000);
        } catch {
          // Keep the ID fallback only when Roblox does not expose this profile.
        }
      }),
    );
  }
}

export async function getAvatarState(
  accessToken: string,
  userId: string,
): Promise<AvatarState> {
  try {
    const wearing = await fetchJson<{ assetIds?: number[] }>(
      `https://avatar.roblox.com/v1/users/${userId}/currently-wearing`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const ids = (wearing.assetIds ?? []).map(String);
    const [thumbs, metadata, preview, fullBody, model3d] = await Promise.all([
      thumbnails("Asset", ids),
      assetMetadata(ids),
      thumbnails("AvatarHeadShot", [userId], "420x420"),
      thumbnails("Avatar", [userId], "420x420"),
      getAvatar3DModel(accessToken, userId),
    ]);
    const assets: AvatarAsset[] = ids.map((id) => ({
      id,
      name: metadata[id]?.name ?? `Asset ${id}`,
      assetType: metadata[id]?.assetType ?? "Wearable",
      category: avatarCategory(metadata[id]?.assetType),
      thumbnailUrl: thumbs[id] ?? null,
    }));
    return {
      userId,
      previewUrl: preview[userId] ?? null,
      fullBodyPreviewUrl: fullBody[userId] ?? null,
      model3d,
      currentlyWearing: assets,
    };
  } catch {
    return {
      userId,
      previewUrl: null,
      fullBodyPreviewUrl: null,
      model3d: null,
      currentlyWearing: [],
    };
  }
}

function avatarCategory(
  assetType?: string,
): AvatarAsset["category"] {
  const value = (assetType ?? "").toLowerCase();
  if (/(animation|run|walk|jump|fall|idle|swim|climb)/.test(value)) return "Animations";
  if (/emote/.test(value)) return "Emotes";
  if (/(shirt|pants|tshirt|jacket|sweater|shorts|dress|shoe)/.test(value)) {
    return "Clothing";
  }
  if (/(accessory|hat|hair|neck|shoulder|front|back|waist|gear)/.test(value)) {
    return "Accessories";
  }
  if (/head/.test(value)) return "Heads";
  if (/face/.test(value)) return "Faces";
  if (/(body|torso|arm|leg)/.test(value)) return "Bodies";
  if (/(bundle|character)/.test(value)) return "Characters";
  return "Other";
}

export async function listInventory(
  accessToken: string,
  userId: string,
  capabilities: Capabilities,
): Promise<AvatarAsset[]> {
  if (!capabilities.inventory) return [];

  // Prefer Open Cloud inventory-items (matches user.inventory-item:read).
  try {
    const cloud = await listInventoryOpenCloud(accessToken, userId);
    if (cloud.length) return cloud;
  } catch {
    // Fall through to classic inventory endpoints.
  }

  // Fallback: request each wearable type by numeric assetTypeId.
  const wearableTypeIds = [
    8, 2, 11, 12, 18, 19, // Hat, TShirt, Shirt, Pants, Face, Gear
    41, 42, 43, 44, 45, 46, 47, // classic accessories
    64, 65, 66, 67, 68, 69, 70, 71, 72, // layered clothing
  ];

  const pages = await Promise.all(
    wearableTypeIds.map(async (assetTypeId) => {
      try {
        const url = new URL(
          `https://inventory.roblox.com/v2/users/${userId}/inventory/${assetTypeId}`,
        );
        url.searchParams.set("limit", "100");
        url.searchParams.set("sortOrder", "Desc");
        const data = await fetchJson<{
          data?: Array<{
            assetId?: number;
            assetName?: string;
            name?: string;
          }>;
        }>(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        return (data.data ?? []).map((row) => ({
          id: String(row.assetId ?? ""),
          name: row.assetName ?? row.name ?? `Asset ${row.assetId}`,
          assetType: avatarAssetTypeName(assetTypeId),
          category: avatarCategory(avatarAssetTypeName(assetTypeId)),
        }));
      } catch {
        return [];
      }
    }),
  );

  const rows = pages.flat().filter((row) => row.id);
  const ids = rows.map((row) => row.id);
  const thumbs = await thumbnails("Asset", ids).catch(
    () => ({}) as Record<string, string | null>,
  );
  return rows.map((row) => ({
    ...row,
    thumbnailUrl: thumbs[row.id] ?? null,
  }));
}

async function listInventoryOpenCloud(
  accessToken: string,
  userId: string,
): Promise<AvatarAsset[]> {
  const items: AvatarAsset[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < 5; page++) {
    const url = new URL(
      `https://apis.roblox.com/cloud/v2/users/${userId}/inventory-items`,
    );
    url.searchParams.set("maxPageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const data = await fetchJson<{
      inventoryItems?: Array<{
        path?: string;
        assetDetails?: {
          assetId?: string | number;
          inventoryItemAssetType?: string;
        };
      }>;
      nextPageToken?: string | null;
    }>(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    for (const item of data.inventoryItems ?? []) {
      const assetId = item.assetDetails?.assetId;
      if (assetId == null) continue;
      items.push({
        id: String(assetId),
        name: `Asset ${assetId}`,
        assetType: item.assetDetails?.inventoryItemAssetType ?? "Wearable",
        category: avatarCategory(item.assetDetails?.inventoryItemAssetType),
        thumbnailUrl: null,
      });
    }

    pageToken = data.nextPageToken ?? null;
    if (!pageToken) break;
  }

  if (!items.length) return [];

  const ids = items.map((item) => item.id);
  const [thumbs, metadata] = await Promise.all([
    thumbnails("Asset", ids).catch(() => ({}) as Record<string, string | null>),
    assetMetadata(ids).catch(
      () => ({}) as Record<string, { name: string; assetType: string }>,
    ),
  ]);

  return items.map((item) => ({
    ...item,
    name: metadata[item.id]?.name ?? item.name,
    assetType: metadata[item.id]?.assetType ?? item.assetType,
    category: avatarCategory(metadata[item.id]?.assetType ?? item.assetType),
    thumbnailUrl: thumbs[item.id] ?? null,
  }));
}

function avatarAssetTypeName(assetTypeId: number): string {
  const names: Record<number, string> = {
    2: "T-Shirt",
    8: "Hat",
    11: "Shirt",
    12: "Pants",
    18: "Face",
    19: "Gear",
    41: "Hair Accessory",
    42: "Face Accessory",
    43: "Neck Accessory",
    44: "Shoulder Accessory",
    45: "Front Accessory",
    46: "Back Accessory",
    47: "Waist Accessory",
    64: "T-Shirt Accessory",
    65: "Shirt Accessory",
    66: "Pants Accessory",
    67: "Jacket Accessory",
    68: "Sweater Accessory",
    69: "Shorts Accessory",
    70: "Left Shoe Accessory",
    71: "Right Shoe Accessory",
    72: "Dress Skirt Accessory",
  };
  return names[assetTypeId] ?? `Asset type ${assetTypeId}`;
}

export { DEFAULT_CAPABILITIES };
