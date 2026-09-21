/** Changelog shown on the About page. Keep newest patches first. */

export type PatchNoteEntry = {
  date: string;
  dateLabel?: string;
  version: string;
  title: string;
  items: string[];
};

export const MAJOR_RELEASE: PatchNoteEntry = {
  date: "2026-09-04",
  version: "3.0",
  title: "SB Launcher 3 — Liquid Glass",
  items: [
    "Liquid Glass design — unified glass on every surface like the search bar, with iOS 26 bubble physics.",
    "New 3D volumetric icons (Home, Discover, Friends, Visuals, Settings, About) with dynamic accent colors.",
    "Layout & positioning + Scroll & overscroll: sidebar, topbar, content alignment, card gap, columns — fully animated.",
    "Visuals & Settings now accordion — each group opens separately, no clutter.",
  ],
};

export const PATCH_NOTES: PatchNoteEntry[] = [
  {
    version: "3.5.0",
    date: "2026-09-20",
    title: "Material You & unified glass",
    items: [
      "Material You is the default design, with locally bundled Material Symbols and animated navigation in both glass and solid modes.",
      "Frosted and Liquid Glass share one settings section and a draggable live preview.",
      "Frosted uses Material You controls by default, with a saved option for Liquid Glass buttons, switches and sliders.",
      "Liquid Glass reuses refraction maps and skips backdrop processing for offscreen surfaces.",
      "Arctic Glass and Pulse Midnight presets now use theme-colored icons.",
      "Visuals and game settings now include section search with automatic expansion of matching controls.",
      "Search lighting keeps its thickness and rounded shape at every window width, and Material You switch checkmarks are centered.",
    ],
  },
  {
    version: "3.4.2",
    date: "2026-09-19",
    title: "Visual polish & reliability",
    items: [
      "Search now uses a soft circulating theme-color edge light with no pillars or protruding shapes.",
      "Visual preset editing stays inside its card, while textured glass controls are grouped into one clearer section.",
      "Home loading, Roblox launch handling, discovery, private servers, and local API boundaries are more resilient.",
      "The public website has been redesigned with richer customization previews and clearer product information.",
    ],
  },
  {
    version: "3.4.1",
    date: "2026-09-18",
    title: "Frosted SB title in About",
    items: [
      "About banner title now uses the new frosted SB image instead of text — blends with the liquid glass banner.",
    ],
  },
  {
    version: "3.4.0",
    date: "2026-09-18",
    title: "New SB logo everywhere",
    items: [
      "Brand logo updated to new liquid SB blob with frosted SB letters — visible on sidebar, About banner, site and installer.",
      "App icon, tray and installer artifacts regenerated from the new logo.",
    ],
  },
  {
    version: "3.3.0",
    date: "2026-09-13",
    title: "Rooms & friends reliability",
    items: [
      "Room hosts can filter servers by free slots, player count and reported ping, with ping or capacity sorting.",
      "Re-entering a room no longer opens Roblox automatically; joining the shared server now requires an explicit button press.",
      "Friends presence refreshes faster and stays stable when Roblox or the launcher cloud has a temporary network failure.",
      "Stale friend responses can no longer overwrite newer account or presence data.",
      "The Windows packaging pipeline now works in stripped PowerShell environments while keeping SHA-256 checks intact.",
    ],
  },
  {
    version: "3.2.1",
    date: "2026-09-13",
    title: "Stable rooms, transitions & glass",
    items: [
      "Room readiness now updates reliably and group launches stop waiting when a suitable Roblox server cannot be found.",
      "Page opening transitions are smooth again without flicker, overlapping frames or animated scrolling.",
      "Friends list refreshes no longer replay competing card animations.",
      "Liquid Glass blur and transparency stay intact while pages open.",
      "Installer and updater preserve launcher data silently without extra prompts.",
    ],
  },
  {
    version: "3.2.0",
    date: "2026-09-12",
    title: "Rooms, journal & visual polish",
    items: [
      "Room members can launch the selected Roblox experience together on one server with enough free slots when everyone is ready.",
      "Screenshots and recordings created in Roblox are imported into the Journal automatically.",
      "Navigation, section alignment and custom icon colors were stabilized across old and new sections.",
      "The classic multicolor palette icon is restored while custom color mode keeps its readable monochrome treatment.",
    ],
  },
  {
    version: "3.1.0",
    date: "2026-09-10",
    title: "Frosted buttons & tidy settings",
    items: [
      "All buttons unified to dark-gray frosted glass like the account pill.",
      "Sidebar bubble can switch back to classic Material You in Visuals.",
      "Visuals & Settings regrouped — no duplicate controls, bigger section icons.",
      "Custom wallpapers back (100% working), static About logo, no cursor parallax.",
      "Installer no longer fails on locked files — closes the app before updating.",
    ],
  },
  {
    version: "3.0.0",
    date: "2026-09-04",
    title: "Liquid Glass & 3D icons",
    items: [
      "Liquid Glass pill in left hotbar — more transparent, flows with spring physics, no gaps.",
      "Theme presets with avatars, names, reorder (↑↓) and delete — saved in same grid as base presets.",
      "Instant scroll reset on navigation — no fly-up when switching at bottom.",
      "Colors & layout icon fixed — same palette as Visuals, centered and not crooked.",
    ],
  },
  {
    version: "2.5.0",
    date: "2026-07-30",
    title: "Private servers, splash & polish",
    items: [
      "Private servers: join by invite link/code, save, rename, copy link, and remove from the game page.",
      "Startup splash (native + web) uses your Visuals wallpaper when set.",
      "Roblox application icon Apply fixed for desktop and Start Menu shortcuts.",
      "Custom profile photos and nick badges upload correctly again.",
      "Game card hover clipping fixed; Friends Playing shows real online counts.",
    ],
  },
  {
    version: "2.4.10",
    date: "2026-07-29",
    dateLabel: "Local build",
    title: "Themed splash wallpapers",
    items: [
      "Native and web startup screens use your Visuals wallpaper when set (color fallback otherwise).",
      "Splash layout refreshed with a centered glass card and themed glow.",
    ],
  },
];
