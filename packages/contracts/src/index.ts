import { z } from "zod";

export const UserProfileSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  profileUrl: z.string().url(),
  createdAt: z.string().nullable().optional(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const UserProfileDetailsSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  description: z.string().default(""),
  createdAt: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  fullBodyAvatarUrl: z.string().nullable(),
  profileUrl: z.string().url(),
  isBanned: z.boolean().default(false),
  hasVerifiedBadge: z.boolean().default(false),
  friendCount: z.number().int().nonnegative().default(0),
  followerCount: z.number().int().nonnegative().default(0),
  followingCount: z.number().int().nonnegative().default(0),
  presenceType: z
    .enum(["Offline", "Online", "InGame", "InStudio", "Unknown"])
    .default("Unknown"),
  isOnline: z.boolean().default(false),
  lastLocation: z.string().nullable().default(null),
  placeId: z.string().nullable().default(null),
  universeId: z.string().nullable().default(null),
  gameInstanceId: z.string().nullable().default(null),
  canJoin: z.boolean().default(false),
  /** Signed in at least once through SB Launcher (local or shared registry). */
  registeredViaLauncher: z.boolean().default(false),
  /** How this launcher user shows the nick badge (visible to everyone). */
  launcherBadgeMode: z.enum(["launcher", "custom", "off"]).default("launcher"),
  /** Custom badge image URL when launcherBadgeMode is custom. */
  launcherBadgeUrl: z.string().nullable().optional(),
  /** Profile picture override for launcher users. */
  launcherAvatarMode: z.enum(["roblox", "custom"]).default("roblox"),
  launcherAvatarUrl: z.string().nullable().optional(),
  /** Profile banner (visible to everyone in the launcher). */
  launcherBanner: z
    .object({
      mode: z.enum(["off", "image", "gif", "video", "color"]).default("off"),
      mediaUrl: z.string().nullable().optional(),
      color: z.string().nullable().optional(),
      fit: z.enum(["cover", "contain", "fill"]).default("cover"),
      position: z.enum(["center", "top", "bottom", "left", "right"]).default("center"),
      blur: z.number().min(0).max(24).default(0),
      opacity: z.number().min(0).max(1).default(1),
      dim: z.number().min(0).max(1).default(0.35),
      height: z.number().min(160).max(480).default(280),
      muted: z.boolean().default(true),
      loop: z.boolean().default(true),
    })
    .nullable()
    .optional(),
  /** Favorite experiences shared on the launcher profile (max 8). */
  favoriteGames: z
    .array(
      z.object({
        universeId: z.string(),
        placeId: z.string(),
        name: z.string(),
        iconUrl: z.string().nullable().optional(),
      }),
    )
    .default([]),
  games: z.array(z.lazy(() => GameSummarySchema)).default([]),
});
export type UserProfileDetails = z.infer<typeof UserProfileDetailsSchema>;

export const CapabilitySchema = z.object({
  profile: z.boolean(),
  friends: z.boolean(),
  presence: z.boolean(),
  avatarWrite: z.boolean(),
  inventory: z.boolean(),
  servers: z.boolean(),
});
export type Capabilities = z.infer<typeof CapabilitySchema>;

/** Roblox account remembered on this PC via OAuth (launcher identity). */
export const SavedAccountSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  profileUrl: z.string().url(),
  lastUsedAt: z.string().nullable().optional(),
});
export type SavedAccount = z.infer<typeof SavedAccountSchema>;

export const SessionSchema = z.object({
  authenticated: z.boolean(),
  user: UserProfileSchema.nullable(),
  capabilities: CapabilitySchema,
  scopes: z.array(z.string()),
  /** Saved OAuth accounts on this machine (switcher list). */
  accounts: z.array(SavedAccountSchema).default([]),
  /** Active Roblox user id when authenticated. */
  activeUserId: z.string().nullable().default(null),
});
export type Session = z.infer<typeof SessionSchema>;

export const AccountSwitchResponseSchema = z.object({
  sessionToken: z.string(),
  session: SessionSchema,
});
export type AccountSwitchResponse = z.infer<typeof AccountSwitchResponseSchema>;

