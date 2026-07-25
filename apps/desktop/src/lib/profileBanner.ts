export type ProfileBannerPreference = {
  mode: "off" | "image" | "gif" | "video" | "color";
  mediaUrl: string;
  color: string;
  fit: "cover" | "contain" | "fill";
  position: "center" | "top" | "bottom" | "left" | "right";
  blur: number;
  opacity: number;
  dim: number;
  height: number;
  muted: boolean;
  loop: boolean;
};

type StoredBanner = {
  userId: string;
  banner: ProfileBannerPreference;
  savedAt: number;
};

const STORAGE_KEY = "sb-profile-banner";

const defaultBanner = (): ProfileBannerPreference => ({
  mode: "off",
  mediaUrl: "",
  color: "#1b2238",
  fit: "cover",
  position: "center",
  blur: 0,
  opacity: 1,
  dim: 0.35,
  height: 280,
  muted: true,
  loop: true,
});

function parseBanner(raw: unknown): ProfileBannerPreference | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<ProfileBannerPreference>;
  const mode = value.mode;
  if (
    mode !== "off" &&
    mode !== "image" &&
    mode !== "gif" &&
    mode !== "video" &&
    mode !== "color"
  ) {
    return null;
  }
  return {
    mode,
    mediaUrl: typeof value.mediaUrl === "string" ? value.mediaUrl : "",
    color: typeof value.color === "string" ? value.color : "#1b2238",
    fit:
      value.fit === "contain" || value.fit === "fill" || value.fit === "cover"
        ? value.fit
        : "cover",
    position:
      value.position === "top" ||
      value.position === "bottom" ||
      value.position === "left" ||
      value.position === "right" ||
      value.position === "center"
        ? value.position
        : "center",
    blur: typeof value.blur === "number" ? value.blur : 0,
    opacity: typeof value.opacity === "number" ? value.opacity : 1,
    dim: typeof value.dim === "number" ? value.dim : 0.35,
    height: typeof value.height === "number" ? value.height : 280,
    muted: value.muted !== false,
    loop: value.loop !== false,
  };
}

function readStored(): StoredBanner | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<StoredBanner> | null;
    if (!parsed || typeof parsed.userId !== "string") return null;
    const banner = parseBanner(parsed.banner);
    if (!banner) return null;
    return {
      userId: parsed.userId,
      banner,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function getProfileBannerPreference(userId: string): ProfileBannerPreference | null {
  const stored = readStored();
  if (!stored || stored.userId !== String(userId)) return null;
  return stored.banner;
}

export function saveProfileBannerPreference(userId: string, banner: ProfileBannerPreference) {
  const payload: StoredBanner = {
    userId: String(userId),
    banner,
    savedAt: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  void window.sbDesktop?.setPrefs?.({ profileBanner: payload });
}

export function resolveOwnBanner(
  userId: string,
  fromCloud: ProfileBannerPreference,
): ProfileBannerPreference {
  const local = getProfileBannerPreference(userId);
  if (!local) return fromCloud;

  // Prefer a non-empty local banner when cloud still echoes off/empty (lag / stale).
  const cloudEmpty =
    fromCloud.mode === "off" ||
    ((fromCloud.mode === "image" || fromCloud.mode === "gif" || fromCloud.mode === "video") &&
      !fromCloud.mediaUrl.trim());
  const localHasContent =
    local.mode === "color" ||
    local.mode === "off" ||
    ((local.mode === "image" || local.mode === "gif" || local.mode === "video") &&
      Boolean(local.mediaUrl.trim()));

  if (cloudEmpty && local.mode !== "off" && localHasContent) return local;
  return fromCloud;
}

export { defaultBanner as defaultProfileBanner };
