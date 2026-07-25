/** Changelog shown on the About page. Keep newest patches first. */

export type PatchNoteEntry = {
  version: string;
  title: string;
  items: string[];
};

export const MAJOR_RELEASE: PatchNoteEntry = {
  version: "2.0",
  title: "SB Launcher 2",
  items: [
    "Full desktop companion rebuild — Discover, friends, profile, and Visuals in one place.",
    "Theme system with wallpapers, glass, particles, fonts, and live preview.",
    "Native Windows host with local API, Roblox launch, and cloud account sync.",
    "Safe graphics presets and return-to-launcher when you leave a place.",
  ],
};

export const PATCH_NOTES: PatchNoteEntry[] = [
  {
    version: "2.3.1",
    title: "Animations & polish",
    items: [
      "Classic page animations are back — smooth springs instead of the new stiff transitions.",
      "Loading screen reliably shows the snake spinner again (no more empty screen).",
      "About page cleanup: original banner art restored, confetti removed.",
    ],
  },
  {
    version: "2.3.0",
    title: "About, profiles & persistence",
    items: [
      "About banner shows Version up to date / update available, with patch-note modal when an update is ready.",
      "Profile banners save and update reliably again (local cache + optimistic apply).",
      "Launch overlay settings now auto-save like Visuals and survive reinstall when you keep app data.",
    ],
  },
  {
    version: "2.2.2",
    title: "Launch overlay & polish",
    items: [
      "Fixed auto-close of Roblox after leaving a game (log tail + earlier session monitor).",
      "Custom Launch Overlay before join — color, image, or GIF with live preview.",
      "Replaced the old Roblox-file splash with the in-launcher overlay window.",
    ],
  },
  {
    version: "2.2.0",
    title: "Social & profile",
    items: [
      "Favorite games on your profile with cloud Sync.",
      "SB Launcher nick badges in Friends and people search.",
      "Home Friends Playing rail and classic Discover recommendations restored.",
    ],
  },
  {
    version: "2.1.0",
    title: "Appearance & launch",
    items: [
      "Custom Roblox app icon and launcher nick badge options.",
      "Roblox font customization and richer Visuals controls.",
      "Installer / live runtime sync so UI updates land in the installed app.",
    ],
  },
];