export const GameSummarySchema = z.object({
  universeId: z.string(),
  placeId: z.string(),
  name: z.string(),
  description: z.string().optional().default(""),
  creatorName: z.string().optional().default(""),
  playing: z.number().int().nonnegative().default(0),
  visits: z.number().int().nonnegative().default(0),
  maxPlayers: z.number().int().positive().optional(),
  genre: z.string().optional(),
  genreL1: z.string().optional(),
  genreL2: z.string().optional(),
  upVotes: z.number().int().nonnegative().optional(),
  downVotes: z.number().int().nonnegative().optional(),
  ratingPercent: z.number().min(0).max(100).optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  thumbnailUrl: z.string().nullable().default(null),
  iconUrl: z.string().nullable().default(null),
  /** Robux paid-access price when the experience is sold for Robux. */
  priceInRobux: z.number().int().nonnegative().nullable().optional(),
  isForSale: z.boolean().optional(),
  productId: z.string().nullable().optional(),
  /** True when the signed-in user can play without buying again. */
  owned: z.boolean().optional(),
});
export type GameSummary = z.infer<typeof GameSummarySchema>;

export const GameDetailsSchema = GameSummarySchema.extend({
  rootPlaceId: z.string(),
  favoritedCount: z.number().int().nonnegative().optional(),
  media: z
    .array(
      z.object({
        id: z.string(),
        imageUrl: z.string().nullable(),
        videoUrl: z.string().nullable().optional(),
      }),
    )
    .default([]),
});
export type GameDetails = z.infer<typeof GameDetailsSchema>;

export const GameEventSchema = z.object({
  id: z.string(),
  universeId: z.string(),
  placeId: z.string(),
  title: z.string(),
  subtitle: z.string().default(""),
  description: z.string().default(""),
  startUtc: z.string(),
  endUtc: z.string(),
  status: z.enum(["upcoming", "live", "ended"]),
  hostName: z.string().default(""),
  thumbnailUrl: z.string().nullable().default(null),
  eventUrl: z.string().url(),
});
export type GameEvent = z.infer<typeof GameEventSchema>;

export const DiscoverySortSchema = z.object({
  sortId: z.string(),
  displayName: z.string(),
  gameCount: z.number().int().nonnegative().optional(),
});
export type DiscoverySort = z.infer<typeof DiscoverySortSchema>;

export const DiscoveryCategorySchema = z.object({
  sort: DiscoverySortSchema,
  games: z.array(GameSummarySchema),
});
export type DiscoveryCategory = z.infer<typeof DiscoveryCategorySchema>;

