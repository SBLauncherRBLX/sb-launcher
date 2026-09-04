export type Env = {
  PLAYERS: KVNamespace;
  META: KVNamespace;
  UPDATE_ADMIN_TOKEN?: string;
  DEFAULT_DOWNLOAD_URL?: string;
};

export type BadgeMode = "launcher" | "custom" | "off";
export type AvatarMode = "roblox" | "custom";
export type BannerMode = "off" | "image" | "gif" | "video" | "color";

export type ProfileCosmetics = {
  badge: {
    mode: BadgeMode;
    customUrl?: string;
  };
  avatar: {
    mode: AvatarMode;
    customUrl?: string;
  };
  banner: {
    mode: BannerMode;
    mediaUrl?: string;
    color?: string;
    fit: "cover" | "contain" | "fill";
    position: "center" | "top" | "bottom" | "left" | "right";
    blur: number;
    opacity: number;
    dim: number;
    height: number;
    muted: boolean;
    loop: boolean;
  };
};

export type PlayerRecord = {
  id: string;
  registeredAt: string;
  username?: string;
  displayName?: string;
  cosmetics?: ProfileCosmetics;
  favoriteGames?: FavoriteGamePublic[];
};

export type FavoriteGamePublic = {
  universeId: string;
  placeId: string;
  name: string;
  iconUrl?: string | null;
};

export type UpdateManifest = {
  version: string;
  buildId: string;
  downloadUrl: string;
  /** Plain multiline patch notes shown in the launcher. */
  notes: string;
  /** Optional short title for the update dialog. */
  title?: string;
  publishedAt: string;
};

