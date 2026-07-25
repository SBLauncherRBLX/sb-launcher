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

export function getWallpaperUrl(
  wallpaperId: string | null | undefined,
  customWallpapers: Array<{ id: string; url: string }> = [],
): string | null {
  if (!wallpaperId) return null;
  const bundled = BUNDLED_WALLPAPERS.find((item) => item.id === wallpaperId);
  if (bundled) return bundled.url;
  const custom = customWallpapers.find((item) => item.id === wallpaperId);
  if (custom) return custom.url;
  return null;
}
