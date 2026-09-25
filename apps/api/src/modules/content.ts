import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CONTENT_STORAGE_BYTES, ContentDataSchema, LibraryGameSchema, type ContentDocument, type PlaySession } from "@sb/contracts";
import { prisma } from "../lib/prisma.js";
import { requireAuth, renewAccessToken } from "./auth/service.js";
import { env } from "../config.js";

export async function ensureContentTables() {
  await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "LauncherContent" ("userId" TEXT PRIMARY KEY, "revision" INTEGER NOT NULL DEFAULT 0, "payload" TEXT NOT NULL)');
  await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "PlaySession" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "universeId" TEXT NOT NULL, "placeId" TEXT NOT NULL, "name" TEXT NOT NULL, "startedAt" REAL NOT NULL, "lastSeen" REAL NOT NULL, "seconds" REAL NOT NULL DEFAULT 0, "ended" INTEGER NOT NULL DEFAULT 0)');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PlaySession_user" ON "PlaySession" ("userId", "startedAt")');
}

export async function readContent(userId: string): Promise<ContentDocument> {
  const empty = JSON.stringify(ContentDataSchema.parse({}));
  await prisma.$executeRaw`INSERT INTO "LauncherContent" ("userId", "payload") VALUES (${userId}, ${empty}) ON CONFLICT("userId") DO NOTHING`;
  const rows = await prisma.$queryRaw<Array<{ revision: number; payload: string }>>`SELECT "revision", "payload" FROM "LauncherContent" WHERE "userId"=${userId}`;
  const row = rows[0];
  if (!row) throw new Error("Could not initialize library storage.");
  return { revision: Number(row.revision), data: ContentDataSchema.parse(JSON.parse(row.payload)) };
}

export function pulseSession(s: PlaySession, running: boolean, now: number): PlaySession {
  if (s.ended) return s;
  const gap = Math.max(0, now - s.lastSeen);
  // A suspended/crashed launcher cannot establish playtime during its absence.
  if (gap > 60_000) return { ...s, ended: true };
  if (!running && (s.seconds > 0 || now - s.startedAt > 120_000)) return { ...s, ended: true };
  return { ...s, lastSeen: now, seconds: s.seconds + (running ? Math.min(gap, 30_000) / 1000 : 0) };
}

export async function registerContentRoutes(app: FastifyInstance) {
  app.get("/api/content", async (request, reply) => {
    const auth = requireAuth(request, reply); if (!auth) return;
    return readContent(auth.user.id);
  });
  app.put("/api/content", { bodyLimit: 33 * 1024 * 1024 }, async (request, reply) => {
    const auth = requireAuth(request, reply); if (!auth) return;
    const parsed = z.object({ revision: z.number().int().nonnegative(), data: ContentDataSchema }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid library data" });
    const { revision, data } = parsed.data;
    const payload = JSON.stringify(data);
    if (Buffer.byteLength(payload) > CONTENT_STORAGE_BYTES) return reply.code(413).send({ error: "Local library and journal storage is full (32 MB including image encoding). Remove some images first." });
    await readContent(auth.user.id);
    const changed = await prisma.$executeRaw`UPDATE "LauncherContent" SET "payload"=${payload}, "revision"="revision"+1 WHERE "userId"=${auth.user.id} AND "revision"=${revision}`;
    if (!changed) return reply.code(409).send({ error: "Library changed in another window. Reload before saving." });
    return { data, revision: revision + 1 };
  });
  app.get("/api/play-sessions", async (request, reply) => {
    const auth = requireAuth(request, reply); if (!auth) return;
    const stale = Date.now() - 60_000;
    await prisma.$executeRaw`UPDATE "PlaySession" SET "ended"=1 WHERE "userId"=${auth.user.id} AND "ended"=0 AND "lastSeen"<${stale}`;
    const items = await prisma.$queryRaw<PlaySession[]>`SELECT "id","universeId","placeId","name","startedAt","lastSeen","seconds","ended" FROM "PlaySession" WHERE "userId"=${auth.user.id} ORDER BY "startedAt" DESC LIMIT 10000`;
    return { items: items.map(s => ({ ...s, ended: Boolean(s.ended) })) };
  });
  app.post("/api/play-sessions", async (request, reply) => {
    const auth = requireAuth(request, reply); if (!auth) return;
    const parsed = LibraryGameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Game identity is required." });
    const game = parsed.data, id = randomUUID(), now = Date.now();
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "PlaySession" SET "ended"=1 WHERE "userId"=${auth.user.id} AND "ended"=0`;
      await tx.$executeRaw`INSERT INTO "PlaySession" ("id","userId","universeId","placeId","name","startedAt","lastSeen") VALUES (${id},${auth.user.id},${game.universeId},${game.placeId},${game.name},${now},${now})`;
    });
    return { id };
  });
  app.post<{ Params: { id: string } }>("/api/play-sessions/:id/pulse", async (request, reply) => {
    const auth = requireAuth(request, reply); if (!auth) return;
    const body = z.object({ running: z.boolean() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid process status." });
    return prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<PlaySession[]>`SELECT * FROM "PlaySession" WHERE "id"=${request.params.id} AND "userId"=${auth.user.id}`;
      const row = rows[0];
      if (!row) return reply.code(404).send({ error: "Session not found." });
      const updated = pulseSession({ ...row, ended: Boolean(row.ended) }, body.data.running, Date.now());
      await tx.$executeRaw`UPDATE "PlaySession" SET "lastSeen"=${updated.lastSeen},"seconds"=${updated.seconds},"ended"=${updated.ended ? 1 : 0} WHERE "id"=${updated.id}`;
      return updated;
    });
  });
  // Proxy only our fixed community endpoint; OAuth tokens never reach React.
  app.post("/api/community", async (request, reply) => {
    const auth = requireAuth(request, reply); if (!auth) return;
    const body = z.object({ action: z.string().max(40), input: z.record(z.unknown()).default({}) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid community request." });
    try {
      const send=(token:string)=>fetch(`${env.SB_CLOUD_URL}/v1/community`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body.data), signal: AbortSignal.timeout(10_000) });
      let result=await send(auth.accessToken);
      if(result.status===401){
        try { result=await send(await renewAccessToken(auth.user.id,auth.accessToken)); }
        catch { return reply.code(401).send({error:"Your Roblox connection expired. Reconnect Roblox to use Rooms.",code:"ROBLOX_RECONNECT"}); }
      }
      if(result.status===401)return reply.code(401).send({error:"Roblox could not verify your connection. Reconnect Roblox to use Rooms.",code:"ROBLOX_RECONNECT"});
      if (result.status === 404 && !body.data.action.startsWith("profiles.")) return reply.code(503).send({ error: "Community service is not deployed yet. Your local library is available." });
      const payload = await result.json();
      return reply.code(result.status).send(payload);
    } catch { return reply.code(503).send({ error: "Community service is unavailable. Please try again." }); }
  });
}
