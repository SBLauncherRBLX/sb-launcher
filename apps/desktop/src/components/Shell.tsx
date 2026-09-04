import { NavLink, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import type { PropsWithChildren, FormEvent, ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Badge, Button } from "@sb/ui";
import { useAppStore } from "../store";
import { authStartUrl } from "../lib/api";
import sbLogo from "../assets/sb-logo.png";
import { Home3D, Discover3D, Friends3D, Visuals3D, Settings3D, About3D } from "./Nav3DIcons";
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
    icon: <Home3D className="nav-icon-3d" />,
  },
  {
    to: "/discover",
    label: "Discover",
    icon: <Discover3D className="nav-icon-3d" />,
  },
  {
    to: "/friends",
    label: "Friends",
    icon: <Friends3D className="nav-icon-3d" />,
  },
  {
    to: "/visuals",
    label: "Visuals",
    icon: <Visuals3D className="nav-icon-3d" />,
  },
  {
    to: "/settings",
    label: "Settings",
    icon: <Settings3D className="nav-icon-3d" />,
  },
  {
    to: "/about",
    label: "About",
    icon: <About3D className="nav-icon-3d" />,
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
  const mainRef = useRef<HTMLDivElement>(null);
  const [avatarPreference, setAvatarPreference] = useState<ProfileAvatarPreference>(
    getProfileAvatarPreference,
  );
  const motionEnabled = useMotionEnabled(theme);
  const profileAvatar = resolveProfileAvatar(session?.user?.avatarUrl, avatarPreference);
  const accounts = session?.accounts ?? [];
  const activeUserId = session?.activeUserId ?? session?.user?.id ?? null;

  const layout = useMemo(
    () => theme.layout ?? { sidebarPosition: "left", sidebarWidth: 272, topbarPosition: "sticky", topbarHeight: "comfortable", contentAlignment: "stretch", contentMaxWidth: 1280, contentPadding: 22, cardGap: 16, cardColumns: "auto", topbarBlur: 12, pageTransition: "slide" } as NonNullable<typeof theme.layout>,
    [theme.layout],
  );
  const scroll = useMemo(
    () => theme.scroll ?? { overscrollBehavior: "contain", scrollBehavior: "smooth", scrollbarStyle: "thin", scrollAnimation: "fade", scrollAnimationDuration: 360, scrollAnimationEasing: "easeOut", scrollStagger: 40, enableScrollProgress: false, hideTopbarOnScroll: false, parallaxIntensity: 0.5, revealOnScroll: true } as NonNullable<typeof theme.scroll>,
    [theme.scroll],
  );
  const [topbarHidden, setTopbarHidden] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const lastScrollY = useRef(0);

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

  // Reset hidden state immediately when feature is disabled (bug #3)
  useEffect(() => {
    if (!scroll.hideTopbarOnScroll) {
      setTopbarHidden(false);
      lastScrollY.current = 0;
    }
    if (!scroll.enableScrollProgress) {
      setScrollProgress(0);
    }
  }, [scroll.hideTopbarOnScroll, scroll.enableScrollProgress]);

  useEffect(() => {
    const isSticky = layout.topbarPosition !== "static";
    const scrollEl: HTMLElement | null = isSticky
      ? mainRef.current
      : (mainRef.current?.querySelector(".page") as HTMLElement | null) ?? mainRef.current;
    if (!scrollEl) return;
    if (!scroll.hideTopbarOnScroll && !scroll.enableScrollProgress) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = scrollEl.scrollTop;
        const delta = y - lastScrollY.current;
        if (scroll.hideTopbarOnScroll) {
          if (y > 80 && delta > 4) setTopbarHidden(true);
          else if (delta < -6 || y < 20) setTopbarHidden(false);
        }
        if (scroll.enableScrollProgress) {
          const max = scrollEl.scrollHeight - scrollEl.clientHeight;
          setScrollProgress(max > 0 ? Math.min(1, y / max) : 0);
        }
        lastScrollY.current = y;
      });
    };
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scroll.hideTopbarOnScroll, scroll.enableScrollProgress, layout.topbarPosition]);

  useLayoutEffect(() => {
    // instant scroll reset without animation — completely invisible (before paint)
    const isSticky = layout.topbarPosition !== "static";
    const scrollEl: HTMLElement | null = isSticky
      ? mainRef.current
      : (mainRef.current?.querySelector(".page") as HTMLElement | null) ?? null;
    const instantReset = (el: HTMLElement | null) => {
      if (!el) return;
      const prev = el.style.scrollBehavior;
      el.style.scrollBehavior = "auto";
      el.scrollTop = 0;
      try {
        (el as unknown as { scrollTo: (o: ScrollToOptions) => void }).scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      } catch {}
      // restore on next frame to avoid smooth reappearing
      requestAnimationFrame(() => {
        el.style.scrollBehavior = prev;
      });
    };
    instantReset(scrollEl);
    if (!isSticky) instantReset(mainRef.current);
    // also reset window if needed
    try { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); } catch { window.scrollTo(0, 0); }
    setTopbarHidden(false);
    setScrollProgress(0);
    lastScrollY.current = 0;
  }, [location.pathname, layout.topbarPosition]);

  // Scroll reveal — makes scroll animations actually work on scroll (not just on load)
  useEffect(() => {
    if (!scroll.revealOnScroll || scroll.scrollAnimation === "none") {
      document.querySelectorAll(".page .sb-card").forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const isSticky = layout.topbarPosition !== "static";
    const scrollRoot: HTMLElement | null = isSticky ? mainRef.current : (mainRef.current?.querySelector(".page") as HTMLElement | null);
    const pageEl = mainRef.current?.querySelector(".page") as HTMLElement | null;
    if (!pageEl) return;
    const cards = Array.from(pageEl.querySelectorAll(".sb-card")) as HTMLElement[];
    cards.forEach((el, idx) => {
      el.style.setProperty("--card-index", String(idx));
      el.classList.remove("is-visible");
    });
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        root: scrollRoot,
        threshold: 0.12,
        rootMargin: "0px 0px -8% 0px",
      },
    );
    cards.forEach((el) => observer.observe(el));
    const mo = new MutationObserver(() => {
      const newCards = Array.from(pageEl.querySelectorAll(".sb-card")) as HTMLElement[];
      newCards.forEach((el, idx) => {
        if (!el.style.getPropertyValue("--card-index")) el.style.setProperty("--card-index", String(idx));
        if (!el.classList.contains("is-visible")) observer.observe(el);
      });
    });
    mo.observe(pageEl, { childList: true, subtree: true });
    // fallback: make visible after short delay if observer doesn't fire (e.g., already in view)
    const t = window.setTimeout(() => cards.forEach((el) => el.classList.add("is-visible")), 900);
    return () => {
      observer.disconnect();
      mo.disconnect();
      window.clearTimeout(t);
    };
  }, [location.pathname, scroll.revealOnScroll, scroll.scrollAnimation, scroll.scrollAnimationDuration, scroll.scrollAnimationEasing, scroll.scrollStagger, layout.topbarPosition]);

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

  const isSticky = layout.topbarPosition !== "static";
  const shellClasses = useMemo(
    () => [
      "app-shell",
      theme.density,
      layout.sidebarPosition === "right" ? "layout-right" : layout.sidebarPosition === "hidden" ? "layout-hidden" : "",
    ]
      .filter(Boolean)
      .join(" "),
    [theme.density, layout.sidebarPosition],
  );

  const scrollbarClass = scroll.scrollbarStyle === "hidden" ? "scrollbar-hidden" : scroll.scrollbarStyle === "overlay" ? "scrollbar-overlay" : "";

  const mainClasses = useMemo(
    () => [
      "main",
      isSticky ? "scroll-sticky" : "",
      layout.topbarPosition === "floating" ? "topbar-floating" : layout.topbarPosition === "static" ? "topbar-static" : "",
      `topbar-height-${layout.topbarHeight}`,
      isSticky ? scrollbarClass : "",
    ]
      .filter(Boolean)
      .join(" "),
    [isSticky, layout.topbarPosition, layout.topbarHeight, scrollbarClass],
  );

  const pageClasses = useMemo(
    () => ["page", !isSticky ? scrollbarClass : ""].filter(Boolean).join(" "),
    [isSticky, scrollbarClass],
  );

  return (
    <>
      <svg width="0" height="0" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden>
        <defs>
          <filter id="liquid-glass-filter" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 13 -5" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" result="composite" />
            <feGaussianBlur in="composite" stdDeviation="0.5" result="finalBlur" />
          </filter>
          <radialGradient id="liquid-highlight-3d" cx="0.3" cy="0.22" r="0.8">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.42" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="liquid-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff3b7a" stopOpacity="0.45" />
            <stop offset="18%" stopColor="#7c5cff" stopOpacity="0.38" />
            <stop offset="42%" stopColor="#00d4ff" stopOpacity="0.32" />
            <stop offset="68%" stopColor="#3cff88" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ff3b7a" stopOpacity="0.35" />
          </linearGradient>
        </defs>
      </svg>
      <div className={shellClasses}>
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
                  {isActive ? (
                    motionEnabled ? (
                      <motion.div
                        layoutId="nav-pill-liquid"
                        className="nav-pill nav-pill-liquid"
                        initial={{ scale: 0.94, opacity: 0.88 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.94, opacity: 0.88 }}
                        transition={{
                          type: "spring",
                          stiffness: 540,
                          damping: 32,
                          mass: 0.82,
                          restDelta: 0.001,
                          restSpeed: 0.001,
                        }}
                        layout
                        style={{ willChange: "transform, opacity" }}
                      />
                    ) : (
                      <span className="nav-pill nav-pill-liquid" />
                    )
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
      <div className={mainClasses} ref={mainRef}>
        {scroll.enableScrollProgress ? (
          <div className="scroll-progress" style={{ transform: `scaleX(${scrollProgress})`, opacity: scrollProgress > 0 ? 1 : 0 }} />
        ) : null}
        <header className={`topbar ${topbarHidden ? "is-hidden" : ""}`}>
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
        <main className={pageClasses}>{children}</main>
        {updateNotesOpen && updateAvailable ? (
          <UpdateInstallModal
            update={updateAvailable}
            onClose={() => setUpdateNotesOpen(false)}
          />
        ) : null}
        <LaunchGateModal />
      </div>
    </div>
    </>
  );
}
