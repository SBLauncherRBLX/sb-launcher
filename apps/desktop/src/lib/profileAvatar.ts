export type ProfileAvatarMode = "roblox" | "custom";

export type ProfileAvatarPreference = {
  mode: ProfileAvatarMode;
  customUrl: string;
};

const STORAGE_KEY = "sb-profile-avatar";
export const PROFILE_AVATAR_EVENT = "sb-profile-avatar-updated";

let cached: ProfileAvatarPreference | null = null;

function parsePreference(raw: unknown): ProfileAvatarPreference | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<ProfileAvatarPreference>;
  // Migrate old launcher/classic person modes back to roblox.
  const mode = value.mode === "custom" ? "custom" : "roblox";
  return {
    mode,
    customUrl: typeof value.customUrl === "string" ? value.customUrl : "",
  };
}

function readLocalStoragePreference(): ProfileAvatarPreference {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<ProfileAvatarPreference>;
    return parsePreference(parsed) ?? { mode: "roblox", customUrl: "" };
  } catch {
    return { mode: "roblox", customUrl: "" };
  }
}

export function hydrateProfileAvatarPreference(prefs: Record<string, unknown>) {
  const fromPrefs = parsePreference(prefs.profileAvatar);
  if (fromPrefs) {
    cached = fromPrefs;
    return;
  }

  const legacy = readLocalStoragePreference();
  cached = legacy;
  if (legacy.mode === "custom" && legacy.customUrl.trim()) {
    void window.sbDesktop?.setPrefs({ profileAvatar: legacy });
  }
}

export function getProfileAvatarPreference(): ProfileAvatarPreference {
  return cached ?? readLocalStoragePreference();
}

export function saveProfileAvatarPreference(preference: ProfileAvatarPreference) {
  cached = preference;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
  void window.sbDesktop?.setPrefs({ profileAvatar: preference });
  window.dispatchEvent(new CustomEvent(PROFILE_AVATAR_EVENT, { detail: preference }));
}

export function resolveProfileAvatar(
  robloxUrl: string | null | undefined,
  preference: ProfileAvatarPreference,
): string | null {
  if (preference.mode === "custom" && preference.customUrl.trim()) {
    return preference.customUrl.trim();
  }
  return robloxUrl ?? null;
}
