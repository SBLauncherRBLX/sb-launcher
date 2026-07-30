import { useEffect, useState } from "react";
import type { VisualTheme } from "@sb/contracts";
import { themeToCssVars, LoadingState } from "@sb/ui";
import { getWallpaperUrl } from "../assets/wallpapers";

/** Full-screen boot splash — wallpaper from theme when set, else themed color wash. */
export function BootSplash({
  theme,
  label = "Starting SB Launcher…",
}: {
  theme: VisualTheme;
  label?: string;
}) {
  const [customWallpapers, setCustomWallpapers] = useState<Array<{ id: string; url: string }>>([]);

  useEffect(() => {
    void window.sbDesktop?.listCustomWallpapers?.().then((items) => {
      setCustomWallpapers(items ?? []);
    });
  }, []);

  const wallpaperUrl = getWallpaperUrl(theme.wallpaperId, customWallpapers);
  const opacity = Math.max(theme.wallpaperOpacity ?? 0.55, wallpaperUrl ? 0.4 : 0);
  const blur = theme.wallpaperBlur ?? 0;
  const dim = theme.wallpaperDim ?? 0.45;
  const cssVars = {
    ...themeToCssVars(theme),
    ["--sb-boot-wallpaper" as string]: wallpaperUrl ? `url("${wallpaperUrl}")` : "none",
    ["--sb-wallpaper-opacity" as string]: String(opacity),
    ["--sb-wallpaper-blur" as string]: `${blur}px`,
    ["--sb-wallpaper-dim" as string]: String(dim),
  };

  return (
    <div className="app-boot-loading" style={cssVars}>
      <div className="app-boot-wallpaper" aria-hidden />
      <div className="app-boot-dim" aria-hidden />
      <div className="app-boot-glow" aria-hidden />
      <div className="app-boot-card">
        <LoadingState label={label} />
        <p className="app-boot-title">SB Launcher</p>
      </div>
    </div>
  );
}
