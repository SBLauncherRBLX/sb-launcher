/// <reference types="vite/client" />

type SbDesktopApi = {
  getPrefs: () => Promise<Record<string, unknown>>;
  setPrefs: (patch: Record<string, unknown>) => Promise<Record<string, unknown>>;
  openExternal: (url: string) => Promise<boolean>;
  openRoblox: (
    deepLink: string,
    graphics?: import("@sb/contracts").SafeGraphicsSettings,
  ) => Promise<{ ok: boolean; error?: string; optimization?: RobloxOptimizationResult }>;
  applyRobloxSettings: (
    graphics: import("@sb/contracts").SafeGraphicsSettings,
  ) => Promise<RobloxOptimizationResult>;
  pickRobloxFont: () => Promise<{
    id: string;
    name: string;
    path?: string;
    url?: string;
  } | null>;
  getRobloxFontPreviewDataUrl: (fontId: string) => Promise<string | null>;
  sampleMediaLuminance: (url: string) => Promise<number | null>;
  pickLaunchOverlayMedia: () => Promise<{
    id: string;
    name: string;
    url: string;
    kind: "image" | "gif";
  } | null>;
  getPendingAuthToken: () => Promise<string | null>;
  detectRoblox: () => Promise<{ installed: boolean; path: string | null }>;
  isRobloxRunning: () => Promise<boolean>;
  getOAuthConfig: () => Promise<{
    clientId: string;
    redirectUri: string;
    configured: boolean;
  }>;
  setOAuthClientId: (clientId: string) => Promise<{ configured: boolean }>;
  pickWallpaper: () => Promise<{ id: string; name: string; url: string } | null>;
  pickProfileAvatar: () => Promise<{ url: string } | null>;
  pickNickBadge: () => Promise<{ url: string } | null>;
  pickRobloxAppIcon: () => Promise<{ id: string; url: string; icoPath?: string } | null>;
  applyRobloxAppIcon: (preference: {
    mode: string;
    customUrl: string;
  }) => Promise<{ ok: boolean; message: string; updated?: string[] }>;
  listCustomWallpapers: () => Promise<Array<{ id: string; name: string; url: string }>>;
  setWindowChrome: (chrome: {
    background: string;
    text: string;
    accent: string;
    accentSecondary?: string;
    cornerRadius?: number;
  }) => Promise<boolean>;
  setDiscordActivity: (payload: {
    details?: string;
    state?: string;
    playing?: string;
  }) => Promise<boolean>;
  clearDiscordActivity: () => Promise<boolean>;
  startUpdate: (payload: {
    downloadUrl: string;
    version: string;
    keepPresets: boolean;
  }) => Promise<boolean>;
  cancelUpdate: () => Promise<boolean>;
  onUpdateProgress: (
    handler: (event: {
      type?: string;
      phase?: string;
      percent?: number;
      message?: string;
    }) => void,
  ) => () => void;
  onAuthToken: (handler: (token: string) => void) => () => void;
};

type RobloxOptimizationResult = {
  ok: boolean;
  applied: string[];
  message: string;
  backupPath?: string;
  fastFlagsPath?: string;
};

declare global {
  interface Window {
    sbDesktop?: SbDesktopApi;
  }
}

export {};
