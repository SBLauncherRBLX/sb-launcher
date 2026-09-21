import { describe, expect, it } from "vitest";
import { contrastText } from "@sb/ui";
import {
  VisualThemeSchema,
  DEFAULT_THEME,
  normalizeTheme,
  bayesianRating,
} from "@sb/contracts";

describe("desktop theme import", () => {
  it("keeps filled control labels readable for dark, light and mid-tone custom accents", () => {
    expect(contrastText("#6750a4")).toBe("#ffffff");
    expect(contrastText("#eaddff")).toBe("#1d1b20");
    expect(contrastText("#777777")).toBe("#ffffff");
    expect(contrastText("#888888")).toBe("#1d1b20");
  });
  it("accepts default theme JSON", () => {
    const parsed = VisualThemeSchema.parse(JSON.parse(JSON.stringify(DEFAULT_THEME)));
    expect(parsed.id).toBe("material-you");
  });

  it("migrates legacy themes without v2 fields", () => {
    const legacy = {
      ...DEFAULT_THEME,
      effects: undefined,
      backgroundMode: undefined,
      wallpaperId: undefined,
    };
    const normalized = normalizeTheme(legacy);
    expect(normalized.backgroundMode).toBe("solid");
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
