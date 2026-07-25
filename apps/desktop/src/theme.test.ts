import { describe, expect, it } from "vitest";
import {
  VisualThemeSchema,
  DEFAULT_THEME,
  normalizeTheme,
  bayesianRating,
} from "@sb/contracts";

describe("desktop theme import", () => {
  it("accepts default theme JSON", () => {
    const parsed = VisualThemeSchema.parse(JSON.parse(JSON.stringify(DEFAULT_THEME)));
    expect(parsed.id).toBe("sb-midnight");
  });

  it("migrates legacy themes without v2 fields", () => {
    const legacy = {
      ...DEFAULT_THEME,
      effects: undefined,
      backgroundMode: undefined,
      wallpaperId: undefined,
    };
    const normalized = normalizeTheme(legacy);
    expect(normalized.backgroundMode).toBe("gradient");
    expect(normalized.effects?.glow).toBe(true);
    expect(normalized.motionIntensity).toBe("high");
  });
});

describe("bayesianRating", () => {
  it("prefers high-quality games with enough votes", () => {
    expect(bayesianRating(900, 100)).toBeGreaterThan(0.85);
    expect(bayesianRating(10, 90)).toBeLessThan(0.5);
  });
});
