import { useEffect, useMemo, useState } from "react";
import { Button, EmptyState, LoadingState } from "@sb/ui";
import { useAppStore } from "../store";
import { launchExperience } from "../lib/launch";
import { authStartUrl } from "../lib/api";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { fadeUp, springSnappy, useMotionEnabled } from "../lib/motion";
import { LauncherNickBadge } from "../components/LauncherNickBadge";

const PAGE_SIZE = 40;

export function FriendsPage() {
  const navigate = useNavigate();
  const session = useAppStore((s) => s.session);
  const items = useAppStore((s) => s.friends);
  const refreshFriends = useAppStore((s) => s.refreshFriends);
  const theme = useAppStore((s) => s.theme);
  const motionEnabled = useMotionEnabled(theme);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!session?.authenticated) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        setLoading(true);
        await refreshFriends();
        if (cancelled) return;
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load friends");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session?.authenticated, refreshFriends]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((friend) => {
      const display = friend.displayName.toLowerCase();
      const user = friend.username.toLowerCase();
      return display.includes(q) || user.includes(q) || `@${user}`.includes(q);
    });
  }, [items, query]);

  const visible = filtered.slice(0, visibleCount);
  const remaining = Math.max(0, filtered.length - visible.length);

  if (!session?.authenticated) {
    return (
      <EmptyState
        title="Sign in to see friends"
        description="Friends and presence require a Roblox OAuth session."
      />
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Friends</h2>
          <p className="sb-muted">See who’s online and join them when allowed.</p>
        </div>
        <Button
          variant="ghost"
          onClick={() => void window.sbDesktop?.openExternal("https://www.roblox.com/users/friends")}
        >
          Open on Roblox
        </Button>
      </div>

      <div className="form-grid" style={{ marginBottom: "1rem", maxWidth: 420 }}>
        <label>
          Search by nick
          <input
            className="sb-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Display name or @username"
          />
        </label>
      </div>

      {loading && items.length === 0 ? <LoadingState label="Loading friends…" /> : null}
      {error ? <EmptyState title="Friends unavailable" description={error} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No friends to show"
          description="Your OAuth app may need additional approved scopes, or your friends list is empty."
        />
      ) : null}
      {!loading && !error && items.length > 0 && filtered.length === 0 ? (
        <EmptyState title="No matches" description={`Nothing matched “${query.trim()}”.`} />
      ) : null}

      <div className="friend-list">
        {visible.map((friend, index) => (
          <motion.div
            key={friend.userId}
            className="sb-card friend-row"
            {...fadeUp(index, motionEnabled)}
            whileHover={
              motionEnabled
                ? { x: 4, transition: springSnappy }
                : undefined
            }
          >
            <button
              className="avatar friend-avatar-button"
              onClick={() => navigate(`/profile/${friend.userId}`)}
              title={`Open ${friend.displayName}'s profile`}
            >
              {friend.avatarUrl ? (
                <img src={friend.avatarUrl} alt={friend.displayName} />
              ) : (
                friend.displayName.slice(0, 1).toUpperCase()
              )}
            </button>
            <div className="grow">
              <div>
                <span
                  className={`status-dot ${
                    friend.presenceType === "InGame"
                      ? "ingame"
                      : friend.isOnline
                        ? "online"
                        : ""
                  }`}
                />{" "}
                <button
                  className="friend-name-button"
                  onClick={() => navigate(`/profile/${friend.userId}`)}
                >
                  <strong>{friend.displayName}</strong>
                  <LauncherNickBadge
                    registeredViaLauncher={friend.registeredViaLauncher}
                    mode={friend.launcherBadgeMode}
                    customUrl={friend.launcherBadgeUrl}
                  />
                </button>{" "}
                <span className="sb-muted">@{friend.username}</span>
              </div>
              <div className="sb-muted">
                {friend.presenceType === "InGame" ? (
                  <>
                    In Experience
                    {friend.lastLocation ? (
                      <>
                        {" · "}
                        {friend.universeId ? (
                          <button
                            type="button"
                            className="friend-game-button"
                            onClick={() => navigate(`/game/${friend.universeId}`)}
                            title={`Open ${friend.lastLocation}`}
                          >
                            {friend.lastLocation}
                          </button>
                        ) : (
                          friend.lastLocation
                        )}
                      </>
                    ) : (
                      <span className="sb-muted"> · game hidden by privacy</span>
                    )}
                  </>
                ) : friend.presenceType === "InStudio" ? (
                  friend.lastLocation ? `In Studio · ${friend.lastLocation}` : "In Studio"
                ) : friend.isOnline ? (
                  friend.inLauncher && friend.lastLocation?.startsWith("SB Launcher")
                    ? friend.lastLocation
                    : friend.inLauncher
                      ? "Online · SB Launcher"
                      : "Online"
                ) : (
                  "Offline"
                )}
              </div>
            </div>
            <div className="row-actions">
              <Button
                disabled={!friend.canJoin}
                title={friend.joinDisabledReason ?? undefined}
                onClick={() =>
                  void launchExperience({
                    placeId: friend.placeId ?? undefined,
                    userId: friend.userId,
                    gameInstanceId: friend.gameInstanceId ?? undefined,
                    universeId: friend.universeId ?? undefined,
                    name: friend.lastLocation ?? "Experience",
                  })
                }
              >
                Join
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate(`/profile/${friend.userId}`)}
              >
                Profile
              </Button>
            </div>
          </motion.div>
        ))}
      </div>

      {remaining > 0 ? (
        <div className="row-actions" style={{ marginTop: "1rem" }}>
          <Button variant="secondary" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
            Load more ({remaining} left)
          </Button>
          <span className="sb-muted">
            Showing {visible.length} of {filtered.length}
          </span>
        </div>
      ) : filtered.length > PAGE_SIZE ? (
        <div className="sb-muted" style={{ marginTop: "1rem" }}>
          Showing all {filtered.length} friends
        </div>
      ) : null}

      {!session.capabilities.friends ? (
        <div className="notice" style={{ marginTop: "1rem" }}>
          Friends capability is limited. Re-authorize with approved User Tools scopes, or{" "}
          <button
            className="chip"
            onClick={() => void window.sbDesktop?.openExternal(authStartUrl())}
          >
            sign in again
          </button>
          .
        </div>
      ) : null}
    </div>
  );
}
