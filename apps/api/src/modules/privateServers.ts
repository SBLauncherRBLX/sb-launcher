import type { SavedPrivateServer } from "@sb/contracts";
import { prisma } from "../lib/prisma.js";

function mapRow(row: {
  id: string;
  universeId: string;
  placeId: string;
  accessCode: string;
  label: string;
  gameName: string | null;
  iconUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SavedPrivateServer {
  return {
    id: row.id,
    universeId: row.universeId,
    placeId: row.placeId,
    accessCode: row.accessCode,
    label: row.label,
    gameName: row.gameName,
    iconUrl: row.iconUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Ensure table exists for installs that still have an older SQLite file. */
export async function ensurePrivateServerTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PrivateServer" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "universeId" TEXT NOT NULL,
      "placeId" TEXT NOT NULL,
      "accessCode" TEXT NOT NULL,
      "label" TEXT NOT NULL,
      "gameName" TEXT,
      "iconUrl" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PrivateServer_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PrivateServer_userId_placeId_accessCode_key"
    ON "PrivateServer"("userId", "placeId", "accessCode")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PrivateServer_userId_universeId_idx"
    ON "PrivateServer"("userId", "universeId")
  `);
}

export async function listPrivateServers(
  userId: string,
  filter?: { universeId?: string; placeId?: string },
): Promise<SavedPrivateServer[]> {
  const rows = await prisma.privateServer.findMany({
    where: {
      userId,
      ...(filter?.universeId ? { universeId: filter.universeId } : {}),
      ...(filter?.placeId ? { placeId: filter.placeId } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(mapRow);
}

export async function upsertPrivateServer(
  userId: string,
  input: {
    universeId: string;
    placeId: string;
    accessCode: string;
    label: string;
    gameName?: string | null;
    iconUrl?: string | null;
  },
): Promise<SavedPrivateServer> {
  const accessCode = input.accessCode.trim();
  const label = input.label.trim().slice(0, 64) || "Private server";
  const row = await prisma.privateServer.upsert({
    where: {
      userId_placeId_accessCode: {
        userId,
        placeId: input.placeId,
        accessCode,
      },
    },
    create: {
      userId,
      universeId: input.universeId,
      placeId: input.placeId,
      accessCode,
      label,
      gameName: input.gameName ?? null,
      iconUrl: input.iconUrl ?? null,
    },
    update: {
      universeId: input.universeId,
      label,
      gameName: input.gameName ?? null,
      iconUrl: input.iconUrl ?? null,
    },
  });
  return mapRow(row);
}

export async function updatePrivateServer(
  userId: string,
  id: string,
  patch: { label?: string },
): Promise<SavedPrivateServer | null> {
  const existing = await prisma.privateServer.findFirst({ where: { id, userId } });
  if (!existing) return null;
  const label = patch.label?.trim().slice(0, 64);
  if (!label) return mapRow(existing);
  const row = await prisma.privateServer.update({
    where: { id },
    data: { label },
  });
  return mapRow(row);
}

export async function deletePrivateServer(userId: string, id: string): Promise<boolean> {
  const result = await prisma.privateServer.deleteMany({ where: { id, userId } });
  return result.count > 0;
}
