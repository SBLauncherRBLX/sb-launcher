import { describe, expect, it } from "vitest";
import {
  VisualThemeSchema,
  SafeGraphicsSettingsSchema,
  buildRobloxDeepLink,
  DEFAULT_THEME,
} from "./index.js";

describe("contracts", () => {
  it("validates default theme", () => {
    expect(VisualThemeSchema.parse(DEFAULT_THEME).id).toBe("sb-midnight");
  });

  it("builds roblox deep links", () => {
    expect(
      buildRobloxDeepLink({ placeId: "123", gameInstanceId: "abc" }),
    ).toContain("placeId=123");
    expect(buildRobloxDeepLink({ userId: "99" })).toContain("userId=99");
  });

  it("fills safe optimization defaults for older preferences", () => {
    const graphics = SafeGraphicsSettingsSchema.parse({
      preferredWindowMode: "windowed",
      preferredResolution: "native",
      fpsCapHint: "60",
    });
    expect(graphics.optimizationPreset).toBe("balanced");
    expect(graphics.qualityLevel).toBe(5);
    expect(graphics.applyOnLaunch).toBe(false);
    expect(graphics.robloxFontMode).toBe("vanilla");
    expect(graphics.preferredAspectRatio).toBe("native");
    expect(graphics.disableDpiScale).toBe(false);
  });

  it("accepts custom Roblox resolution and aspect ratio", () => {
    const graphics = SafeGraphicsSettingsSchema.parse({
      preferredResolution: "1280x720",
      preferredAspectRatio: "16:9",
      disableDpiScale: true,
    });
    expect(graphics.preferredResolution).toBe("1280x720");
    expect(graphics.preferredAspectRatio).toBe("16:9");
    expect(graphics.disableDpiScale).toBe(true);
  });
});
