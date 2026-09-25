import type { VisualTheme } from "@sb/contracts";
import { themeToCssVars, LoadingState } from "@sb/ui";
export function BootSplash({ theme }: { theme: VisualTheme }) {
  return <div className="app-boot-loading" style={{ ...themeToCssVars(theme), background: theme.background }}>
    {!window.sbDesktop?.finishStartup &&
      <div className="startup-loader"><LoadingState label="Starting SB Launcher…" /></div>}
  </div>;
}
