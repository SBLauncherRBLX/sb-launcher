import { create } from "zustand";
import { PRIVATE_DEMO } from "./lib/version";
import {
  DEFAULT_CAPABILITIES,
  DEFAULT_THEME,
  SafeGraphicsSettingsSchema,
  normalizeTheme,
  type SafeGraphicsSettings,
  type Session,
  type VisualTheme,
  type FriendPresence,
} from "@sb/contracts";
import { api, authStartUrl, setSessionToken } from "./lib/api";
import { hydrateProfileAvatarPreference } from "./lib/profileAvatar";
import { hydrateNickBadgePreference } from "./lib/nickBadge";
import { hydrateRobloxAppIconPreference } from "./lib/robloxAppIcon";

export type AppUpdateInfo = {
  version: string;
  buildId: string;
  downloadUrl: string;
  notes: string;
  title: string;
};

export type UpdateCheckStatus = "idle" | "checking" | "upToDate" | "available" | "offline";

type AppState = {
  ready: boolean;
  session: Session | null;
  theme: VisualTheme;
  graphics: SafeGraphicsSettings;
  friends: FriendPresence[];
  robloxInstalled: boolean | null;
  demoMode: boolean;
  error: string | null;
  updateStatus: UpdateCheckStatus;
  updateAvailable: AppUpdateInfo | null;
  updateNotesOpen: boolean;
  setUpdateNotesOpen: (open: boolean) => void;
  dismissUpdate: () => void;
  checkUpdates: () => Promise<void>;
  bootstrap: () => Promise<void>;
  setAuthToken: (token: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  refreshFriends: () => Promise<void>;
  setTheme: (theme: VisualTheme) => void;
  setGraphics: (graphics: SafeGraphicsSettings) => void;
  persistPreferences: () => Promise<void>;
  signOut: () => Promise<void>;
  switchAccount: (userId: string) => Promise<void>;
  addAccount: () => Promise<void>;
  removeAccount: (userId: string) => Promise<void>;
};

function guestSession(accounts: Session["accounts"] = []): Session {
  return {
    authenticated: false,
    user: null,
    capabilities: DEFAULT_CAPABILITIES,
    scopes: [],
    accounts,
    activeUserId: null,
  };
}

const DEFAULT_DOWNLOAD =
  "https://sblauncherrblx.github.io/SB-launcher-for-Roblox/";
let friendsRefreshVersion = 0;

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  session: null,
  theme: DEFAULT_THEME,
  graphics: SafeGraphicsSettingsSchema.parse({}),
  friends: [],
  robloxInstalled: null,
  demoMode: true,
  error: null,
  updateStatus: "idle",
  updateAvailable: null,
  updateNotesOpen: false,
  setUpdateNotesOpen: (open) => set({ updateNotesOpen: open }),
  dismissUpdate: () => set({ updateAvailable: null, updateNotesOpen: false }),

  checkUpdates: async () => {
    if (PRIVATE_DEMO) { set({ updateStatus: "upToDate", updateAvailable: null }); return; }
    set({ updateStatus: "checking" });

    try {
      const result = await api.checkUpdate();
      if (!result.cloudConfigured) {
        set({ updateStatus: "offline", updateAvailable: null });
        return;
      }
      if (!result.updateAvailable || !result.latest) {
        set({ updateStatus: "upToDate", updateAvailable: null });
        return;
      }
      set({
        updateStatus: "available",
        updateAvailable: {
          version: result.latest.version,
          buildId: result.latest.buildId,
          downloadUrl:
            result.downloadUrl || result.latest.downloadUrl || DEFAULT_DOWNLOAD,
          notes: result.notes || result.latest.notes || "",
          title:
            (result.latest as { title?: string }).title?.trim() ||
            `Version ${result.latest.version}`,
        },
      });
    } catch {
      set({ updateStatus: "offline", updateAvailable: null });
    }
  },

  bootstrap: async () => {
    try {
      const prefs = (await window.sbDesktop?.getPrefs()) ?? {};
      // Paint boot splash with saved theme before waiting on API/session.
      if (prefs.theme) {
        set({ theme: normalizeTheme(prefs.theme) });
      }
      hydrateProfileAvatarPreference(prefs);
      hydrateNickBadgePreference(prefs);
      hydrateRobloxAppIconPreference(prefs);
      const token =
        (typeof prefs.sessionToken === "string" && prefs.sessionToken) ||
        (await window.sbDesktop?.getPendingAuthToken()) ||
        null;
      if (token) setSessionToken(token);

      const health = await api.health().catch(() => ({
        ok: false,
        demoMode: true,
        oauthConfigured: false,
      }));
      const session = await api.session().catch(() => null);
      let theme = DEFAULT_THEME;
      let graphics = SafeGraphicsSettingsSchema.parse({});
      if (session?.authenticated) {
        try {
          const pref = await api.preferences();
          theme = normalizeTheme(pref.theme);
          graphics = pref.graphics;
        } catch {
          // use defaults / local prefs below
        }
      }
      // Local AppData prefs survive reinstall — prefer them over cloud when present
      // (same path visuals already use via VisualsPage auto-save).
      if (prefs.theme) {
        theme = normalizeTheme(prefs.theme);
      }
      if (prefs.graphics) {
        graphics = SafeGraphicsSettingsSchema.parse(prefs.graphics);
      }
      // Pulse Midnight remains a selectable preset; only retire the obsolete default.
      if (theme.id === "pixel-os") {
        theme = DEFAULT_THEME;
      }
      // One-time migration: unify all buttons to the account-pill glass look.
      // Afterwards the user can still pick Gradient/Solid/Tonal (M3) in Visuals.
      if (!prefs.sbButtonUnifiedV1 && theme.effects?.glass && theme.buttonStyle !== "glass") {
        theme = { ...theme, buttonStyle: "glass" };
        void window.sbDesktop?.setPrefs({ theme, sbButtonUnifiedV1: true }).catch(() => undefined);
        try {
          localStorage.setItem("sb-button-unified-v1", "1");
        } catch {}
        if (session?.authenticated) {
          void api.savePreferences({ theme, graphics }).catch(() => undefined);
        }
      }

      const detect = await window.sbDesktop?.detectRoblox();
      set({
        ready: true,
        session,
        theme,
        graphics,
        demoMode: health.demoMode,
        robloxInstalled: detect?.installed ?? null,
        error: null,
      });
      // Keep shared theme/graphics on every saved account in the background.
      if (session?.authenticated) {
        void api.savePreferences({ theme, graphics }).catch(() => undefined);
      }
      if (session?.authenticated && session.capabilities.friends) {
        void get().refreshFriends().catch(() => undefined);
      }
      // Always check cloud update manifest on every launcher open.
      void get().checkUpdates();
    } catch (err) {
      set({
        ready: true,
        error: err instanceof Error ? err.message : "Failed to bootstrap",
      });
    }
  },

  setAuthToken: async (token: string) => {
    setSessionToken(token);
    await window.sbDesktop?.setPrefs({ sessionToken: token });
    await get().refreshSession();
  },

  refreshSession: async () => {
    const session = await api.session();
    set({ session });
    // Theme/graphics stay on the shared local prefs — do not reload per-account values.
    if (session.authenticated && session.capabilities.friends) {
      void get().refreshFriends().catch(() => undefined);
    } else {
      friendsRefreshVersion += 1;
      set({ friends: [] });
    }
  },

  refreshFriends: async () => {
    const session = get().session;
    if (!session?.authenticated || !session.capabilities.friends) {
      friendsRefreshVersion += 1;
      set({ friends: [] });
      return;
    }
    const requestVersion = ++friendsRefreshVersion;
    const activeUserId = session.activeUserId ?? session.user?.id ?? null;
    const result = await api.friends();
    const currentSession = get().session;
    const currentUserId = currentSession?.activeUserId ?? currentSession?.user?.id ?? null;
    if (
      requestVersion === friendsRefreshVersion &&
      currentSession?.authenticated &&
      currentUserId === activeUserId
    ) {
      set({ friends: result.items });
    }
  },

  setTheme: (theme) => set({ theme: normalizeTheme(theme) }),
  setGraphics: (graphics) => set({ graphics }),

  persistPreferences: async () => {
    const { theme, graphics, session } = get();
    await window.sbDesktop?.setPrefs({ theme, graphics });
    if (session?.authenticated) {
      try {
        await api.savePreferences({ theme, graphics });
      } catch {
        // Cloud is optional — local prefs already saved, don't block UI.
      }
    }
  },

  signOut: async () => {
    friendsRefreshVersion += 1;
    try {
      await api.logout();
    } catch {
      // ignore
    }
    setSessionToken(null);
    await window.sbDesktop?.setPrefs({ sessionToken: null });
    const session = await api.session().catch(() => null);
    set({
      friends: [],
      session: session ?? guestSession(get().session?.accounts ?? []),
    });
  },

  switchAccount: async (userId: string) => {
    const result = await api.switchAccount(userId);
    setSessionToken(result.sessionToken);
    await window.sbDesktop?.setPrefs({ sessionToken: result.sessionToken });
    friendsRefreshVersion += 1;
    set({ session: result.session });
    // Keep the same shared theme/graphics across accounts.
    if (result.session.capabilities.friends) {
      void get().refreshFriends().catch(() => undefined);
    } else {
      set({ friends: [] });
    }
  },

  addAccount: async () => {
    const url = authStartUrl();
    if (window.sbDesktop?.openExternal) {
      await window.sbDesktop.openExternal(url);
    } else {
      window.open(url, "_blank");
    }
  },

  removeAccount: async (userId: string) => {
    const result = await api.removeAccount(userId);
    if (result.removedActive) {
      const next = result.accounts[0];
      if (next) {
        await get().switchAccount(next.id);
        return;
      }
      setSessionToken(null);
      await window.sbDesktop?.setPrefs({ sessionToken: null });
      friendsRefreshVersion += 1;
      set({ friends: [], session: guestSession([]) });
      return;
    }
    const session = get().session;
    if (session) {
      set({ session: { ...session, accounts: result.accounts } });
    }
  },
}));
