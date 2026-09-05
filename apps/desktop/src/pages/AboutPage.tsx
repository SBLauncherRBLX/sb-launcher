import { useCallback, useEffect, useRef, useState } from "react";
import { MAJOR_RELEASE, PATCH_NOTES } from "../lib/patchNotes";
import { APP_VERSION } from "../lib/version";
import { useAppStore } from "../store";
import { BrandModelViewer } from "../components/BrandModel";

const TRIPLE_CLICK_MS = 520;
const SLOGAN_MS = 5000;

export function AboutPage() {
  const updateStatus = useAppStore((s) => s.updateStatus);
  const updateAvailable = useAppStore((s) => s.updateAvailable);
  const setUpdateNotesOpen = useAppStore((s) => s.setUpdateNotesOpen);
  const checkUpdates = useAppStore((s) => s.checkUpdates);

  const [sloganActive, setSloganActive] = useState(false);
  const clickTimes = useRef<number[]>([]);
  const sloganTimer = useRef<number | null>(null);

  useEffect(() => {
    void checkUpdates();
  }, [checkUpdates]);

  useEffect(
    () => () => {
      if (sloganTimer.current != null) window.clearTimeout(sloganTimer.current);
    },
    [],
  );

  const showSlogan = useCallback(() => {
    setSloganActive(true);
    if (sloganTimer.current != null) window.clearTimeout(sloganTimer.current);
    sloganTimer.current = window.setTimeout(() => {
      setSloganActive(false);
      sloganTimer.current = null;
    }, SLOGAN_MS);
  }, []);

  const onBannerClick = () => {
    const now = Date.now();
    clickTimes.current = [...clickTimes.current.filter((t) => now - t < TRIPLE_CLICK_MS), now];
    if (clickTimes.current.length >= 3) {
      clickTimes.current = [];
      showSlogan();
    }
  };

  return (
    <div className="about-page">
      <section aria-label="About SB Launcher" style={{ width: "100%", display: "grid", placeItems: "center", gap: "1rem", padding: "1.25rem 0 0.5rem" }}>
        <div style={{ width: "100%", maxWidth: 520, cursor: "grab" }} onClick={onBannerClick} role="button" tabIndex={0} aria-label="SB Launcher 3D logo — drag to rotate" onKeyDown={(e) => e.key === "Enter" && onBannerClick()}>
          <BrandModelViewer />
        </div>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: "1.7rem", fontWeight: 800, letterSpacing: "-0.03em" }}>SB Launcher</h1>
          <p className="sb-muted" style={{ margin: "0.2rem 0 0", fontWeight: 600 }}>{APP_VERSION}</p>
          {sloganActive ? <p style={{ margin: "0.35rem 0 0", fontSize: "0.95rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "lowercase" }}>always better</p> : null}
        </div>
        <div className="about-version-status" style={{ position: "static", padding: 0, background: "transparent" }}>
          {updateStatus === "idle" || updateStatus === "checking" ? (
            <span className="about-version-status-text">Checking version...</span>
          ) : null}
          {updateStatus === "upToDate" ? (
            <span className="about-version-status-text">Version up to date</span>
          ) : null}
          {updateStatus === "offline" ? (
            <span className="about-version-status-text">Version check offline</span>
          ) : null}
          {updateStatus === "available" && updateAvailable ? (
            <button type="button" className="about-version-status-btn" onClick={() => setUpdateNotesOpen(true)}>
              Version update available
              {updateAvailable.version ? ` · ${updateAvailable.version}` : ""}
            </button>
          ) : null}
        </div>
      </section>

      <section className="about-patchnotes sb-card" aria-label="Patch notes">
        <header className="about-patchnotes-header">
          <h2>Patch notes</h2>
          <p className="sb-muted">Major 3.0 + last 3 updates (shipped with this build)</p>
        </header>

        <article className="about-patch-block about-patch-block--major">
          <div className="about-patch-heading">
            <span className="about-patch-badge">Major</span>
            <h3>
              {MAJOR_RELEASE.version} — {MAJOR_RELEASE.title}
            </h3>
          </div>
          <ul>
            {MAJOR_RELEASE.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <div className="about-patch-minors">
          <h3 className="about-patch-minors-title">Minor patches & updates</h3>
          {PATCH_NOTES.map((patch) => (
            <article key={patch.version} className="about-patch-block">
              <div className="about-patch-heading">
                <span className="about-patch-badge about-patch-badge--minor">
                  {patch.version}
                </span>
                <h4>{patch.title}</h4>
              </div>
              <ul>
                {patch.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <p className="about-disclaimer sb-muted">
        SB Launcher is not affiliated with, endorsed by, or sponsored by Roblox
        Corporation.
      </p>
    </div>
  );
}
