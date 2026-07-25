import { useEffect, useRef, useState } from "react";
import type { VisualTheme } from "@sb/contracts";
import { getWallpaperUrl } from "../assets/wallpapers";
import { ParticleField } from "./ParticleField";

export function BackgroundScene({ theme }: { theme: VisualTheme }) {
  const [customWallpapers, setCustomWallpapers] = useState<Array<{ id: string; url: string }>>([]);
  const sceneRef = useRef<HTMLDivElement>(null);
  const parallaxEnabled = Boolean(theme.effects?.parallax);

  useEffect(() => {
    void window.sbDesktop?.listCustomWallpapers?.().then((items) => {
      setCustomWallpapers(items ?? []);
    });
  }, []);

  useEffect(() => {
    if (!parallaxEnabled) {
      const node = sceneRef.current;
      if (node) {
        node.style.setProperty("--sb-parallax-x", "0px");
        node.style.setProperty("--sb-parallax-y", "0px");
      }
      return;
    }

    const onMove = (event: PointerEvent) => {
      const node = sceneRef.current;
      if (!node) return;
      const x = (event.clientX / window.innerWidth - 0.5) * 18;
      const y = (event.clientY / window.innerHeight - 0.5) * 12;
      node.style.setProperty("--sb-parallax-x", `${x.toFixed(2)}px`);
      node.style.setProperty("--sb-parallax-y", `${y.toFixed(2)}px`);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [parallaxEnabled]);

  const wallpaperUrl = getWallpaperUrl(theme.wallpaperId, customWallpapers);
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
      className={`background-scene mode-${mode}${parallaxEnabled ? " parallax" : ""}`}
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
    </div>
  );
}
