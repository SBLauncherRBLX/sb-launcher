import { useEffect, useRef, useState } from "react";
import type { SafeGraphicsSettings } from "@sb/contracts";
import { Button, Badge } from "@sb/ui";
import { useAppStore } from "../store";
import { authStartUrl } from "../lib/api";
import { FontPreview } from "../components/FontPreview";
import {
  applyRobloxAppIconPreference,
  getRobloxAppIconPreference,
  saveRobloxAppIconPreference,
  type RobloxAppIconMode,
  type RobloxAppIconPreference,
} from "../lib/robloxAppIcon";
import sbLogo from "../assets/sb-logo.png";

const ROBLOX_APP_ICON_OPTIONS: Array<{
  mode: RobloxAppIconMode;
  label: string;
  preview: string | null;
}> = [
  { mode: "default", label: "Default Roblox", preview: null },
  { mode: "launcher", label: "SB Launcher", preview: sbLogo },
  { mode: "custom", label: "Custom", preview: null },
];

export function SettingsPage() {
  const session = useAppStore((s) => s.session);
  const graphics = useAppStore((s) => s.graphics);
  const setGraphics = useAppStore((s) => s.setGraphics);
  const persistPreferences = useAppStore((s) => s.persistPreferences);
  const robloxInstalled = useAppStore((s) => s.robloxInstalled);
  const [message, setMessage] = useState<string | null>(null);
  const [detectPath, setDetectPath] = useState<string | null>(null);
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [redirectUri, setRedirectUri] = useState(
    "http://127.0.0.1:8787/auth/roblox/callback",
  );
  const [robloxAppIcon, setRobloxAppIcon] = useState<RobloxAppIconPreference>(
    getRobloxAppIconPreference,
  );
  const [discordRichPresence, setDiscordRichPresence] = useState(true);
  const [discordApplicationId, setDiscordApplicationId] = useState("");
  const [discordShowWhenBrowsing, setDiscordShowWhenBrowsing] = useState(true);
  const [discordShowGameThumbnail, setDiscordShowGameThumbnail] = useState(true);
  const [discordShowElapsed, setDiscordShowElapsed] = useState(true);
  const [discordShowJoinButton, setDiscordShowJoinButton] = useState(true);
  const [discordShowGamePageButton, setDiscordShowGamePageButton] = useState(true);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void window.sbDesktop?.detectRoblox().then((r) => setDetectPath(r.path));
    void window.sbDesktop?.getOAuthConfig().then((config) => {
      setOauthClientId(config.clientId);
      setOauthConfigured(config.configured);
      setRedirectUri(config.redirectUri);
    });
    void window.sbDesktop?.getPrefs().then((prefs) => {
      setDiscordRichPresence(prefs.discordRichPresence !== false);
      setDiscordShowWhenBrowsing(prefs.discordShowWhenBrowsing !== false);
      setDiscordShowGameThumbnail(prefs.discordShowGameThumbnail !== false);
      setDiscordShowElapsed(prefs.discordShowElapsed !== false);
      setDiscordShowJoinButton(prefs.discordShowJoinButton !== false);
      setDiscordShowGamePageButton(prefs.discordShowGamePageButton !== false);
      if (typeof prefs.discordApplicationId === "string") {
        setDiscordApplicationId(prefs.discordApplicationId.replace(/\D/g, ""));
      }
    });
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, []);

  async function patchDiscordPrefs(patch: Record<string, unknown>) {
    await window.sbDesktop?.setPrefs(patch);
  }

  function schedulePersist() {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void persistPreferences();
    }, 350);
  }

  function patch(partial: Partial<SafeGraphicsSettings>) {
    const current = useAppStore.getState().graphics;
    setGraphics({ ...current, ...partial, optimizationPreset: "custom" });
    schedulePersist();
  }

  function applyPreset(preset: SafeGraphicsSettings["optimizationPreset"]) {
    const values: Record<
      Exclude<SafeGraphicsSettings["optimizationPreset"], "custom">,
      Partial<SafeGraphicsSettings>
    > = {
      "maximum-fps": {
        preferredWindowMode: "fullscreen",
        fpsCapHint: "240",
        qualityLevel: 1,
        useAllowlistedFastFlags: true,
        graySky: true,
        textureQualityOverride: "1",
        antiAliasingSamples: "0",
        pauseVoxelizer: true,
        grassDistance: "0",
        renderingMode: "d3d11",
      },
      balanced: {
        preferredWindowMode: "fullscreen",
        fpsCapHint: "120",
        qualityLevel: 5,
        useAllowlistedFastFlags: true,
        graySky: false,
        textureQualityOverride: "2",
        antiAliasingSamples: "2",
        pauseVoxelizer: false,
        grassDistance: "64",
        renderingMode: "d3d11",
      },
      quality: {
        preferredWindowMode: "fullscreen",
        fpsCapHint: "60",
        qualityLevel: 10,
        useAllowlistedFastFlags: true,
        graySky: false,
        textureQualityOverride: "3",
        antiAliasingSamples: "4",
        pauseVoxelizer: false,
        grassDistance: "256",
        renderingMode: "d3d11",
      },
    };
    const current = useAppStore.getState().graphics;
    setGraphics({
      ...current,
      ...values[preset as Exclude<typeof preset, "custom">],
      optimizationPreset: preset,
    });
    schedulePersist();
  }

  async function applyOptimization() {
    try {
      const current = useAppStore.getState().graphics;
      const result = await window.sbDesktop?.applyRobloxSettings(current);
      setMessage(result?.message ?? "Optimization is available in the desktop app.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not apply Roblox optimization.");
    }
  }

  async function pickCustomFont() {
    try {
      const picked = await window.sbDesktop?.pickRobloxFont();
      if (!picked) return;
      const next = {
        ...useAppStore.getState().graphics,
        robloxFontMode: "custom" as const,
        robloxCustomFontId: picked.id,
        robloxCustomFontName: picked.name,
        robloxCustomFontUrl: picked.url,
        optimizationPreset: "custom" as const,
      };
      setGraphics(next);
      await persistPreferences();
      const result = await window.sbDesktop?.applyRobloxSettings(next);
      setMessage(
        result?.ok
          ? `Font applied: ${picked.name}. Restart Roblox to see it.`
          : result?.message ?? `Font selected: ${picked.name}. Click Apply now.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not pick font.");
    }
  }

  async function pickLaunchOverlayMedia() {
    try {
      const picked = await window.sbDesktop?.pickLaunchOverlayMedia?.();
      if (!picked) return;
      const current = useAppStore.getState().graphics;
      setGraphics({
        ...current,
        launchOverlayBgMode: picked.kind,
        launchOverlayMediaId: picked.id,
        launchOverlayMediaUrl: picked.url,
        launchOverlayMediaName: picked.name,
        optimizationPreset: "custom",
      });
      if (persistTimer.current) clearTimeout(persistTimer.current);
      await persistPreferences();
      setMessage(`Overlay background selected: ${picked.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not pick overlay media.");
    }
  }

  async function save() {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    await persistPreferences();
    if (window.sbDesktop?.setOAuthClientId) {
      const result = await window.sbDesktop.setOAuthClientId(oauthClientId);
      setOauthConfigured(result.configured);
    }
    await window.sbDesktop?.setPrefs({
      discordRichPresence,
      discordApplicationId: discordApplicationId.trim() || null,
      discordShowWhenBrowsing,
      discordShowGameThumbnail,
      discordShowElapsed,
      discordShowJoinButton,
      discordShowGamePageButton,
    });
    saveRobloxAppIconPreference(robloxAppIcon);
    setMessage("Settings saved.");
  }

  async function toggleDiscordRichPresence(next: boolean) {
    setDiscordRichPresence(next);
    await patchDiscordPrefs({ discordRichPresence: next });
    if (next) {
      void window.sbDesktop?.clearDiscordActivity?.();
    }
  }

  async function applyRobloxAppIcon() {
    try {
      const result = await applyRobloxAppIconPreference(robloxAppIcon);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update Roblox app icon.");
    }
  }

  function robloxAppIconPreview(preference: RobloxAppIconPreference): string | null {
    if (preference.mode === "launcher") return sbLogo;
    if (preference.mode === "custom" && preference.customUrl.trim()) {
      return preference.customUrl.trim();
    }
    return null;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Settings</h2>
          <p className="sb-muted">Safe graphics preferences and account options.</p>
        </div>
        <Button onClick={() => void save()}>Save</Button>
      </div>

      {message ? <div className="notice">{message}</div> : null}

      <div className="panel-grid">
        <div className="sb-card" style={{ padding: "1.25rem" }}>
          <h3>Discord</h3>
          <p className="sb-muted" style={{ marginTop: "0.75rem" }}>
            Show what you&apos;re doing in Roblox on Discord — game name, playtime, thumbnail, Join
            server, and game page. Discord desktop must be running on this PC.
          </p>
          <label className="check-row" style={{ marginTop: "1rem" }}>
            <input
              type="checkbox"
              checked={discordRichPresence}
              onChange={(event) => void toggleDiscordRichPresence(event.target.checked)}
            />
            <span>Enable Discord Rich Presence</span>
          </label>

          {discordRichPresence ? (
            <div className="form-grid" style={{ marginTop: "1rem" }}>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={discordShowWhenBrowsing}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setDiscordShowWhenBrowsing(next);
                    void patchDiscordPrefs({ discordShowWhenBrowsing: next });
                  }}
                />
                <span>Show activity while browsing the launcher</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={discordShowGameThumbnail}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setDiscordShowGameThumbnail(next);
                    void patchDiscordPrefs({ discordShowGameThumbnail: next });
                  }}
                />
                <span>Show game thumbnail</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={discordShowElapsed}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setDiscordShowElapsed(next);
                    void patchDiscordPrefs({ discordShowElapsed: next });
                  }}
                />
                <span>Show time elapsed in game</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={discordShowJoinButton}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setDiscordShowJoinButton(next);
                    void patchDiscordPrefs({ discordShowJoinButton: next });
                  }}
                />
                <span>Join button (server when known, otherwise the game)</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={discordShowGamePageButton}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setDiscordShowGamePageButton(next);
                    void patchDiscordPrefs({ discordShowGamePageButton: next });
                  }}
                />
                <span>See game page button</span>
              </label>
              <p className="sb-muted" style={{ gridColumn: "1 / -1", margin: 0 }}>
                Discord hides activity buttons on your own profile. Friends still see Join / See game
                page on your activity.
              </p>
              <label style={{ gridColumn: "1 / -1" }}>
                Discord Application ID
                <input
                  className="sb-input"
                  inputMode="numeric"
                  placeholder="Leave empty for the built-in SB Launcher ID"
                  value={discordApplicationId}
                  onChange={(event) =>
                    setDiscordApplicationId(event.target.value.replace(/\D/g, ""))
                  }
                />
              </label>
              <p className="sb-muted" style={{ gridColumn: "1 / -1", margin: 0 }}>
                Leave empty to use the built-in app ID. Change this only if you use your own Discord
                application. Optional Rich Presence art asset name: sblogo.
              </p>
            </div>
          ) : null}
        </div>

        <div className="sb-card" style={{ padding: "1.25rem" }}>
          <h3>Account</h3>
          <div style={{ marginTop: "0.75rem" }} className="sb-muted">
            {session?.authenticated ? (
              <>
                Signed in as <strong>{session.user?.displayName}</strong> (@{session.user?.username})
              </>
            ) : (
              "Not signed in"
            )}
          </div>
          <div className="chips" style={{ marginTop: "0.75rem" }}>
            {oauthConfigured ? <Badge>Live OAuth ready</Badge> : <Badge>OAuth setup required</Badge>}
            {session?.capabilities.friends ? <Badge>Friends</Badge> : null}
            {session?.capabilities.inventory ? <Badge>Inventory</Badge> : null}
            {session?.capabilities.avatarWrite ? <Badge>Avatar write</Badge> : null}
            {session?.capabilities.servers ? <Badge>Servers</Badge> : null}
          </div>
          <div className="form-grid" style={{ marginTop: "1rem" }}>
            <p className="sb-muted" style={{ margin: 0 }}>
              Customize your badge, photo, and banner on your own profile page (Customize profile).
              Those looks are visible to everyone using SB Launcher.
            </p>
            <label>
              Roblox OAuth Client ID
              <input
                className="sb-input"
                inputMode="numeric"
                placeholder="Paste Client ID from Creator Dashboard"
                value={oauthClientId}
                onChange={(event) => setOauthClientId(event.target.value.replace(/\D/g, ""))}
              />
            </label>
            <label>
              Registered redirect URI
              <input className="sb-input" value={redirectUri} readOnly />
            </label>
            <p className="sb-muted" style={{ margin: 0 }}>
              Create a Roblox OAuth app in the User Tools category and register this exact redirect
              URI. SB Launcher uses PKCE and does not store a client secret in the desktop app.
            </p>
          </div>
          <div className="row-actions" style={{ marginTop: "1rem" }}>
            <Button
              disabled={!oauthConfigured}
              onClick={() => void window.sbDesktop?.openExternal(authStartUrl())}
            >
              {session?.authenticated ? "Re-authorize" : "Sign in with Roblox"}
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void window.sbDesktop?.openExternal("https://www.roblox.com/my/account")
              }
            >
              Roblox account
            </Button>
          </div>
        </div>

        <div className="sb-card" style={{ padding: "1.25rem" }}>
          <h3>Roblox Player</h3>
          <p className="sb-muted">
            Status:{" "}
            {robloxInstalled ? "Detected on this PC" : "Not detected — install from Roblox.com"}
          </p>
          {detectPath ? (
            <p className="sb-muted" style={{ wordBreak: "break-all" }}>
              Path hint: {detectPath}
            </p>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => void window.sbDesktop?.openExternal("https://www.roblox.com/download")}
          >
            Download Roblox
          </Button>
        </div>
      </div>

      <div className="sb-card" style={{ padding: "1.25rem", marginTop: "1rem" }}>
        <div className="rail-title">
          <div>
            <h3>Roblox optimization</h3>
            <p className="sb-muted rail-subtitle">
              Uses Roblox settings plus only FastFlags from Roblox's official local allowlist.
            </p>
          </div>
          <Button variant="secondary" onClick={() => void applyOptimization()}>
            Apply now
          </Button>
        </div>
        <div className="chips" style={{ margin: "1rem 0" }}>
          <button
            className={`chip ${graphics.optimizationPreset === "maximum-fps" ? "active" : ""}`}
            onClick={() => applyPreset("maximum-fps")}
          >
            Maximum FPS
          </button>
          <button
            className={`chip ${graphics.optimizationPreset === "balanced" ? "active" : ""}`}
            onClick={() => applyPreset("balanced")}
          >
            Balanced
          </button>
          <button
            className={`chip ${graphics.optimizationPreset === "quality" ? "active" : ""}`}
            onClick={() => applyPreset("quality")}
          >
            Best quality
          </button>
        </div>
        <div className="form-grid" style={{ marginTop: "1rem", maxWidth: 520 }}>
          <label className="check-row">
            <input
              type="checkbox"
              checked={graphics.applyOnLaunch}
              onChange={(e) =>
                setGraphics({ ...graphics, applyOnLaunch: e.target.checked })
              }
            />
            <span>Apply automatically before launching Roblox</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={graphics.returnToLauncherOnExit}
              onChange={(e) =>
                setGraphics({ ...graphics, returnToLauncherOnExit: e.target.checked })
              }
            />
            <span>Close Roblox after leaving a place and return to SB Launcher</span>
          </label>
          <label>
            Window mode
            <select
              className="sb-input"
              value={graphics.preferredWindowMode}
              onChange={(e) =>
                patch({
                  preferredWindowMode: e.target.value as SafeGraphicsSettings["preferredWindowMode"],
                })
              }
            >
              <option value="windowed">Windowed</option>
              <option value="fullscreen">Fullscreen</option>
              <option value="borderless">Borderless (treated as fullscreen)</option>
            </select>
          </label>
          <label>
            FPS cap
            <select
              className="sb-input"
              value={graphics.fpsCapHint}
              onChange={(e) =>
                patch({ fpsCapHint: e.target.value as SafeGraphicsSettings["fpsCapHint"] })
              }
            >
              <option value="unlimited">Maximum (240 FPS)</option>
              <option value="240">240</option>
              <option value="144">144</option>
              <option value="120">120</option>
              <option value="60">60</option>
              <option value="30">30</option>
            </select>
          </label>
          <label>
            Graphics quality ({graphics.qualityLevel}/10)
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={graphics.qualityLevel}
              onChange={(e) => patch({ qualityLevel: Number(e.target.value) })}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={graphics.openRobloxSettingsOnLaunch}
              onChange={(e) => patch({ openRobloxSettingsOnLaunch: e.target.checked })}
            />
            <span>Remind me to open Roblox settings after launch</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={graphics.useAllowlistedFastFlags}
              onChange={(e) => patch({ useAllowlistedFastFlags: e.target.checked })}
            />
            <span>Use Roblox-allowlisted FastFlags</span>
          </label>
          {graphics.useAllowlistedFastFlags ? (
            <>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={graphics.graySky}
                  onChange={(e) => patch({ graySky: e.target.checked })}
                />
                <span>Gray sky (FPS)</span>
              </label>
              <label>
                Texture quality override
                <select
                  className="sb-input"
                  value={graphics.textureQualityOverride}
                  onChange={(e) =>
                    patch({
                      textureQualityOverride:
                        e.target.value as SafeGraphicsSettings["textureQualityOverride"],
                    })
                  }
                >
                  <option value="automatic">Automatic</option>
                  <option value="1">Low</option>
                  <option value="2">Medium</option>
                  <option value="3">High</option>
                </select>
              </label>
              <label>
                Anti-aliasing
                <select
                  className="sb-input"
                  value={graphics.antiAliasingSamples}
                  onChange={(e) =>
                    patch({
                      antiAliasingSamples:
                        e.target.value as SafeGraphicsSettings["antiAliasingSamples"],
                    })
                  }
                >
                  <option value="0">Off</option>
                  <option value="2">2× MSAA</option>
                  <option value="4">4× MSAA</option>
                  <option value="8">8× MSAA</option>
                </select>
              </label>
              <label>
                Grass render distance
                <select
                  className="sb-input"
                  value={graphics.grassDistance}
                  onChange={(e) =>
                    patch({
                      grassDistance: e.target.value as SafeGraphicsSettings["grassDistance"],
                    })
                  }
                >
                  <option value="default">Default</option>
                  <option value="0">Off</option>
                  <option value="64">64 studs</option>
                  <option value="128">128 studs</option>
                  <option value="256">256 studs</option>
                </select>
              </label>
              <label>
                Rendering backend
                <select
                  className="sb-input"
                  value={graphics.renderingMode}
                  onChange={(e) =>
                    patch({
                      renderingMode: e.target.value as SafeGraphicsSettings["renderingMode"],
                    })
                  }
                >
                  <option value="automatic">Automatic</option>
                  <option value="d3d11">Direct3D 11</option>
                  <option value="vulkan">Vulkan</option>
                  <option value="opengl">OpenGL</option>
                </select>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={graphics.pauseVoxelizer}
                  onChange={(e) => patch({ pauseVoxelizer: e.target.checked })}
                />
                <span>Pause voxel lighting updates</span>
              </label>
            </>
          ) : null}
        </div>
        <div className="notice" style={{ marginTop: "1rem" }}>
          Close Roblox before applying. SB Launcher creates a backup of the original settings and
          changes graphics settings and the documented allowlisted flags only. It never injects code
          or bypasses Roblox's whitelist. Roblox updates can replace ClientAppSettings.json.
        </div>
      </div>

      <div className="sb-card" style={{ padding: "1.25rem", marginTop: "1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h3>Roblox application icon</h3>
            <p className="sb-muted" style={{ margin: "0.35rem 0 0" }}>
              Icon on Windows shortcuts for Roblox Player (desktop / Start menu).
            </p>
          </div>
          <Button variant="secondary" onClick={() => void applyRobloxAppIcon()}>
            Apply icon
          </Button>
        </div>
        <div className="app-icon-picker" style={{ marginTop: "1rem" }}>
          {ROBLOX_APP_ICON_OPTIONS.map((option) => {
            const preview =
              option.mode === "custom"
                ? robloxAppIconPreview(robloxAppIcon) ?? option.preview
                : option.preview;
            const selected = robloxAppIcon.mode === option.mode;
            return (
              <button
                key={option.mode}
                type="button"
                className={`app-icon-option${selected ? " is-selected" : ""}`}
                onClick={() =>
                  setRobloxAppIcon({
                    ...robloxAppIcon,
                    mode: option.mode,
                  })
                }
              >
                {preview ? (
                  <img src={preview} alt="" className="app-icon-option-preview" />
                ) : (
                  <span className="app-icon-option-fallback" aria-hidden>
                    R
                  </span>
                )}
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
        {robloxAppIcon.mode === "custom" ? (
          <div className="form-grid" style={{ marginTop: "1rem", maxWidth: 520 }}>
            <label>
              Custom app icon URL
              <input
                className="sb-input"
                type="url"
                placeholder="https://example.com/icon.png"
                value={robloxAppIcon.customUrl}
                onChange={(event) =>
                  setRobloxAppIcon({
                    ...robloxAppIcon,
                    customUrl: event.target.value,
                  })
                }
              />
            </label>
            {window.sbDesktop?.pickRobloxAppIcon ? (
              <div className="row-actions">
                <Button
                  variant="secondary"
                  onClick={() =>
                    void window.sbDesktop?.pickRobloxAppIcon().then((picked) => {
                      if (picked) {
                        setRobloxAppIcon({ mode: "custom", customUrl: picked.url });
                      }
                    })
                  }
                >
                  Choose image file
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="notice" style={{ marginTop: "1rem" }}>
          Click Apply icon after choosing. Windows may keep a cached shortcut icon until you refresh
          the desktop or log out.
        </div>
      </div>

      <div className="sb-card" style={{ padding: "1.25rem", marginTop: "1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h3>Roblox appearance</h3>
            <p className="sb-muted" style={{ margin: "0.35rem 0 0" }}>
              Custom client font. Applied with optimization (and on every Roblox launch while custom
              mode is on). Close Roblox first.
            </p>
          </div>
          <Button variant="secondary" onClick={() => void applyOptimization()}>
            Apply now
          </Button>
        </div>
        <div className="form-grid" style={{ marginTop: "1rem", maxWidth: 520 }}>
          <label>
            Client font
            <select
              className="sb-input"
              value={graphics.robloxFontMode}
              onChange={(e) =>
                patch({
                  robloxFontMode: e.target.value as SafeGraphicsSettings["robloxFontMode"],
                })
              }
            >
              <option value="vanilla">Vanilla (default Roblox fonts)</option>
              <option value="custom">Custom font (replace all UI fonts)</option>
            </select>
          </label>
          {graphics.robloxFontMode === "custom" ? (
            <div className="row-actions" style={{ alignItems: "center", gap: "0.75rem" }}>
              <Button variant="secondary" onClick={() => void pickCustomFont()}>
                Choose font (.ttf / .otf)
              </Button>
              <span className="sb-muted">
                {graphics.robloxCustomFontName
                  ? `Selected: ${graphics.robloxCustomFontName}`
                  : "No font selected"}
              </span>
            </div>
          ) : null}
          <FontPreview
            label="Preview on “Always better”"
            useCustomFile={graphics.robloxFontMode === "custom"}
            fontId={graphics.robloxCustomFontId}
          />
        </div>
        <div className="notice" style={{ marginTop: "1rem" }}>
          Custom font copies your file over every local Roblox font slot. Switch back to Vanilla and
          Apply to restore defaults.
        </div>
      </div>

      <div className="sb-card" style={{ padding: "1.25rem", marginTop: "1rem" }}>
        <h3>Launch overlay</h3>
        <p className="sb-muted" style={{ margin: "0.35rem 0 1rem" }}>
          A small window shown for a few seconds when you join an experience from SB Launcher — not
          Roblox’s own splash files.
        </p>
        <div className="launch-overlay-layout">
          <div className="form-grid" style={{ maxWidth: 420 }}>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={graphics.launchOverlayEnabled ?? true}
                onChange={(e) => patch({ launchOverlayEnabled: e.target.checked })}
              />
              Show overlay when launching
            </label>
            <label>
              Duration ({Math.round((graphics.launchOverlayDurationMs ?? 4000) / 1000)}s)
              <input
                type="range"
                min={2000}
                max={8000}
                step={500}
                value={graphics.launchOverlayDurationMs ?? 4000}
                onChange={(e) => patch({ launchOverlayDurationMs: Number(e.target.value) })}
              />
            </label>
            <label>
              Label
              <input
                className="sb-input"
                maxLength={48}
                value={graphics.launchOverlayLabel ?? "Launching Roblox…"}
                onChange={(e) => patch({ launchOverlayLabel: e.target.value })}
              />
            </label>
            <label>
              Background
              <select
                className="sb-input"
                value={graphics.launchOverlayBgMode ?? "color"}
                onChange={(e) =>
                  patch({
                    launchOverlayBgMode: e.target
                      .value as SafeGraphicsSettings["launchOverlayBgMode"],
                  })
                }
              >
                <option value="color">Solid color</option>
                <option value="image">Custom image</option>
                <option value="gif">Custom GIF</option>
              </select>
            </label>
            {(graphics.launchOverlayBgMode ?? "color") === "color" ? (
              <label>
                Background color
                <input
                  type="color"
                  value={graphics.launchOverlayBgColor ?? "#12141f"}
                  onChange={(e) => patch({ launchOverlayBgColor: e.target.value })}
                />
              </label>
            ) : (
              <div className="row-actions" style={{ alignItems: "center", gap: "0.75rem" }}>
                <Button variant="secondary" onClick={() => void pickLaunchOverlayMedia()}>
                  Choose {(graphics.launchOverlayBgMode ?? "image") === "gif" ? "GIF" : "image"}
                </Button>
                <span className="sb-muted">
                  {graphics.launchOverlayMediaName
                    ? `Selected: ${graphics.launchOverlayMediaName}`
                    : "No file selected"}
                </span>
              </div>
            )}
            <label>
              Window color
              <input
                type="color"
                value={graphics.launchOverlayWindowColor ?? "#1a1d2b"}
                onChange={(e) => patch({ launchOverlayWindowColor: e.target.value })}
              />
            </label>
            <label>
              Border color
              <input
                type="color"
                value={graphics.launchOverlayBorderColor ?? "#3a4158"}
                onChange={(e) => patch({ launchOverlayBorderColor: e.target.value })}
              />
            </label>
            <label>
              Snake color
              <input
                type="color"
                value={graphics.launchOverlaySnakeColor ?? "#9a82db"}
                onChange={(e) => patch({ launchOverlaySnakeColor: e.target.value })}
              />
            </label>
            <label>
              Snake track
              <input
                type="color"
                value={graphics.launchOverlaySnakeTrackColor ?? "#4a4458"}
                onChange={(e) => patch({ launchOverlaySnakeTrackColor: e.target.value })}
              />
            </label>
            <label>
              Text color
              <input
                type="color"
                value={graphics.launchOverlayTextColor ?? "#e6e1e5"}
                onChange={(e) => patch({ launchOverlayTextColor: e.target.value })}
              />
            </label>
          </div>

          <div className="launch-overlay-preview-wrap">
            <p className="sb-muted" style={{ margin: "0 0 0.65rem" }}>
              Live preview
            </p>
            <div
              className="launch-overlay-preview"
              style={{
                background: graphics.launchOverlayWindowColor ?? "#1a1d2b",
                borderColor: graphics.launchOverlayBorderColor ?? "#3a4158",
              }}
            >
              <div
                className="launch-overlay-preview-bg"
                style={{
                  background:
                    (graphics.launchOverlayBgMode ?? "color") === "color"
                      ? (graphics.launchOverlayBgColor ?? "#12141f")
                      : undefined,
                }}
              >
                {(graphics.launchOverlayBgMode === "image" ||
                  graphics.launchOverlayBgMode === "gif") &&
                graphics.launchOverlayMediaUrl ? (
                  <img
                    src={graphics.launchOverlayMediaUrl}
                    alt=""
                    className="launch-overlay-preview-media"
                  />
                ) : null}
                <div className="launch-overlay-preview-dim" />
              </div>
              <div className="launch-overlay-preview-content">
                <svg
                  className="launch-overlay-preview-snake"
                  viewBox="0 0 100 100"
                  aria-hidden
                >
                  <path
                    d="M 1.95,49.90 L 2.93,44.04 L 5.18,39.45 L 8.20,35.64 L 11.82,32.32 L 15.72,29.39 L 19.63,26.46 L 23.14,23.14 L 26.46,19.63 L 29.39,15.72 L 32.32,11.82 L 35.64,8.20 L 39.45,5.18 L 44.04,2.93 L 50.00,1.95 L 55.86,2.93 L 60.45,5.18 L 64.26,8.30 L 67.58,11.82 L 70.51,15.72 L 73.44,19.63 L 76.76,23.14 L 80.27,26.46 L 84.18,29.39 L 88.09,32.32 L 91.60,35.64 L 94.73,39.45 L 96.97,44.04 L 97.95,50.00 L 96.97,55.86 L 94.73,60.45 L 91.70,64.26 L 88.09,67.58 L 84.18,70.51 L 80.27,73.44 L 76.66,76.66 L 73.44,80.27 L 70.51,84.18 L 67.58,88.09 L 64.26,91.70 L 60.45,94.73 L 55.86,96.97 L 49.90,97.95 L 44.04,96.97 L 39.45,94.73 L 35.64,91.70 L 32.32,88.09 L 29.39,84.18 L 26.46,80.27 L 23.24,76.66 L 19.63,73.44 L 15.72,70.51 L 11.82,67.58 L 8.20,64.26 L 5.18,60.45 L 2.93,55.86 Z"
                    fill="none"
                    stroke={graphics.launchOverlaySnakeTrackColor ?? "#4a4458"}
                    strokeWidth="3.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    className="launch-overlay-preview-snake-head"
                    d="M 1.95,49.90 L 2.93,44.04 L 5.18,39.45 L 8.20,35.64 L 11.82,32.32 L 15.72,29.39 L 19.63,26.46 L 23.14,23.14 L 26.46,19.63 L 29.39,15.72 L 32.32,11.82 L 35.64,8.20 L 39.45,5.18 L 44.04,2.93 L 50.00,1.95 L 55.86,2.93 L 60.45,5.18 L 64.26,8.30 L 67.58,11.82 L 70.51,15.72 L 73.44,19.63 L 76.76,23.14 L 80.27,26.46 L 84.18,29.39 L 88.09,32.32 L 91.60,35.64 L 94.73,39.45 L 96.97,44.04 L 97.95,50.00 L 96.97,55.86 L 94.73,60.45 L 91.70,64.26 L 88.09,67.58 L 84.18,70.51 L 80.27,73.44 L 76.66,76.66 L 73.44,80.27 L 70.51,84.18 L 67.58,88.09 L 64.26,91.70 L 60.45,94.73 L 55.86,96.97 L 49.90,97.95 L 44.04,96.97 L 39.45,94.73 L 35.64,91.70 L 32.32,88.09 L 29.39,84.18 L 26.46,80.27 L 23.24,76.66 L 19.63,73.44 L 15.72,70.51 L 11.82,67.58 L 8.20,64.26 L 5.18,60.45 L 2.93,55.86 Z"
                    fill="none"
                    stroke={graphics.launchOverlaySnakeColor ?? "#9a82db"}
                    strokeWidth="3.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="48 232"
                  />
                </svg>
                <strong style={{ color: graphics.launchOverlayTextColor ?? "#e6e1e5" }}>
                  {graphics.launchOverlayLabel || "Launching Roblox…"}
                </strong>
              </div>
            </div>
            <p className="sb-muted" style={{ margin: "0.7rem 0 0", fontSize: "0.85rem" }}>
              {(graphics.launchOverlayEnabled ?? true)
                ? `Appears for ~${Math.round((graphics.launchOverlayDurationMs ?? 4000) / 1000)}s when you join a game.`
                : "Overlay is off — joining goes straight to Roblox."}
            </p>
          </div>
        </div>
      </div>

      <div className="sb-card" style={{ padding: "1.25rem", marginTop: "1rem" }}>
        <h3>About</h3>
        <p>
          <strong>SB Launcher</strong> is an independent companion app and is not affiliated with,
          endorsed by, or sponsored by Roblox Corporation.
        </p>
        <div className="row-actions">
          <Button
            variant="ghost"
            onClick={() => void window.sbDesktop?.openExternal("https://en.help.roblox.com/")}
          >
            Roblox Help
          </Button>
        </div>
      </div>
    </div>
  );
}
