import { describe, expect, it } from "vitest";
import { detectCapabilities } from "./modules/roblox/client.js";
import { buildRobloxDeepLink } from "@sb/contracts";

describe("api helpers", () => {
  it("detects basic profile capability", () => {
    const caps = detectCapabilities("openid profile");
    expect(caps.profile).toBe(true);
    expect(caps.servers).toBe(true);
  });

  it("builds launch deep links", () => {
    const link = buildRobloxDeepLink({ placeId: "123", gameInstanceId: "abc" });
    expect(link).toContain("placeId=123");
    expect(link).toContain("gameInstanceId=abc");
  });
});
