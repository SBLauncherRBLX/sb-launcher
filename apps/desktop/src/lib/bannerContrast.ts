/** Relative luminance 0–1 from sRGB channel 0–255. */
function channelLin(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminanceFromRgb(r: number, g: number, b: number): number {
  return 0.2126 * channelLin(r) + 0.7152 * channelLin(g) + 0.0722 * channelLin(b);
}

export function luminanceFromCssColor(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;

  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3)
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    const n = Number.parseInt(h, 16);
    return luminanceFromRgb((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }

  const rgb = raw.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i);
  if (rgb) {
    return luminanceFromRgb(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  }

  return null;
}

function sampleCanvas(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const stepX = Math.max(1, Math.floor(w / 24));
  const stepY = Math.max(1, Math.floor(h / 16));
  let total = 0;
  let count = 0;
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y += stepY) {
    for (let x = 0; x < w; x += stepX) {
      const i = (y * w + x) * 4;
      const a = data[i + 3] ?? 0;
      if (a < 20) continue;
      total += luminanceFromRgb(data[i]!, data[i + 1]!, data[i + 2]!);
      count += 1;
    }
  }
  return count ? total / count : 0.35;
}

async function sampleBlobLuminance(blob: Blob): Promise<number | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const w = Math.min(96, bitmap.width || 96);
    const h = Math.min(64, bitmap.height || 64);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return sampleCanvas(ctx, w, h);
  } catch {
    return null;
  }
}

/**
 * Average relative luminance of an image/GIF (first frame).
 * Prefers fetch→bitmap, then native host sampling (bypasses CORS for cloud media).
 */
export async function sampleMediaLuminance(url: string): Promise<number | null> {
  if (!url) return null;

  try {
    const res = await fetch(url, { cache: "force-cache", mode: "cors" });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.type.startsWith("video/")) return null;
      const lum = await sampleBlobLuminance(blob);
      if (lum != null) return lum;
    }
  } catch {
    // CORS / network — fall through to native.
  }

  try {
    const native = await window.sbDesktop?.sampleMediaLuminance?.(url);
    if (typeof native === "number" && Number.isFinite(native)) return native;
  } catch {
    // ignore
  }

  return null;
}

export type ProfileTextTone = "light" | "dark";

/** light = white text (dark banner), dark = black text (light banner). */
export function toneFromLuminance(luminance: number, dim = 0): ProfileTextTone {
  const effective = luminance * (1 - Math.min(0.95, Math.max(0, dim)));
  return effective < 0.52 ? "light" : "dark";
}
