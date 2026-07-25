import { useEffect, useState } from "react";

const PREVIEW_TEXT = "Always better";
const CUSTOM_FAMILY = "SBRobloxPreviewFont";

type FontPreviewProps = {
  /** Custom Roblox font id from prefs (loads via native data-URL). */
  fontId?: string | null;
  /** When false/vanilla — show system UI stand-in. */
  useCustomFile?: boolean;
  label?: string;
};

export function FontPreview({
  fontId,
  useCustomFile = false,
  label = "Preview",
}: FontPreviewProps) {
  const [readyFamily, setReadyFamily] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    const previous = [...document.fonts].filter((f) => f.family === CUSTOM_FAMILY);

    async function load() {
      if (!useCustomFile || !fontId) {
        setReadyFamily(null);
        setStatus("idle");
        return;
      }

      setStatus("loading");
      setReadyFamily(null);

      try {
        const dataUrl = await window.sbDesktop?.getRobloxFontPreviewDataUrl?.(fontId);
        if (cancelled) return;
        if (!dataUrl) {
          setStatus("error");
          return;
        }

        for (const face of previous) {
          try {
            document.fonts.delete(face);
          } catch {
            /* ignore */
          }
        }

        const face = new FontFace(CUSTOM_FAMILY, `url(${dataUrl})`);
        await face.load();
        if (cancelled) return;
        document.fonts.add(face);
        setReadyFamily(`"${CUSTOM_FAMILY}", system-ui, sans-serif`);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [useCustomFile, fontId]);

  const family =
    useCustomFile && readyFamily
      ? readyFamily
      : 'system-ui, "Segoe UI", "Helvetica Neue", Arial, sans-serif';

  return (
    <div className="font-preview">
      <span className="font-preview-label">{label}</span>
      <p className="font-preview-text" style={{ fontFamily: family }}>
        {PREVIEW_TEXT}
      </p>
      {useCustomFile && status === "loading" ? (
        <span className="font-preview-status sb-muted">Loading font…</span>
      ) : null}
      {useCustomFile && status === "error" ? (
        <span className="font-preview-status sb-muted">
          Could not load preview — re-pick the font or Apply now.
        </span>
      ) : null}
      {useCustomFile && !fontId ? (
        <span className="font-preview-status sb-muted">Choose a .ttf / .otf to preview.</span>
      ) : null}
    </div>
  );
}
