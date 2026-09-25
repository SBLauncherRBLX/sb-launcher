import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { FavoritesIslandSchema, type FavoritesIsland, type UserProfileDetails } from "@sb/contracts";
import { Badge, Button, EmptyState, LoadingState } from "@sb/ui";
import { api } from "../lib/api";
import { GameCard, formatCount } from "../components/GameCard";
import { launchExperience } from "../lib/launch";
import { useAppStore } from "../store";
import sbLogo from "../assets/sb-logo.png";
import {
  getProfileAvatarPreference,
  saveProfileAvatarPreference,
  type ProfileAvatarPreference,
} from "../lib/profileAvatar";
import {
  saveNickBadgePreference,
  type NickBadgePreference,
} from "../lib/nickBadge";
import {
  luminanceFromCssColor,
  sampleMediaLuminance,
  toneFromLuminance,
  type ProfileTextTone,
} from "../lib/bannerContrast";
import {
  defaultProfileBanner,
  resolveOwnBanner,
  saveProfileBannerPreference,
  type ProfileBannerPreference,
} from "../lib/profileBanner";

type BannerState = ProfileBannerPreference;

const defaultBanner = defaultProfileBanner;

function savedFavoriteIconSize(userId: string): number | null {
  try {
    const size = Number(localStorage.getItem(`sb-favorite-icon-size-v1:${userId}`));
    return Number.isFinite(size) && size >= 24 && size <= 128 ? size : null;
  } catch {
    return null;
  }
}

function savedFavoriteLayout(userId: string): Partial<FavoritesIsland> | null {
  try {
    const value = JSON.parse(localStorage.getItem(`sb-favorite-layout-v1:${userId}`) || "null");
    if (!value || typeof value !== "object") return null;
    const parsed = FavoritesIslandSchema.parse(value);
    return { layout: parsed.layout, columns: parsed.columns, freeWidth: parsed.freeWidth,
      freeHeight: parsed.freeHeight, iconPositions: parsed.iconPositions };
  } catch { return null; }
}

function bannerFromLauncher(
  b: UserProfileDetails["launcherBanner"] | null | undefined,
): BannerState {
  return {
    mode: b?.mode ?? "off",
    mediaUrl: b?.mediaUrl ?? "",
    color: b?.color ?? "#1b2238",
    fit: b?.fit ?? "cover",
    position: b?.position ?? "center",
    blur: b?.blur ?? 0,
    opacity: b?.opacity ?? 1,
    dim: b?.dim ?? 0.35,
    height: b?.height ?? 280,
    muted: b?.muted ?? true,
    loop: b?.loop ?? true,
  };
}

function bannerToLauncher(
  state: BannerState,
): NonNullable<UserProfileDetails["launcherBanner"]> {
  const mediaModes = state.mode === "image" || state.mode === "gif" || state.mode === "video";
  return {
    mode: state.mode,
    mediaUrl: mediaModes ? state.mediaUrl.trim() || null : null,
    color: state.mode === "color" ? state.color : null,
    fit: state.fit,
    position: state.position,
    blur: state.blur,
    opacity: state.opacity,
    dim: state.dim,
    height: state.height,
    muted: state.muted,
    loop: state.loop,
  };
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function isLocalVirtualMediaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith(".sblauncher");
  } catch {
    return false;
  }
}

async function uploadPickedNativeMedia(
  picked: { url: string; dataBase64?: string; contentType?: string },
  upload: (file: { contentType: string; dataBase64: string }) => Promise<string | null>,
): Promise<string> {
  // Prefer bytes from the native host — WebView cannot reliably fetch
  // cross-origin virtual hosts like profile.sblauncher / badges.sblauncher.
  if (picked.dataBase64?.trim()) {
    const url = await upload({
      contentType: picked.contentType || "image/png",
      dataBase64: picked.dataBase64,
    });
    if (url) return url;
    throw new Error("Cloud upload failed. Check your connection and try again.");
  }

  // Legacy fallback (browser / older hosts).
  const res = await fetch(picked.url);
  const blob = await res.blob();
  const file = new File([blob], "upload.bin", { type: blob.type || "application/octet-stream" });
  const dataBase64 = await fileToBase64(file);
  const url = await upload({
    contentType: file.type || "application/octet-stream",
    dataBase64,
  });
  if (url) return url;
  throw new Error("Cloud upload failed. Check your connection and try again.");
}

