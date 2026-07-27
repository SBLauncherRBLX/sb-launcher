import { env } from "../config.js";
import { sanitizeDownloadUrl } from "../lib/safeUrl.js";

export type RemotePlayerLookup = {
  registered: boolean;
  registeredAt?: string;
  username?: string;
  displayName?: string;
  cosmetics?: ProfileCosmetics;
  favoriteGames?: Array<{
    universeId: string;
    placeId: string;
    name: string;
    iconUrl?: string | null;
  }>;
};

export type ProfileCosmetics = {
  badge: {
    mode: "launcher" | "custom" | "off";
    customUrl?: string;
  };
  avatar: {
    mode: "roblox" | "custom";
    customUrl?: string;
  };
  banner: {
    mode: "off" | "image" | "gif" | "video" | "color";
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

export type UpdateManifest = {
  version: string;
  buildId: string;
  downloadUrl: string;
  notes: string;
  title?: string;
  publishedAt: string;
};

const UPDATE_NOTES_MAX = 12_000;

export function defaultProfileCosmetics(): ProfileCosmetics {
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

function cloudBaseUrl(): string | null {
  const url = env.SB_CLOUD_URL.trim().replace(/\/+$/, "");
  return url || null;
}

export function isCloudConfigured(): boolean {
  return Boolean(cloudBaseUrl());
}

export async function registerPlayerRemote(accessToken: string): Promise<boolean> {
  const base = cloudBaseUrl();
  if (!base || !accessToken.trim()) return false;
  try {
    const response = await fetch(`${base}/v1/players/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[sb-cloud] register failed ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      `[sb-cloud] register error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/** Best-effort cloud upsert for already-authenticated sessions (throttled). */
const cloudRegisterAttemptAt = new Map<string, number>();
const CLOUD_REGISTER_TTL_MS = 2 * 60_000;

export function scheduleCloudRegistration(userId: string, accessToken: string): void {
  if (!userId || !accessToken.trim() || !isCloudConfigured()) return;
  const last = cloudRegisterAttemptAt.get(userId) ?? 0;
  if (Date.now() - last < CLOUD_REGISTER_TTL_MS) return;
  cloudRegisterAttemptAt.set(userId, Date.now());
  void registerPlayerRemote(accessToken).then((ok) => {
    if (!ok) cloudRegisterAttemptAt.delete(userId);
  });
}

export async function fetchPlayerRemote(userId: string): Promise<RemotePlayerLookup | null> {
  const base = cloudBaseUrl();
  if (!base || !/^\d+$/.test(userId)) return null;
  try {
    const response = await fetch(`${base}/v1/players/${encodeURIComponent(userId)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return null;
    return (await response.json()) as RemotePlayerLookup;
  } catch {
    return null;
  }
}

export async function fetchPlayersBatchRemote(
  userIds: string[],
): Promise<Record<string, RemotePlayerLookup>> {
  const base = cloudBaseUrl();
  const ids = [...new Set(userIds.filter((id) => /^\d+$/.test(id)))].slice(0, 100);
  const result: Record<string, RemotePlayerLookup> = {};
  if (!base || !ids.length) return result;

  try {
    const response = await fetch(`${base}/v1/players/batch`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userIds: ids }),
      signal: AbortSignal.timeout(3_500),
    });
    if (response.ok) {
      const data = (await response.json()) as {
        players?: Record<string, RemotePlayerLookup>;
      };
      if (data.players && typeof data.players === "object") {
        for (const [id, row] of Object.entries(data.players)) {
          result[id] = row;
        }
        return result;
      }
    }
  } catch {
    // fall through — skip slow per-user fanout on friends lists
  }

  // Cap fallback fan-out so a down cloud never stalls Friends for minutes.
  const sample = ids.slice(0, 20);
  const chunkSize = 8;
  for (let i = 0; i < sample.length; i += chunkSize) {
    const chunk = sample.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (id) => {
        const remote = await fetchPlayerRemote(id);
        if (remote) result[id] = remote;
      }),
    );
  }
  return result;
}

export async function saveFavoritesRemote(
  accessToken: string,
  items: Array<{
    universeId: string;
    placeId: string;
    name: string;
    iconUrl?: string | null;
  }>,
): Promise<boolean> {
  const base = cloudBaseUrl();
  if (!base || !accessToken.trim()) return false;
  try {
    const response = await fetch(`${base}/v1/players/me/favorites`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: items.slice(0, 8) }),
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function isPlayerRemote(userId: string): Promise<boolean> {
  const remote = await fetchPlayerRemote(userId);
  return Boolean(remote?.registered);
}

export async function saveCosmeticsRemote(
  accessToken: string,
  cosmetics: Partial<ProfileCosmetics>,
): Promise<ProfileCosmetics | null> {
  const base = cloudBaseUrl();
  if (!base || !accessToken.trim()) return null;
  try {
    const response = await fetch(`${base}/v1/players/me/cosmetics`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cosmetics),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { cosmetics?: ProfileCosmetics };
    return data.cosmetics ?? null;
  } catch {
    return null;
  }
}

export async function uploadMediaRemote(
  accessToken: string,
  contentType: string,
  bytes: Buffer,
): Promise<{ url: string; id: string } | null> {
  const base = cloudBaseUrl();
  if (!base || !accessToken.trim()) return null;
  try {
    const response = await fetch(`${base}/v1/media`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": contentType,
      },
      body: bytes,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { url?: string; id?: string };
    if (!data.url || !data.id) return null;
    return { url: data.url, id: data.id };
  } catch {
    return null;
  }
}

export async function fetchUpdateManifest(): Promise<UpdateManifest | null> {
  const base = cloudBaseUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/v1/update`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<UpdateManifest>;
    if (typeof data.version !== "string" || !data.version.trim()) return null;
    return {
      version: data.version.trim(),
      buildId: typeof data.buildId === "string" ? data.buildId.trim() : "",
      downloadUrl: sanitizeDownloadUrl(
        typeof data.downloadUrl === "string" ? data.downloadUrl.trim() : "",
      ) ?? "",
      notes:
        typeof data.notes === "string" ? data.notes.trim().slice(0, UPDATE_NOTES_MAX) : "",
      title:
        typeof data.title === "string" && data.title.trim()
          ? data.title.trim().slice(0, 120)
          : undefined,
      publishedAt: typeof data.publishedAt === "string" ? data.publishedAt.trim() : "",
    };
  } catch {
    return null;
  }
}

/** Compare dotted semver-like versions. Returns positive if a > b. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export type UpdateCheckResult = {
  updateAvailable: boolean;
  current: { version: string; buildId: string };
  latest: UpdateManifest | null;
  downloadUrl: string | null;
  notes: string | null;
  cloudConfigured: boolean;
};

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const current = {
    version: env.SB_APP_VERSION.trim() || "2.4.3",
    buildId: env.SB_BUILD_ID.trim(),
  };
  const cloudConfigured = isCloudConfigured();
  if (!cloudConfigured) {
    return {
      updateAvailable: false,
      current,
      latest: null,
      downloadUrl: null,
      notes: null,
      cloudConfigured: false,
    };
  }

  const latest = await fetchUpdateManifest();
  if (!latest) {
    return {
      updateAvailable: false,
      current,
      latest: null,
      downloadUrl: null,
      notes: null,
      cloudConfigured: true,
    };
  }

  const newerVersion = compareSemver(latest.version, current.version) > 0;
  const newerBuild =
    Boolean(latest.buildId) &&
    Boolean(current.buildId) &&
    latest.buildId !== current.buildId &&
    compareSemver(latest.version, current.version) >= 0 &&
    latest.buildId > current.buildId;

  const updateAvailable = newerVersion || newerBuild;

  return {
    updateAvailable,
    current,
    latest,
    downloadUrl: sanitizeDownloadUrl(latest.downloadUrl) || null,
    notes: latest.notes || null,
    cloudConfigured: true,
  };
}

export type LauncherPresenceHit = {
  online: boolean;
  robloxOpen: boolean;
  ageMs: number;
};

export async function sendLauncherPresenceHeartbeat(
  accessToken: string,
  robloxOpen = false,
): Promise<boolean> {
  const base = cloudBaseUrl();
  if (!base || !accessToken.trim()) return false;
  try {
    const response = await fetch(`${base}/v1/presence/heartbeat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ robloxOpen }),
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchLauncherPresenceBatch(
  accessToken: string,
  userIds: string[],
): Promise<Record<string, LauncherPresenceHit>> {
  const base = cloudBaseUrl();
  if (!base || !accessToken.trim() || userIds.length === 0) return {};
  try {
    const response = await fetch(`${base}/v1/presence/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userIds: userIds.slice(0, 100) }),
      signal: AbortSignal.timeout(1_200),
    });
    if (!response.ok) return {};
    const data = (await response.json()) as {
      online?: Record<string, LauncherPresenceHit>;
    };
    return data.online ?? {};
  } catch {
    return {};
  }
}

