import sbNebula from "./wallpapers/sb-nebula.svg?url";
import midnightGrid from "./wallpapers/midnight-grid.svg?url";
import emberWaves from "./wallpapers/ember-waves.svg?url";
import arcticBloom from "./wallpapers/arctic-bloom.svg?url";
import monoLines from "./wallpapers/mono-lines.svg?url";

export const BUNDLED_WALLPAPERS = [
  {
    id: "sb-nebula",
    name: "SB Nebula",
    url: sbNebula,
  },
  {
    id: "midnight-grid",
    name: "Midnight Grid",
    url: midnightGrid,
  },
  {
    id: "ember-waves",
    name: "Ember Waves",
    url: emberWaves,
  },
  {
    id: "arctic-bloom",
    name: "Arctic Bloom",
    url: arcticBloom,
  },
  {
    id: "mono-lines",
    name: "Mono Lines",
    url: monoLines,
  },
] as const;

export function getWallpaperUrl(wallpaperId: string | null | undefined): string | null {
  if (!wallpaperId) return null;
  const bundled = BUNDLED_WALLPAPERS.find((item) => item.id === wallpaperId);
  if (bundled) return bundled.url;
  // Custom wallpapers are stored as "custom-xxx" ids with virtual-host URLs.
  // Direct data: URLs (fallback for browser mode) are also valid.
  if (wallpaperId.startsWith("data:")) return wallpaperId;
  if (wallpaperId.startsWith("https://wallpapers.sblauncher/")) return wallpaperId;
  if (wallpaperId.startsWith("custom-")) {
    // If id already contains an extension, use it as filename; otherwise the
    // BackgroundScene will resolve via listCustomWallpapers(). This fallback
    // keeps old presets from breaking.
    if (/\.(png|jpg|jpeg|webp|bmp)$/i.test(wallpaperId)) {
      return `https://wallpapers.sblauncher/${wallpaperId}`;
    }
    return `__custom_lookup__:${wallpaperId}`;
  }
  return null;
}

export function isCustomWallpaperId(wallpaperId: string | null | undefined): boolean {
  return typeof wallpaperId === "string" && wallpaperId.startsWith("custom-");
}
