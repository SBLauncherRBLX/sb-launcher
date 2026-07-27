import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import type { GameSummary } from "@sb/contracts";
import { Card } from "@sb/ui";
import { useAppStore } from "../store";
import { springSnappy, useMotionEnabled } from "../lib/motion";

export function needsPaidAccessPurchase(game: Pick<GameSummary, "isForSale" | "priceInRobux" | "owned">): boolean {
  const price = game.priceInRobux ?? 0;
  if (!game.isForSale || price <= 0) return false;
  // Owned only when the inventory check explicitly confirms it.
  return game.owned !== true;
}

export function robloxGamePageUrl(placeId: string): string {
  return `https://www.roblox.com/games/${encodeURIComponent(placeId)}/`;
}

export function formatRobux(price: number): string {
  return `R$ ${price.toLocaleString("en-US")}`;
}

export function GameCard({
  game,
  compact = false,
  onRemove,
  removeLabel = "Remove",
  showPaidAccess = true,
}: {
  game: GameSummary;
  compact?: boolean;
  onRemove?: (game: GameSummary) => void;
  removeLabel?: string;
  /** When false, paid-access price/owned UI is hidden (e.g. Last Played). */
  showPaidAccess?: boolean;
}) {
  const navigate = useNavigate();
  const theme = useAppStore((s) => s.theme);
  const friends = useAppStore((s) => s.friends);
  const motionEnabled = useMotionEnabled(theme);
  const friendsPlaying = friends.filter(
    (friend) =>
      friend.presenceType === "InGame" &&
      (friend.universeId === game.universeId || friend.placeId === game.placeId),
  );
  const Wrapper = motionEnabled ? motion.div : "div";
  const motionProps = motionEnabled
    ? {
        whileHover: { y: -4, scale: 1.02, transition: springSnappy },
        whileTap: { scale: 0.98, transition: springSnappy },
      }
    : {};
  const paidLocked = showPaidAccess && needsPaidAccessPurchase(game);
  const price = game.priceInRobux ?? 0;
  const showOwnedBadge = showPaidAccess && !paidLocked && game.isForSale && price > 0;

  return (
    <Wrapper className={`game-card-wrap ${compact ? "compact" : ""}`} {...motionProps}>
      {onRemove ? (
        <button
          type="button"
          className="game-card-remove"
          title={removeLabel}
          aria-label={`${removeLabel} ${game.name}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove(game);
          }}
        >
          ×
        </button>
      ) : null}
      <Card
        className={`game-card ${compact ? "compact" : ""} ${paidLocked ? "paid-locked" : ""}`}
        onClick={() => navigate(`/game/${game.universeId}`)}
      >
        <div className="thumb">
          {game.iconUrl || game.thumbnailUrl ? (
            <img src={game.iconUrl || game.thumbnailUrl || ""} alt={game.name} loading="lazy" />
          ) : (
            <span className="sb-muted">SB</span>
          )}
          {paidLocked ? (
            <span className="game-card-price-badge" title="Paid access">
              {formatRobux(price)}
            </span>
          ) : showOwnedBadge ? (
            <span className="game-card-price-badge owned" title="Owned">
              Owned
            </span>
          ) : null}
        </div>
        <div className="meta">
          <h3>{game.name}</h3>
          <div className="game-stats">
            {paidLocked ? (
              <span className="game-stat-robux">{formatRobux(price)}</span>
            ) : (
              <span className="game-stat-playing">
                <svg
                  className="game-stat-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="12" cy="8" r="3.25" />
                  <path d="M5.5 19c.9-3.2 3.2-5 6.5-5s5.6 1.8 6.5 5" />
                </svg>
                {formatCount(game.playing)} playing
              </span>
            )}
            {game.ratingPercent ? <span>{game.ratingPercent}%</span> : null}
            {game.genreL1 ? <span>{game.genreL1}</span> : null}
          </div>
          {friendsPlaying.length ? (
            <div className="friends-playing-label">
              {friendsPlaying.length} {friendsPlaying.length === 1 ? "friend" : "friends"} playing
            </div>
          ) : null}
        </div>
      </Card>
    </Wrapper>
  );
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
