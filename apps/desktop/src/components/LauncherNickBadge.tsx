import sbLogo from "../assets/sb-logo.png";

type Props = {
  registeredViaLauncher?: boolean;
  mode?: "launcher" | "custom" | "off" | null;
  customUrl?: string | null;
  className?: string;
  title?: string;
};

export function LauncherNickBadge({
  registeredViaLauncher,
  mode = "off",
  customUrl,
  className = "inline-nick-badge",
  title = "SB Launcher user",
}: Props) {
  if (!registeredViaLauncher || mode === "off") return null;
  const src =
    mode === "custom" && customUrl?.trim()
      ? customUrl.trim()
      : mode === "launcher"
        ? sbLogo
        : null;
  if (!src) return null;
  return <img src={src} alt="" className={className} title={title} />;
}
