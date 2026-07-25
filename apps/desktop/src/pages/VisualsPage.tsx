import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_THEME, VisualThemeSchema, normalizeTheme, type VisualTheme } from "@sb/contracts";
import { THEME_PRESETS, Button, FONT_OPTIONS } from "@sb/ui";
import { useAppStore } from "../store";
import { api } from "../lib/api";
import { BUNDLED_WALLPAPERS } from "../assets/wallpapers";

export function VisualsPage() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const persistPreferences = useAppStore((s) => s.persistPreferences);
  const session = useAppStore((s) => s.session);
  const [presetName, setPresetName] = useState("My Visual");
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [customWallpapers, setCustomWallpapers] = useState<Array<{ id: string; name: string; url: string }>>([]);

  useEffect(() => {
    void window.sbDesktop?.listCustomWallpapers?.().then((items) => {
      setCustomWallpapers(items ?? []);
    });
  }, []);

  const exportJson = useMemo(() => JSON.stringify(theme, null, 2), [theme]);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function schedulePersist() {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void persistPreferences();
    }, 350);
  }

  function patch(partial: Partial<VisualTheme>) {
    setTheme({ ...theme, ...partial });
    schedulePersist();
  }

  function patchEffects(partial: Partial<NonNullable<VisualTheme["effects"]>>) {
    setTheme(
      normalizeTheme({
        ...theme,
        effects: { ...(theme.effects ?? DEFAULT_THEME.effects), ...partial },
      }),
    );
    schedulePersist();
  }

  async function save() {
    await persistPreferences();
    if (session?.authenticated) {
      await api.saveTheme(presetName.trim() || theme.name, theme);
    }
    setMessage("Visual preset saved.");
  }

  function applyPreset(preset: VisualTheme) {
    setTheme(normalizeTheme({ ...preset, fontId: theme.fontId }));
    schedulePersist();
    setMessage(`Applied “${preset.name}”.`);
  }

  function importTheme() {
    try {
      const parsed = normalizeTheme(JSON.parse(importText));
      setTheme(parsed);
      schedulePersist();
      setMessage("Imported visual preset.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Invalid theme JSON");
    }
  }

  function reset() {
    setTheme(DEFAULT_THEME);
    schedulePersist();
    setMessage("Reset to SB Midnight.");
  }

  async function importWallpaper() {
    if (!window.sbDesktop?.pickWallpaper) {
      setMessage("Custom wallpaper import is available in the desktop app.");
      return;
    }
    const picked = await window.sbDesktop.pickWallpaper();
    if (!picked) return;
    setCustomWallpapers((current) => [...current, picked]);
    patch({
      backgroundMode: "image",
      wallpaperId: picked.id,
    });
    setMessage(`Imported wallpaper “${picked.name}”.`);
  }

  const wallpapers = [...BUNDLED_WALLPAPERS, ...customWallpapers];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Visuals</h2>
          <p className="sb-muted">
            Wallpapers, effects, motion, and component styling — not just gradients.
          </p>
        </div>
        <div className="row-actions">
          <Button onClick={() => void save()}>Save</Button>
          <Button variant="secondary" onClick={reset}>
            Reset
          </Button>
        </div>
      </div>

      {message ? <div className="notice">{message}</div> : null}

      <div className="visual-sections">
        <section className="sb-card" style={{ padding: "1.25rem" }}>
          <h3>Presets</h3>
          <div className="preset-grid" style={{ marginTop: "1rem" }}>
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={`preset-card ${theme.id === preset.id ? "active" : ""}`}
                onClick={() => applyPreset(preset)}
              >
                <div
                  className="preset-swatch"
                  style={{
                    background: `linear-gradient(135deg, ${preset.gradientFrom}, ${preset.gradientTo}), ${preset.background}`,
                  }}
                />
                <strong>{preset.name}</strong>
              </button>
            ))}
          </div>
        </section>

        <div className="panel-grid">
          <div className="sb-card" style={{ padding: "1.25rem" }}>
            <h3>Background</h3>
            <div className="form-grid" style={{ marginTop: "1rem" }}>
              <label>
                Background mode
                <select
                  className="sb-input"
                  value={theme.backgroundMode ?? "gradient"}
                  onChange={(e) =>
                    patch({ backgroundMode: e.target.value as VisualTheme["backgroundMode"] })
                  }
                >
                  <option value="gradient">Gradient</option>
                  <option value="solid">Solid</option>
                  <option value="image">Wallpaper</option>
                  <option value="layered">Layered</option>
                </select>
              </label>
              <label>
                Wallpaper
                <select
                  className="sb-input"
                  value={theme.wallpaperId ?? ""}
                  onChange={(e) => {
                    const wallpaperId = e.target.value || null;
                    patch({
                      wallpaperId,
                      backgroundMode: wallpaperId
                        ? theme.backgroundMode === "solid" || theme.backgroundMode === "gradient"
                          ? "image"
                          : theme.backgroundMode
                        : theme.backgroundMode,
                      wallpaperOpacity:
                        wallpaperId && (theme.wallpaperOpacity ?? 0) < 0.2
                          ? 0.55
                          : theme.wallpaperOpacity,
                    });
                  }}
                >
                  <option value="">None</option>
                  {wallpapers.map((wallpaper) => (
                    <option key={wallpaper.id} value={wallpaper.id}>
                      {wallpaper.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="secondary" onClick={() => void importWallpaper()}>
                Import custom wallpaper
              </Button>
              <label>
                Wallpaper opacity ({(theme.wallpaperOpacity ?? 0.35).toFixed(2)})
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={theme.wallpaperOpacity ?? 0.35}
                  onChange={(e) => patch({ wallpaperOpacity: Number(e.target.value) })}
                />
              </label>
              <label>
                Wallpaper blur ({theme.wallpaperBlur ?? 0}px)
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={theme.wallpaperBlur ?? 0}
                  onChange={(e) => patch({ wallpaperBlur: Number(e.target.value) })}
                />
              </label>
              <label>
                Dim overlay ({(theme.wallpaperDim ?? 0.45).toFixed(2)})
                <input
                  type="range"
                  min={0}
                  max={0.9}
                  step={0.01}
                  value={theme.wallpaperDim ?? 0.45}
                  onChange={(e) => patch({ wallpaperDim: Number(e.target.value) })}
                />
              </label>
            </div>
          </div>

          <div className="sb-card" style={{ padding: "1.25rem" }}>
            <h3>Effects</h3>
            <div className="form-grid" style={{ marginTop: "1rem" }}>
              {(
                [
                  ["glass", "Glass surfaces"],
                  ["noise", "Film grain"],
                  ["vignette", "Vignette"],
                  ["glow", "Accent glow"],
                  ["particles", "Particles"],
                  ["parallax", "Parallax feel"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="check-row">
                  <input
                    type="checkbox"
                    checked={theme.effects?.[key] ?? false}
                    onChange={(e) => patchEffects({ [key]: e.target.checked })}
                  />
                  <span>{label}</span>
                </label>
              ))}
              {theme.effects?.glass ? (
                <div className="form-grid glass-deep-panel" style={{ marginTop: "0.35rem" }}>
                  <p className="sb-muted" style={{ gridColumn: "1 / -1", margin: 0 }}>
                    Deep glass — tune blur, clarity, tint, and where it applies.
                  </p>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={theme.effects.glassCards ?? true}
                      onChange={(e) => patchEffects({ glassCards: e.target.checked })}
                    />
                    <span>Cards</span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={theme.effects.glassSidebar ?? true}
                      onChange={(e) => patchEffects({ glassSidebar: e.target.checked })}
                    />
                    <span>Sidebar</span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={theme.effects.glassTopbar ?? true}
                      onChange={(e) => patchEffects({ glassTopbar: e.target.checked })}
                    />
                    <span>Top bar</span>
                  </label>
                  <label>
                    Glass blur ({theme.effects.glassBlur ?? theme.blur}px)
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={theme.effects.glassBlur ?? theme.blur}
                      onChange={(e) => patchEffects({ glassBlur: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Fill opacity ({(theme.effects.glassOpacity ?? 0.52).toFixed(2)})
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={theme.effects.glassOpacity ?? 0.52}
                      onChange={(e) => patchEffects({ glassOpacity: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Saturation ({(theme.effects.glassSaturation ?? 1.35).toFixed(2)}×)
                    <input
                      type="range"
                      min={0}
                      max={3}
                      step={0.05}
                      value={theme.effects.glassSaturation ?? 1.35}
                      onChange={(e) => patchEffects({ glassSaturation: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Brightness ({(theme.effects.glassBrightness ?? 1).toFixed(2)}×)
                    <input
                      type="range"
                      min={0.4}
                      max={1.8}
                      step={0.02}
                      value={theme.effects.glassBrightness ?? 1}
                      onChange={(e) => patchEffects({ glassBrightness: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Contrast ({(theme.effects.glassContrast ?? 1).toFixed(2)}×)
                    <input
                      type="range"
                      min={0.5}
                      max={1.8}
                      step={0.02}
                      value={theme.effects.glassContrast ?? 1}
                      onChange={(e) => patchEffects({ glassContrast: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Border ({(theme.effects.glassBorder ?? 0.42).toFixed(2)})
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={theme.effects.glassBorder ?? 0.42}
                      onChange={(e) => patchEffects({ glassBorder: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Specular ({(theme.effects.glassSpecular ?? 0.28).toFixed(2)})
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={theme.effects.glassSpecular ?? 0.28}
                      onChange={(e) => patchEffects({ glassSpecular: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Shadow ({(theme.effects.glassShadow ?? 0.4).toFixed(2)})
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={theme.effects.glassShadow ?? 0.4}
                      onChange={(e) => patchEffects({ glassShadow: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Tint strength ({(theme.effects.glassTintStrength ?? 0.15).toFixed(2)})
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={theme.effects.glassTintStrength ?? 0.15}
                      onChange={(e) => patchEffects({ glassTintStrength: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Tint color
                    <input
                      type="color"
                      value={theme.effects.glassTintColor ?? theme.accent}
                      onChange={(e) => patchEffects({ glassTintColor: e.target.value })}
                    />
                  </label>
                </div>
              ) : null}
              {theme.effects?.particles ? (
                <div className="form-grid" style={{ marginTop: "0.35rem" }}>
                  <label>
                    Particle density
                    <select
                      className="sb-input"
                      value={theme.effects.particleDensity ?? "medium"}
                      onChange={(e) =>
                        patchEffects({
                          particleDensity: e.target.value as "low" | "medium" | "high",
                        })
                      }
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                  <label>
                    Particle size ({(theme.effects.particleSize ?? 1).toFixed(2)}×)
                    <input
                      type="range"
                      min={0.5}
                      max={2.5}
                      step={0.05}
                      value={theme.effects.particleSize ?? 1}
                      onChange={(e) =>
                        patchEffects({ particleSize: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Particle speed ({(theme.effects.particleSpeed ?? 1).toFixed(2)}×)
                    <input
                      type="range"
                      min={0.25}
                      max={2.5}
                      step={0.05}
                      value={theme.effects.particleSpeed ?? 1}
                      onChange={(e) =>
                        patchEffects({ particleSpeed: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Particle opacity ({(theme.effects.particleOpacity ?? 0.75).toFixed(2)})
                    <input
                      type="range"
                      min={0.15}
                      max={1}
                      step={0.01}
                      value={theme.effects.particleOpacity ?? 0.75}
                      onChange={(e) =>
                        patchEffects({ particleOpacity: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="panel-grid">
          <div className="sb-card" style={{ padding: "1.25rem" }}>
            <h3>Colors & layout</h3>
            <div className="form-grid" style={{ marginTop: "1rem" }}>
              <label>
                Preset name
                <input
                  className="sb-input"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                />
              </label>
              <label>
                Accent
                <input type="color" value={theme.accent} onChange={(e) => patch({ accent: e.target.value })} />
              </label>
              <label>
                Accent secondary
                <input
                  type="color"
                  value={theme.accentSecondary}
                  onChange={(e) => patch({ accentSecondary: e.target.value })}
                />
              </label>
              <label>
                Background
                <input
                  type="color"
                  value={theme.background}
                  onChange={(e) => patch({ background: e.target.value })}
                />
              </label>
              <label>
                Surface
                <input type="color" value={theme.surface} onChange={(e) => patch({ surface: e.target.value })} />
              </label>
              <label>
                Text
                <input type="color" value={theme.text} onChange={(e) => patch({ text: e.target.value })} />
              </label>
              <label>
                Blur ({theme.blur}px)
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={theme.blur}
                  onChange={(e) => patch({ blur: Number(e.target.value) })}
                />
              </label>
              <label>
                Panel opacity ({theme.opacity.toFixed(2)})
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.01}
                  value={theme.opacity}
                  onChange={(e) => patch({ opacity: Number(e.target.value) })}
                />
              </label>
              <label>
                Window corner radius ({theme.cornerRadius}px)
                <input
                  type="range"
                  min={0}
                  max={48}
                  value={theme.cornerRadius}
                  onChange={(e) => patch({ cornerRadius: Number(e.target.value) })}
                />
              </label>
              <label>
                Font
                <select
                  className="sb-input"
                  value={theme.fontId ?? "figtree"}
                  onChange={(e) => patch({ fontId: e.target.value })}
                >
                  {FONT_OPTIONS.map((font) => (
                    <option key={font.id} value={font.id} style={{ fontFamily: font.stack }}>
                      {font.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Density
                <select
                  className="sb-input"
                  value={theme.density}
                  onChange={(e) => patch({ density: e.target.value as VisualTheme["density"] })}
                >
                  <option value="compact">Compact</option>
                  <option value="comfortable">Comfortable</option>
                  <option value="spacious">Spacious</option>
                </select>
              </label>
              <label>
                Sidebar style
                <select
                  className="sb-input"
                  value={theme.sidebarStyle}
                  onChange={(e) =>
                    patch({ sidebarStyle: e.target.value as VisualTheme["sidebarStyle"] })
                  }
                >
                  <option value="solid">Solid</option>
                  <option value="glass">Glass</option>
                  <option value="minimal">Minimal</option>
                </select>
              </label>
              <label>
                Button style
                <select
                  className="sb-input"
                  value={theme.buttonStyle ?? "gradient"}
                  onChange={(e) =>
                    patch({ buttonStyle: e.target.value as VisualTheme["buttonStyle"] })
                  }
                >
                  <option value="gradient">Gradient</option>
                  <option value="solid">Solid</option>
                  <option value="tonal">Tonal</option>
                </select>
              </label>
              <label>
                Card style
                <select
                  className="sb-input"
                  value={theme.cardStyle ?? "glass"}
                  onChange={(e) => patch({ cardStyle: e.target.value as VisualTheme["cardStyle"] })}
                >
                  <option value="glass">Glass</option>
                  <option value="solid">Solid</option>
                  <option value="outline">Outline</option>
                </select>
              </label>
            </div>
          </div>

          <div className="sb-card" style={{ padding: "1.25rem" }}>
            <h3>Motion</h3>
            <p className="sb-muted" style={{ marginTop: "0.35rem" }}>
              Material You 3 motion — enter uses decelerate, exit uses accelerate,
              and on-screen changes use emphasized easing with short/medium/long
              duration tokens.
            </p>
            <div className="form-grid" style={{ marginTop: "1rem" }}>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={theme.animations}
                  onChange={(e) => patch({ animations: e.target.checked })}
                />
                <span>Enable animations</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={theme.reducedMotion}
                  onChange={(e) => patch({ reducedMotion: e.target.checked })}
                />
                <span>Reduced motion</span>
              </label>
              <label>
                Motion intensity
                <select
                  className="sb-input"
                  value={theme.motionIntensity ?? "medium"}
                  onChange={(e) =>
                    patch({
                      motionIntensity: e.target.value as VisualTheme["motionIntensity"],
                    })
                  }
                >
                  <option value="off">Off</option>
                  <option value="low">Low (shorter tokens)</option>
                  <option value="medium">Medium (M3 default)</option>
                  <option value="high">High (longer tokens)</option>
                </select>
              </label>
            </div>

            <h3 style={{ marginTop: "1.5rem" }}>Live preview</h3>
            <div
              style={{
                marginTop: "1rem",
                padding: "1.25rem",
                borderRadius: `${theme.cornerRadius}px`,
                background:
                  theme.backgroundMode === "solid"
                    ? theme.surface
                    : `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo}), ${theme.surface}`,
                border: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            >
              <strong style={{ color: theme.accent }}>{theme.name || "Custom Visual"}</strong>
              <p style={{ color: theme.textMuted }}>
                Cards, buttons, and sidebar update instantly as you tweak values.
              </p>
              <button className="sb-button">Sample action</button>
            </div>

            <h3 style={{ marginTop: "1.5rem" }}>Export / Import</h3>
            <textarea
              className="sb-input"
              style={{ minHeight: 160, marginTop: "0.75rem", fontFamily: "ui-monospace, monospace" }}
              value={exportJson}
              readOnly
            />
            <textarea
              className="sb-input"
              style={{ minHeight: 120, marginTop: "0.75rem", fontFamily: "ui-monospace, monospace" }}
              placeholder="Paste theme JSON to import…"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <Button variant="secondary" style={{ marginTop: "0.75rem" }} onClick={importTheme}>
              Import JSON
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
