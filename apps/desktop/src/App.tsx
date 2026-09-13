import { useEffect, useMemo } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { themeToCssVars } from "@sb/ui";
import { normalizeTheme } from "@sb/contracts";
import { Shell } from "./components/Shell";
import { BackgroundScene } from "./components/BackgroundScene";
import { BootSplash } from "./components/BootSplash";
import { useAppStore } from "./store";
import { api } from "./lib/api";
import { HomePage } from "./pages/HomePage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { GameDetailsPage } from "./pages/GameDetailsPage";
import { FriendsPage } from "./pages/FriendsPage";
import { VisualsPage } from "./pages/VisualsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AboutPage } from "./pages/AboutPage";
import { UserProfilePage } from "./pages/UserProfilePage";
import { ActivityPage } from "./pages/ActivityPage";
import { JournalPage } from "./pages/JournalPage";
import { RoomsPage } from "./pages/RoomsPage";
import { SessionTracker } from "./lib/content";
import { CaptureTracker } from "./components/JournalCaptures";
import { PageErrorBoundary } from "./components/PageErrorBoundary";

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <div className="page-motion page-enter" key={location.pathname}>
        <PageErrorBoundary><Routes location={location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/game/:universeId" element={<GameDetailsPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/profile/:userId" element={<UserProfilePage />} />
          <Route path="/visuals" element={<VisualsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes></PageErrorBoundary>
    </div>
  );
}

export default function App() {
  const ready = useAppStore((s) => s.ready);
  const theme = useAppStore((s) => s.theme);
  const session = useAppStore((s) => s.session);
  const bootstrap = useAppStore((s) => s.bootstrap);
  const setAuthToken = useAppStore((s) => s.setAuthToken);
  const normalizedTheme = useMemo(() => normalizeTheme(theme), [theme]);
  const cssVars = useMemo(() => themeToCssVars(normalizedTheme), [normalizedTheme]);
  const activeUserId = session?.activeUserId ?? session?.user?.id ?? "guest";

  useEffect(() => {
    void bootstrap();
    const unsub = window.sbDesktop?.onAuthToken((token) => {
      void setAuthToken(token);
    });
    return () => unsub?.();
  }, [bootstrap, setAuthToken]);

  useEffect(() => {
    if (!ready || !session?.authenticated) return;
    let cancelled = false;
    const beat = async () => {
      try {
        const running = (await window.sbDesktop?.isRobloxRunning?.()) ?? false;
        await api.presenceHeartbeat(running);
      } catch {
        // ignore transient cloud/API errors
      }
    };
    void beat();
    const timer = window.setInterval(() => {
      if (!cancelled) void beat();
    }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [ready, session?.authenticated, activeUserId]);

  useEffect(() => {
    if (!ready) return;
    void window.sbDesktop?.setWindowChrome?.({
      background: normalizedTheme.background,
      text: normalizedTheme.text,
      textMuted: normalizedTheme.textMuted,
      accent: normalizedTheme.accent,
      accentSecondary: normalizedTheme.accentSecondary,
      cornerRadius: normalizedTheme.cornerRadius,
    });
  }, [
    ready,
    normalizedTheme.background,
    normalizedTheme.text,
    normalizedTheme.textMuted,
    normalizedTheme.accent,
    normalizedTheme.accentSecondary,
    normalizedTheme.cornerRadius,
  ]);

  useEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(cssVars)) {
      if (typeof value === "string" || typeof value === "number") {
        root.style.setProperty(key, String(value));
      }
    }
    root.dataset.columns = normalizedTheme.layout?.cardColumns ?? "auto";
    root.dataset.scrollAnimation = "none";
    root.dataset.reveal = "false";
  }, [cssVars, normalizedTheme]);

  if (!ready) {
    return <BootSplash theme={normalizedTheme} label="Starting SB Launcher…" />;
  }

  return (
    <div
      style={cssVars}
      className={`app-root density-${normalizedTheme.density} motion-${normalizedTheme.motionIntensity ?? "medium"} button-style-${normalizedTheme.buttonStyle ?? "gradient"} card-style-${normalizedTheme.cardStyle ?? "glass"} nav-pill-${normalizedTheme.layout?.navPillStyle ?? "glass"}`}
    >
      <BackgroundScene theme={normalizedTheme} />
      <SessionTracker />
      <CaptureTracker />
      <Shell>
        <AnimatedRoutes key={activeUserId} />
      </Shell>
    </div>
  );
}