export const HistoryEntrySchema = z.object({
  id: z.string(),
  universeId: z.string(),
  placeId: z.string(),
  name: z.string(),
  iconUrl: z.string().nullable(),
  launchedAt: z.string(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const FavoriteEntrySchema = z.object({
  id: z.string(),
  universeId: z.string(),
  placeId: z.string(),
  name: z.string(),
  iconUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type FavoriteEntry = z.infer<typeof FavoriteEntrySchema>;

export const HomePayloadSchema = z.object({
  continuePlaying: z.array(GameSummarySchema),
  favorites: z.array(GameSummarySchema),
  friendsPlaying: z.array(GameSummarySchema).default([]),
  forYou: z.array(GameSummarySchema),
  upAndComing: z.array(GameSummarySchema),
  surpriseMe: GameSummarySchema.nullable(),
});
export type HomePayload = z.infer<typeof HomePayloadSchema>;

export const DiscoverPayloadSchema = z.object({
  categories: z.array(DiscoveryCategorySchema),
});
export type DiscoverPayload = z.infer<typeof DiscoverPayloadSchema>;

export const SurpriseMePayloadSchema = z.object({
  game: GameSummarySchema.nullable(),
  reason: z.string().optional(),
});
export type SurpriseMePayload = z.infer<typeof SurpriseMePayloadSchema>;

export const ServerInfoSchema = z.object({
  id: z.string(),
  maxPlayers: z.number().int(),
  playing: z.number().int(),
  fps: z.number().nullable().optional(),
  ping: z.number().int().nullable().optional(),
  region: z.literal("unavailable").default("unavailable"),
  regionNote: z
    .string()
    .default("Roblox does not expose server region via public APIs."),
  playerTokens: z.array(z.string()).default([]),
});
export type ServerInfo = z.infer<typeof ServerInfoSchema>;

/** Saved VIP / private server invite managed in SB Launcher (OAuth-safe). */
export const SavedPrivateServerSchema = z.object({
  id: z.string(),
  universeId: z.string(),
  placeId: z.string(),
  accessCode: z.string().min(4).max(256),
  label: z.string().min(1).max(64),
  gameName: z.string().optional().nullable(),
  iconUrl: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type SavedPrivateServer = z.infer<typeof SavedPrivateServerSchema>;

export const PrivateServerInviteSchema = z.object({
  placeId: z.string().optional(),
  accessCode: z.string().min(4).max(256),
});
export type PrivateServerInvite = z.infer<typeof PrivateServerInviteSchema>;

/**
 * Parse a VIP invite URL, deep link, or raw access code.
 * Supports privateServerLinkCode / accessCode / share?code= / roblox:// links.
 */
export function parsePrivateServerInvite(
  input: string,
  fallbackPlaceId?: string | null,
): PrivateServerInvite | null {
  const raw = input.trim();
  if (!raw) return null;
  const fallback = fallbackPlaceId?.trim() || undefined;

  const fromParams = (params: URLSearchParams, pathPlaceId?: string): PrivateServerInvite | null => {
    const accessCode =
      params.get("accessCode")?.trim() ||
      params.get("privateServerLinkCode")?.trim() ||
      params.get("linkCode")?.trim() ||
      (params.get("type")?.toLowerCase() === "server" ? params.get("code")?.trim() : null) ||
      null;
    const placeId =
      params.get("placeId")?.trim() ||
      pathPlaceId?.trim() ||
      fallback;
    if (!accessCode) return null;
    return placeId ? { placeId, accessCode } : { accessCode };
  };

  try {
    if (raw.startsWith("roblox://") || raw.startsWith("roblox-player:")) {
      const normalized = raw.replace(/^roblox-player:/i, "roblox://");
      const url = new URL(normalized);
      const parsed = fromParams(url.searchParams);
      if (parsed?.accessCode) {
        return parsed.placeId || fallback
          ? { placeId: parsed.placeId ?? fallback, accessCode: parsed.accessCode }
          : null;
      }
    }

    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    const pathPlace = url.pathname.match(/\/games\/(\d+)/)?.[1];
    const parsed = fromParams(url.searchParams, pathPlace);
    if (parsed?.accessCode) {
      return parsed.placeId || fallback
        ? { placeId: parsed.placeId ?? fallback, accessCode: parsed.accessCode }
        : null;
    }
  } catch {
    // fall through to raw code
  }

  if (/^[A-Za-z0-9_-]{6,256}$/.test(raw) && fallback) {
    return { placeId: fallback, accessCode: raw };
  }
  return null;
}

export function buildPrivateServerInviteUrl(placeId: string, accessCode: string): string {
  return `https://www.roblox.com/games/${encodeURIComponent(placeId)}?privateServerLinkCode=${encodeURIComponent(accessCode)}`;
}
export const FriendPresenceSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  isOnline: z.boolean(),
  presenceType: z.enum(["Offline", "Online", "InGame", "InStudio", "Unknown"]),
  lastLocation: z.string().nullable(),
  placeId: z.string().nullable(),
  universeId: z.string().nullable(),
  gameInstanceId: z.string().nullable(),
  canJoin: z.boolean(),
  joinDisabledReason: z.string().nullable(),
  /** True when friend has a fresh SB Launcher presence heartbeat. */
  inLauncher: z.boolean().default(false),
  registeredViaLauncher: z.boolean().default(false),
  launcherBadgeMode: z.enum(["launcher", "custom", "off"]).default("off"),
  launcherBadgeUrl: z.string().nullable().optional(),
});
export type FriendPresence = z.infer<typeof FriendPresenceSchema>;

export const UserSearchResultSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  hasVerifiedBadge: z.boolean().default(false),
  previousUsernames: z.array(z.string()).default([]),
  profileUrl: z.string().url(),
  registeredViaLauncher: z.boolean().default(false),
  launcherBadgeMode: z.enum(["launcher", "custom", "off"]).default("off"),
  launcherBadgeUrl: z.string().nullable().optional(),
});
export type UserSearchResult = z.infer<typeof UserSearchResultSchema>;

export const AvatarAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  assetType: z.string(),
  category: z
    .enum([
      "Characters",
      "Clothing",
      "Accessories",
      "Heads",
      "Faces",
      "Bodies",
      "Animations",
      "Emotes",
      "Other",
    ])
    .default("Other"),
  thumbnailUrl: z.string().nullable(),
});
export type AvatarAsset = z.infer<typeof AvatarAssetSchema>;

export const Avatar3DModelSchema = z.object({
  objUrl: z.string().url(),
  mtlUrl: z.string().url().nullable(),
  cameraPosition: z.array(z.number()).length(3).nullable().default(null),
  cameraDirection: z.array(z.number()).length(3).nullable().default(null),
});
export type Avatar3DModel = z.infer<typeof Avatar3DModelSchema>;

export const AvatarStateSchema = z.object({
  userId: z.string(),
  previewUrl: z.string().nullable(),
  fullBodyPreviewUrl: z.string().nullable().default(null),
  model3d: Avatar3DModelSchema.nullable().default(null),
  currentlyWearing: z.array(AvatarAssetSchema),
  scales: z.record(z.number()).optional(),
  bodyColors: z.record(z.number()).optional(),
});
export type AvatarState = z.infer<typeof AvatarStateSchema>;

export const OutfitPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  assetIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OutfitPreset = z.infer<typeof OutfitPresetSchema>;

export const LayoutSettingsSchema = z.object({
  sidebarPosition: z.enum(["left", "right", "hidden"]).default("left"),
  sidebarWidth: z.number().min(200).max(360).default(272),
  topbarPosition: z.enum(["sticky", "floating", "static"]).default("sticky"),
  topbarHeight: z.enum(["compact", "comfortable", "spacious"]).default("comfortable"),
  contentAlignment: z.enum(["left", "center", "stretch"]).default("stretch"),
  contentMaxWidth: z.number().min(720).max(1800).default(1280),
  contentPadding: z.number().min(8).max(48).default(22),
  cardGap: z.number().min(8).max(32).default(16),
  cardColumns: z.enum(["auto", "2", "3", "4"]).default("auto"),
  topbarBlur: z.number().min(0).max(40).default(12),
});
export type LayoutSettings = z.infer<typeof LayoutSettingsSchema>;

export const ScrollSettingsSchema = z.object({
  overscrollBehavior: z.enum(["contain", "none", "auto"]).default("contain"),
  scrollBehavior: z.enum(["auto", "smooth"]).default("smooth"),
  scrollbarStyle: z.enum(["thin", "hidden", "overlay"]).default("thin"),
  scrollAnimation: z.enum(["none", "fade", "slide", "scale", "parallax"]).default("fade"),
  scrollAnimationDuration: z.number().min(120).max(900).default(360),
  scrollAnimationEasing: z.enum(["linear", "ease", "easeIn", "easeOut", "easeInOut", "spring"]).default("easeOut"),
  scrollStagger: z.number().min(0).max(120).default(40),
  enableScrollProgress: z.boolean().default(false),
  hideTopbarOnScroll: z.boolean().default(false),
  parallaxIntensity: z.number().min(0).max(1).default(0.5),
  revealOnScroll: z.boolean().default(true),
});
export type ScrollSettings = z.infer<typeof ScrollSettingsSchema>;

export const ThemeEffectsSchema = z.object({
  glass: z.boolean().default(true),
  /** Backdrop blur strength in px when glass is on. */
  glassBlur: z.number().min(0).max(100).default(20),
  /** Surface fill opacity (0 = crystal clear, 1 = nearly solid). */
  glassOpacity: z.number().min(0).max(1).default(0.52),
  /** backdrop-filter saturate() multiplier. */
  glassSaturation: z.number().min(0).max(3).default(1.35),
  /** backdrop-filter brightness() multiplier. */
  glassBrightness: z.number().min(0.4).max(1.8).default(1),
  /** backdrop-filter contrast() multiplier. */
  glassContrast: z.number().min(0.5).max(1.8).default(1),
  /** Border visibility over glass. */
  glassBorder: z.number().min(0).max(1).default(0.42),
  /** Top-edge specular highlight. */
  glassSpecular: z.number().min(0).max(1).default(0.28),
  /** Soft elevation shadow under glass panels. */
  glassShadow: z.number().min(0).max(1).default(0.4),
  /** Mix tint color into the glass fill. */
  glassTintStrength: z.number().min(0).max(1).default(0.15),
  /** Tint color; falls back to accent when omitted. */
  glassTintColor: z.string().optional(),
  /** Apply glass to cards. */
  glassCards: z.boolean().default(true),
  /** Apply glass to sidebar. */
  glassSidebar: z.boolean().default(true),
  /** Apply glass to top bar. */
  glassTopbar: z.boolean().default(true),
  noise: z.boolean().default(false),
  vignette: z.boolean().default(false),
  glow: z.boolean().default(true),
  particles: z.boolean().default(false),
  particleDensity: z.enum(["low", "medium", "high"]).default("medium"),
  particleSize: z.number().min(0.5).max(2.5).default(1),
  particleSpeed: z.number().min(0.25).max(2.5).default(1),
  particleOpacity: z.number().min(0.15).max(1).default(0.75),
  parallax: z.boolean().default(false),
});
export type ThemeEffects = z.infer<typeof ThemeEffectsSchema>;

export const VisualThemeSchema = z.object({
  id: z.string(),
  name: z.string(),
  accent: z.string(),
  accentSecondary: z.string(),
  background: z.string(),
  surface: z.string(),
  surfaceElevated: z.string(),
  text: z.string(),
  textMuted: z.string(),
  border: z.string(),
  gradientFrom: z.string(),
  gradientTo: z.string(),
  blur: z.number().min(0).max(100),
  opacity: z.number().min(0.05).max(1),
  cornerRadius: z.number().min(0).max(48),
  density: z.enum(["compact", "comfortable", "spacious"]),
  animations: z.boolean(),
  reducedMotion: z.boolean(),
  sidebarStyle: z.enum(["solid", "glass", "minimal"]),
  backgroundImage: z.string().nullable().optional(),
  backgroundMode: z.enum(["gradient", "solid", "image", "layered"]).optional(),
  wallpaperId: z.string().nullable().optional(),
  wallpaperOpacity: z.number().min(0).max(1).optional(),
  wallpaperBlur: z.number().min(0).max(40).optional(),
  wallpaperDim: z.number().min(0).max(0.9).optional(),
  effects: ThemeEffectsSchema.optional(),
  layout: LayoutSettingsSchema.optional(),
  scroll: ScrollSettingsSchema.optional(),
  motionIntensity: z.enum(["off", "low", "medium", "high"]).optional(),
  buttonStyle: z.enum(["gradient", "solid", "tonal"]).optional(),
  cardStyle: z.enum(["glass", "solid", "outline"]).optional(),
  fontId: z.string().optional(),
});
export type VisualTheme = z.infer<typeof VisualThemeSchema>;

export const SafeGraphicsSettingsSchema = z.object({
  preferredWindowMode: z.enum(["windowed", "fullscreen", "borderless"]).default("windowed"),
  preferredResolution: z
    .enum([
      "native",
      "2560x1440",
      "1920x1080",
      "1600x900",
      "1366x768",
      "1280x720",
      "1024x768",
    ])
    .default("native"),
  /** Window aspect ratio (windowed). Combined with resolution when both are set. */
  preferredAspectRatio: z
    .enum(["native", "16:9", "16:10", "4:3", "21:9", "1:1"])
    .default("native"),
  /** Disable Windows DPI scaling of the Roblox render buffer (allowlisted FFlag). */
  disableDpiScale: z.boolean().default(false),
  fpsCapHint: z.enum(["unlimited", "240", "144", "120", "60", "30"]).default("60"),
  qualityLevel: z.number().int().min(1).max(10).default(5),
  optimizationPreset: z
    .enum(["maximum-fps", "balanced", "quality", "custom"])
    .default("balanced"),
  applyOnLaunch: z.boolean().default(false),
  useAllowlistedFastFlags: z.boolean().default(true),
  graySky: z.boolean().default(false),
  textureQualityOverride: z.enum(["automatic", "1", "2", "3"]).default("automatic"),
  antiAliasingSamples: z.enum(["0", "2", "4", "8"]).default("2"),
  pauseVoxelizer: z.boolean().default(false),
  grassDistance: z.enum(["default", "0", "64", "128", "256"]).default("default"),
  renderingMode: z.enum(["automatic", "d3d11", "vulkan", "opengl"]).default("automatic"),
  returnToLauncherOnExit: z.boolean().default(true),
  qualityGuidanceShown: z.boolean().default(false),
  openRobloxSettingsOnLaunch: z.boolean().default(false),
  /** Roblox client UI font: stock files or one custom TTF/OTF for every slot. */
  robloxFontMode: z.enum(["vanilla", "custom"]).default("vanilla"),
  robloxCustomFontId: z.string().optional(),
  robloxCustomFontName: z.string().optional(),
  robloxCustomFontUrl: z.string().optional(),
  /**
   * Small SB Launcher overlay shown for a few seconds when joining an experience
   * (not Roblox client texture mods).
   */
  launchOverlayEnabled: z.boolean().default(true),
  launchOverlayDurationMs: z.number().int().min(2000).max(8000).default(4000),
  launchOverlayBgMode: z.enum(["color", "image", "gif"]).default("color"),
  launchOverlayBgColor: z.string().default("#12141f"),
  launchOverlayMediaId: z.string().optional(),
  launchOverlayMediaUrl: z.string().optional(),
  launchOverlayMediaName: z.string().optional(),
  launchOverlayWindowColor: z.string().default("#1a1d2b"),
  launchOverlayBorderColor: z.string().default("#3a4158"),
  launchOverlaySnakeColor: z.string().default("#9A82DB"),
  launchOverlaySnakeTrackColor: z.string().default("#4A4458"),
  launchOverlayTextColor: z.string().default("#E6E1E5"),
  launchOverlayLabel: z.string().max(48).default("Launching Roblox…"),
});
export type SafeGraphicsSettings = z.infer<typeof SafeGraphicsSettingsSchema>;

export const LaunchTargetSchema = z.object({
  placeId: z.string().optional(),
  gameInstanceId: z.string().optional(),
  userId: z.string().optional(),
  accessCode: z.string().optional(),
});
export type LaunchTarget = z.infer<typeof LaunchTargetSchema>;

export const PaginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    previousCursor: z.string().nullable().optional(),
  });

