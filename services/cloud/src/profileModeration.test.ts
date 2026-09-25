import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { defaultCosmetics, type Env, type PlayerRecord } from "./index";

function fixture() {
  const players = new Map<string, string | Uint8Array>();
  const metadata = new Map<string, string>();
  const env = {
    ADMIN_USER_IDS: "100,101",
    PLAYERS: {
      get: async (key: string, type?: string) => {
        const value = players.get(key);
        return type === "json" && typeof value === "string" ? JSON.parse(value) : value ?? null;
      },
      put: async (key: string, value: string | Uint8Array) => { players.set(key, value); },
      delete: async (key: string) => { players.delete(key); },
    },
    META: {
      get: async (key: string) => metadata.get(key) ?? null,
      put: async (key: string, value: string) => { metadata.set(key, value); },
    },
  } as unknown as Env;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const token = String(new Headers(init?.headers).get("Authorization") ?? "").replace("Bearer ", "");
    const sub = token === "admin" ? "100" : token === "other-admin" ? "101" : "200";
    return new Response(JSON.stringify({ sub, preferred_username: `user${sub}` }), { status: 200 });
  }));
  async function call(token: string, action: string, input: Record<string, unknown>) {
    const response = await worker.fetch(new Request("https://cloud.test/v1/community", {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, input }),
    }), env);
    return { status: response.status, data: await response.json() as any };
  }
  async function put(token: string, path: string, body: unknown) {
    const response = await worker.fetch(new Request(`https://cloud.test${path}`, {
      method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    }), env);
    return { status: response.status, data: await response.json() as any };
  }
  const record: PlayerRecord = {
    id: "200", registeredAt: new Date().toISOString(), username: "user200",
    cosmetics: defaultCosmetics(),
    favoriteGames: [
      { universeId: "10", placeId: "11", name: "First" },
      { universeId: "20", placeId: "21", name: "Second" },
    ],
  };
  players.set("player:200", JSON.stringify(record));
  players.set("player:100", JSON.stringify({ id: "100", registeredAt: new Date().toISOString(), cosmetics: defaultCosmetics() }));
  return { players, record, call, put };
}

afterEach(() => vi.unstubAllGlobals());

describe("profile moderation", () => {
  it("restricts moderation to verified admins, removes owned media and records a reason", async () => {
    const { players, record, call, put } = fixture();
    const mediaUrl = "https://cloud.test/v1/media/200/photo";
    record.cosmetics!.avatar = { mode: "custom", customUrl: mediaUrl };
    players.set("player:200", JSON.stringify(record));
    players.set("media:200:photo", new Uint8Array([1, 2, 3]));
    players.set("mediaindex:200", JSON.stringify(["photo"]));
    expect((await call("user", "profiles.inspect", { userId: "200" })).status).toBe(403);
    expect((await call("user", "profiles.remove", { userId: "200", scope: "avatar", reason: "Violating photo" })).status).toBe(403);
    expect((await call("admin", "profiles.remove", { userId: "100", scope: "avatar", reason: "Violating photo" })).status).toBe(403);
    const removed = await call("admin", "profiles.remove", { userId: "200", scope: "avatar", reason: "Violating photo" });
    expect(removed.status).toBe(200);
    expect(removed.data.player.cosmetics.avatar.mode).toBe("roblox");
    expect(removed.data.locks).toContain("avatar");
    expect(removed.data.history[0]).toMatchObject({ adminId: "100", reason: "Violating photo", scope: "avatar" });
    expect(players.has("media:200:photo")).toBe(false);
    expect((await put("user", "/v1/players/me/cosmetics", { avatar: { mode: "custom", customUrl: mediaUrl } })).status).toBe(403);
    const unlocked = await call("admin", "profiles.unlock", { userId: "200", scope: "avatar", reason: "Appeal approved" });
    expect(unlocked.data.locks).not.toContain("avatar");
    expect(unlocked.data.history).toHaveLength(2);
    expect((await put("user", "/v1/players/me/cosmetics", { avatar: { mode: "roblox" } })).status).toBe(200);
  });

  it("blocks republishing a removed favorite without affecting other games", async () => {
    const { call, put } = fixture();
    expect((await call("admin", "profiles.remove", { userId: "200", scope: "game:10", reason: "Inappropriate game" })).data.player.favoriteGames.map((game: any) => game.universeId)).toEqual(["20"]);
    expect((await put("user", "/v1/players/me/favorites", { items: [{ universeId: "10", placeId: "11", name: "First" }] })).status).toBe(403);
    expect((await put("user", "/v1/players/me/favorites", { items: [{ universeId: "20", placeId: "21", name: "Second" }] })).status).toBe(200);
    expect((await call("other-admin", "profiles.inspect", { userId: "200" })).data.locks).toContain("game:10");
  });
});
