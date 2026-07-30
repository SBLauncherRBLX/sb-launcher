import type { FastifyReply, FastifyRequest } from "fastify";
import {
  DEFAULT_CAPABILITIES,
  type Capabilities,
  type SavedAccount,
  type Session,
  type UserProfile,
} from "@sb/contracts";
import { env, oauthConfigured } from "../../config.js";
import { encrypt, decrypt, hashToken, randomToken, sha256Base64Url } from "../../lib/crypto.js";
import { sanitizeDesktopRedirect } from "../../lib/safeUrl.js";
import { prisma } from "../../lib/prisma.js";
import { detectCapabilities, fetchUserInfo } from "../roblox/client.js";
import { fetchJson } from "../../lib/http.js";
import { promises as fs } from "node:fs";
import path from "node:path";

const SESSION_COOKIE = "sb_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export type AuthContext = {
  user: UserProfile;
  accessToken: string;
  scopes: string[];
  capabilities: Capabilities;
  sessionId: string;
};

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext | null;
  }
}

export async function createSession(userId: string): Promise<string> {
  const token = randomToken(32);
  const tokenHash = hashToken(token);
  await prisma.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return token;
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_URL.startsWith("https"),
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function resolveSession(token?: string | null): Promise<AuthContext | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: { include: { oauthGrant: true } } },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  const grant = session.user.oauthGrant;
  if (!grant) return null;
  let accessToken = decrypt(grant.accessTokenEncrypted);
  let scopes: string[] = env.ROBLOX_SCOPES.split(/\s+/);

  {
    scopes = grant.scope.split(/\s+/).filter(Boolean);
    if (grant.expiresAt.getTime() < Date.now() + 60_000 && grant.refreshTokenEncrypted) {
      try {
        const refreshed = await refreshRobloxToken(decrypt(grant.refreshTokenEncrypted));
        accessToken = refreshed.access_token;
        scopes = (refreshed.scope ?? grant.scope).split(/\s+/).filter(Boolean);
        await prisma.oAuthGrant.update({
          where: { id: grant.id },
          data: {
            accessTokenEncrypted: encrypt(refreshed.access_token),
            refreshTokenEncrypted: refreshed.refresh_token
              ? encrypt(refreshed.refresh_token)
              : grant.refreshTokenEncrypted,
            scope: refreshed.scope ?? grant.scope,
            expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
          },
        });
      } catch {
        // keep existing token; caller may get 401 from Roblox
      }
    }
  }

  return {
    sessionId: session.id,
    accessToken,
    scopes,
    capabilities: detectCapabilities(scopes.join(" ")),
    user: {
      id: session.user.id,
      username: session.user.username,
      displayName: session.user.displayName,
      avatarUrl: session.user.avatarUrl,
      profileUrl: session.user.profileUrl,
    },
  };
}

export async function authHook(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const cookie = request.cookies?.[SESSION_COOKIE];
  request.auth = await resolveSession(bearer || cookie || null);
}

export function requireAuth(request: FastifyRequest, reply: FastifyReply): AuthContext | null {
  if (!request.auth) {
    reply.code(401).send({ error: "Authentication required", code: "UNAUTHORIZED" });
    return null;
  }
  return request.auth;
}

