import { NavLink, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import type { PropsWithChildren, FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button } from "@sb/ui";
import { useAppStore } from "../store";
import { authStartUrl } from "../lib/api";
import sbLogo from "../assets/sb-logo.png";
import { fadeUp, springSnappy, useMotionEnabled } from "../lib/motion";
import { APP_VERSION } from "../lib/version";
import {
  getProfileAvatarPreference,
  PROFILE_AVATAR_EVENT,
  resolveProfileAvatar,
  type ProfileAvatarPreference,
} from "../lib/profileAvatar";
import { UpdateInstallModal } from "./UpdateInstallModal";
import { LaunchGateModal } from "./LaunchGateModal";

function updateNotesSummary(notes: string, maxLen = 96): string {
  const line = notes
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) return "";
  return line.length <= maxLen
    ? line
    : `${line.slice(0, maxLen - 1).trimEnd()}…`;
}

function NavIcon({ children }: PropsWithChildren) {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      width={22}
      height={22}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const links: Array<{ to: string; label: string; icon: ReactNode }> = [
  {
    to: "/",
    label: "Home",
    icon: (
      <NavIcon>
        <path d="M4.5 10.5 12 4l7.5 6.5" />
        <path d="M6.5 9.8V19a1 1 0 0 0 1 1H10v-5h4v5h2.5a1 1 0 0 0 1-1V9.8" />
      </NavIcon>
    ),
  },
  {
    to: "/discover",
    label: "Discover",
    icon: (
      <NavIcon>
        <circle cx="12" cy="12" r="8.25" />
        <path d="m14.8 9.2-1.6 4.6-4.6 1.6 1.6-4.6z" />
      </NavIcon>
    ),
  },
  {
    to: "/friends",
    label: "Friends",
    icon: (
      <NavIcon>
        <circle cx="9" cy="8.2" r="3.1" />
        <path d="M3.6 19c.7-3 3-4.8 5.4-4.8s4.7 1.8 5.4 4.8" />
        <circle cx="16.6" cy="9" r="2.35" />
        <path d="M15.4 14.3c1.7.3 3.1 1.4 3.8 3.2" />
      </NavIcon>
    ),
  },
  {
    to: "/visuals",
    label: "Visuals",
    icon: (
      <NavIcon>
        <path d="M12 4.2a7.8 7.8 0 1 0 0 15.6c1.4 0 1.85-.9 1.2-1.9-.8-1.3.2-2.8 1.75-2.8H17a2.7 2.7 0 0 0 2.7-2.7C19.7 7.5 16.3 4.2 12 4.2Z" />
        <circle cx="8.2" cy="11" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="10.8" cy="8.2" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="14.4" cy="8.4" r="0.9" fill="currentColor" stroke="none" />
      </NavIcon>
    ),
  },
  {
    to: "/settings",
    label: "Settings",
    icon: (
      <NavIcon>
        <circle cx="12" cy="12" r="3.1" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.86 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </NavIcon>
    ),
  },
  {
    to: "/about",
    label: "About",
    icon: (
      <NavIcon>
        <circle cx="12" cy="12" r="8.25" />
        <path d="M12 10.2v5.1" />
        <circle cx="12" cy="7.6" r="0.85" fill="currentColor" stroke="none" />
      </NavIcon>
    ),
  },
];

export function Shell({ children }: PropsWithChildren) {
  const session = useAppStore((s) => s.session);
  const theme = useAppStore((s) => s.theme);
  const demoMode = useAppStore((s) => s.demoMode);
  const signOut = useAppStore((s) => s.signOut);
  const switchAccount = useAppStore((s) => s.switchAccount);
  const addAccount = useAppStore((s) => s.addAccount);
  const updateAvailable = useAppStore((s) => s.updateAvailable);
  const dismissUpdate = useAppStore((s) => s.dismissUpdate);
  const updateNotesOpen = useAppStore((s) => s.updateNotesOpen);
  const setUpdateNotesOpen = useAppStore((s) => s.setUpdateNotesOpen);
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [query, setQuery] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [avatarPreference, setAvatarPreference] = useState<ProfileAvatarPreference>(
    getProfileAvatarPreference,
  );
  const motionEnabled = useMotionEnabled(theme);
  const profileAvatar = resolveProfileAvatar(session?.user?.avatarUrl, avatarPreference);
  const accounts = session?.accounts ?? [];
  const activeUserId = session?.activeUserId ?? session?.user?.id ?? null;

  useEffect(() => {
    if (location.pathname.startsWith("/discover")) {
      setQuery(params.get("q") ?? "");
    }
  }, [location.pathname, params]);

  useEffect(() => {
    const update = (event: Event) => {
      setAvatarPreference(
        (event as CustomEvent<ProfileAvatarPreference>).detail ??
          getProfileAvatarPreference(),
      );
    };
    window.addEventListener(PROFILE_AVATAR_EVENT, update);
    return () => window.removeEventListener(PROFILE_AVATAR_EVENT, update);
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [accountMenuOpen]);

  async function signIn() {
    const url = authStartUrl();
    if (window.sbDesktop?.openExternal) {
      await window.sbDesktop.openExternal(url);
    } else {
      window.open(url, "_blank");
    }
  }

  async function onSwitchAccount(userId: string) {
    if (userId === activeUserId || accountBusy) {
      setAccountMenuOpen(false);
      return;
    }
    setAccountBusy(true);
    try {
      await switchAccount(userId);
      setAccountMenuOpen(false);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not switch account");
    } finally {
      setAccountBusy(false);
    }
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const term = query.trim();
    if (!term) {
      navigate("/discover");
      return;
    }
    const activeTab = params.get("tab") === "people" ? "people" : "experiences";
    navigate(`/discover?q=${encodeURIComponent(term)}&tab=${activeTab}`);
  }

  return (
    <div className={`app-shell ${theme.density}`}>
      <aside className={`sidebar ${theme.sidebarStyle}`}>
        <div className="brand">
          <span
            className="brand-logo-tint"
            style={{ ["--sb-brand-mask" as string]: `url(${sbLogo})` }}
            role="img"
            aria-label="SB Launcher"
          />
          {/* Original asset kept in the bundle unused for display; tint is CSS-only. */}
          <img src={sbLogo} alt="" className="brand-logo" hidden />
          <div>
            <h1>SB Launcher</h1>
            <p className="sb-muted">Roblox Companion · v{APP_VERSION}</p>
          </div>
        </div>
        <nav className="nav">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              {({ isActive }) => (
                <>
                  {motionEnabled && isActive ? (
                    <motion.span
                      layoutId="nav-pill"
                      className="nav-pill"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  ) : null}
                  {link.icon}
                  <span className="nav-label">{link.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          {demoMode ? <Badge>Guest mode</Badge> : null}
          {session?.authenticated ? (
            <div className="sidebar-account" ref={accountMenuRef}>
              <div className="sidebar-account-row">
                <motion.button
                  type="button"
                  className="profile-chip sidebar-profile-button"
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="menu"
                  whileTap={motionEnabled ? { scale: 0.98 } : undefined}
                  transition={springSnappy}
                  onClick={() => setAccountMenuOpen((open) => !open)}
                >
                  <img
                    src={profileAvatar ?? sbLogo}
                    alt={session.user?.displayName ?? "Profile"}
                    className="profile-avatar"
                  />
                  <div>
                    <strong>{session.user?.displayName}</strong>
                    <div className="sb-muted">@{session.user?.username}</div>
                  </div>
                </motion.button>
                <motion.button
                  type="button"
                  className="account-add-button"
                  title="Add another Roblox account"
                  aria-label="Add another Roblox account"
                  disabled={accountBusy}
                  whileTap={motionEnabled ? { scale: 0.92 } : undefined}
                  transition={springSnappy}
                  onClick={() => void addAccount()}
                >
                  +
                </motion.button>
              </div>
              <AnimatePresence>
                {accountMenuOpen ? (
                  <motion.div
                    className="account-popover"
                    role="menu"
                    initial={motionEnabled ? { opacity: 0, y: 10, scale: 0.96 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={motionEnabled ? { opacity: 0, y: 8, scale: 0.97 } : undefined}
                    transition={springSnappy}
                  >
                    {accounts.map((account, index) => {
                      const active = account.id === activeUserId;
                      return (
                        <motion.button
                          key={account.id}
                          type="button"
                          role="menuitem"
                          className={`account-popover-item${active ? " active" : ""}`}
                          disabled={accountBusy}
                          {...fadeUp(index, motionEnabled)}
                          whileTap={motionEnabled ? { scale: 0.98 } : undefined}
                          onClick={() => void onSwitchAccount(account.id)}
                        >
                          <img
                            src={account.avatarUrl || sbLogo}
                            alt=""
                            className="profile-avatar"
                          />
                          <div>
                            <strong>{account.displayName}</strong>
                            <div className="sb-muted">@{account.username}</div>
                          </div>
                          {active ? <span className="account-active-mark">Active</span> : null}
                        </motion.button>
                      );
                    })}
                    <div className="account-popover-actions">
                      <button
                        type="button"
                        className="account-popover-link"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          if (session.user?.id) navigate(`/profile/${session.user.id}`);
                        }}
                      >
                        Open profile
                      </button>
                      <button
                        type="button"
                        className="account-popover-link"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          void signOut();
                        }}
                      >
                        Sign out
                      </button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ) : (
            <div className="guest-profile">
              <span
                className="brand-logo-tint profile-avatar-tint"
                style={{ ["--sb-brand-mask" as string]: `url(${sbLogo})` }}
                role="img"
                aria-label="SB Launcher guest"
              />
              <Button onClick={() => void signIn()}>Sign in with Roblox</Button>
            </div>
          )}
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <form className="search m3-search" onSubmit={onSearch}>
            <svg
              className="m3-search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              className="sb-input m3-search-input"
              placeholder="Search experiences and people…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          {!session?.authenticated ? (
            <Button onClick={() => void signIn()}>Sign in</Button>
          ) : (
            <button
              className="topbar-profile-button"
              title={`Open ${session.user?.displayName ?? "your"} profile`}
              onClick={() => navigate(`/profile/${session.user?.id}`)}
            >
              <img
                src={profileAvatar ?? sbLogo}
                alt={session.user?.displayName ?? "Profile"}
              />
            </button>
          )}
        </header>
        {updateAvailable ? (
          <div className="notice update-banner" role="status">
            <div className="update-banner-copy">
              <strong>Update available</strong>
              <span className="sb-muted">
                Version {updateAvailable.version}
                {updateNotesSummary(updateAvailable.notes)
                  ? ` — ${updateNotesSummary(updateAvailable.notes)}`
                  : ""}
              </span>
            </div>
            <div className="row-actions">
              <Button onClick={() => setUpdateNotesOpen(true)}>Install</Button>
              <Button variant="ghost" onClick={() => dismissUpdate()}>
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}
        <main className="page">{children}</main>
        {updateNotesOpen && updateAvailable ? (
          <UpdateInstallModal
            update={updateAvailable}
            onClose={() => setUpdateNotesOpen(false)}
          />
        ) : null}
        <LaunchGateModal />
      </div>
    </div>
  );
}
