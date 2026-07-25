export type RobloxAppIconMode = "default" | "launcher" | "custom";

export type RobloxAppIconPreference = {
  mode: RobloxAppIconMode;
  customUrl: string;
};

const STORAGE_KEY = "sb-roblox-app-icon";
export const ROBLOX_APP_ICON_EVENT = "sb-roblox-app-icon-updated";

const MODES: RobloxAppIconMode[] = ["default", "launcher", "custom"];

let cached: RobloxAppIconPreference | null = null;

function parsePreference(raw: unknown): RobloxAppIconPreference | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<RobloxAppIconPreference> & { mode?: string };
  // Dropped classic logo option — fall back to default.
  const mode = MODES.includes(value.mode as RobloxAppIconMode)
    ? (value.mode as RobloxAppIconMode)
    : "default";
  return {
    mode,
    customUrl: typeof value.customUrl === "string" ? value.customUrl : "",
  };
}

function readLocalStoragePreference(): RobloxAppIconPreference {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Partial<RobloxAppIconPreference>;
    return parsePreference(parsed) ?? { mode: "default", customUrl: "" };
  } catch {
    return { mode: "default", customUrl: "" };
  }
}

export function hydrateRobloxAppIconPreference(prefs: Record<string, unknown>) {
  const fromPrefs = parsePreference(prefs.robloxAppIcon);
  if (fromPrefs) {
    cached = fromPrefs;
    return;
  }
  cached = readLocalStoragePreference();
  if (cached.mode !== "default" || cached.customUrl.trim()) {
    void window.sbDesktop?.setPrefs({ robloxAppIcon: cached });
  }
}

export function getRobloxAppIconPreference(): RobloxAppIconPreference {
  return cached ?? readLocalStoragePreference();
}

export function saveRobloxAppIconPreference(preference: RobloxAppIconPreference) {
  cached = preference;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
  void window.sbDesktop?.setPrefs({ robloxAppIcon: preference });
  window.dispatchEvent(new CustomEvent(ROBLOX_APP_ICON_EVENT, { detail: preference }));
}

export async function applyRobloxAppIconPreference(preference: RobloxAppIconPreference) {
  saveRobloxAppIconPreference(preference);
  return window.sbDesktop?.applyRobloxAppIcon?.(preference) ?? {
    ok: false,
    message: "Roblox app icon changes require the desktop app.",
    updated: [] as string[],
  };
}