export async function beginOAuth(desktopRedirect?: string): Promise<{ url: string; state: string }> {
  if (!oauthConfigured) {
    throw new Error(
      "Roblox OAuth is not configured. Add your approved ROBLOX_CLIENT_ID to SB Launcher settings.",
    );
  }

  const safeRedirect = sanitizeDesktopRedirect(desktopRedirect, env.DESKTOP_PROTOCOL);
  if (!safeRedirect) {
    throw new Error("Invalid desktopRedirect. Only the SB Launcher protocol is allowed.");
  }

  const state = randomToken(24);
  const codeVerifier = randomToken(48);
  const codeChallenge = sha256Base64Url(codeVerifier);
  await prisma.oAuthState.create({
    data: {
      state,
      codeVerifier,
      desktopRedirect: safeRedirect,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });

  const url = new URL("https://apis.roblox.com/oauth/v1/authorize");
  url.searchParams.set("client_id", env.ROBLOX_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.ROBLOX_REDIRECT_URI);
  url.searchParams.set("scope", env.ROBLOX_SCOPES);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return { url: url.toString(), state };
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};

async function exchangeCode(code: string, codeVerifier: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.ROBLOX_REDIRECT_URI,
    client_id: env.ROBLOX_CLIENT_ID,
    code_verifier: codeVerifier,
  });
  if (env.ROBLOX_CLIENT_SECRET) {
    body.set("client_secret", env.ROBLOX_CLIENT_SECRET);
  }
  return fetchJson<TokenResponse>("https://apis.roblox.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

async function refreshRobloxToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: env.ROBLOX_CLIENT_ID,
  });
  if (env.ROBLOX_CLIENT_SECRET) {
    body.set("client_secret", env.ROBLOX_CLIENT_SECRET);
  }
  return fetchJson<TokenResponse>("https://apis.roblox.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

export async function completeOAuth(code: string, state: string): Promise<{
  sessionToken: string;
  desktopRedirect: string | null;
  user: UserProfile;
}> {
  const oauthState = await prisma.oAuthState.findUnique({ where: { state } });
  if (!oauthState || oauthState.expiresAt.getTime() < Date.now()) {
    throw new Error("Invalid or expired OAuth state");
  }
  await prisma.oAuthState.delete({ where: { id: oauthState.id } });

  const tokens = await exchangeCode(code, oauthState.codeVerifier);
  const profile = await fetchUserInfo(tokens.access_token);
  await upsertUserGrant(profile, tokens);
  const { registerLauncherUser } = await import("../launcherUsers.js");
  await registerLauncherUser(profile.id);
  try {
    const { registerPlayerRemote } = await import("../sbCloud.js");
    await registerPlayerRemote(tokens.access_token);
  } catch {
    // Remote registry is best-effort; local login must still succeed.
  }
  const sessionToken = await createSession(profile.id);
  await writePendingAuthToken(sessionToken);
  return {
    sessionToken,
    desktopRedirect: sanitizeDesktopRedirect(
      oauthState.desktopRedirect,
      env.DESKTOP_PROTOCOL,
    ),
    user: profile,
  };
}

/** Hand session to the native host without putting the token in a browser URL. */
async function writePendingAuthToken(sessionToken: string): Promise<void> {
  try {
    const dbUrl = env.DATABASE_URL.replace(/^file:/, "");
    const dbPath = path.isAbsolute(dbUrl) ? dbUrl : path.resolve(process.cwd(), dbUrl);
    const pendingPath = path.join(path.dirname(dbPath), "pending-auth.txt");
    await fs.writeFile(pendingPath, sessionToken, { encoding: "utf8", mode: 0o600 });
  } catch (err) {
    console.warn(
      `[auth] could not write pending-auth token: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function upsertUserGrant(profile: UserProfile, tokens: TokenResponse): Promise<void> {
  await prisma.user.upsert({
    where: { id: profile.id },
    create: {
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      profileUrl: profile.profileUrl,
    },
    update: {
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      profileUrl: profile.profileUrl,
    },
  });

  await prisma.oAuthGrant.upsert({
    where: { userId: profile.id },
    create: {
      userId: profile.id,
      accessTokenEncrypted: encrypt(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      idTokenEncrypted: tokens.id_token ? encrypt(tokens.id_token) : null,
      scope: tokens.scope ?? env.ROBLOX_SCOPES,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
    update: {
      accessTokenEncrypted: encrypt(tokens.access_token),
      refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      idTokenEncrypted: tokens.id_token ? encrypt(tokens.id_token) : undefined,
      scope: tokens.scope ?? env.ROBLOX_SCOPES,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });
}

/** Users with an OAuth grant on this machine (saved launcher accounts). */
export async function listSavedAccounts(): Promise<SavedAccount[]> {
  const rows = await prisma.user.findMany({
    where: { oauthGrant: { isNot: null } },
    include: {
      oauthGrant: { select: { updatedAt: true } },
      sessions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const mapped = rows.map((row) => {
    const lastSession = row.sessions[0]?.createdAt?.getTime() ?? 0;
    const grantUpdated = row.oauthGrant?.updatedAt.getTime() ?? 0;
    const lastUsedMs = Math.max(lastSession, grantUpdated, row.updatedAt.getTime());
    return {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      profileUrl: row.profileUrl,
      lastUsedAt: new Date(lastUsedMs).toISOString(),
      _sort: lastUsedMs,
    };
  });

  mapped.sort((a, b) => b._sort - a._sort);
  return mapped.map(({ _sort: _, ...account }) => account);
}

export async function switchAccount(
  userId: string,
  previousSessionId?: string | null,
): Promise<{ sessionToken: string; auth: AuthContext }> {
  const grant = await prisma.oAuthGrant.findUnique({
    where: { userId },
    include: { user: true },
  });
  if (!grant) {
    throw new Error("Account is not saved on this PC. Sign in with Roblox to add it.");
  }

  if (previousSessionId) {
    await prisma.session.delete({ where: { id: previousSessionId } }).catch(() => undefined);
  }

  const sessionToken = await createSession(userId);
  const auth = await resolveSession(sessionToken);
  if (!auth) {
    throw new Error("Could not activate that account. Try signing in again.");
  }
  return { sessionToken, auth };
}

/**
 * Remove OAuth grant + sessions for a saved account.
 * Keeps User favorites/history so re-adding restores context.
 */
export async function removeAccount(userId: string): Promise<void> {
  const grant = await prisma.oAuthGrant.findUnique({ where: { userId } });
  if (!grant) return;

  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId } }),
    prisma.oAuthGrant.delete({ where: { userId } }),
  ]);
}

/** Clear only the active SB session; saved OAuth grants remain. */
export async function logout(sessionToken?: string | null): Promise<void> {
  if (!sessionToken) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(sessionToken) } });
}

export async function toSessionPayload(auth: AuthContext | null): Promise<Session> {
  const accounts = await listSavedAccounts().catch(() => [] as SavedAccount[]);
  if (!auth) {
    return {
      authenticated: false,
      user: null,
      capabilities: DEFAULT_CAPABILITIES,
      scopes: [],
      accounts,
      activeUserId: null,
    };
  }
  return {
    authenticated: true,
    user: auth.user,
    capabilities: auth.capabilities,
    scopes: auth.scopes,
    accounts,
    activeUserId: auth.user.id,
  };
}

export function desktopAuthUrl(sessionToken: string, desktopRedirect?: string | null): string {
  // Token is delivered via pending-auth.txt next to the DB — never in the deep-link URL.
  void sessionToken;
  const safe =
    sanitizeDesktopRedirect(desktopRedirect, env.DESKTOP_PROTOCOL) ??
    `${env.DESKTOP_PROTOCOL}://auth`;
  return safe;
}

export { SESSION_COOKIE };
