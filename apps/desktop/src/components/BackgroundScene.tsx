import { useEffect, useMemo, useRef, useState } from "react";
import type { VisualTheme } from "@sb/contracts";
import { getWallpaperUrl } from "../assets/wallpapers";
import { ParticleField } from "./ParticleField";
import { SymbolField } from "./SymbolField";

type CustomWallpaperEntry = { id: string; url: string };

export function BackgroundScene({ theme }: { theme: VisualTheme }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [customMap, setCustomMap] = useState<Map<string, string>>(new Map());
  const wallpaperId = theme.wallpaperId ?? null;

  // Load custom wallpaper file map once + whenever the selected id changes.
  // This makes "custom-xxx" ids resolve to their real file URL with extension.
  useEffect(() => {
    let cancelled = false;
    if (!wallpaperId || !wallpaperId.startsWith("custom-")) return;
    const api = window.sbDesktop?.listCustomWallpapers;
    if (!api) return;
    void api()
      .then((list: CustomWallpaperEntry[]) => {
        if (cancelled) return;
        setCustomMap(new Map(list.map((w) => [w.id, w.url])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [wallpaperId]);

  // Parallax on cursor removed per user request — keep background static.
  useEffect(() => {
    const node = sceneRef.current;
    if (node) {
      node.style.setProperty("--sb-parallax-x", "0px");
      node.style.setProperty("--sb-parallax-y", "0px");
    }
  }, []);

  const rawUrl = getWallpaperUrl(wallpaperId);
  const wallpaperUrl = useMemo(() => {
    if (!rawUrl) return null;
    if (rawUrl.startsWith("__custom_lookup__:")) {
      const id = rawUrl.slice("__custom_lookup__:".length);
      // Exact file URL from the wallpapers folder (with correct extension)
      if (customMap.has(id)) return customMap.get(id)!;
      // Fallback: id may already be a filename with extension stored as wallpaperId
      if (id.includes(".")) return `https://wallpapers.sblauncher/${id}`;
      // Last resort — try common extensions; the virtual host will 404 if wrong,
      // but at least we don't show a broken gradient with 0 opacity.
      return null;
    }
    return rawUrl;
  }, [rawUrl, customMap]);
  const mode = theme.backgroundMode ?? "gradient";
  const showWallpaper = Boolean(wallpaperUrl) && (mode === "image" || mode === "layered");
  const style = {
    ["--sb-wallpaper-opacity" as string]: String(
      mode === "image"
        ? Math.max(theme.wallpaperOpacity ?? 0.55, 0.45)
        : Math.max(theme.wallpaperOpacity ?? 0.35, showWallpaper ? 0.28 : 0),
    ),
    ["--sb-wallpaper-blur" as string]: `${theme.wallpaperBlur ?? 0}px`,
    ["--sb-wallpaper-dim" as string]: String(theme.wallpaperDim ?? 0.45),
  };

  return (
    <div
      ref={sceneRef}
      className={`background-scene mode-${mode}`}
      style={style}
      aria-hidden
    >
      {showWallpaper && wallpaperUrl ? (
        <div className="background-wallpaper" style={{ backgroundImage: `url("${wallpaperUrl}")` }} />
      ) : null}
      <div className="background-gradient" />
      {showWallpaper ? <div className="background-dim" /> : null}
      {theme.effects?.glow ? <div className="background-glow" /> : null}
      {theme.effects?.noise ? <div className="background-noise" /> : null}
      {theme.effects?.vignette ? <div className="background-vignette" /> : null}
      {theme.effects?.particles ? <ParticleField theme={theme} /> : null}
      {theme.effects?.symbolField ? <SymbolField theme={theme} /> : null}
    </div>
  );
}
