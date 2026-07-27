import { create } from "zustand";
import {
  DEFAULT_THEME,
  SafeGraphicsSettingsSchema,
  normalizeTheme,
  type SafeGraphicsSettings,
  type Session,
  type VisualTheme,
  type FriendPresence,
} from "@sb/contracts";
import { api, setSessionToken } from "./lib/api";
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
};

const DEFAULT_DOWNLOAD =
  "https://sblauncherrblx.github.io/SB-launcher-for-Roblox/";

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
      // Roll old default themes forward to SB Midnight.
      if (theme.id === "pulse-midnight" || theme.id === "pixel-os") {
        theme = DEFAULT_THEME;
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
      if (session?.authenticated && session.capabilities.friends) {
        void api
          .friends()
          .then((result) => set({ friends: result.items }))
          .catch(() => set({ friends: [] }));
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
    if (session.authenticated) {
      try {
        const pref = await api.preferences();
        set({ theme: normalizeTheme(pref.theme), graphics: pref.graphics });
      } catch {
        // ignore
      }
      if (session.capabilities.friends) {
        void get().refreshFriends();
      }
    }
  },

  refreshFriends: async () => {
    const session = get().session;
    if (!session?.authenticated || !session.capabilities.friends) {
      set({ friends: [] });
      return;
    }
    const result = await api.friends();
    set({ friends: result.items });
  },

  setTheme: (theme) => set({ theme: normalizeTheme(theme) }),
  setGraphics: (graphics) => set({ graphics }),

  persistPreferences: async () => {
    const { theme, graphics, session } = get();
    await window.sbDesktop?.setPrefs({ theme, graphics });
    if (session?.authenticated) {
      await api.savePreferences({ theme, graphics });
    }
  },

  signOut: async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    setSessionToken(null);
    await window.sbDesktop?.setPrefs({ sessionToken: null });
    set({
      friends: [],
      session: {
        authenticated: false,
        user: null,
        capabilities: {
          profile: false,
          friends: false,
          presence: false,
          avatarWrite: false,
          inventory: false,
          servers: true,
        },
        scopes: [],
      },
    });
  },
}));
