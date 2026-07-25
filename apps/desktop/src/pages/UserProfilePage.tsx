import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams } from "react-router-dom";
import type { UserProfileDetails } from "@sb/contracts";
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
        setProfile(data);
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
        const ownId = useAppStore.getState().session?.user?.id ?? "";
        const own = String(ownId) === String(data.id);
        setBanner(own ? resolveOwnBanner(data.id, fromCloud) : fromCloud);
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
  const heroStyle =
    bannerView
      ? ({
          ["--profile-banner-height" as string]: `${bannerHeight}px`,
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

  async function saveCosmetics() {
    setSaving(true);
    setMessage(null);
    const badgeSnapshot = { ...badge };
    const avatarSnapshot = { ...avatar };
    const bannerSnapshot = { ...banner };
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
      };
      await api.saveProfileCosmetics(cosmetics);
      // Keep local banner as source of truth — do not echo possibly-stale cloud payload.
      setMessage("Profile look saved for everyone in SB Launcher.");
      setEditorOpen(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save profile look.");
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
        className={`sb-card profile-hero${bannerView && bannerView.mode !== "off" ? ` profile-hero--tone-${textTone}` : ""}`}
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

        <div className="profile-avatar-large">
          {displayAvatar ? (
            <img
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
                        try {
                          const res = await fetch(picked.url);
                          const blob = await res.blob();
                          const file = new File([blob], "badge.png", {
                            type: blob.type || "image/png",
                          });
                          const url = await uploadPickedFile(file);
                          if (url) setBadge({ mode: "custom", customUrl: url });
                        } catch {
                          setBadge({ mode: "custom", customUrl: picked.url });
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
                        try {
                          const res = await fetch(picked.url);
                          const blob = await res.blob();
                          const file = new File([blob], "avatar.png", {
                            type: blob.type || "image/png",
                          });
                          const url = await uploadPickedFile(file);
                          if (url) setAvatar({ mode: "custom", customUrl: url });
                        } catch {
                          setAvatar({ mode: "custom", customUrl: picked.url });
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
            <h3>Favorite games</h3>
            <p className="sb-muted rail-subtitle">
              {isOwnProfile
                ? "Synced from your Favorites in SB Launcher (up to 8)."
                : `Games ${profile.displayName} marked as favorites in SB Launcher.`}
            </p>
          </div>
          {isOwnProfile ? (
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => void syncFavoritesToProfile()}
            >
              Sync favorites
            </Button>
          ) : null}
        </div>
        {profile.favoriteGames?.length ? (
          <div className="grid-games">
            {profile.favoriteGames.map((game) => (
              <GameCard
                key={game.universeId}
                game={{
                  universeId: game.universeId,
                  placeId: game.placeId,
                  name: game.name,
                  description: "",
                  creatorName: "",
                  playing: 0,
                  visits: 0,
                  thumbnailUrl: game.iconUrl ?? null,
                  iconUrl: game.iconUrl ?? null,
                }}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No favorite games yet"
            description={
              isOwnProfile
                ? "Heart games from Home or game pages, then Sync favorites."
                : "This player hasn’t shared favorites on their launcher profile."
            }
          />
        )}
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
