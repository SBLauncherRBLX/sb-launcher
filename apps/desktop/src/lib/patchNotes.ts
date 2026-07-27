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
    version: "2.4.2",
    title: "Paid Places polish",
    items: [
      "Paid Places cards show player count again — Robux price stays on the badge only.",
      "Paid Places is the 3rd Discover row instead of the first.",
    ],
  },
  {
    version: "2.4.1",
    title: "Last Played paid places",
    items: [
      "Last Played no longer shows Robux prices on paid-access experiences — they look like normal places.",
      "Paid Places price UI remains on Discover and game pages.",
    ],
  },
  {
    version: "2.4.0",
    title: "Paid Places",
    items: [
      "Discover now has a Paid Places section for Robux paid-access experiences.",
      "Owned paid places show Play; otherwise the Robux price is shown.",
      "The price button opens Roblox to buy access; the card still opens the launcher game page.",
      "Ownership is checked via inventory (Open Cloud), so owned games are detected after sign-in.",
      "Re-sign in if Settings is missing the Inventory badge (needed for ownership checks).",
    ],
  },
  {
    version: "2.3.7",
    title: "Discord activity",
    items: [
      "Discord Rich Presence now shows the game you’re in, playtime, and the game thumbnail.",
      "Friends can use Join server (when the server ID is known) or open the Roblox game page.",
      "Full Discord settings: browsing presence, thumbnail, timer, and each button on/off.",
      "Joining a friend now saves that experience to Last Played.",
      "Discord settings checkboxes stay aligned when changing UI fonts.",
    ],
  },
  {
    version: "2.3.6",
    title: "Startup port fix",
    items: [
      "Auto-clear a stuck SB Launcher API on port 8787 after a crashed or interrupted update.",
      "Removes the false “Port 8787 is already in use” startup failure in that case.",
    ],
  },
  {
    version: "2.3.5",
    title: "Updater fix",
    items: [
      "Fixed in-app install when the install folder path contains spaces (SB Launcher).",
      "Update progress bar now moves smoothly while downloading.",
      "Failed installs no longer delete the downloaded Setup silently.",
    ],
  },
  {
    version: "2.3.4",
    title: "Update system test",
    items: [
      "Test release to verify in-app install: progress bar, patch notes, and keep-presets option.",
      "No other product changes — safe to install over 2.3.3.",
    ],
  },
  {
    version: "2.3.3",
    title: "In-app updates & Discord",
    items: [
      "Install updates inside the launcher — progress, patch notes, and optional keep-presets, no website dance.",
      "Show SB Launcher in Discord activity while the app is open.",
      "About banner press animation stays flush with its frame.",
    ],
  },
  {
    version: "2.3.2",
    title: "Banner & open source",
    items: [
      "New About banner — rebuilt as pixel-perfect vector art, crisp at any window size.",
      "Banner press animation fixed: the art no longer separates from its frame when clicked.",
      "SB Launcher is now open source — full code on GitHub.",
    ],
  },
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
