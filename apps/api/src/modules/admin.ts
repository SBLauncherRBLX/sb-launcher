import { prisma } from "../lib/prisma.js";

const HARDCODED_ADMINS = new Set<string>([
  // Add your Roblox user IDs here for initial admin access
  // Example: "123456789",
]);

export async function isAdmin(userId: string): Promise<boolean> {
  if (!userId) return false;
  if (HARDCODED_ADMINS.has(userId)) return true;
  const admin = await prisma.admin.findUnique({ where: { userId } }).catch(() => null);
  return Boolean(admin);
}

export async function isBanned(userId: string): Promise<{ banned: boolean; reason?: string | null; expiresAt?: Date | null }> {
  const ban = await prisma.ban.findUnique({ where: { userId } }).catch(() => null);
  if (!ban) return { banned: false };
  if (ban.expiresAt && ban.expiresAt.getTime() < Date.now()) {
    await prisma.ban.delete({ where: { userId } }).catch(() => undefined);
    return { banned: false };
  }
  return { banned: true, reason: ban.reason, expiresAt: ban.expiresAt };
}

export async function isMuted(userId: string, roomCode?: string | null): Promise<boolean> {
  const where = roomCode ? { userId_roomCode: { userId, roomCode } } : { userId_roomCode: { userId, roomCode: null } } as any;
  // Check specific room mute and global mute
  const specific = await prisma.mute.findUnique({ where: { userId_roomCode: { userId, roomCode: roomCode ?? "" } } as any }).catch(() => null);
  if (specific) {
    if (specific.expiresAt && specific.expiresAt.getTime() < Date.now()) {
      await prisma.mute.delete({ where: { id: specific.id } }).catch(() => undefined);
    } else {
      return true;
    }
  }
  if (roomCode) {
    const global = await prisma.mute.findUnique({ where: { userId_roomCode: { userId, roomCode: "" } } as any }).catch(() => null);
    if (global) {
      if (global.expiresAt && global.expiresAt.getTime() < Date.now()) {
        await prisma.mute.delete({ where: { id: global.id } }).catch(() => undefined);
      } else {
        return true;
      }
    }
  }
  // Fallback: any mute with null roomCode is global
  const anyGlobal = await prisma.mute.findFirst({ where: { userId, roomCode: null } }).catch(() => null);
  if (anyGlobal) {
    if (anyGlobal.expiresAt && anyGlobal.expiresAt.getTime() < Date.now()) {
      await prisma.mute.delete({ where: { id: anyGlobal.id } }).catch(() => undefined);
      return false;
    }
    return true;
  }
  return false;
}
