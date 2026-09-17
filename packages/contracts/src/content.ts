import { z } from "zod";

export const CONTENT_STORAGE_BYTES = 32 * 1024 * 1024;

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const LocalImageSchema = z.string().max(1_400_000).refine(v => /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v), "Choose a PNG, JPEG or WebP image under 1 MB.");
export const ArtworkSchema = z.union([LocalImageSchema, z.string().url().refine(v => v.startsWith("https://"), "Use an HTTPS image URL.")]);
export const LibraryGameSchema = z.object({
  universeId: z.string().regex(/^\d+$/), placeId: z.string().regex(/^\d+$/), name: z.string().trim().min(1).max(150),
  iconUrl: ArtworkSchema.nullable().optional(), cover: ArtworkSchema.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  collections: z.array(id).max(30).default([]), pinned: z.boolean().default(false), later: z.boolean().default(false),
});
export type LibraryGame = z.infer<typeof LibraryGameSchema>;
export const ServerFilterSchema = z.object({
  id, name: z.string().trim().min(1).max(50), maxPing: z.number().int().min(0).max(2000),
  minFps: z.number().min(0).max(240), minFree: z.number().int().min(0).max(200),
  maxOccupancy: z.number().int().min(0).max(100), sort: z.enum(["ping", "fps", "space"]),
});
export type ServerFilter = z.infer<typeof ServerFilterSchema>;
export const ContentDataSchema = z.object({
  collections: z.array(z.object({ id, name: z.string().trim().min(1).max(60), cover: ArtworkSchema.nullable().optional() })).max(50).default([]),
  games: z.array(LibraryGameSchema).max(500).default([]),
  journal: z.array(z.object({ id, universeId: z.string().regex(/^\d+$/), title: z.string().trim().min(1).max(100), text: z.string().max(16000), createdAt: z.string().datetime(), images: z.array(LocalImageSchema).max(4).default([]) })).max(300).default([]),
  filters: z.array(ServerFilterSchema).max(30).default([]),
}).superRefine((data, ctx) => {
  for (const list of [data.collections.map(x => x.id), data.games.map(x => x.universeId), data.journal.map(x => x.id), data.filters.map(x => x.id)]) {
    if (new Set(list).size !== list.length) ctx.addIssue({ code: "custom", message: "Duplicate entries are not allowed." });
  }
});
export type ContentData = z.infer<typeof ContentDataSchema>;
export type ContentDocument = { revision: number; data: ContentData };
export type PlaySession = { id: string; universeId: string; placeId: string; name: string; startedAt: number; lastSeen: number; seconds: number; ended: boolean };
export type RoomGame = { id: string; universeId: string; placeId: string; name: string; iconUrl?: string | null; addedBy: string; votes: string[] };
export type RoomLaunchPlan = { gameInstanceId: string; universeId: string; placeId: string; name: string; iconUrl?: string | null; startedAt: number };
export type FriendRoom = { code: string; name: string; ownerId: string; createdAt: number; updatedAt: number; members: Array<{ id: string; name: string; ready: boolean }>; queue: RoomGame[]; selected: string | null; launchPlan?: RoomLaunchPlan | null };
export type WorkshopItem = { code: string; title: string; description: string; authorId: string; authorName: string; createdAt: number; theme: unknown; likes: number; liked: boolean };
export type RoomMessage = { id: string; authorId: string; authorName: string; text: string; createdAt: number };
export const ROOM_CHAT_LIMIT = 60;
export const ROOM_MESSAGE_LENGTH = 400;

/** Missing metrics fail an active threshold rather than being treated as zero. */
export function matchServers<T extends { id: string; playing: number; maxPlayers: number; ping?: number | null; fps?: number | null }>(servers: T[], filter: Omit<ServerFilter, "id" | "name">): T[] {
  const maxOcc = filter.maxOccupancy <= 0 || filter.maxOccupancy >= 100 ? 100 : filter.maxOccupancy;
  return [...new Map(servers.map(s => [s.id, s])).values()].filter(s =>
    s.maxPlayers > 0 && s.maxPlayers - s.playing >= Math.max(0, filter.minFree) &&
    s.playing / s.maxPlayers * 100 <= maxOcc &&
    (!filter.maxPing || (s.ping != null && s.ping >= 0 && s.ping <= filter.maxPing)) &&
    (!filter.minFps || (s.fps != null && s.fps >= filter.minFps))
  ).sort((a,b) => filter.sort === "fps" ? (b.fps ?? -1) - (a.fps ?? -1) : filter.sort === "space" ? (b.maxPlayers-b.playing) - (a.maxPlayers-a.playing) : (a.ping ?? Infinity) - (b.ping ?? Infinity));
}
