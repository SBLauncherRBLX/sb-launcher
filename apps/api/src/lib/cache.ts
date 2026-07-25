import { prisma } from "./prisma.js";

type MemoryEntry = { value: unknown; expiresAt: number };
const memory = new Map<string, MemoryEntry>();
const MEMORY_MAX = 1200;

function memoryGet<T>(key: string): T | null {
  const row = memory.get(key);
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  return row.value as T;
}

function memorySet(key: string, value: unknown, ttlMs: number): void {
  if (memory.size >= MEMORY_MAX) {
    const first = memory.keys().next().value;
    if (first) memory.delete(first);
  }
  memory.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const hot = memoryGet<T>(key);
  if (hot !== null) return hot;

  const row = await prisma.cacheEntry.findUnique({ where: { key } });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.cacheEntry.delete({ where: { key } }).catch(() => undefined);
    return null;
  }
  const parsed = JSON.parse(row.value) as T;
  const remaining = Math.max(1_000, row.expiresAt.getTime() - Date.now());
  memorySet(key, parsed, Math.min(remaining, 120_000));
  return parsed;
}

export async function cacheSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs);
  const payload = JSON.stringify(value);
  memorySet(key, value, ttlMs);
  // Persist off the request path so responses aren't blocked on SQLite upserts.
  void prisma.cacheEntry
    .upsert({
      where: { key },
      create: { key, value: payload, expiresAt },
      update: { value: payload, expiresAt },
    })
    .catch(() => undefined);
}

export async function invalidateCachesOnUpgrade(): Promise<void> {
  memory.clear();
  await prisma.cacheEntry.deleteMany({
    where: {
      OR: [
        { key: { startsWith: "user-search:" } },
        { key: { startsWith: "thumbs:" } },
        { key: { startsWith: "game-search:" } },
        { key: { startsWith: "discover:" } },
        { key: { startsWith: "home:" } },
        { key: { startsWith: "for-you:" } },
        { key: { startsWith: "friends-presence:" } },
      ],
    },
  });
}
