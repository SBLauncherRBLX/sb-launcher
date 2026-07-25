import { motion } from "motion/react";
import type { GameSummary } from "@sb/contracts";
import { GameCard, formatCount } from "./GameCard";
import { useAppStore } from "../store";
import { fadeUp, springSoft, springSnappy, useMotionEnabled } from "../lib/motion";

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

  if (!games.length) return null;

  return (
    <section className="rail">
      <div className="rail-title">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p className="sb-muted rail-subtitle">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="rail-scroll">
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