const CORS_ORIGINS = new Set([
  "https://app.sblauncher",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const PLAYER_PREFIX = "player:";
const PRESENCE_PREFIX = "presence:";
const MEDIA_PREFIX = "media:";
const MEDIA_INDEX_PREFIX = "mediaindex:";
const RATE_PREFIX = "rate:";
const COUNT_KEY = "players:count";
const UPDATE_KEY = "update:latest";
const UPDATE_NOTES_MAX = 12_000;
const UPDATE_TITLE_MAX = 120;
const MAX_MEDIA_BYTES = 3_500_000;
const MAX_MEDIA_PER_USER = 20;
const MAX_MEDIA_UPLOADS_PER_HOUR = 10;
const MAX_AUTH_CALLS_PER_MINUTE = 60;
const PRESENCE_TTL_SECONDS = 90;
const PRESENCE_BATCH_MAX = 100;

const ALLOWED_DOWNLOAD_HOSTS = new Set([
  "sblauncherrblx.github.io",
  "github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
]);

/**
 * Seeded update shipped with the Worker so clients still see a new release
 * when Cloudflare KV write quota is exhausted (free tier). Prefer this when
 * its version is newer than (or equal to) the KV copy.
 */
const SHIPPED_UPDATE: UpdateManifest = {
  version: "3.0.0",
  buildId: "20260904234027",
  downloadUrl: "https://sblauncherrblx.github.io/SB-launcher-for-Roblox/",
  notes:
    "SB Launcher 3.0 — Liquid Glass\n\n- New 3D volumetric icons with dynamic accent colors\n- Layout & positioning: sidebar, topbar, content alignment, card gap, columns — fully animated\n- Scroll & overscroll: sticky topbar gap fix, overscroll modes, scroll animations (fade/slide/scale/parallax)\n- Visuals & Settings now accordion — each group opens separately, no clutter\n- Glass unified to topbar beauty & instant scroll reset\n- Theme presets with avatars, names, reorder, delete — saved in same grid\n- Bubble reverted to previous liquid glass (48% + spring 540) per 3.0 rollback\n- Custom wallpapers removed (bundled only)",
  title: "SB Launcher 3.0",
  publishedAt: "2026-09-04T23:40:27.000Z",
};

function parseSemver(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Positive if a > b, 0 if equal, negative if a < b. Invalid versions sort lowest. */
function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) {
    if (pa[i]! !== pb[i]!) return pa[i]! - pb[i]!;
  }
  return 0;
}

export function defaultCosmetics(): ProfileCosmetics {
  return {
    badge: { mode: "launcher" },
    avatar: { mode: "roblox" },
    banner: {
      mode: "off",
      fit: "cover",
      position: "center",
      blur: 0,
      opacity: 1,
      dim: 0.35,
      height: 280,
      muted: true,
      loop: true,
    },
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return cors(request, new Response(null, { status: 204 }));
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (request.method === "GET" && path === "/health") {
        return cors(request, json({ ok: true, service: "sb-launcher-cloud" }));
      }

      if (request.method === "POST" && path === "/v1/players/register") {
        return cors(request, await registerPlayer(request, env));
      }

      if (request.method === "POST" && path === "/v1/presence/heartbeat") {
        return cors(request, await presenceHeartbeat(request, env));
      }

      if (request.method === "POST" && path === "/v1/presence/batch") {
        return cors(request, await presenceBatch(request, env));
      }

      if (request.method === "GET" && path === "/v1/players/count") {
        return cors(request, await playerCount(env));
      }

      if (request.method === "PUT" && path === "/v1/players/me/cosmetics") {
        return cors(request, await putCosmetics(request, env));
      }

      if (request.method === "PUT" && path === "/v1/players/me/favorites") {
        return cors(request, await putFavorites(request, env));
      }

      if (request.method === "POST" && path === "/v1/players/batch") {
        return cors(request, await playersBatch(request, env));
      }

      if (request.method === "POST" && path === "/v1/media") {
        return cors(request, await uploadMedia(request, env));
      }

      const mediaMatch = path.match(/^\/v1\/media\/(\d+)\/([a-zA-Z0-9_-]+)$/);
      if (request.method === "GET" && mediaMatch) {
        return cors(request, await getMedia(mediaMatch[1], mediaMatch[2], env));
      }

      const playerMatch = path.match(/^\/v1\/players\/(\d+)$/);
      if (request.method === "GET" && playerMatch) {
        return cors(request, await getPlayer(playerMatch[1], env));
      }

      if (path === "/v1/update") {
        if (request.method === "GET") {
          return cors(request, await getUpdate(env));
        }
        if (request.method === "PUT") {
          return cors(request, await putUpdate(request, env));
        }
      }

      return cors(request, json({ error: "Not found" }, 404));
    } catch {
      return cors(request, json({ error: "Internal error" }, 500));
    }
  },
} satisfies ExportedHandler<Env>;

async function registerPlayer(request: Request, env: Env): Promise<Response> {
  const identity = await requireRobloxIdentity(request, env);
  if (identity instanceof Response) return identity;

  const key = PLAYER_PREFIX + identity.id;
  const existing = (await env.PLAYERS.get(key, "json")) as PlayerRecord | null;
  const now = new Date().toISOString();
  const record: PlayerRecord = {
    id: identity.id,
    registeredAt: existing?.registeredAt ?? now,
    username: identity.username,
    displayName: identity.displayName,
    cosmetics: existing?.cosmetics ?? defaultCosmetics(),
    favoriteGames: existing?.favoriteGames ?? [],
  };

  await env.PLAYERS.put(key, JSON.stringify(record));

  if (!existing) {
    const current = Number((await env.META.get(COUNT_KEY)) ?? "0");
    await env.META.put(COUNT_KEY, String(Number.isFinite(current) ? current + 1 : 1));
  }

  return json({ ok: true, player: publicPlayer(record), created: !existing });
}