export function UserProfilePage() {
  const { userId = "" } = useParams();
  const friends = useAppStore((s) => s.friends);
  const session = useAppStore((s) => s.session);
  const [profile, setProfile] = useState<UserProfileDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [badge, setBadge] = useState<NickBadgePreference>({ mode: "launcher", customUrl: "" });
  const [avatar, setAvatar] = useState<ProfileAvatarPreference>({ mode: "roblox", customUrl: "" });
  const [banner, setBanner] = useState<BannerState>(defaultBanner);
  const [favoritesIsland, setFavoritesIsland] = useState<FavoritesIsland>(() => FavoritesIslandSchema.parse({}));
  const draggingFavorite = useRef<{ id: string; pointerId: number } | null>(null);
  const [textTone, setTextTone] = useState<ProfileTextTone>("light");
  const [avatarFallbackIndex, setAvatarFallbackIndex] = useState(0);

  const friendPresence = useMemo(
    () => friends.find((friend) => friend.userId === userId) ?? null,
    [friends, userId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEditorOpen(false);
    setMessage(null);
    void api
      .userProfile(userId)
      .then((data) => {
        if (cancelled) return;
        const ownId = useAppStore.getState().session?.user?.id ?? "";
        const own = String(ownId) === String(data.id);
        const cloudIsland = FavoritesIslandSchema.parse(data.favoritesIsland ?? {});
        const localIconSize = own ? savedFavoriteIconSize(data.id) : null;
        const localLayout = own ? savedFavoriteLayout(data.id) : null;
        const islandWithLayout = localLayout && cloudIsland.layout === "row" && localLayout.layout !== "row"
          ? { ...cloudIsland, ...localLayout } : cloudIsland;
        const island = localIconSize && localIconSize > 64 && islandWithLayout.iconSize <= 64
          ? { ...islandWithLayout, iconSize: localIconSize }
          : islandWithLayout;
        setProfile({ ...data, favoritesIsland: island });
        setAvatarFallbackIndex(0);
        setBadge({
          mode: data.launcherBadgeMode ?? "launcher",
          customUrl: data.launcherBadgeUrl ?? "",
        });
        setAvatar({
          mode: data.launcherAvatarMode ?? "roblox",
          customUrl: data.launcherAvatarUrl ?? "",
        });
        const fromCloud = bannerFromLauncher(data.launcherBanner);
        if (own) {
          saveProfileAvatarPreference({
            mode: data.launcherAvatarMode === "custom" ? "custom" : "roblox",
            customUrl: data.launcherAvatarUrl ?? "",
          });
          saveNickBadgePreference({
            mode:
              data.launcherBadgeMode === "custom" ||
              data.launcherBadgeMode === "off" ||
              data.launcherBadgeMode === "launcher"
                ? data.launcherBadgeMode
                : "launcher",
            customUrl: data.launcherBadgeUrl ?? "",
          });
        }
        setBanner(own ? resolveOwnBanner(data.id, fromCloud) : fromCloud);
        setFavoritesIsland(island);
        setError(null);
      })
      .catch((reason) => {
        if (cancelled) return;
        const cachedFriend = useAppStore
          .getState()
          .friends.find((friend) => friend.userId === userId);
        if (cachedFriend) {
          setProfile({
            id: cachedFriend.userId,
            username: cachedFriend.username,
            displayName: cachedFriend.displayName,
            description: "",
            createdAt: null,
            avatarUrl: cachedFriend.avatarUrl,
            fullBodyAvatarUrl: cachedFriend.avatarUrl,
            profileUrl: `https://www.roblox.com/users/${cachedFriend.userId}/profile`,
            isBanned: false,
            hasVerifiedBadge: false,
            friendCount: 0,
            followerCount: 0,
            followingCount: 0,
            presenceType: cachedFriend.presenceType,
            isOnline: cachedFriend.isOnline,
            lastLocation: cachedFriend.lastLocation,
            placeId: cachedFriend.placeId,
            universeId: cachedFriend.universeId,
            gameInstanceId: cachedFriend.gameInstanceId,
            canJoin: cachedFriend.canJoin,
            registeredViaLauncher: false,
            launcherBadgeMode: "off",
            launcherBadgeUrl: null,
            launcherAvatarMode: "roblox",
            launcherAvatarUrl: null,
            launcherBanner: null,
            favoritesIsland: FavoritesIslandSchema.parse({}),
            favoriteGames: [],
            games: [],
          });
          setError(null);
          return;
        }
        setError(reason instanceof Error ? reason.message : "Could not load profile.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    const active = banner.mode === "off" ? null : bannerToLauncher(banner);
    if (!active) {
      setTextTone("light");
      return;
    }

    const dim = active.dim ?? 0.35;

    async function resolveTone() {
      if (!active) return;
      if (active.mode === "color") {
        const lum = luminanceFromCssColor(active.color || "#1b2238") ?? 0.2;
        if (!cancelled) setTextTone(toneFromLuminance(lum, dim));
        return;
      }

      if (active.mediaUrl) {
        const sampled = await sampleMediaLuminance(active.mediaUrl);
        if (cancelled) return;
        if (sampled != null) {
          setTextTone(toneFromLuminance(sampled, dim));
          return;
        }
      }

      if (!cancelled) setTextTone(dim < 0.12 ? "dark" : "light");
    }

    void resolveTone();
    return () => {
      cancelled = true;
    };
  }, [banner.mode, banner.color, banner.mediaUrl, banner.dim]);

  if (loading) return <LoadingState label="Loading Roblox profile…" />;
  if (error || !profile) {
    return <EmptyState title="Profile unavailable" description={error ?? undefined} />;
  }

  const presenceType = friendPresence?.presenceType ?? profile.presenceType;
  const isOnline = friendPresence?.isOnline ?? profile.isOnline;
  const lastLocation = friendPresence?.lastLocation ?? profile.lastLocation;
  const canJoin = friendPresence?.canJoin ?? profile.canJoin;
  const placeId = friendPresence?.placeId ?? profile.placeId;
  const universeId = friendPresence?.universeId ?? profile.universeId;
  const gameInstanceId = friendPresence?.gameInstanceId ?? profile.gameInstanceId;

  const isOwnProfile = String(session?.user?.id ?? "") === String(profile.id);
  const badgeMode = profile.launcherBadgeMode ?? "off";
  const badgeUrl =
    badgeMode === "custom"
      ? profile.launcherBadgeUrl
      : badgeMode === "launcher"
        ? sbLogo
        : null;
  const showLauncherBadge =
    Boolean(profile.registeredViaLauncher) && badgeMode !== "off" && Boolean(badgeUrl);

  const avatarCandidates: string[] = [];
  const pushAvatar = (url: string | null | undefined) => {
    const value = url?.trim();
    if (value && !avatarCandidates.includes(value)) avatarCandidates.push(value);
  };

  if (profile.launcherAvatarMode === "custom") pushAvatar(profile.launcherAvatarUrl);
  if (isOwnProfile) {
    const local = getProfileAvatarPreference();
    if (local.mode === "custom") pushAvatar(local.customUrl);
  }
  pushAvatar(profile.fullBodyAvatarUrl);
  pushAvatar(profile.avatarUrl);
  pushAvatar(friendPresence?.avatarUrl);
  if (isOwnProfile) pushAvatar(session?.user?.avatarUrl);

  const displayAvatar = avatarCandidates[avatarFallbackIndex] ?? null;

  // Always paint from normalized local banner state (filled on load for every profile).
  // Own profile keeps editor/local cache; others get cloud via bannerFromLauncher defaults.
  // Using raw profile.launcherBanner for guests caused height/fit mismatches → "half banner".
  const bannerView = banner.mode === "off" ? null : bannerToLauncher(banner);
  const bannerHeight = Math.min(480, Math.max(160, bannerView?.height ?? 280));
  const showFavoritesIsland = favoritesIsland.visible && (isOwnProfile || Boolean(profile.favoriteGames?.length));
  const favoriteCount = Math.min(profile.favoriteGames?.length ?? 0, 8);
  const columnHeight = favoriteCount * favoritesIsland.iconSize
    + Math.max(0, favoriteCount - 1) * favoritesIsland.gap
    + (favoritesIsland.showHeading ? 42 : 24) + favoritesIsland.offsetY * 2;
  const columnFitsBanner = favoritesIsland.layout === "column" && columnHeight <= 640 && favoritesIsland.iconSize < 88;
  const renderedBannerHeight = columnFitsBanner ? Math.max(bannerHeight, columnHeight) : bannerHeight;
  const favoritesBelow = favoritesIsland.iconSize >= 88 || favoritesIsland.layout === "free"
    || (favoritesIsland.layout === "column" && !columnFitsBanner);

  function moveFavorite(event: ReactPointerEvent<HTMLAnchorElement>, id: string) {
    if (draggingFavorite.current?.id !== id || draggingFavorite.current.pointerId !== event.pointerId) return;
    const area = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!area) return;
    const usableWidth = Math.max(1, area.width - favoritesIsland.iconSize);
    const usableHeight = Math.max(1, area.height - favoritesIsland.iconSize);
    const x = Math.max(0, Math.min(1, (event.clientX - area.left - favoritesIsland.iconSize / 2) / usableWidth));
    const y = Math.max(0, Math.min(1, (event.clientY - area.top - favoritesIsland.iconSize / 2) / usableHeight));
    setFavoritesIsland(current => ({ ...current, iconPositions: { ...current.iconPositions, [id]: { x, y } } }));
  }
  const heroStyle =
    bannerView
      ? ({
          ["--profile-banner-height" as string]: `${renderedBannerHeight}px`,
          ["--profile-banner-blur" as string]: `${bannerView.blur ?? 0}px`,
        } as CSSProperties)
      : undefined;

  async function uploadPickedFile(file: File): Promise<string | null> {
    const dataBase64 = await fileToBase64(file);
    const uploaded = await api.uploadProfileMedia({
      contentType: file.type || "application/octet-stream",
      dataBase64,
    });
    return uploaded.url;
  }

  async function resolveNativeUpload(
    picked: { url: string; dataBase64?: string; contentType?: string },
  ): Promise<string> {
    return uploadPickedNativeMedia(picked, async ({ contentType, dataBase64 }) => {
      const uploaded = await api.uploadProfileMedia({ contentType, dataBase64 });
      return uploaded.url;
    });
  }

  async function saveCosmetics() {
    setSaving(true);
    setMessage(null);
    const badgeSnapshot = { ...badge };
    const avatarSnapshot = { ...avatar };
    const bannerSnapshot = { ...banner };
    const islandSnapshot = { ...favoritesIsland };
    if (isOwnProfile) {
      try { localStorage.setItem(`sb-favorite-icon-size-v1:${userId}`, String(islandSnapshot.iconSize)); } catch { /* Cloud save still works. */ }
      try { localStorage.setItem(`sb-favorite-layout-v1:${userId}`, JSON.stringify(islandSnapshot)); } catch { /* Cloud save still works. */ }
    }

    if (
      avatarSnapshot.mode === "custom" &&
      (!avatarSnapshot.customUrl.trim() || isLocalVirtualMediaUrl(avatarSnapshot.customUrl))
    ) {
      setSaving(false);
      setMessage(
        "Custom photo must be uploaded to cloud first. Click Upload photo, wait for it to finish, then Save.",
      );
      return;
    }
    if (
      badgeSnapshot.mode === "custom" &&
      (!badgeSnapshot.customUrl.trim() || isLocalVirtualMediaUrl(badgeSnapshot.customUrl))
    ) {
      setSaving(false);
      setMessage(
        "Custom badge must be uploaded to cloud first. Click Upload badge image, wait for it to finish, then Save.",
      );
      return;
    }

    const nextBanner = bannerToLauncher(bannerSnapshot);

    // Optimistic UI — apply immediately, then persist to cloud.
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            registeredViaLauncher: true,
            launcherBadgeMode: badgeSnapshot.mode,
            launcherBadgeUrl:
              badgeSnapshot.mode === "custom"
                ? badgeSnapshot.customUrl.trim() || null
                : null,
            launcherAvatarMode: avatarSnapshot.mode,
            launcherAvatarUrl:
              avatarSnapshot.mode === "custom"
                ? avatarSnapshot.customUrl.trim() || null
                : null,
            launcherBanner: nextBanner,
            favoritesIsland: islandSnapshot,
          }
        : prev,
    );
    setBanner(bannerSnapshot);
    saveNickBadgePreference(badgeSnapshot);
    saveProfileAvatarPreference(avatarSnapshot);
    if (userId) saveProfileBannerPreference(userId, bannerSnapshot);

    try {
      const cosmetics = {
        badge: {
          mode: badgeSnapshot.mode,
          customUrl:
            badgeSnapshot.mode === "custom" ? badgeSnapshot.customUrl.trim() || null : null,
        },
        avatar: {
          mode: avatarSnapshot.mode,
          customUrl:
            avatarSnapshot.mode === "custom" ? avatarSnapshot.customUrl.trim() || null : null,
        },
        banner: {
          mode: nextBanner.mode,
          mediaUrl: nextBanner.mediaUrl ?? null,
          color: nextBanner.color ?? null,
          fit: nextBanner.fit,
          position: nextBanner.position,
          blur: nextBanner.blur,
          opacity: nextBanner.opacity,
          dim: nextBanner.dim,
          height: nextBanner.height,
          muted: nextBanner.muted,
          loop: nextBanner.loop,
        },
        favoritesIsland: islandSnapshot,
      };
      await api.saveProfileCosmetics(cosmetics);
      setMessage("Profile look saved for everyone in SB Launcher.");
      setEditorOpen(false);
    } catch {
      // Cloud is only for sharing with others — local optimistic save already succeeded.
      // Any cloud failure (quota, network, 503) should not look like an error.
      setMessage("Saved locally — will sync to cloud when it is available.");
      setEditorOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function syncFavoritesToProfile() {
    setSaving(true);
    setMessage(null);
    try {
      const result = await api.syncProfileFavorites();
      if (!result.ok) {
        setMessage("Could not sync favorites to cloud. Try again later.");
        return;
      }
      const refreshed = await api.userProfile(userId);
      setProfile(refreshed);
      setMessage("Favorite games synced to your profile.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not sync favorites.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="user-profile-page">
      {message ? <div className="notice">{message}</div> : null}

      <section
        className={`sb-card profile-hero${bannerView && bannerView.mode !== "off" ? ` profile-hero--tone-${textTone}` : ""}${showFavoritesIsland ? " has-favorites" : ""}${showFavoritesIsland && favoritesBelow ? " favorites-below" : ""}`}
        style={heroStyle}
        data-text-tone={bannerView && bannerView.mode !== "off" ? textTone : undefined}
      >
        <div className="profile-hero-glow" />
        {bannerView ? (
          <div
            className="profile-banner-layer"
            style={{ opacity: bannerView.opacity ?? 1 }}
          >
            {bannerView.mode === "color" ? (
              <div
                className="profile-banner-fill"
                style={{ background: bannerView.color || "#1b2238" }}
              />
            ) : bannerView.mode === "video" && bannerView.mediaUrl ? (
              <video
                key={bannerView.mediaUrl}
                className="profile-banner-media"
                src={bannerView.mediaUrl}
                autoPlay
                muted={bannerView.muted !== false}
                loop={bannerView.loop !== false}
                playsInline
                style={{
                  objectFit: bannerView.fit ?? "cover",
                  objectPosition: bannerView.position ?? "center",
                }}
              />
            ) : bannerView.mediaUrl ? (
              <img
                key={bannerView.mediaUrl}
                className="profile-banner-media"
                src={bannerView.mediaUrl}
                alt=""
                style={{
                  objectFit: bannerView.fit ?? "cover",
                  objectPosition: bannerView.position ?? "center",
                }}
              />
            ) : null}
            <div
              className="profile-banner-dim"
              style={{ opacity: bannerView.dim ?? 0.35 }}
            />
          </div>
        ) : null}

        <div className={`profile-avatar-large${profile.launcherAvatarMode === "custom" && profile.fullBodyAvatarUrl ? " has-skin-hover" : ""}`}>
          {profile.launcherAvatarMode === "custom" && profile.fullBodyAvatarUrl ? <img className="profile-hover-skin" src={profile.fullBodyAvatarUrl} alt="" aria-hidden="true" /> : null}
          {displayAvatar ? (
            <img
              className="profile-avatar-photo"
              key={displayAvatar}
              src={displayAvatar}
              alt={profile.displayName}
              onError={() =>
                setAvatarFallbackIndex((index) =>
                  index + 1 < avatarCandidates.length ? index + 1 : index,
                )
              }
            />
          ) : (
            <span>{profile.displayName.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        {showFavoritesIsland ? <div
          className={`profile-hero-favorites is-${favoritesIsland.surface} at-${favoritesIsland.position} layout-${favoritesIsland.layout}${favoritesIsland.border ? " has-border" : ""}${isOwnProfile && editorOpen && favoritesIsland.layout === "free" ? " is-editing" : ""}`}
          aria-label="Favorite games"
          style={{
            ["--favorites-color" as string]: favoritesIsland.color,
            ["--favorites-opacity" as string]: `${favoritesIsland.opacity * 100}%`,
            ["--favorites-blur" as string]: `${favoritesIsland.blur}px`,
            ["--favorites-radius" as string]: `${favoritesIsland.radius}px`,
            ["--favorites-icon" as string]: `${favoritesIsland.iconSize}px`,
            ["--favorites-gap" as string]: `${favoritesIsland.gap}px`,
            ["--favorites-columns" as string]: favoritesIsland.columns,
            ["--favorites-free-width" as string]: `${favoritesIsland.freeWidth}px`,
            ["--favorites-free-height" as string]: `${favoritesIsland.freeHeight}px`,
            ["--favorites-offset-x" as string]: `${favoritesIsland.offsetX}px`,
            ["--favorites-offset-y" as string]: `${favoritesIsland.offsetY}px`,
          } as CSSProperties}
        >
          {favoritesIsland.showHeading && <div className="profile-favorites-heading"><strong>Favorite games</strong></div>}
          <div className="profile-favorites-icons">{profile.favoriteGames?.slice(0, 8).map((game, index) => {
            const point = favoritesIsland.iconPositions[game.universeId] ?? {
              x: (index % 4) / 3, y: Math.floor(index / 4),
            };
            const canDrag = isOwnProfile && editorOpen && favoritesIsland.layout === "free";
            return <Link key={game.universeId} to={`/game/${game.universeId}`} title={game.name} aria-label={game.name}
              style={favoritesIsland.layout === "free" ? {
                left: `calc(${point.x * 100}% - ${point.x * favoritesIsland.iconSize}px)`,
                top: `calc(${point.y * 100}% - ${point.y * favoritesIsland.iconSize}px)`,
              } : undefined}
              onClick={event => { if (canDrag) event.preventDefault(); }}
              onPointerDown={event => { if (!canDrag) return; event.preventDefault(); draggingFavorite.current = { id: game.universeId, pointerId: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); }}
              onPointerMove={event => { if (canDrag) moveFavorite(event, game.universeId); }}
              onPointerUp={event => { if (draggingFavorite.current?.pointerId === event.pointerId) draggingFavorite.current = null; }}
              onPointerCancel={() => { draggingFavorite.current = null; }}>
              {game.iconUrl ? <img src={game.iconUrl} alt="" loading="lazy" /> : <span aria-hidden="true">★</span>}
            </Link>;
          })}</div>
        </div> : null}
        <div className="profile-hero-content">
          <div className="profile-name-row">
            <h2 className="profile-display-name">
              <span>{profile.displayName}</span>
              {showLauncherBadge ? (
                <img
                  src={badgeUrl!}
                  alt="SB Launcher"
                  className="launcher-user-badge"
                  title={
                    badgeMode === "custom"
                      ? "Custom SB Launcher badge"
                      : "Signed in with SB Launcher"
                  }
                />
              ) : null}
            </h2>
            {profile.hasVerifiedBadge ? <Badge>Verified</Badge> : null}
            {profile.registeredViaLauncher ? <Badge>SB Launcher</Badge> : null}
            <Badge>
              {presenceType === "InGame"
                ? "In Experience"
                : presenceType === "InStudio"
                  ? "In Studio"
                  : isOnline
                    ? "Online"
                    : presenceType === "Unknown"
                      ? "Status unknown"
                      : "Offline"}
            </Badge>
          </div>
          <p className="sb-muted profile-handle">@{profile.username}</p>
          {presenceType === "InGame" && lastLocation ? (
            <p className="profile-playing-now">Playing {lastLocation}</p>
          ) : null}
          <div className="profile-counts">
            <div>
              <strong>{formatCount(profile.friendCount)}</strong>
              <span>Friends</span>
            </div>
            <div>
              <strong>{formatCount(profile.followerCount)}</strong>
              <span>Followers</span>
            </div>
            <div>
              <strong>{formatCount(profile.followingCount)}</strong>
              <span>Following</span>
            </div>
          </div>
          {profile.createdAt ? (
            <p className="sb-muted profile-joined">
              Joined{" "}
              {new Intl.DateTimeFormat("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              }).format(new Date(profile.createdAt))}
            </p>
          ) : null}
          <div className="row-actions">
            {canJoin ? (
              <Button
                onClick={() =>
                  void launchExperience({
                    placeId: placeId ?? undefined,
                    userId: profile.id,
                    gameInstanceId: gameInstanceId ?? undefined,
                    universeId: universeId ?? undefined,
                    name: lastLocation ?? "Experience",
                  })
                }
              >
                Join
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => void window.sbDesktop?.openExternal(profile.profileUrl)}
            >
              Open on Roblox
            </Button>
            {isOwnProfile ? (
              <Button variant="secondary" onClick={() => setEditorOpen((v) => !v)}>
                {editorOpen ? "Close editor" : "Customize profile"}
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {isOwnProfile && editorOpen ? (
        <section className="sb-card profile-cosmetics-editor">
          <h3>Customize your launcher profile</h3>
          <p className="sb-muted">
            Badge, photo, and banner are visible to everyone using SB Launcher.
          </p>

          <div className="form-grid" style={{ marginTop: "1rem" }}>
            <label>
              Nick badge
              <select
                className="sb-input"
                value={badge.mode}
                onChange={(e) =>
                  setBadge({ ...badge, mode: e.target.value as NickBadgePreference["mode"] })
                }
              >
                <option value="launcher">SB Launcher logo</option>
                <option value="custom">Custom image</option>
                <option value="off">Hidden</option>
              </select>
            </label>
            {badge.mode === "custom" ? (
              <>
                <label>
                  Badge image URL
                  <input
                    className="sb-input"
                    value={badge.customUrl}
                    onChange={(e) => setBadge({ ...badge, customUrl: e.target.value })}
                    placeholder="https://…"
                  />
                </label>
                <div className="row-actions">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void window.sbDesktop?.pickNickBadge?.().then(async (picked) => {
                        if (!picked) return;
                        setMessage(null);
                        try {
                          const url = await resolveNativeUpload(picked);
                          setBadge({ mode: "custom", customUrl: url });
                          setMessage("Badge image uploaded. Click Save to publish.");
                        } catch (err) {
                          setMessage(
                            err instanceof Error
                              ? err.message
                              : "Could not upload badge image.",
                          );
                        }
                      })
                    }
                  >
                    Upload badge image
                  </Button>
                </div>
              </>
            ) : null}

            <label>
              Profile picture
              <select
                className="sb-input"
                value={avatar.mode}
                onChange={(e) =>
                  setAvatar({
                    ...avatar,
                    mode: e.target.value as ProfileAvatarPreference["mode"],
                  })
                }
              >
                <option value="roblox">Roblox profile</option>
                <option value="custom">Custom photo</option>
              </select>
            </label>
            {avatar.mode === "custom" ? (
              <>
                <label>
                  Custom photo URL
                  <input
                    className="sb-input"
                    value={avatar.customUrl}
                    onChange={(e) => setAvatar({ ...avatar, customUrl: e.target.value })}
                    placeholder="https://…"
                  />
                </label>
                <div className="row-actions">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void window.sbDesktop?.pickProfileAvatar?.().then(async (picked) => {
                        if (!picked) return;
                        setMessage(null);
                        try {
                          const url = await resolveNativeUpload(picked);
                          setAvatar({ mode: "custom", customUrl: url });
                          // Preview in Shell immediately via local prefs (cloud URL).
                          saveProfileAvatarPreference({ mode: "custom", customUrl: url });
                          setMessage("Photo uploaded. Click Save to publish on your profile.");
                        } catch (err) {
                          setMessage(
                            err instanceof Error
                              ? err.message
                              : "Could not upload profile photo.",
                          );
                        }
                      })
                    }
                  >
                    Upload photo
                  </Button>
                </div>
              </>
            ) : null}

            <label>
              Banner type
              <select
                className="sb-input"
                value={banner.mode}
                onChange={(e) =>
                  setBanner((prev) => ({
                    ...prev,
                    mode: e.target.value as BannerState["mode"],
                  }))
                }
              >
                <option value="off">Off</option>
                <option value="image">Photo</option>
                <option value="gif">GIF</option>
                <option value="video">Video</option>
                <option value="color">Solid color</option>
              </select>
            </label>

            {banner.mode === "color" ? (
              <label>
                Banner color
                <input
                  className="sb-input"
                  type="color"
                  value={banner.color}
                  onChange={(e) =>
                    setBanner((prev) => ({ ...prev, color: e.target.value }))
                  }
                />
              </label>
            ) : null}

            {banner.mode === "image" || banner.mode === "gif" || banner.mode === "video" ? (
              <>
                <label>
                  Banner media URL
                  <input
                    className="sb-input"
                    value={banner.mediaUrl}
                    onChange={(e) =>
                      setBanner((prev) => ({ ...prev, mediaUrl: e.target.value }))
                    }
                    placeholder="https://… (direct image/gif/mp4/webm)"
                  />
                </label>
                <div className="row-actions">
                  <label className="sb-button secondary file-pick-label">
                    Upload file
                    <input
                      type="file"
                      accept={
                        banner.mode === "video"
                          ? "video/mp4,video/webm"
                          : "image/png,image/jpeg,image/webp,image/gif"
                      }
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        void uploadPickedFile(file)
                          .then((url) => {
                            if (!url) return;
                            setBanner((prev) => ({ ...prev, mediaUrl: url }));
                          })
                          .catch((err) =>
                            setMessage(
                              err instanceof Error ? err.message : "Upload failed.",
                            ),
                          )
                          .finally(() => {
                            e.target.value = "";
                          });
                      }}
                    />
                  </label>
                </div>
              </>
            ) : null}

            {banner.mode !== "off" ? (
              <>
                <label>
                  Banner height ({banner.height}px)
                  <input
                    className="sb-input"
                    type="range"
                    min={160}
                    max={480}
                    value={banner.height}
                    onChange={(e) =>
                      setBanner((prev) => ({
                        ...prev,
                        height: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  Fit
                  <select
                    className="sb-input"
                    value={banner.fit}
                    onChange={(e) =>
                      setBanner((prev) => ({
                        ...prev,
                        fit: e.target.value as BannerState["fit"],
                      }))
                    }
                  >
                    <option value="cover">Cover</option>
                    <option value="contain">Contain</option>
                    <option value="fill">Fill</option>
                  </select>
                </label>
                <label>
                  Position
                  <select
                    className="sb-input"
                    value={banner.position}
                    onChange={(e) =>
                      setBanner((prev) => ({
                        ...prev,
                        position: e.target.value as BannerState["position"],
                      }))
                    }
                  >
                    <option value="center">Center</option>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </label>
                <label>
                  Blur ({banner.blur}px)
                  <input
                    className="sb-input"
                    type="range"
                    min={0}
                    max={24}
                    value={banner.blur}
                    onChange={(e) =>
                      setBanner((prev) => ({ ...prev, blur: Number(e.target.value) }))
                    }
                  />
                </label>
                <label>
                  Opacity ({Math.round(banner.opacity * 100)}%)
                  <input
                    className="sb-input"
                    type="range"
                    min={15}
                    max={100}
                    value={Math.round(banner.opacity * 100)}
                    onChange={(e) =>
                      setBanner((prev) => ({
                        ...prev,
                        opacity: Number(e.target.value) / 100,
                      }))
                    }
                  />
                </label>
                <label>
                  Dim overlay ({Math.round(banner.dim * 100)}%)
                  <input
                    className="sb-input"
                    type="range"
                    min={0}
                    max={85}
                    value={Math.round(banner.dim * 100)}
                    onChange={(e) =>
                      setBanner((prev) => ({
                        ...prev,
                        dim: Number(e.target.value) / 100,
                      }))
                    }
                  />
                </label>
                {banner.mode === "video" ? (
                  <>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={banner.muted}
                        onChange={(e) =>
                          setBanner((prev) => ({ ...prev, muted: e.target.checked }))
                        }
                      />
                      Mute video
                    </label>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={banner.loop}
                        onChange={(e) =>
                          setBanner((prev) => ({ ...prev, loop: e.target.checked }))
                        }
                      />
                      Loop video
                    </label>
                  </>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="profile-island-editor">
            <div><h4>Favorite games island</h4><p className="sb-muted">Preview changes on the banner above. Game names appear only on hover.</p></div>
            <Button variant="secondary" disabled={saving} onClick={() => void syncFavoritesToProfile()}>Sync favorite games</Button>
            <div className="form-grid">
              <label className="checkbox-row"><input type="checkbox" checked={favoritesIsland.visible} onChange={e => setFavoritesIsland(v => ({ ...v, visible: e.target.checked }))} /> Show island</label>
              <label className="checkbox-row"><input type="checkbox" checked={favoritesIsland.showHeading} onChange={e => setFavoritesIsland(v => ({ ...v, showHeading: e.target.checked }))} /> Show heading</label>
              <label className="checkbox-row"><input type="checkbox" checked={favoritesIsland.border} onChange={e => setFavoritesIsland(v => ({ ...v, border: e.target.checked }))} /> Show border</label>
              <label>Position<select className="sb-input" value={favoritesIsland.position} onChange={e => setFavoritesIsland(v => ({ ...v, position: e.target.value as FavoritesIsland["position"] }))}><option value="top-right">Top right</option><option value="top-left">Top left</option><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option></select></label>
              <label>Surface<select className="sb-input" value={favoritesIsland.surface} onChange={e => setFavoritesIsland(v => ({ ...v, surface: e.target.value as FavoritesIsland["surface"] }))}><option value="glass">Glass</option><option value="solid">Solid</option><option value="transparent">Transparent</option></select></label>
              <label>Surface color<input className="sb-input" type="color" value={favoritesIsland.color} onChange={e => setFavoritesIsland(v => ({ ...v, color: e.target.value }))} /></label>
              <label>Opacity ({Math.round(favoritesIsland.opacity * 100)}%)<input className="sb-input" type="range" min="0" max="100" value={Math.round(favoritesIsland.opacity * 100)} onChange={e => setFavoritesIsland(v => ({ ...v, opacity: Number(e.target.value) / 100 }))} /></label>
              <label>Glass blur ({favoritesIsland.blur}px)<input className="sb-input" type="range" min="0" max="30" value={favoritesIsland.blur} onChange={e => setFavoritesIsland(v => ({ ...v, blur: Number(e.target.value) }))} /></label>
              <label>Corner radius ({favoritesIsland.radius}px)<input className="sb-input" type="range" min="0" max="32" value={favoritesIsland.radius} onChange={e => setFavoritesIsland(v => ({ ...v, radius: Number(e.target.value) }))} /></label>
              <label>Icon size ({favoritesIsland.iconSize}px)<input className="sb-input" type="range" min="24" max="128" value={favoritesIsland.iconSize} onChange={e => setFavoritesIsland(v => ({ ...v, iconSize: Number(e.target.value) }))} /></label>
              <label>Icon gap ({favoritesIsland.gap}px)<input className="sb-input" type="range" min="0" max="16" value={favoritesIsland.gap} onChange={e => setFavoritesIsland(v => ({ ...v, gap: Number(e.target.value) }))} /></label>
              <label>Game layout<select className="sb-input" value={favoritesIsland.layout} onChange={e => setFavoritesIsland(v => ({ ...v, layout: e.target.value as FavoritesIsland["layout"] }))}><option value="row">Horizontal</option><option value="column">Vertical</option><option value="grid">Grid</option><option value="free">Free placement</option></select></label>
              {favoritesIsland.layout === "grid" && <label>Grid columns ({favoritesIsland.columns})<input className="sb-input" type="range" min="1" max="8" value={favoritesIsland.columns} onChange={e => setFavoritesIsland(v => ({ ...v, columns: Number(e.target.value) }))} /></label>}
              {favoritesIsland.layout === "free" && <><label>Area width ({favoritesIsland.freeWidth}px)<input className="sb-input" type="range" min="160" max="700" value={favoritesIsland.freeWidth} onChange={e => setFavoritesIsland(v => ({ ...v, freeWidth: Number(e.target.value) }))} /></label><label>Area height ({favoritesIsland.freeHeight}px)<input className="sb-input" type="range" min="100" max="600" value={favoritesIsland.freeHeight} onChange={e => setFavoritesIsland(v => ({ ...v, freeHeight: Number(e.target.value) }))} /></label></>}
              <label>Horizontal offset ({favoritesIsland.offsetX}px)<input className="sb-input" type="range" min="0" max="80" value={favoritesIsland.offsetX} onChange={e => setFavoritesIsland(v => ({ ...v, offsetX: Number(e.target.value) }))} /></label>
              <label>Vertical offset ({favoritesIsland.offsetY}px)<input className="sb-input" type="range" min="0" max="80" value={favoritesIsland.offsetY} onChange={e => setFavoritesIsland(v => ({ ...v, offsetY: Number(e.target.value) }))} /></label>
            </div>
            {favoritesIsland.layout === "free" && <p className="sb-muted">Drag game icons in the preview above, then save your changes.</p>}
            <Button variant="secondary" onClick={() => setFavoritesIsland(FavoritesIslandSchema.parse({}))}>Reset island</Button>
          </div>

          <div className="row-actions" style={{ marginTop: "1rem" }}>
            <Button disabled={saving} onClick={() => void saveCosmetics()}>
              {saving ? "Saving…" : "Save for everyone"}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="profile-section">
        <h3>About</h3>
        <div className="sb-card profile-about">
          {profile.description ? (
            <p>{profile.description}</p>
          ) : (
            <p className="sb-muted">This user has not added a description.</p>
          )}
        </div>
      </section>


      <section className="profile-section">
        <div className="rail-title">
          <div>
            <h3>Experiences</h3>
            <p className="sb-muted rail-subtitle">
              Public experiences created by {profile.displayName}
            </p>
          </div>
        </div>
        {profile.games.length ? (
          <div className="grid-games">
            {profile.games.map((game) => (
              <GameCard key={game.universeId} game={game} />
            ))}
          </div>
        ) : (
          <EmptyState title="No public experiences" />
        )}
      </section>
    </div>
  );
}
