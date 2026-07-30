import type {
  DiscoverPayload,
  GameSummary,
  HomePayload,
  SurpriseMePayload,
} from "@sb/contracts";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8787";

let sessionToken: string | null = null;

export function setSessionToken(token: string | null) {
  sessionToken = token;
}

export function getSessionToken() {
  return sessionToken;
}

export function getApiBase() {
  return API_BASE;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (sessionToken) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ ok: boolean; demoMode: boolean; oauthConfigured: boolean }>("/health"),
  session: () => request<import("@sb/contracts").Session>("/api/session"),
  home: (light = false) =>
    request<HomePayload>(light ? "/api/home?light=1" : "/api/home"),
  discover: () => request<DiscoverPayload>("/api/discover"),
  discoverSort: (sortId: string, limit = 100) =>
    request<{ items: GameSummary[] }>(
      `/api/discover/sorts/${encodeURIComponent(sortId)}?limit=${limit}`,
    ),
  searchGames: (q: string, cursor?: string | null, limit = 40) =>
    request<{ items: GameSummary[]; nextCursor: string | null }>(
      `/api/games/search?q=${encodeURIComponent(q)}&limit=${limit}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
      }`,
    ),
  searchUsers: (q: string, cursor?: string | null, limit = 10) =>
    request<{
      items: import("@sb/contracts").UserSearchResult[];
      nextCursor: string | null;
    }>(
      `/api/users/search?q=${encodeURIComponent(q)}&limit=${limit}${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
      }`,
    ),
  games: (q?: string) =>
    request<{ items: GameSummary[]; nextCursor: string | null }>(
      `/api/games${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  forYou: () =>
    request<{ items: GameSummary[]; message?: string }>("/api/recommendations/for-you"),
  surprise: () => request<SurpriseMePayload>("/api/surprise"),
  game: (universeId: string) =>
    request<import("@sb/contracts").GameDetails>(`/api/games/${universeId}`),
  gamePlayability: (games: Array<{ universeId: string; placeId: string }>) =>
    request<{ owned: Record<string, boolean> }>("/api/games/playability", {
      method: "POST",
      body: JSON.stringify({ games }),
    }),
  gameEvents: (universeId: string) =>
    request<{ items: import("@sb/contracts").GameEvent[] }>(
      `/api/games/${universeId}/events`,
    ),
  servers: (placeId: string, cursor?: string | null) =>
    request<{ items: import("@sb/contracts").ServerInfo[]; nextCursor: string | null }>(
      `/api/games/${placeId}/servers${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  privateServersEnabled: (universeId: string) =>
    request<{ enabled: boolean }>(
      `/api/games/${encodeURIComponent(universeId)}/private-servers/enabled`,
    ),
  privateServers: (filter?: { universeId?: string; placeId?: string }) => {
    const params = new URLSearchParams();
    if (filter?.universeId) params.set("universeId", filter.universeId);
    if (filter?.placeId) params.set("placeId", filter.placeId);
    const q = params.toString();
    return request<{ items: import("@sb/contracts").SavedPrivateServer[] }>(
      `/api/private-servers${q ? `?${q}` : ""}`,
    );
  },
  savePrivateServer: (body: {
    universeId: string;
    placeId: string;
    accessCode: string;
    label?: string;
    gameName?: string | null;
    iconUrl?: string | null;
  }) =>
    request<import("@sb/contracts").SavedPrivateServer>("/api/private-servers", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  renamePrivateServer: (id: string, label: string) =>
    request<import("@sb/contracts").SavedPrivateServer>(
      `/api/private-servers/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify({ label }) },
    ),
  removePrivateServer: (id: string) =>
    request<{ ok: boolean }>(`/api/private-servers/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  launch: (body: Record<string, unknown>) =>
    request<{ deepLink: string; webUrl: string }>("/api/launch", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  friends: () =>
    request<{
      items: import("@sb/contracts").FriendPresence[];
      capabilityDenied?: boolean;
      message?: string;
    }>("/api/friends"),
  presenceHeartbeat: (robloxOpen = false) =>
    request<{ ok: boolean }>("/api/presence/heartbeat", {
      method: "POST",
      body: JSON.stringify({ robloxOpen }),
    }),
  userProfile: (userId: string) =>
    request<import("@sb/contracts").UserProfileDetails>(
      `/api/users/${encodeURIComponent(userId)}/profile`,
    ),
  favorites: () => request<{ items: Array<Record<string, unknown>> }>("/api/favorites"),
  addFavorite: (body: Record<string, unknown>) =>
    request("/api/favorites", { method: "POST", body: JSON.stringify(body) }),
  removeFavorite: (universeId: string) =>
    request(`/api/favorites/${universeId}`, { method: "DELETE" }),
  syncProfileFavorites: () =>
    request<{ ok: boolean }>("/api/profile/favorites/sync", { method: "POST" }),
  history: () => request<{ items: Array<Record<string, unknown>> }>("/api/history"),
  removeHistory: (universeId: string) =>
    request(`/api/history/${encodeURIComponent(universeId)}`, { method: "DELETE" }),
  preferences: () =>
    request<{
      theme: import("@sb/contracts").VisualTheme;
      graphics: import("@sb/contracts").SafeGraphicsSettings;
    }>("/api/preferences"),
  savePreferences: (body: {
    theme: import("@sb/contracts").VisualTheme;
    graphics: import("@sb/contracts").SafeGraphicsSettings;
  }) =>
    request("/api/preferences", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  saveLauncherBadge: (body: { mode: "launcher" | "custom" | "off"; customUrl?: string }) =>
    request<{ ok: boolean; badge: { mode: string; customUrl?: string } }>("/api/launcher-badge", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  saveProfileCosmetics: (body: Record<string, unknown>) =>
    request<{
      ok: boolean;
      cosmetics: {
        badge: { mode: "launcher" | "custom" | "off"; customUrl?: string };
        avatar: { mode: "roblox" | "custom"; customUrl?: string };
        banner: NonNullable<import("@sb/contracts").UserProfileDetails["launcherBanner"]>;
      };
    }>("/api/profile/cosmetics", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  uploadProfileMedia: (body: { contentType: string; dataBase64: string }) =>
    request<{ ok: boolean; url: string; id: string }>("/api/profile/media", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  themes: () =>
    request<{
      items: Array<{ id: string; name: string; theme: import("@sb/contracts").VisualTheme }>;
    }>("/api/themes"),
  saveTheme: (name: string, theme: import("@sb/contracts").VisualTheme) =>
    request("/api/themes", {
      method: "POST",
      body: JSON.stringify({ name, theme }),
    }),
  logout: () => request("/auth/logout", { method: "POST" }),
  accounts: () =>
    request<{ items: import("@sb/contracts").SavedAccount[] }>("/api/accounts"),
  switchAccount: (userId: string) =>
    request<import("@sb/contracts").AccountSwitchResponse>("/api/accounts/switch", {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  removeAccount: (userId: string) =>
    request<{
      ok: boolean;
      removedActive: boolean;
      accounts: import("@sb/contracts").SavedAccount[];
    }>(`/api/accounts/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  checkUpdate: () =>
    request<{
      updateAvailable: boolean;
      current: { version: string; buildId: string };
      latest: {
        version: string;
        buildId: string;
        downloadUrl: string;
        notes: string;
        title?: string;
        publishedAt: string;
      } | null;
      downloadUrl: string | null;
      notes: string | null;
      cloudConfigured: boolean;
    }>("/api/update/check"),
};

export function authStartUrl() {
  const desktopRedirect = "sblauncher://auth";
  return `${API_BASE}/auth/roblox/start?desktopRedirect=${encodeURIComponent(desktopRedirect)}`;
}
