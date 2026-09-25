import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GameSummary, HomePayload } from "@sb/contracts";
import { Button, EmptyState, LoadingState } from "@sb/ui";
import { api } from "../lib/api";
import { GameRail, SurpriseCard } from "../components/GameRail";
import { HomeEvents } from "../components/HomeEvents";
import { useAppStore } from "../store";
import { useStartupHomeReady } from "../components/StartupExperience";

const homeCache = new Map<string, HomePayload>();

export function HomePage() {
  const session = useAppStore((s) => s.session);
  const cacheKey = session?.user?.id ?? "guest";
  const [home, setHome] = useState<HomePayload | null>(() => homeCache.get(cacheKey) ?? null);
  const [loading, setLoading] = useState(() => !homeCache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);
  useStartupHomeReady(!loading);
  const navigate = useNavigate();

  const loadVersion = useRef(0);
  async function loadHome() {
    const version = ++loadVersion.current;
    const cached = homeCache.get(cacheKey) ?? null;
    setHome(cached);
    setLoading(!cached);
    setError(null);
    let hasLightPayload = false;
    try {
      const light = await api.home(true);
      if (version !== loadVersion.current) return;
      setHome(light);
      homeCache.set(cacheKey, light);
      hasLightPayload = true;
      setLoading(false);
      const full = await api.home(false);
      if (version !== loadVersion.current) return;
      setHome(full);
      homeCache.set(cacheKey, full);
    } catch (err) {
      if (version !== loadVersion.current) return;
      if (!hasLightPayload) setError(err instanceof Error ? err.message : "Failed to load home");
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHome();
    return () => { loadVersion.current++; };
  }, [session?.authenticated, cacheKey]);

  async function refreshSurprise() {
    try {
      const surprise = await api.surprise();
      setHome((current) =>
        current ? { ...current, surpriseMe: surprise.game } : current,
      );
    } catch {
      // ignore
    }
  }

  async function removeFromLastPlayed(game: GameSummary) {
    if (!session?.authenticated) return;
    setHome((current) =>
      current
        ? {
            ...current,
            continuePlaying: current.continuePlaying.filter(
              (item) => item.universeId !== game.universeId,
            ),
          }
        : current,
    );
    try {
      await api.removeHistory(game.universeId);
    } catch {
      await loadHome();
    }
  }

  if (loading && !home) return <LoadingState label="Loading your home feed…" />;
  if (error || !home) return <EmptyState title="Could not load home" description={error ?? ""} />;

  return (
    <div className="home-page">
      <div className="page-header">
        <div>
          <h2>Home</h2>
          <p className="sb-muted">
            Your continue list, favorites, and personalized picks — not the full catalog.
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/discover")}>
          Browse all categories
        </Button>
      </div>

      <GameRail
        title="Last Played"
        subtitle="Games you launched in SB Launcher. Hover a card and press × to remove it."
        games={home.continuePlaying}
        onRemove={session?.authenticated ? removeFromLastPlayed : undefined}
        removeLabel="Remove from Last Played"
        showPaidAccess={false}
      />

      <GameRail title="Favorites" games={home.favorites} />
      <HomeEvents games={[...home.continuePlaying, ...home.favorites, ...home.forYou, ...home.upAndComing]} />

      <GameRail
        title="Friends Playing"
        subtitle={
          session?.authenticated
            ? "Experiences your friends are in right now."
            : "Sign in to see what friends are playing."
        }
        games={home.friendsPlaying ?? []}
      />

      <GameRail
        title="For You"
        subtitle={
          session?.authenticated
            ? "Based on games you launched in SB Launcher."
            : "Sign in and play a few games to unlock personalized picks."
        }
        games={home.forYou}
      />

      <section className="rail">
        <div className="rail-title">
          <h3>Surprise Me</h3>
          <p className="sb-muted rail-subtitle">
            Hidden gems with strong ratings, steady visits, and under 2K online.
          </p>
        </div>
        <SurpriseCard game={home.surpriseMe} onRefresh={() => void refreshSurprise()} />
      </section>

      <GameRail
        title="Up & Coming"
        subtitle="Fresh experiences gaining momentum."
        games={home.upAndComing}
      />
    </div>
  );
}
