import { describe, expect, it } from "vitest";
import { createSymbolCells } from "./SymbolField";

describe("interactive symbol field", () => {
  it("keeps large-window grids bounded and all symbols inside the canvas", () => {
    for (const density of ["low", "medium", "high"] as const) {
      const cells = createSymbolCells(3840, 2160, density);
      expect(cells.length).toBeGreaterThan(1000);
      expect(cells.length).toBeLessThanOrEqual(2600);
      expect(cells.every(cell => cell.x >= 0 && cell.x < 3840 && cell.y >= 0 && cell.y < 2160 && Number.isFinite(cell.angle))).toBe(true);
    }
    expect(createSymbolCells(0, 300, "medium")).toEqual([]);
  });

  it("uses a visibly denser grid when the preview is small enough", () => {
    const low = createSymbolCells(640, 360, "low");
    const high = createSymbolCells(640, 360, "high");
    expect(high.length).toBeGreaterThan(low.length * 2);
  });
});
