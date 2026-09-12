import { describe, expect, it } from "vitest";
import { pageTransition } from "./lib/motion";

describe("scroll animation settings", () => {
  it("maps each configured scroll animation to a page transition", () => {
    expect(pageTransition(true, "fade").initial).toEqual({ opacity: 0 });
    expect(pageTransition(true, "slide").initial).toHaveProperty("x", 28);
    expect(pageTransition(true, "scale").initial).toHaveProperty("scale", 0.92);
    expect(pageTransition(true, "parallax").initial).toHaveProperty("y", 22);
    expect(pageTransition(true, "none")).toEqual({});
  });

  it("uses the configured duration for page transitions", () => {
    expect(pageTransition(true, "fade", 720, "easeInOut").transition).toEqual({
      duration: 0.72,
      ease: [0.42, 0, 0.58, 1],
    });
  });
});