async function presenceHeartbeat(request: Request, env: Env): Promise<Response> {
  const identity = await requireRobloxIdentity(request, env);
  if (identity instanceof Response) return identity;

  let robloxOpen = false;
  try {
    const body = (await request.json()) as { robloxOpen?: unknown };
    robloxOpen = body?.robloxOpen === true;
  } catch {
    // empty body is fine
  }

  const now = Date.now();
  await env.META.put(
    PRESENCE_PREFIX + identity.id,
    JSON.stringify({
      userId: identity.id,
      at: now,
      robloxOpen,
    }),
    { expirationTtl: PRESENCE_TTL_SECONDS },
  );

  // Keep registry fresh so friends can resolve launcher users.
  const key = PLAYER_PREFIX + identity.id;
  const existing = (await env.PLAYERS.get(key, "json")) as PlayerRecord | null;
  if (!existing) {
    await env.PLAYERS.put(
      key,
      JSON.stringify({
        id: identity.id,
        registeredAt: new Date(now).toISOString(),
        username: identity.username,
        displayName: identity.displayName,
        cosmetics: defaultCosmetics(),
      } satisfies PlayerRecord),
    );
    const current = Number((await env.META.get(COUNT_KEY)) ?? "0");
    await env.META.put(COUNT_KEY, String(Number.isFinite(current) ? current + 1 : 1));
  }

  return json({ ok: true, ttlSeconds: PRESENCE_TTL_SECONDS });
}

