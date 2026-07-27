import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { GameSummary } from "@sb/contracts";
import { GameCard, formatCount } from "./GameCard";
import { useAppStore } from "../store";
import { fadeUp, springSoft, springSnappy, useMotionEnabled } from "../lib/motion";

function RailChevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d={dir === "left" ? "M14.5 6.5 9 12l5.5 5.5" : "M9.5 6.5 15 12l-5.5 5.5"}
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GameRail({
  title,
  subtitle,
  games,
  action,
  onRemove,
  removeLabel,
}: {
  title: string;
  subtitle?: string;
  games: GameSummary[];
  action?: React.ReactNode;
  onRemove?: (game: GameSummary) => void;
  removeLabel?: string;
}) {
  const theme = useAppStore((s) => s.theme);
  const motionEnabled = useMotionEnabled(theme);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function updateScrollState() {
    const el = scrollerRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft;
    setCanScrollLeft(left > 4);
    setCanScrollRight(max > 4 && left < max - 4);
  }

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateScrollState();
    const onScroll = () => updateScrollState();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateScrollState) : null;
    ro?.observe(el);
    window.addEventListener("resize", updateScrollState);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro?.disconnect();
      window.removeEventListener("resize", updateScrollState);
    };
  }, [games.length, title]);

  function scrollBatch(direction: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    // Jump roughly one visible page of cards (Roblox-style batch scroll).
    const amount = Math.max(el.clientWidth * 0.9, 320);
    el.scrollBy({ left: direction * amount, behavior: "smooth" });
  }

  if (!games.length) return null;

  const showArrows = canScrollLeft || canScrollRight;

  return (
    <section className="rail">
      <div className="rail-title">
        <div className="rail-title-text">
          <h3>{title}</h3>
          {subtitle ? <p className="sb-muted rail-subtitle">{subtitle}</p> : null}
        </div>
        <div className="rail-controls">
          {action}
          {showArrows ? (
            <div className="rail-arrows" role="group" aria-label={`Scroll ${title}`}>
              <button
                type="button"
                className="rail-arrow"
                aria-label={`Previous ${title}`}
                disabled={!canScrollLeft}
                onClick={() => scrollBatch(-1)}
              >
                <RailChevron dir="left" />
              </button>
              <button
                type="button"
                className="rail-arrow"
                aria-label={`Next ${title}`}
                disabled={!canScrollRight}
                onClick={() => scrollBatch(1)}
              >
                <RailChevron dir="right" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="rail-scroll" ref={scrollerRef}>
        {games.map((game, index) => {
          const Card = motionEnabled ? motion.div : "div";
          const props = motionEnabled ? fadeUp(index, true) : {};
          return (
            <Card key={game.universeId} className="rail-item" {...props}>
              <GameCard
                game={game}
                compact
                onRemove={onRemove}
                removeLabel={removeLabel}
              />
            </Card>
          );
        })}
      </div>
    </section>
  );
}

export function SurpriseCard({
  game,
  reason,
  onRefresh,
}: {
  game: GameSummary | null;
  reason?: string;
  onRefresh: () => void;
}) {
  const theme = useAppStore((s) => s.theme);
  const motionEnabled = useMotionEnabled(theme);
  const Wrapper = motionEnabled ? motion.div : "div";
  const animation = motionEnabled
    ? {
        initial: { opacity: 0, y: 10, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        transition: springSoft,
        whileHover: { y: -3, transition: springSnappy },
      }
    : {};

  if (!game) {
    return (
      <Wrapper className="surprise-card empty" {...animation}>
        <h3>Surprise Me</h3>
        <p className="sb-muted">{reason ?? "No hidden gems matched right now."}</p>
        <button className="sb-button secondary" onClick={onRefresh}>
          Try again
        </button>
      </Wrapper>
    );
  }

  return (
    <Wrapper key={game.universeId} className="surprise-card" {...animation}>
      <div className="surprise-copy">
        <span className="sb-badge">Surprise Me</span>
        <h3>{game.name}</h3>
        <p className="sb-muted">
          {formatCount(game.playing)} playing · {game.ratingPercent ?? "—"}% liked ·{" "}
          {formatCount(game.visits)} visits
        </p>
      </div>
      <GameCard game={game} />
      <button className="sb-button ghost surprise-refresh" onClick={onRefresh}>
        Another surprise
      </button>
    </Wrapper>
  );
}
