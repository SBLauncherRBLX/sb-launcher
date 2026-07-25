import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { env } from "../config.js";
import { sanitizeMediaUrl } from "../lib/safeUrl.js";

const REMOTE_REGISTRY_URLS = [
  "https://sblauncherrblx.github.io/SB-launcher-for-Roblox/sb-users.json",
  "https://raw.githubusercontent.com/sblauncherrblx/SB-launcher-for-Roblox/main/sb-users.json",
];

export type LauncherBadgeMode = "launcher" | "custom" | "off";

export type LauncherBadge = {
  mode: LauncherBadgeMode;
  customUrl?: string;
};

type RegistryFile = {
  ids: string[];
  badges?: Record<string, LauncherBadge>;
};

let remoteCache: { ids: Set<string>; badges: Record<string, LauncherBadge>; loadedAt: number } | null =
  null;
const REMOTE_TTL_MS = 10 * 60_000;

function registryPath(): string {
  const dbUrl = env.DATABASE_URL.replace(/^file:/, "");
  const dbPath = path.isAbsolute(dbUrl)
    ? dbUrl
    : path.resolve(process.cwd(), dbUrl);
  return path.join(path.dirname(dbPath), "sb-users.json");
}

async function readLocalRegistry(): Promise<RegistryFile> {
  try {
    const raw = await fs.readFile(registryPath(), "utf8");
    const parsed = JSON.parse(raw) as RegistryFile;
    return {
      ids: (parsed.ids ?? []).map(String),
      badges: parsed.badges ?? {},
    };
  } catch {
    return { ids: [], badges: {} };
  }
}

async function writeLocalRegistry(registry: RegistryFile): Promise<void> {
  const file = registryPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const payload: RegistryFile = {
    ids: [...new Set(registry.ids.map(String))].sort((a, b) => a.localeCompare(b)),
    badges: registry.badges ?? {},
  };
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function fetchRemoteRegistry(): Promise<{
  ids: Set<string>;
  badges: Record<string, LauncherBadge>;
}> {
  const now = Date.now();
  if (remoteCache && now - remoteCache.loadedAt < REMOTE_TTL_MS) {
    return { ids: remoteCache.ids, badges: remoteCache.badges };
  }

  const ids = new Set<string>();
  const badges: Record<string, LauncherBadge> = {};
  for (const url of REMOTE_REGISTRY_URLS) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(4_000),
      });
      if (!response.ok) continue;
      const parsed = (await response.json()) as RegistryFile;
      for (const id of parsed.ids ?? []) {
        if (/^\d+$/.test(String(id))) ids.add(String(id));
      }
      for (const [id, badge] of Object.entries(parsed.badges ?? {})) {
        if (!/^\d+$/.test(id)) continue;
        badges[id] = normalizeBadge(badge);
      }
      if (ids.size > 0) break;
    } catch {
      // try next mirror
    }
  }

  remoteCache = { ids, badges, loadedAt: now };
  return { ids, badges };
}

function normalizeBadge(raw: unknown): LauncherBadge {
  if (!raw || typeof raw !== "object") return { mode: "launcher" };
  const value = raw as Partial<LauncherBadge>;
  const mode =
    value.mode === "custom" || value.mode === "off" || value.mode === "launcher"
      ? value.mode
      : "launcher";
  return {
    mode,
    customUrl:
      mode === "custom" && typeof value.customUrl === "string"
        ? sanitizeMediaUrl(value.customUrl)
        : undefined,
  };
}

/** Persist a Roblox user id as an SB Launcher registrant (local registry). */
export async function registerLauncherUser(userId: string): Promise<void> {
  if (!/^\d+$/.test(userId)) return;
  const local = await readLocalRegistry();
  if (!local.ids.includes(userId)) {
    local.ids.push(userId);
    await writeLocalRegistry(local);
  }
}

export async function setLauncherBadge(userId: string, badge: LauncherBadge): Promise<LauncherBadge> {
  if (!/^\d+$/.test(userId)) {
    throw new Error("Invalid user id");
  }
  const normalized = normalizeBadge(badge);
  const local = await readLocalRegistry();
  if (!local.ids.includes(userId)) local.ids.push(userId);
  local.badges = local.badges ?? {};
  local.badges[userId] = {
    mode: normalized.mode,
    ...(normalized.mode === "custom" && normalized.customUrl
      ? { customUrl: normalized.customUrl }
      : {}),
  };
  await writeLocalRegistry(local);
  return local.badges[userId];
}

export async function getLauncherBadge(userId: string): Promise<LauncherBadge> {
  if (!/^\d+$/.test(userId)) return { mode: "launcher" };

  const local = await readLocalRegistry();
  if (local.badges?.[userId]) return normalizeBadge(local.badges[userId]);

  const remote = await fetchRemoteRegistry();
  if (remote.badges[userId]) return normalizeBadge(remote.badges[userId]);

  return { mode: "launcher" };
}

/** True if this Roblox account has signed in through SB Launcher (local DB, local registry, or public list). */
export async function isLauncherUser(userId: string): Promise<boolean> {
  if (!/^\d+$/.test(userId)) return false;

  try {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (row) return true;
  } catch {
    // DB may be unavailable during early boot; fall through.
  }

  const local = await readLocalRegistry();
  if (local.ids.includes(userId)) return true;

  try {
    const { isPlayerRemote } = await import("./sbCloud.js");
    if (await isPlayerRemote(userId)) return true;
  } catch {
    // Cloud optional.
  }

  const remote = await fetchRemoteRegistry();
  return remote.ids.has(userId);
}
