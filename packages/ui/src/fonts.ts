/** Available UI fonts for Visuals. Labels are user-facing; stacks are CSS font-family values. */
export type FontOption = {
  id: string;
  label: string;
  stack: string;
};

export const FONT_OPTIONS: FontOption[] = [
  {
    id: "figtree",
    label: "Figtree",
    stack: '"Figtree", "Segoe UI Variable", "Segoe UI", sans-serif',
  },
  {
    id: "anthropic-serif",
    label: "Anthropic Serif",
    // Open stand-in for proprietary Anthropic Serif (Source Serif 4 is loaded via Google Fonts).
    stack: '"Source Serif 4", "Anthropic Serif", Georgia, "Times New Roman", serif',
  },
  {
    id: "inter",
    label: "Inter",
    stack: '"Inter", "Segoe UI", sans-serif',
  },
  {
    id: "space-grotesk",
    label: "Space Grotesk",
    stack: '"Space Grotesk", "Segoe UI", sans-serif',
  },
  {
    id: "dm-sans",
    label: "DM Sans",
    stack: '"DM Sans", "Segoe UI", sans-serif',
  },
  {
    id: "outfit",
    label: "Outfit",
    stack: '"Outfit", "Segoe UI", sans-serif',
  },
  {
    id: "manrope",
    label: "Manrope",
    stack: '"Manrope", "Segoe UI", sans-serif',
  },
  {
    id: "sora",
    label: "Sora",
    stack: '"Sora", "Segoe UI", sans-serif',
  },
  {
    id: "nunito",
    label: "Nunito",
    stack: '"Nunito", "Segoe UI", sans-serif',
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    stack: '"JetBrains Mono", "Cascadia Mono", Consolas, monospace',
  },
];

export const DEFAULT_FONT_ID = "figtree";

export function resolveFontStack(fontId: string | null | undefined): string {
  const match = FONT_OPTIONS.find((font) => font.id === fontId);
  return match?.stack ?? FONT_OPTIONS[0]!.stack;
}
