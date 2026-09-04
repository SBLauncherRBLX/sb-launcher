/** Changelog shown on the About page. Keep newest patches first. */

export type PatchNoteEntry = {
  version: string;
  title: string;
  items: string[];
};

export const MAJOR_RELEASE: PatchNoteEntry = {
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
    version: "3.0.0",
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
    title: "Themed splash wallpapers",
    items: [
      "Native and web startup screens use your Visuals wallpaper when set (color fallback otherwise).",
      "Splash layout refreshed with a centered glass card and themed glow.",
    ],
  },
];