export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const DEFAULT_CAPABILITIES: Capabilities = {
  profile: false,
  friends: false,
  presence: false,
  avatarWrite: false,
  inventory: false,
  servers: true,
};

export const DEFAULT_THEME_EFFECTS: ThemeEffects = {
  glass: false,
  glassBlur: 20,
  glassOpacity: 0.52,
  glassSaturation: 1.35,
  glassBrightness: 1,
  glassContrast: 1,
  glassBorder: 0.42,
  glassSpecular: 0.28,
  glassShadow: 0.4,
  glassTintStrength: 0.15,
  glassCards: true,
  glassSidebar: true,
  glassTopbar: true,
  noise: false,
  vignette: false,
  glow: true,
  particles: false,
  particleDensity: "medium",
  particleSize: 1,
  particleSpeed: 1,
  particleOpacity: 0.75,
  parallax: false,
};

export const DEFAULT_LAYOUT: LayoutSettings = {
  sidebarPosition: "left",
  sidebarWidth: 272,
  topbarPosition: "sticky",
  topbarHeight: "comfortable",
  contentAlignment: "stretch",
  contentMaxWidth: 1280,
  contentPadding: 22,
  cardGap: 16,
  cardColumns: "auto",
  topbarBlur: 12,
};

export const DEFAULT_SCROLL: ScrollSettings = {
  overscrollBehavior: "contain",
  scrollBehavior: "smooth",
  scrollbarStyle: "thin",
  scrollAnimation: "fade",
  scrollAnimationDuration: 360,
  scrollAnimationEasing: "easeOut",
  scrollStagger: 40,
  enableScrollProgress: false,
  hideTopbarOnScroll: false,
  parallaxIntensity: 0.5,
  revealOnScroll: true,
};

