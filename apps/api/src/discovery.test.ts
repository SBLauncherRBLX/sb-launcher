import { describe, expect, it } from "vitest";
import { bayesianRating } from "@sb/contracts";

describe("surprise filter helpers", () => {
  it("accepts strong-rated candidates", () => {
    const rating = bayesianRating(900, 100);
    expect(rating).toBeGreaterThanOrEqual(0.85);
  });

  it("rejects weak-rated candidates", () => {
    const rating = bayesianRating(200, 800);
    expect(rating).toBeLessThan(0.85);
  });
});