async function presenceBatch(request: Request, env: Env): Promise<Response> {
  const identity = await requireRobloxIdentity(request, env);
  if (identity instanceof Response) return identity;

  let userIds: string[] = [];
  try {
    const body = (await request.json()) as { userIds?: unknown };
    if (Array.isArray(body.userIds)) {
      userIds = body.userIds
        .map((id) => String(id ?? "").trim())
        .filter((id) => /^\d+$/.test(id))
        .slice(0, PRESENCE_BATCH_MAX);
    }
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const now = Date.now();
  const online: Record<
    string,
    { online: boolean; robloxOpen: boolean; ageMs: number }
  > = {};

  await Promise.all(
    userIds.map(async (userId) => {
      const raw = (await env.META.get(PRESENCE_PREFIX + userId, "json")) as {
        at?: number;
        robloxOpen?: boolean;
      } | null;
      if (!raw || typeof raw.at !== "number") {
        online[userId] = { online: false, robloxOpen: false, ageMs: -1 };
        return;
      }
      const ageMs = now - raw.at;
      const isOnline = ageMs >= 0 && ageMs <= PRESENCE_TTL_SECONDS * 1000;
      online[userId] = {
        online: isOnline,
        robloxOpen: isOnline && raw.robloxOpen === true,
        ageMs,
      };
    }),
  );

  return json({ ok: true, online, viewerId: identity.id });
}

async function getPlayer(userId: string, env: Env): Promise<Response> {
  const raw = (await env.PLAYERS.get(PLAYER_PREFIX + userId, "json")) as PlayerRecord | null;
  if (!raw || typeof raw !== "object") {
    return json({ registered: false });
  }
  return json({
    registered: true,
    ...publicPlayer(raw),
  });
}

async function putCosmetics(request: Request, env: Env): Promise<Response> {
  const identity = await requireRobloxIdentity(request, env);
  if (identity instanceof Response) return identity;

  const body = (await request.json()) as Partial<ProfileCosmetics>;
  const key = PLAYER_PREFIX + identity.id;
  const existing = (await env.PLAYERS.get(key, "json")) as PlayerRecord | null;
  const base = existing ?? {
    id: identity.id,
    registeredAt: new Date().toISOString(),
    username: identity.username,
    displayName: identity.displayName,
  };

  if (!existing) {
    const current = Number((await env.META.get(COUNT_KEY)) ?? "0");
    await env.META.put(COUNT_KEY, String(Number.isFinite(current) ? current + 1 : 1));
  }

  const cosmetics = mergeCosmetics(base.cosmetics ?? defaultCosmetics(), body);
  const record: PlayerRecord = {
    ...base,
    username: identity.username ?? base.username,
    displayName: identity.displayName ?? base.displayName,
    cosmetics,
  };
  await env.PLAYERS.put(key, JSON.stringify(record));
  return json({ ok: true, cosmetics });
}

async function uploadMedia(request: Request, env: Env): Promise<Response> {
  const identity = await requireRobloxIdentity(request, env);
  if (identity instanceof Response) return identity;

  const limited = await enforceRateLimit(
    env,
    `media:${identity.id}`,
    MAX_MEDIA_UPLOADS_PER_HOUR,
    3600,
  );
  if (limited) return limited;

  const declared = (request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_MEDIA_BYTES) {
    return json(
      {
        error: `File too large (max ${Math.floor(MAX_MEDIA_BYTES / 1_000_000)} MB). Use a smaller file or paste a direct media URL.`,
      },
      413,
    );
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) {
    return json({ error: "Empty upload" }, 400);
  }
  if (bytes.byteLength > MAX_MEDIA_BYTES) {
    return json(
      {
        error: `File too large (max ${Math.floor(MAX_MEDIA_BYTES / 1_000_000)} MB). Use a smaller file or paste a direct media URL.`,
      },
      413,
    );
  }

  const detected = detectMediaContentType(bytes);
  if (!detected) {
    return json({ error: "Unrecognized file. Use png/jpeg/webp/gif/mp4/webm." }, 400);
  }
  if (declared && declared !== detected) {
    // Ignore attacker-supplied type; keep detected.
  }

  const indexKey = MEDIA_INDEX_PREFIX + identity.id;
  const index = ((await env.PLAYERS.get(indexKey, "json")) as string[] | null) ?? [];
  if (index.length >= MAX_MEDIA_PER_USER) {
    return json(
      { error: `Media quota exceeded (max ${MAX_MEDIA_PER_USER} files per account).` },
      429,
    );
  }

  const id = crypto.randomUUID().replace(/-/g, "");
  const key = `${MEDIA_PREFIX}${identity.id}:${id}`;
  await env.PLAYERS.put(key, bytes, {
    metadata: { contentType: detected, userId: identity.id },
  });
  index.push(id);
  await env.PLAYERS.put(indexKey, JSON.stringify(index));

  const url = new URL(request.url);
  const publicUrl = `${url.origin}/v1/media/${identity.id}/${id}`;
  return json({ ok: true, id, url: publicUrl, contentType: detected, bytes: bytes.byteLength });
}

async function getMedia(userId: string, id: string, env: Env): Promise<Response> {
  if (!/^\d+$/.test(userId) || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return json({ error: "Not found" }, 404);
  }
  const key = `${MEDIA_PREFIX}${userId}:${id}`;
  const object = await env.PLAYERS.getWithMetadata<ArrayBuffer>(key, "arrayBuffer");
  if (!object.value) {
    return json({ error: "Not found" }, 404);
  }
  const contentType =
    (object.metadata as { contentType?: string } | null)?.contentType ??
    "application/octet-stream";
  return new Response(object.value, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}

async function playerCount(env: Env): Promise<Response> {
  const count = Number((await env.META.get(COUNT_KEY)) ?? "0");
  return json({ count: Number.isFinite(count) ? count : 0 });
}

async function getUpdate(env: Env): Promise<Response> {
  let fromKv: UpdateManifest | null = null;
  try {
    const raw = await env.META.get(UPDATE_KEY, "json");
    if (raw && typeof raw === "object") {
      const data = raw as Partial<UpdateManifest>;
      const downloadUrl =
        sanitizeDownloadUrl(typeof data.downloadUrl === "string" ? data.downloadUrl : "") ??
        sanitizeDownloadUrl(env.DEFAULT_DOWNLOAD_URL ?? "") ??
        "";
      fromKv = {
        version: typeof data.version === "string" ? data.version : "0.0.0",
        buildId: typeof data.buildId === "string" ? data.buildId : "",
        downloadUrl,
        notes: typeof data.notes === "string" ? data.notes.slice(0, UPDATE_NOTES_MAX) : "",
        title:
          typeof data.title === "string" && data.title.trim()
            ? data.title.trim().slice(0, UPDATE_TITLE_MAX)
            : undefined,
        publishedAt: typeof data.publishedAt === "string" ? data.publishedAt : "",
      };
    }
  } catch {
    // KV read failures should not block the seeded release.
  }

  const shipped: UpdateManifest = {
    ...SHIPPED_UPDATE,
    downloadUrl:
      sanitizeDownloadUrl(SHIPPED_UPDATE.downloadUrl) ??
      sanitizeDownloadUrl(env.DEFAULT_DOWNLOAD_URL ?? "") ??
      SHIPPED_UPDATE.downloadUrl,
  };

  const best =
    !fromKv || compareSemver(shipped.version, fromKv.version) >= 0 ? shipped : fromKv;
  return json(best);
}

async function putUpdate(request: Request, env: Env): Promise<Response> {
  const expected = env.UPDATE_ADMIN_TOKEN?.trim();
  if (!expected) {
    return json({ error: "UPDATE_ADMIN_TOKEN is not configured" }, 503);
  }
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!(await timingSafeEqualString(token, expected))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = (await request.json()) as Partial<UpdateManifest>;
  const version = typeof body.version === "string" ? body.version.trim() : "";
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    return json({ error: "version must look like 2.1.0" }, 400);
  }

  const rawDownload =
    (typeof body.downloadUrl === "string" && body.downloadUrl.trim()) ||
    env.DEFAULT_DOWNLOAD_URL ||
    "";
  const downloadUrl = sanitizeDownloadUrl(rawDownload);
  if (!downloadUrl) {
    return json(
      {
        error:
          "downloadUrl must be https on an allowlisted host (GitHub Pages / GitHub releases).",
      },
      400,
    );
  }

  const notes =
    typeof body.notes === "string" ? body.notes.trim().slice(0, UPDATE_NOTES_MAX) : "";
  const titleRaw = typeof body.title === "string" ? body.title.trim() : "";
  const title = titleRaw ? titleRaw.slice(0, UPDATE_TITLE_MAX) : undefined;

  const manifest: UpdateManifest = {
    version,
    buildId: typeof body.buildId === "string" ? body.buildId.trim().slice(0, 64) : "",
    downloadUrl,
    notes,
    ...(title ? { title } : {}),
    publishedAt:
      typeof body.publishedAt === "string" && body.publishedAt.trim()
        ? body.publishedAt.trim()
        : new Date().toISOString(),
  };

  try {
    await env.META.put(UPDATE_KEY, JSON.stringify(manifest));
  } catch {
    // Free-tier KV write quota exhausted: seed SHIPPED_UPDATE + redeploy instead.
    return json(
      {
        error:
          "KV write failed (quota?). Bump SHIPPED_UPDATE in the Worker and redeploy.",
      },
      503,
    );
  }
  return json({ ok: true, update: manifest });
}

function publicPlayer(record: PlayerRecord) {
  return {
    id: record.id,
    registeredAt: record.registeredAt,
    username: record.username,
    displayName: record.displayName,
    cosmetics: record.cosmetics ?? defaultCosmetics(),
    favoriteGames: Array.isArray(record.favoriteGames) ? record.favoriteGames.slice(0, 8) : [],
  };
}

async function putFavorites(request: Request, env: Env): Promise<Response> {
  const identity = await requireRobloxIdentity(request, env);
  if (identity instanceof Response) return identity;

  const body = (await request.json()) as { items?: unknown };
  const itemsRaw = Array.isArray(body.items) ? body.items : [];
  const favoriteGames: FavoriteGamePublic[] = [];
  const seen = new Set<string>();
  for (const row of itemsRaw) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const universeId = typeof item.universeId === "string" ? item.universeId.trim() : "";
    const placeId = typeof item.placeId === "string" ? item.placeId.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!universeId || !placeId || !name || seen.has(universeId)) continue;
    seen.add(universeId);
    const iconUrl =
      typeof item.iconUrl === "string" && item.iconUrl.trim()
        ? sanitizeUrl(item.iconUrl.trim())
        : null;
    favoriteGames.push({
      universeId,
      placeId,
      name: name.slice(0, 120),
      iconUrl,
    });
    if (favoriteGames.length >= 8) break;
  }

  const key = PLAYER_PREFIX + identity.id;
  const existing = (await env.PLAYERS.get(key, "json")) as PlayerRecord | null;
  const base = existing ?? {
    id: identity.id,
    registeredAt: new Date().toISOString(),
    username: identity.username,
    displayName: identity.displayName,
    cosmetics: defaultCosmetics(),
  };
  if (!existing) {
    const current = Number((await env.META.get(COUNT_KEY)) ?? "0");
    await env.META.put(COUNT_KEY, String(Number.isFinite(current) ? current + 1 : 1));
  }

  const record: PlayerRecord = {
    ...base,
    username: identity.username ?? base.username,
    displayName: identity.displayName ?? base.displayName,
    cosmetics: base.cosmetics ?? defaultCosmetics(),
    favoriteGames,
  };
  await env.PLAYERS.put(key, JSON.stringify(record));
  return json({ ok: true, favoriteGames });
}