export const DEFAULT_THEME: VisualTheme = {
  id: "sb-midnight",
  name: "SB Midnight",
  accent: "#9a82db",
  accentSecondary: "#efb8c8",
  background: "#141218",
  surface: "#1d1b20",
  surfaceElevated: "#2b2930",
  text: "#e6e1e5",
  textMuted: "#cac4d0",
  border: "#49454f",
  gradientFrom: "#9a82db40",
  gradientTo: "#efb8c828",
  blur: 20,
  opacity: 1,
  cornerRadius: 28,
  density: "comfortable",
  animations: true,
  reducedMotion: false,
  sidebarStyle: "solid",
  backgroundImage: null,
  backgroundMode: "gradient",
  wallpaperId: null,
  wallpaperOpacity: 0.55,
  wallpaperBlur: 0,
  wallpaperDim: 0.45,
  effects: {
    ...DEFAULT_THEME_EFFECTS,
    glass: false,
    noise: false,
    vignette: false,
    glow: true,
    particles: false,
    parallax: false,
  },
  layout: { ...DEFAULT_LAYOUT },
  scroll: { ...DEFAULT_SCROLL },
  motionIntensity: "high",
  buttonStyle: "tonal",
  cardStyle: "solid",
  fontId: "figtree",
};

export function normalizeTheme(input: unknown): VisualTheme {
  const parsed = VisualThemeSchema.parse(input);
  return {
    ...DEFAULT_THEME,
    ...parsed,
    effects: { ...DEFAULT_THEME_EFFECTS, ...(parsed.effects ?? {}) },
    layout: { ...DEFAULT_LAYOUT, ...(parsed.layout ?? {}) },
    scroll: { ...DEFAULT_SCROLL, ...(parsed.scroll ?? {}) },
    backgroundMode: parsed.backgroundMode ?? DEFAULT_THEME.backgroundMode,
    wallpaperId: parsed.wallpaperId ?? parsed.backgroundImage ?? null,
    wallpaperOpacity: parsed.wallpaperOpacity ?? DEFAULT_THEME.wallpaperOpacity,
    wallpaperBlur: parsed.wallpaperBlur ?? DEFAULT_THEME.wallpaperBlur,
    wallpaperDim: parsed.wallpaperDim ?? DEFAULT_THEME.wallpaperDim,
    motionIntensity: parsed.motionIntensity ?? DEFAULT_THEME.motionIntensity,
    buttonStyle: parsed.buttonStyle ?? DEFAULT_THEME.buttonStyle,
    cardStyle: parsed.cardStyle ?? DEFAULT_THEME.cardStyle,
    fontId: parsed.fontId ?? DEFAULT_THEME.fontId,
  };
}

