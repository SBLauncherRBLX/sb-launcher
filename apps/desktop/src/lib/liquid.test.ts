import { describe, expect, it } from "vitest";
import { displacementPixels, LIQUID_DEFAULTS, sanitizeLiquid } from "./liquid";

describe("liquid settings", () => {
  it("keeps older Frosted profiles on Material controls and restores an explicit Liquid choice", () => {
    expect(sanitizeLiquid({enabled:false}).frostedLiquidControls).toBe(false);
    expect(sanitizeLiquid(JSON.parse(JSON.stringify({...LIQUID_DEFAULTS,frostedLiquidControls:true})) ).frostedLiquidControls).toBe(true);
  });
  it("rejects damaged saved settings and clamps expensive parameters", () => {
    expect(sanitizeLiquid(null)).toEqual(LIQUID_DEFAULTS);
    const value = sanitizeLiquid({refraction: Infinity, blur: -5, quality: 900, enabled: "false", controls: false});
    expect(value.refraction).toBe(LIQUID_DEFAULTS.refraction);
    expect(value.blur).toBe(0);
    expect(value.quality).toBe(1.5);
    expect(value.enabled).toBe(LIQUID_DEFAULTS.enabled);
    expect(value.controls).toBe(false);
  });
});

describe("rounded glass displacement", () => {
  it("keeps the centre neutral and bends opposite edges symmetrically", () => {
    const w=120,h=60,data=displacementPixels(w,h,25,12);
    const pixel=(x:number,y:number)=>Array.from(data.slice((y*w+x)*4,(y*w+x)*4+4));
    expect(pixel(60,30)).toEqual([128,128,128,255]);
    expect(pixel(1,30)[0]).toBeLessThan(128);
    expect(pixel(118,30)[0]).toBeGreaterThan(128);
    expect(pixel(1,30)[0]!+pixel(118,30)[0]!).toBe(256);
    expect(pixel(60,1)[1]!+pixel(60,58)[1]!).toBe(256);
    expect(pixel(0,0)).toEqual([128,128,128,255]);
  });
  it("handles small switch maps and oversized corner settings", () => {
    for(const size of [2,24,44]) {
      const data=displacementPixels(size,size,48,40);
      expect(data.length).toBe(size*size*4);
      for(let i=3;i<data.length;i+=4) expect(data[i]).toBe(255);
    }
  });
});