async function playersBatch(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { userIds?: unknown };
  const rawIds = Array.isArray(body.userIds) ? body.userIds : [];
  const userIds = [
    ...new Set(
      rawIds
        .map((id) => String(id ?? "").trim())
        .filter((id) => /^\d+$/.test(id))
        .slice(0, 100),
    ),
  ];

  const players: Record<
    string,
    {
      registered: boolean;
      username?: string;
      displayName?: string;
      cosmetics?: ProfileCosmetics;
      favoriteGames?: FavoriteGamePublic[];
    }
  > = {};

  await Promise.all(
    userIds.map(async (userId) => {
      const raw = (await env.PLAYERS.get(PLAYER_PREFIX + userId, "json")) as PlayerRecord | null;
      if (!raw || typeof raw !== "object") {
        players[userId] = { registered: false };
        return;
      }
      players[userId] = {
        registered: true,
        ...publicPlayer(raw),
      };
    }),
  );

  return json({ ok: true, players });
}

function mergeCosmetics(
  current: ProfileCosmetics,
  patch: Partial<ProfileCosmetics>,
): ProfileCosmetics {
  const next = structuredClone(current);

  if (patch.badge && typeof patch.badge === "object") {
    const mode = patch.badge.mode;
    if (mode === "launcher" || mode === "custom" || mode === "off") {
      next.badge.mode = mode;
    }
    if (typeof patch.badge.customUrl === "string") {
      next.badge.customUrl = sanitizeUrl(patch.badge.customUrl) ?? undefined;
    }
    if (next.badge.mode !== "custom") delete next.badge.customUrl;
  }

  if (patch.avatar && typeof patch.avatar === "object") {
    const mode = patch.avatar.mode;
    if (mode === "roblox" || mode === "custom") {
      next.avatar.mode = mode;
    }
    if (typeof patch.avatar.customUrl === "string") {
      next.avatar.customUrl = sanitizeUrl(patch.avatar.customUrl) ?? undefined;
    }
    if (next.avatar.mode !== "custom") delete next.avatar.customUrl;
  }

  if (patch.banner && typeof patch.banner === "object") {
    const mode = patch.banner.mode;
    if (mode === "off" || mode === "image" || mode === "gif" || mode === "video" || mode === "color") {
      next.banner.mode = mode;
    }
    if (typeof patch.banner.mediaUrl === "string") {
      next.banner.mediaUrl = sanitizeUrl(patch.banner.mediaUrl) ?? undefined;
    }
    if (typeof patch.banner.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(patch.banner.color)) {
      next.banner.color = patch.banner.color;
    }
    if (patch.banner.fit === "cover" || patch.banner.fit === "contain" || patch.banner.fit === "fill") {
      next.banner.fit = patch.banner.fit;
    }
    if (
      patch.banner.position === "center" ||
      patch.banner.position === "top" ||
      patch.banner.position === "bottom" ||
      patch.banner.position === "left" ||
      patch.banner.position === "right"
    ) {
      next.banner.position = patch.banner.position;
    }
    if (typeof patch.banner.blur === "number") {
      next.banner.blur = clamp(patch.banner.blur, 0, 24);
    }
    if (typeof patch.banner.opacity === "number") {
      next.banner.opacity = clamp(patch.banner.opacity, 0.15, 1);
    }
    if (typeof patch.banner.dim === "number") {
      next.banner.dim = clamp(patch.banner.dim, 0, 0.85);
    }
    if (typeof patch.banner.height === "number") {
      next.banner.height = clamp(patch.banner.height, 160, 480);
    }
    if (typeof patch.banner.muted === "boolean") next.banner.muted = patch.banner.muted;
    if (typeof patch.banner.loop === "boolean") next.banner.loop = patch.banner.loop;
    if (next.banner.mode === "off" || next.banner.mode === "color") {
      delete next.banner.mediaUrl;
    }
  }

  return next;
}

function sanitizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host.endsWith(".sblauncher")) {
      return null;
    }
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host.endsWith(".local") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function sanitizeDownloadUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (!ALLOWED_DOWNLOAD_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

async function requireRobloxIdentity(
  request: Request,
  env: Env,
): Promise<{ id: string; username?: string; displayName?: string } | Response> {
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    return json({ error: "Missing Roblox access token" }, 401);
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const limited = await enforceRateLimit(
    env,
    `auth:${ip}`,
    MAX_AUTH_CALLS_PER_MINUTE,
    60,
  );
  if (limited) return limited;

  const identity = await resolveRobloxIdentity(token);
  if (!identity) {
    return json({ error: "Invalid Roblox access token" }, 401);
  }
  return identity;
}

async function enforceRateLimit(
  env: Env,
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<Response | null> {
  const key = `${RATE_PREFIX}${bucket}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  const current = Number((await env.META.get(key)) ?? "0");
  if (Number.isFinite(current) && current >= max) {
    return json({ error: "Too many requests. Try again later." }, 429);
  }
  await env.META.put(key, String((Number.isFinite(current) ? current : 0) + 1), {
    expirationTtl: Math.max(windowSeconds * 2, 120),
  });
  return null;
}

async function timingSafeEqualString(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.byteLength !== bb.byteLength) {
    // Still compare against self to keep work roughly constant.
    await crypto.subtle.digest("SHA-256", ab);
    return false;
  }
  let diff = 0;
  for (let i = 0; i < ab.byteLength; i++) diff |= ab[i]! ^ bb[i]!;
  return diff === 0;
}

function detectMediaContentType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x39 || bytes[4] === 0x37) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) === "RIFF" &&
    String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!) === "ftyp"
  ) {
    return "video/mp4";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }
  return null;
}

async function resolveRobloxIdentity(accessToken: string): Promise<{
  id: string;
  username?: string;
  displayName?: string;
} | null> {
  try {
    const response = await fetch("https://apis.roblox.com/oauth/v1/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      sub?: string | number;
      preferred_username?: string;
      nickname?: string;
      name?: string;
    };
    const id = String(data.sub ?? "").trim();
    if (!/^\d+$/.test(id)) return null;
    return {
      id,
      username: data.preferred_username ?? data.nickname,
      displayName: data.name ?? data.nickname ?? data.preferred_username,
    };
  } catch {
    return null;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function cors(request: Request, response: Response): Response {
  const origin = request.headers.get("Origin") ?? "";
  const headers = new Headers(response.headers);
  if (CORS_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Accept",
  );
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