export function bayesianRating(upVotes: number, downVotes: number): number {
  const total = upVotes + downVotes;
  if (total === 0) return 0;
  const positive = upVotes / total;
  const prior = 0.85;
  const weight = 50;
  return ((positive * total) + (prior * weight)) / (total + weight);
}

export function buildRobloxDeepLink(target: LaunchTarget): string {
  const params = new URLSearchParams();
  // Follow-user join is the reliable way to enter a friend's current session.
  if (target.userId && !target.gameInstanceId) {
    params.set("userId", target.userId);
    if (target.placeId) params.set("placeId", target.placeId);
    return `roblox://experiences/start?${params.toString()}`;
  }
  if (target.placeId) params.set("placeId", target.placeId);
  if (target.gameInstanceId) params.set("gameInstanceId", target.gameInstanceId);
  if (target.userId) params.set("userId", target.userId);
  if (target.accessCode) params.set("accessCode", target.accessCode);
  if (!params.has("placeId") && !params.has("userId") && target.userId) {
    params.set("userId", target.userId);
  }
  return `roblox://experiences/start?${params.toString()}`;
}

export function buildWebLaunchUrl(target: LaunchTarget): string {
  if (target.placeId) {
    if (target.accessCode) {
      return buildPrivateServerInviteUrl(target.placeId, target.accessCode);
    }
    const base = `https://www.roblox.com/games/start?placeId=${encodeURIComponent(target.placeId)}`;
    if (target.gameInstanceId) {
      return `${base}&gameInstanceId=${encodeURIComponent(target.gameInstanceId)}`;
    }
    return base;
  }
  if (target.userId) {
    return `https://www.roblox.com/users/${target.userId}/profile`;
  }
  return "https://www.roblox.com/home";
}
