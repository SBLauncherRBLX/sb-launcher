export type NickBadgePreference = {
  mode: "launcher" | "custom" | "off";
  customUrl: string;
};

const STORAGE_KEY = "sb-nick-badge";
export const NICK_BADGE_EVENT = "sb-nick-badge-updated";

let cached: NickBadgePreference | null = null;

function parsePreference(raw: unknown): NickBadgePreference | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<NickBadgePreference>;
  const mode =
    value.mode === "custom" || value.mode === "off" || value.mode === "launcher"
      ? value.mode
      : "launcher";
  return {
    mode,
    customUrl: typeof value.customUrl === "string" ? value.customUrl : "",
  };
}

function readLocalStoragePreference(): NickBadgePreference {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<NickBadgePreference>;
    return parsePreference(parsed) ?? { mode: "launcher", customUrl: "" };
  } catch {
    return { mode: "launcher", customUrl: "" };
  }
}

export function hydrateNickBadgePreference(prefs: Record<string, unknown>) {
  const fromPrefs = parsePreference(prefs.nickBadge);
  if (fromPrefs) {
    cached = fromPrefs;
    return;
  }
  cached = readLocalStoragePreference();
  if (cached.mode !== "launcher" || cached.customUrl.trim()) {
    void window.sbDesktop?.setPrefs({ nickBadge: cached });
  }
}

export function getNickBadgePreference(): NickBadgePreference {
  return cached ?? readLocalStoragePreference();
}

export function saveNickBadgePreference(preference: NickBadgePreference) {
  cached = preference;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
  void window.sbDesktop?.setPrefs({ nickBadge: preference });
  window.dispatchEvent(new CustomEvent(NICK_BADGE_EVENT, { detail: preference }));
}

export function resolveNickBadgeSrc(
  preference: NickBadgePreference,
  launcherLogoUrl: string,
): string | null {
  if (preference.mode === "off") return null;
  if (preference.mode === "custom" && preference.customUrl.trim()) {
    return preference.customUrl.trim();
  }
  return launcherLogoUrl;
}
