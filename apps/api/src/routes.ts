import type { FastifyInstance } from "fastify";
import {
  DEFAULT_THEME,
  SafeGraphicsSettingsSchema,
  VisualThemeSchema,
  normalizeTheme,
  buildRobloxDeepLink,
  buildWebLaunchUrl,
} from "@sb/contracts";
import { oauthConfigured } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { detectMediaContentType, sanitizeMediaUrl } from "./lib/safeUrl.js";
import {
  checkForUpdate,
  defaultProfileCosmetics,
  fetchPlayerRemote,
  saveCosmeticsRemote,
  saveFavoritesRemote,
  uploadMediaRemote,
  type ProfileCosmetics,
} from "./modules/sbCloud.js";
import {
  authHook,
  beginOAuth,
  clearSessionCookie,
  completeOAuth,
  desktopAuthUrl,
  logout,
  requireAuth,
  setSessionCookie,
  toSessionPayload,
  SESSION_COOKIE,
} from "./modules/auth/service.js";
import {
  getGameDetails,
  getUserProfileDetails,
  listCharts,
  listFriends,
  peekCachedFriends,
  listServers,
  resolveLaunchHistoryMeta,
  searchGames,
  searchUsers,
} from "./modules/roblox/client.js";
import {
  isLauncherUser,
  getLauncherBadge,
  setLauncherBadge,
  registerLauncherUser,
} from "./modules/launcherUsers.js";
import { RobloxApiError } from "./lib/http.js";
import { listGameEvents } from "./modules/roblox/events.js";
import {
  buildDiscoverPayload,
  buildHomePayload,
} from "./modules/discovery/home.js";
import {
  listSorts,
  listSortContent,
  searchGamesPaginated,
  pickSurpriseMe,
  buildForYou,
} from "./modules/roblox/discovery.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authHook);

  app.get("/health", async () => ({
    ok: true,
    demoMode: false,
    oauthConfigured,
    name: "SB Launcher API",
    instanceToken: process.env.SB_INSTANCE_TOKEN || "",
  }));

  app.get("/api/update/check", async () => checkForUpdate());

  app.get("/auth/status", async (request) => {
    if (request.auth) {
      const { scheduleCloudRegistration } = await import("./modules/sbCloud.js");
      scheduleCloudRegistration(request.auth.user.id, request.auth.accessToken);
    }
    return toSessionPayload(request.auth ?? null);
  });

  app.get<{ Querystring: { desktopRedirect?: string } }>("/auth/roblox/start", async (request, reply) => {
    try {
      const { url } = await beginOAuth(request.query.desktopRedirect);
      return reply.redirect(url);
    } catch (err) {
      return reply.code(500).send({
        error: err instanceof Error ? err.message : "Failed to start OAuth",
        code: "OAUTH_START_FAILED",
      });
    }
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/auth/roblox/callback",
    async (request, reply) => {
      if (request.query.error) {
        return reply.code(400).send({ error: request.query.error });
      }
      const { code, state } = request.query;
      if (!code || !state) {
        return reply.code(400).send({ error: "Missing code or state" });
      }
      try {
        const result = await completeOAuth(code, state);
        setSessionCookie(reply, result.sessionToken);
        const deep = desktopAuthUrl(result.sessionToken, result.desktopRedirect);
        return reply.type("text/html").send(renderAuthSuccessPage(deep, result.user.displayName));
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : "OAuth callback failed",
        });
      }
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies?.[SESSION_COOKIE];
    await logout(token);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/api/session", async (request) => {
    if (request.auth) {
      const { scheduleCloudRegistration } = await import("./modules/sbCloud.js");
      scheduleCloudRegistration(request.auth.user.id, request.auth.accessToken);
    }
    return toSessionPayload(request.auth ?? null);
  });

  app.get<{ Querystring: { q?: string; limit?: string } }>("/api/games", async (request) => {
    const q = request.query.q?.trim() ?? "";
    const limit = Math.min(Number(request.query.limit ?? 24) || 24, 100);
    const items = q ? await searchGames(q, limit) : await listCharts(limit);
    return { items, nextCursor: null };
  });

  app.get("/api/home", async (request) => {
    const lightOnly =
      String((request.query as { light?: string })?.light ?? "") === "1" ||
      String((request.query as { light?: string })?.light ?? "") === "true";

    const history =
      request.auth?.user
        ? await prisma.historyEntry.findMany({
            where: { userId: request.auth.user.id },
            orderBy: { launchedAt: "desc" },
            take: 40,
          })
        : [];
    const favorites =
      request.auth?.user
        ? await prisma.favorite.findMany({
            where: { userId: request.auth.user.id },
            orderBy: { createdAt: "desc" },
          })
        : [];

    // Never block Home on friends network — cache only, no background steal.
    const friends =
      request.auth?.user && request.auth.capabilities.friends
        ? await peekCachedFriends(request.auth.user.id).catch(() => [])
        : [];

    return buildHomePayload({
      userId: request.auth?.user?.id ?? null,
      lightOnly,
      history: history.map((row) => ({
        universeId: row.universeId,
        placeId: row.placeId,
        name: row.name,
        iconUrl: row.iconUrl,
        launchedAt: row.launchedAt,
      })),
      favorites: favorites.map((row) => ({
        universeId: row.universeId,
        placeId: row.placeId,
        name: row.name,
        iconUrl: row.iconUrl,
      })),
      friends,
    });
  });

  app.get("/api/discover", async () => buildDiscoverPayload());

  app.get("/api/discover/sorts", async () => ({ items: await listSorts() }));

  app.get<{ Params: { sortId: string }; Querystring: { limit?: string } }>(
    "/api/discover/sorts/:sortId",
    async (request) => {
      const limit = Math.min(Number(request.query.limit ?? 100) || 100, 100);
      return {
        items: await listSortContent(request.params.sortId, limit),
      };
    },
  );

  app.get<{ Querystring: { q?: string; limit?: string; cursor?: string } }>(
    "/api/games/search",
    async (request) => {
      const q = request.query.q?.trim() ?? "";
      if (!q) return { items: [], nextCursor: null };
      const limit = Math.min(Number(request.query.limit ?? 40) || 40, 50);
      return searchGamesPaginated(q, limit, request.query.cursor ?? null);
    },
  );

  app.get<{ Querystring: { q?: string; limit?: string; cursor?: string } }>(
    "/api/users/search",
    async (request, reply) => {
      const q = request.query.q?.trim() ?? "";
      if (!q) return { items: [], nextCursor: null };
      if (q.length < 2) {
        return reply.code(400).send({ error: "Search query must be at least 2 characters." });
      }
      const limit = Math.min(Number(request.query.limit ?? 10) || 10, 100);
      try {
        return await searchUsers(q, limit, request.query.cursor ?? null);
      } catch (err) {
        if (err instanceof RobloxApiError && err.status === 429) {
          return reply.code(429).send({
            error:
              "Roblox is temporarily limiting search. Wait 5–10 seconds and try again.",
            code: "RATE_LIMITED",
          });
        }
        const message = err instanceof Error ? err.message : "User search failed";
        return reply.code(502).send({ error: message });
      }
    },
  );

  app.get("/api/recommendations/for-you", async (request, reply) => {
    if (!request.auth?.user) {
      return { items: [], message: "Sign in and play games to unlock personalized picks." };
    }
    const history = await prisma.historyEntry.findMany({
      where: { userId: request.auth.user.id },
      orderBy: { launchedAt: "desc" },
      take: 40,
    });
    const items = await buildForYou(
      history.map((row) => ({ universeId: row.universeId, launchedAt: row.launchedAt })),
      24,
    );
    return { items };
  });

  app.get("/api/surprise", async (request) => {
    const exclude =
      request.auth?.user
        ? (
            await prisma.historyEntry.findMany({
              where: { userId: request.auth.user.id },
              orderBy: { launchedAt: "desc" },
              take: 40,
              select: { universeId: true },
            })
          ).map((row) => row.universeId)
        : [];
    return pickSurpriseMe(exclude);
  });

  app.get<{ Params: { universeId: string } }>("/api/games/:universeId", async (request, reply) => {
    try {
      return await getGameDetails(request.params.universeId);
    } catch (err) {
      return reply.code(404).send({
        error: err instanceof Error ? err.message : "Game not found",
        code: "NOT_FOUND",
      });
    }
  });

  app.get<{ Params: { universeId: string } }>(
    "/api/games/:universeId/events",
    async (request) => ({
      items: await listGameEvents(request.params.universeId),
    }),
  );

  app.get<{
    Params: { placeId: string };
    Querystring: { cursor?: string; limit?: string };
  }>("/api/games/:placeId/servers", async (request) => {
    const limit = Number(request.query.limit ?? 25) || 25;
    return listServers(request.params.placeId, request.query.cursor, limit);
  });

  app.post<{
    Body: {
      placeId?: string;
      gameInstanceId?: string;
      userId?: string;
      accessCode?: string;
      universeId?: string;
      name?: string;
      iconUrl?: string | null;
    };
  }>("/api/launch", async (request, reply) => {
    const body = request.body;
    if (!body?.placeId && !body?.userId) {
      return reply.code(400).send({ error: "placeId or userId is required" });
    }
    const target = {
      placeId: body.placeId,
      gameInstanceId: body.gameInstanceId,
      userId: body.userId,
      accessCode: body.accessCode,
    };
    const deepLink = buildRobloxDeepLink(target);
    const webUrl = buildWebLaunchUrl(target);

    // Last Played: also record friend joins (often missing universeId until resolved).
    if (request.auth) {
      const meta = await resolveLaunchHistoryMeta({
        placeId: body.placeId,
        universeId: body.universeId,
        name: body.name,
        iconUrl: body.iconUrl,
        userId: body.userId,
        accessToken: request.auth.accessToken,
      });
      if (meta) {
        await prisma.historyEntry.create({
          data: {
            userId: request.auth.user.id,
            universeId: meta.universeId,
            placeId: meta.placeId,
            name: meta.name,
            iconUrl: meta.iconUrl,
          },
        });
      }
    }

    return { deepLink, webUrl };
  });

  app.get("/api/friends", async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    if (!auth.capabilities.friends) {
      return {
        items: [],
        capabilityDenied: true,
        message:
          "Friends require approved OAuth scopes (e.g. user.social:read). Open Roblox website as a fallback.",
      };
    }
    const items = await listFriends(auth.accessToken, auth.user.id, auth.capabilities);
    return { items, capabilityDenied: false };
  });

  app.post("/api/presence/heartbeat", async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    const body = (request.body ?? {}) as { robloxOpen?: unknown };
    const robloxOpen = body.robloxOpen === true;
    const { sendLauncherPresenceHeartbeat } = await import("./modules/sbCloud.js");
    const ok = await sendLauncherPresenceHeartbeat(auth.accessToken, robloxOpen);
    return { ok };
  });

  app.get<{ Params: { userId: string } }>(
    "/api/users/:userId/profile",
    async (request, reply) => {
      const userId = request.params.userId;
      if (!/^\d+$/.test(userId)) {
        return reply.code(400).send({ error: "Invalid Roblox user ID." });
      }
      const profile = await getUserProfileDetails(userId, request.auth?.accessToken);
      const remote = await fetchPlayerRemote(userId);
      const registeredViaLauncher = remote?.registered || (await isLauncherUser(userId));
      if (!registeredViaLauncher) {
        return {
          ...profile,
          registeredViaLauncher: false,
          launcherBadgeMode: "off" as const,
          launcherBadgeUrl: null,
          launcherAvatarMode: "roblox" as const,
          launcherAvatarUrl: null,
          launcherBanner: null,
          favoriteGames: [],
        };
      }

      const cosmetics = remote?.cosmetics ?? defaultProfileCosmetics();
      const localBadge = await getLauncherBadge(userId).catch(() => null);
      const badge = cosmetics.badge ?? {
        mode: localBadge?.mode ?? "launcher",
        customUrl: localBadge?.customUrl,
      };
      const safeBadgeUrl = sanitizeMediaUrl(badge.customUrl);
      const safeAvatarUrl = sanitizeMediaUrl(cosmetics.avatar?.customUrl);
      const defaultBanner = defaultProfileCosmetics().banner;
      const safeBanner = cosmetics.banner
        ? {
            ...defaultBanner,
            ...cosmetics.banner,
            // Fill missing legacy fields so viewers get the same crop as the owner editor.
            fit: cosmetics.banner.fit ?? defaultBanner.fit,
            position: cosmetics.banner.position ?? defaultBanner.position,
            blur: cosmetics.banner.blur ?? defaultBanner.blur,
            opacity: cosmetics.banner.opacity ?? defaultBanner.opacity,
            dim: cosmetics.banner.dim ?? defaultBanner.dim,
            height: cosmetics.banner.height ?? defaultBanner.height,
            muted: cosmetics.banner.muted ?? defaultBanner.muted,
            loop: cosmetics.banner.loop ?? defaultBanner.loop,
            mediaUrl: sanitizeMediaUrl(cosmetics.banner.mediaUrl) ?? null,
            color:
              typeof cosmetics.banner.color === "string" && cosmetics.banner.color.trim()
                ? cosmetics.banner.color.trim()
                : null,
          }
        : null;

      const favoriteGames = (remote?.favoriteGames ?? [])
        .filter(
          (row) =>
            row &&
            typeof row.universeId === "string" &&
            typeof row.placeId === "string" &&
            typeof row.name === "string",
        )
        .slice(0, 8)
        .map((row) => ({
          universeId: row.universeId,
          placeId: row.placeId,
          name: row.name,
          iconUrl: sanitizeMediaUrl(row.iconUrl) ?? row.iconUrl ?? null,
        }));

      return {
        ...profile,
        registeredViaLauncher: true,
        launcherBadgeMode: badge.mode,
        launcherBadgeUrl:
          badge.mode === "custom" && safeBadgeUrl ? safeBadgeUrl : null,
        launcherAvatarMode: cosmetics.avatar?.mode ?? "roblox",
        launcherAvatarUrl:
          cosmetics.avatar?.mode === "custom" && safeAvatarUrl ? safeAvatarUrl : null,
        launcherBanner: safeBanner,
        favoriteGames,
      };
    },
  );

  app.put<{ Body: Partial<ProfileCosmetics> }>("/api/profile/cosmetics", async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    await registerLauncherUser(auth.user.id);

    if (request.body?.badge) {
      const mode = request.body.badge.mode;
      if (mode === "launcher" || mode === "custom" || mode === "off") {
        await setLauncherBadge(auth.user.id, {
          mode,
          customUrl: sanitizeMediaUrl(request.body.badge.customUrl),
        }).catch(() => undefined);
      }
    }

    const body: Partial<ProfileCosmetics> = { ...(request.body ?? {}) };
    if (body.badge?.customUrl !== undefined) {
      body.badge = {
        ...body.badge,
        customUrl: sanitizeMediaUrl(body.badge.customUrl),
      };
    }
    if (body.avatar?.customUrl !== undefined) {
      body.avatar = {
        ...body.avatar,
        customUrl: sanitizeMediaUrl(body.avatar.customUrl),
      };
    }
    if (body.banner) {
      const rawMedia = body.banner.mediaUrl;
      let mediaUrl: string | null | undefined = rawMedia as string | null | undefined;
      if (rawMedia === null || rawMedia === "") {
        mediaUrl = null;
      } else if (typeof rawMedia === "string") {
        mediaUrl = sanitizeMediaUrl(rawMedia) ?? (rawMedia.startsWith("https://") ? rawMedia : null);
      }
      body.banner = {
        ...body.banner,
        mediaUrl,
      };
    }

    const saved = await saveCosmeticsRemote(auth.accessToken, body);
    if (!saved) {
      return reply.code(502).send({
        error: "Could not save profile cosmetics to cloud. Check your connection and try again.",
      });
    }
    return {
      ok: true,
      cosmetics: {
        badge: {
          mode: body.badge?.mode ?? saved.badge.mode,
          customUrl: body.badge?.customUrl ?? saved.badge.customUrl,
        },
        avatar: {
          mode: body.avatar?.mode ?? saved.avatar.mode,
          customUrl: body.avatar?.customUrl ?? saved.avatar.customUrl,
        },
        banner: {
          ...saved.banner,
          ...(body.banner ?? {}),
          mediaUrl:
            body.banner && "mediaUrl" in body.banner
              ? body.banner.mediaUrl ?? null
              : saved.banner.mediaUrl,
          color:
            body.banner && "color" in body.banner
              ? body.banner.color ?? null
              : saved.banner.color,
        },
      },
    };
  });

  app.post<{
    Body: { contentType?: string; dataBase64?: string };
  }>("/api/profile/media", async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    const dataBase64 = typeof request.body?.dataBase64 === "string" ? request.body.dataBase64 : "";
    if (!dataBase64.trim()) {
      return reply.code(400).send({ error: "dataBase64 is required." });
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(dataBase64, "base64");
    } catch {
      return reply.code(400).send({ error: "Invalid base64 payload." });
    }
    if (bytes.length === 0 || bytes.length > 3_500_000) {
      return reply.code(400).send({
        error: "File must be between 1 byte and ~3.5 MB. Use a URL for larger videos.",
      });
    }
    const detected = detectMediaContentType(bytes);
    if (!detected) {
      return reply.code(400).send({
        error: "Unrecognized file. Use png/jpeg/webp/gif/mp4/webm.",
      });
    }
    const uploaded = await uploadMediaRemote(auth.accessToken, detected, bytes);
    if (!uploaded) {
      return reply.code(502).send({
        error: "Cloud upload failed. Try a smaller file or paste a direct media URL.",
      });
    }
    return { ok: true, ...uploaded };
  });

  app.put<{
    Body: { mode?: string; customUrl?: string };
  }>("/api/launcher-badge", async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    const mode = request.body?.mode;
    if (mode !== "launcher" && mode !== "custom" && mode !== "off") {
      return reply.code(400).send({ error: "mode must be launcher, custom, or off." });
    }
    const customUrl =
      mode === "custom"
        ? sanitizeMediaUrl(
            typeof request.body?.customUrl === "string" ? request.body.customUrl : "",
          )
        : undefined;
    if (mode === "custom" && !customUrl) {
      return reply.code(400).send({
        error: "customUrl must be a public https URL for custom badge.",
      });
    }
    await registerLauncherUser(auth.user.id);
    const badge = await setLauncherBadge(auth.user.id, {
      mode,
      customUrl,
    });
    await saveCosmeticsRemote(auth.accessToken, {
      badge: {
        mode,
        customUrl,
      },
    }).catch(() => undefined);
    return { ok: true, badge };
  });

  app.get("/api/favorites", async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    const rows = await prisma.favorite.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: "desc" },
    });
    return { items: rows };
  });

  app.post<{
    Body: { universeId: string; placeId: string; name: string; iconUrl?: string | null };
  }>("/api/favorites", async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    const body = request.body;
    if (!body?.universeId || !body.placeId || !body.name) {
      return reply.code(400).send({ error: "universeId, placeId, and name are required" });
    }
    const row = await prisma.favorite.upsert({
      where: {
        userId_universeId: { userId: auth.user.id, universeId: body.universeId },
      },
      create: {
        userId: auth.user.id,
        universeId: body.universeId,
        placeId: body.placeId,
        name: body.name,
        iconUrl: body.iconUrl ?? null,
      },
      update: {
        placeId: body.placeId,
        name: body.name,
        iconUrl: body.iconUrl ?? null,
      },
    });
    void syncProfileFavorites(auth.accessToken, auth.user.id);
    return row;
  });

  app.delete<{ Params: { universeId: string } }>(
    "/api/favorites/:universeId",
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) return;
      await prisma.favorite.deleteMany({
        where: { userId: auth.user.id, universeId: request.params.universeId },
      });
      void syncProfileFavorites(auth.accessToken, auth.user.id);
      return { ok: true };
    },
  );

  app.post("/api/profile/favorites/sync", async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    const ok = await syncProfileFavorites(auth.accessToken, auth.user.id);
    return { ok };
  });

  app.get("/api/history", async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    const rows = await prisma.historyEntry.findMany({
      where: { userId: auth.user.id },
      orderBy: { launchedAt: "desc" },
      take: 40,
    });
    return { items: rows };
  });

  app.delete<{ Params: { universeId: string } }>(
    "/api/history/:universeId",
    async (request, reply) => {
      const auth = requireAuth(request, reply);
      if (!auth) return;
      await prisma.historyEntry.deleteMany({
        where: { userId: auth.user.id, universeId: request.params.universeId },
      });
      return { ok: true };
    },
  );

  app.get("/api/preferences", async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    const row = await prisma.userPreferences.findUnique({ where: { userId: auth.user.id } });
    if (!row) {
      return {
        theme: DEFAULT_THEME,
        graphics: SafeGraphicsSettingsSchema.parse({}),
      };
    }
    return {
      theme: row ? normalizeTheme(JSON.parse(row.activeThemeJson)) : DEFAULT_THEME,
      graphics: SafeGraphicsSettingsSchema.parse(row ? JSON.parse(row.graphicsJson) : {}),
    };
  });

  app.put<{
    Body: { theme?: unknown; graphics?: unknown };
  }>("/api/preferences", async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    const theme = request.body?.theme
      ? normalizeTheme(request.body.theme)
      : DEFAULT_THEME;
    const graphics = SafeGraphicsSettingsSchema.parse(request.body?.graphics ?? {});
    await prisma.userPreferences.upsert({
      where: { userId: auth.user.id },
      create: {
        userId: auth.user.id,
        activeThemeJson: JSON.stringify(theme),
        graphicsJson: JSON.stringify(graphics),
      },
      update: {
        activeThemeJson: JSON.stringify(theme),
        graphicsJson: JSON.stringify(graphics),
      },
    });
    return { theme, graphics };
  });

  app.get("/api/themes", async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    const rows = await prisma.themePreset.findMany({
      where: { userId: auth.user.id },
      orderBy: { updatedAt: "desc" },
    });
    return {
      items: rows.map((r: { id: string; name: string; payload: string; createdAt: Date; updatedAt: Date }) => ({
        id: r.id,
        name: r.name,
        theme: VisualThemeSchema.parse(JSON.parse(r.payload)),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  });

  app.post<{ Body: { name: string; theme: unknown } }>("/api/themes", async (request, reply) => {
    const auth = requireAuth(request, reply);
    if (!auth) return;
    const name = request.body?.name?.trim();
    if (!name) return reply.code(400).send({ error: "name is required" });
    const theme = normalizeTheme(request.body.theme);
    const row = await prisma.themePreset.create({
      data: {
        userId: auth.user.id,
        name,
        payload: JSON.stringify(theme),
      },
    });
    return {
      id: row.id,
      name: row.name,
      theme,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

async function syncProfileFavorites(accessToken: string, userId: string): Promise<boolean> {
  const rows = await prisma.favorite.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  return saveFavoritesRemote(
    accessToken,
    rows.map((row) => ({
      universeId: row.universeId,
      placeId: row.placeId,
      name: row.name,
      iconUrl: row.iconUrl,
    })),
  );
}

function renderAuthSuccessPage(deepLink: string, displayName: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>SB Launcher — Signed in</title>
  <style>
    body { font-family: Segoe UI, sans-serif; background:#0b0d14; color:#f4f6fb; display:grid; place-items:center; min-height:100vh; margin:0; }
    .card { background:#141825; border:1px solid #2a3348; border-radius:16px; padding:2rem; max-width:420px; text-align:center; }
    a { color:#7c5cff; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Welcome, ${escapeHtml(displayName)}</h1>
    <p>You are signed in to SB Launcher. Returning to the desktop app…</p>
    <p><a href="${escapeHtml(deepLink)}">Open SB Launcher</a></p>
  </div>
  <script>window.location.href = ${JSON.stringify(deepLink)};</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
