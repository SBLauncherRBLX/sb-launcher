import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  DEFAULT_THEME,
  DEFAULT_LAYOUT,
  DEFAULT_SCROLL,
  VisualThemeSchema,
  normalizeTheme,
  type VisualTheme,
} from "@sb/contracts";
import { THEME_PRESETS, Button, FONT_OPTIONS } from "@sb/ui";
import { useAppStore } from "../store";
import { api } from "../lib/api";
import { BUNDLED_WALLPAPERS } from "../assets/wallpapers";
import { Presets3D, Background3D, Effects3D, Layout3D, Scroll3D, Colors3D, Motion3D, Visuals3D } from "../components/Section3DIcons";

function VisualsSection({
  icon,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="sb-card section-collapsible">
      <button type="button" className="section-header" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="section-icon">{icon}</span>
        <div className="section-titles">
          <h3>{title}</h3>
          <p className="sb-muted">{subtitle}</p>
        </div>
        <motion.span className="section-chevron" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          ▾
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.26, ease: [0.2, 0, 0, 1] as const }} style={{ overflow: "hidden" }}>
            <div className="section-body">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

export function VisualsPage() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const persistPreferences = useAppStore((s) => s.persistPreferences);
  const session = useAppStore((s) => s.session);
  const [presetName, setPresetName] = useState("My Visual");
  const [presetAvatar, setPresetAvatar] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [savedPresets, setSavedPresets] = useState<Array<{ id: string; name: string; theme: VisualTheme; avatarUrl?: string | null; sortOrder: number }>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const presetAvatarInputRef = useRef<HTMLInputElement>(null);
  const editAvatarInputRef = useRef<HTMLInputElement>(null);

  const exportJson = useMemo(() => JSON.stringify(theme, null, 2), [theme]);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const LOCAL_PRESETS_KEY = "sb-local-presets-v1";

  const loadPresets = async () => {
    if (session?.authenticated) {
      try {
        const res = await api.themes();
        setSavedPresets(res.items as unknown as typeof savedPresets);
        return;
      } catch {
        // fall through to local
      }
    }
    try {
      const raw = localStorage.getItem(LOCAL_PRESETS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setSavedPresets(arr);
        else setSavedPresets([]);
      } else {
        // also try sbDesktop prefs
        const prefs = (await window.sbDesktop?.getPrefs?.()) as { localPresets?: typeof savedPresets } | undefined;
        if (prefs?.localPresets && Array.isArray(prefs.localPresets)) setSavedPresets(prefs.localPresets);
        else setSavedPresets([]);
      }
    } catch {
      setSavedPresets([]);
    }
  };

  const persistLocalPresets = async (next: typeof savedPresets) => {
    try {
      localStorage.setItem(LOCAL_PRESETS_KEY, JSON.stringify(next));
    } catch {}
    try {
      await window.sbDesktop?.setPrefs?.({ localPresets: next } as unknown as Record<string, unknown>);
    } catch {}
  };

  useEffect(() => {
    void loadPresets();
  }, [session?.authenticated]);

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const onPickPresetAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2_000_000) { setMessage("Avatar must be < 2MB"); return; }
    const url = await fileToDataUrl(f);
    setPresetAvatar(url);
    e.target.value = "";
  };
  const onPickEditAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2_000_000) { setMessage("Avatar must be < 2MB"); return; }
    const url = await fileToDataUrl(f);
    setEditAvatar(url);
    e.target.value = "";
  };

  function schedulePersist() {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void persistPreferences();
    }, 350);
  }

  function patch(partial: Partial<VisualTheme>) {
    const current = useAppStore.getState().theme;
    setTheme({ ...current, ...partial });
    schedulePersist();
  }

  function patchEffects(partial: Partial<NonNullable<VisualTheme["effects"]>>) {
    const current = useAppStore.getState().theme;
    setTheme(
      normalizeTheme({
        ...current,
        effects: { ...(current.effects ?? DEFAULT_THEME.effects), ...partial },
      }),
    );
    schedulePersist();
  }

  function patchLayout(partial: Partial<NonNullable<VisualTheme["layout"]>>) {
    const current = useAppStore.getState().theme;
    setTheme(
      normalizeTheme({
        ...current,
        layout: { ...(current.layout ?? DEFAULT_LAYOUT), ...partial },
      }),
    );
    schedulePersist();
  }

  function patchScroll(partial: Partial<NonNullable<VisualTheme["scroll"]>>) {
    const current = useAppStore.getState().theme;
    setTheme(
      normalizeTheme({
        ...current,
        scroll: { ...(current.scroll ?? DEFAULT_SCROLL), ...partial },
      }),
    );
    schedulePersist();
  }

  async function save() {
    await persistPreferences();
    const name = presetName.trim() || theme.name;
    const avatar = presetAvatar;
    if (session?.authenticated) {
      try {
        await api.saveTheme(name, theme, avatar);
        await loadPresets();
        setMessage("Visual preset saved.");
        return;
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Failed to save preset");
        return;
      }
    }
    // local fallback
    const newItem = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      theme: normalizeTheme(theme),
      avatarUrl: avatar,
      sortOrder: savedPresets.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as (typeof savedPresets)[number];
    const next = [...savedPresets, newItem];
    setSavedPresets(next);
    await persistLocalPresets(next);
    setMessage("Preset saved locally — sign in to sync to cloud.");
  }

  async function deletePreset(id: string) {
    if (!confirm("Delete this preset?")) return;
    if (id.startsWith("local-") || !session?.authenticated) {
      const next = savedPresets.filter((p) => p.id !== id);
      setSavedPresets(next);
      await persistLocalPresets(next);
      setMessage("Preset deleted.");
      return;
    }
    await api.deleteTheme(id);
    setSavedPresets((s) => s.filter((p) => p.id !== id));
    setMessage("Preset deleted.");
  }

  async function movePreset(id: string, dir: -1 | 1) {
    const idx = savedPresets.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const next = [...savedPresets];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    const tmp = next[idx]!;
    next[idx] = next[target]!;
    next[target] = tmp;
    // reassign sortOrder
    next.forEach((p, i) => (p.sortOrder = i));
    setSavedPresets([...next]);
    if (session?.authenticated && next.every((p) => !p.id.startsWith("local-"))) {
      try {
        await api.reorderThemes(next.map((p) => p.id));
      } catch {}
    } else {
      await persistLocalPresets(next);
    }
  }

  async function startEditPreset(p: (typeof savedPresets)[number]) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditAvatar(p.avatarUrl ?? null);
  }

  async function saveEditPreset() {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) { setMessage("Name cannot be empty"); return; }
    if (editingId.startsWith("local-") || !session?.authenticated) {
      const next = savedPresets.map((x) => (x.id === editingId ? { ...x, name, avatarUrl: editAvatar } : x));
      setSavedPresets(next);
      await persistLocalPresets(next);
      setEditingId(null);
      setMessage("Preset updated.");
      return;
    }
    await api.updateTheme(editingId, { name, avatarUrl: editAvatar });
    setSavedPresets((s) => s.map((x) => (x.id === editingId ? { ...x, name, avatarUrl: editAvatar } : x)));
    setEditingId(null);
    setMessage("Preset updated.");
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

  const wallpapers = BUNDLED_WALLPAPERS;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Visuals</h2>
          <p className="sb-muted">Wallpapers, effects, motion, and component styling — not just gradients.</p>
        </div>
        <div className="row-actions">
          <Button onClick={() => void save()}>Save</Button>
          <Button variant="secondary" onClick={reset}>Reset</Button>
        </div>
      </div>

      {message ? <div className="notice">{message}</div> : null}

      <div style={{ display: "grid", gap: "0.85rem" }}>
        <VisualsSection icon={<Presets3D />} title="Presets" subtitle="Choose a base style — your presets live right here">
          <div className="preset-grid" style={{ marginTop: "0.5rem" }}>
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
            {savedPresets.map((p) => (
              <div
                key={p.id}
                className={`preset-card ${theme.id === p.theme.id ? "active" : ""}`}
                style={{ position: "relative", paddingBottom: editingId === p.id ? "0.6rem" : undefined }}
              >
                <button
                  onClick={() => editingId !== p.id && applyPreset(p.theme)}
                  style={{ display: "contents", cursor: editingId === p.id ? "default" : "pointer" }}
                  disabled={editingId === p.id}
                >
                  <div
                    className="preset-swatch"
                    style={{
                      background: `linear-gradient(135deg, ${p.theme.gradientFrom}, ${p.theme.gradientTo}), ${p.theme.background}`,
                      position: "relative",
                    }}
                  >
                    {p.avatarUrl ? (
                      <img
                        src={p.avatarUrl}
                        alt=""
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          objectFit: "cover",
                          border: "1px solid rgba(255,255,255,0.7)",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
                        }}
                      />
                    ) : null}
                  </div>
                  <strong>{p.name}</strong>
                </button>
                <div style={{ display: "flex", gap: 4, marginTop: 6, justifyContent: "center", flexWrap: "wrap" }}>
                  <button className="sb-button ghost" style={{ padding: "0.25rem 0.5rem", minHeight: "auto", fontSize: "0.75rem" }} onClick={() => void startEditPreset(p)}>
                    Edit
                  </button>
                  <button className="sb-button ghost" style={{ padding: "0.25rem 0.5rem", minHeight: "auto", fontSize: "0.75rem" }} disabled={savedPresets.findIndex((x) => x.id === p.id) === 0} onClick={() => void movePreset(p.id, -1)}>
                    ↑
                  </button>
                  <button className="sb-button ghost" style={{ padding: "0.25rem 0.5rem", minHeight: "auto", fontSize: "0.75rem" }} disabled={savedPresets.findIndex((x) => x.id === p.id) === savedPresets.length - 1} onClick={() => void movePreset(p.id, 1)}>
                    ↓
                  </button>
                  <button className="sb-button ghost" style={{ padding: "0.25rem 0.5rem", minHeight: "auto", fontSize: "0.75rem" }} onClick={() => void deletePreset(p.id)}>
                    ✕
                  </button>
                </div>
                {editingId === p.id ? (
                  <div style={{ display: "grid", gap: "0.4rem", marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid var(--sb-outline-variant)" }}>
                    <input className="sb-input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" />
                    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                      {editAvatar ? <img src={editAvatar} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} /> : null}
                      <Button variant="secondary" onClick={() => editAvatarInputRef.current?.click()}>Pick avatar</Button>
                      <input ref={editAvatarInputRef} type="file" accept="image/*" hidden onChange={onPickEditAvatar} />
                      <Button onClick={() => void saveEditPreset()}>Save</Button>
                      <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="form-grid" style={{ marginTop: "1rem" }}>
            <label>
              Preset name
              <input className="sb-input" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="My Visual" />
            </label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "end" }}>
              <div style={{ flex: "1" }}>
                <label>Avatar</label>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.35rem" }}>
                  {presetAvatar ? <img src={presetAvatar} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", border: "1px solid var(--sb-outline-variant)" }} /> : <span className="sb-muted" style={{ fontSize: "0.85rem" }}>No avatar</span>}
                  <Button variant="secondary" onClick={() => presetAvatarInputRef.current?.click()}>Pick avatar</Button>
                  {presetAvatar ? <Button variant="ghost" onClick={() => setPresetAvatar(null)}>Clear</Button> : null}
                </div>
                <input ref={presetAvatarInputRef} type="file" accept="image/*" hidden onChange={onPickPresetAvatar} />
              </div>
              <Button onClick={() => void save()}>Save as preset</Button>
            </div>
          </div>
        </VisualsSection>

        <VisualsSection icon={<Background3D />} title="Background" subtitle="Wallpapers, opacity and blur">
          <div className="form-grid" style={{ marginTop: "0.5rem" }}>
            <label>
              Background mode
              <select
                className="sb-input"
                value={theme.backgroundMode ?? "gradient"}
                onChange={(e) => patch({ backgroundMode: e.target.value as VisualTheme["backgroundMode"] })}
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
                    wallpaperOpacity: wallpaperId && (theme.wallpaperOpacity ?? 0) < 0.2 ? 0.55 : theme.wallpaperOpacity,
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
            <label>
              Wallpaper opacity ({(theme.wallpaperOpacity ?? 0.35).toFixed(2)})
              <input type="range" min={0} max={1} step={0.01} value={theme.wallpaperOpacity ?? 0.35} onChange={(e) => patch({ wallpaperOpacity: Number(e.target.value) })} />
            </label>
            <label>
              Wallpaper blur ({theme.wallpaperBlur ?? 0}px)
              <input type="range" min={0} max={40} value={theme.wallpaperBlur ?? 0} onChange={(e) => patch({ wallpaperBlur: Number(e.target.value) })} />
            </label>
            <label>
              Dim overlay ({(theme.wallpaperDim ?? 0.45).toFixed(2)})
              <input type="range" min={0} max={0.9} step={0.01} value={theme.wallpaperDim ?? 0.45} onChange={(e) => patch({ wallpaperDim: Number(e.target.value) })} />
            </label>
          </div>
        </VisualsSection>

        <VisualsSection icon={<Effects3D />} title="Effects" subtitle="Glass, grain, glow and particles">
          <div className="form-grid" style={{ marginTop: "0.5rem" }}>
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
                <input type="checkbox" checked={theme.effects?.[key] ?? false} onChange={(e) => patchEffects({ [key]: e.target.checked })} />
                <span>{label}</span>
              </label>
            ))}
            {theme.effects?.glass ? (
              <div className="form-grid glass-deep-panel" style={{ marginTop: "0.35rem" }}>
                <p className="sb-muted" style={{ gridColumn: "1 / -1", margin: 0 }}>Deep glass — tune blur, clarity, tint, and where it applies.</p>
                <label className="check-row">
                  <input type="checkbox" checked={theme.effects.glassCards ?? true} onChange={(e) => patchEffects({ glassCards: e.target.checked })} />
                  <span>Cards</span>
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={theme.effects.glassSidebar ?? true} onChange={(e) => patchEffects({ glassSidebar: e.target.checked })} />
                  <span>Sidebar</span>
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={theme.effects.glassTopbar ?? true} onChange={(e) => patchEffects({ glassTopbar: e.target.checked })} />
                  <span>Top bar</span>
                </label>
                <label>
                  Glass blur ({theme.effects.glassBlur ?? theme.blur}px)
                  <input type="range" min={0} max={100} value={theme.effects.glassBlur ?? theme.blur} onChange={(e) => patchEffects({ glassBlur: Number(e.target.value) })} />
                </label>
                <label>
                  Fill opacity ({(theme.effects.glassOpacity ?? 0.52).toFixed(2)})
                  <input type="range" min={0} max={1} step={0.01} value={theme.effects.glassOpacity ?? 0.52} onChange={(e) => patchEffects({ glassOpacity: Number(e.target.value) })} />
                </label>
                <label>
                  Saturation ({(theme.effects.glassSaturation ?? 1.35).toFixed(2)}×)
                  <input type="range" min={0} max={3} step={0.05} value={theme.effects.glassSaturation ?? 1.35} onChange={(e) => patchEffects({ glassSaturation: Number(e.target.value) })} />
                </label>
                <label>
                  Brightness ({(theme.effects.glassBrightness ?? 1).toFixed(2)}×)
                  <input type="range" min={0.4} max={1.8} step={0.02} value={theme.effects.glassBrightness ?? 1} onChange={(e) => patchEffects({ glassBrightness: Number(e.target.value) })} />
                </label>
                <label>
                  Contrast ({(theme.effects.glassContrast ?? 1).toFixed(2)}×)
                  <input type="range" min={0.5} max={1.8} step={0.02} value={theme.effects.glassContrast ?? 1} onChange={(e) => patchEffects({ glassContrast: Number(e.target.value) })} />
                </label>
                <label>
                  Border ({(theme.effects.glassBorder ?? 0.42).toFixed(2)})
                  <input type="range" min={0} max={1} step={0.01} value={theme.effects.glassBorder ?? 0.42} onChange={(e) => patchEffects({ glassBorder: Number(e.target.value) })} />
                </label>
                <label>
                  Specular ({(theme.effects.glassSpecular ?? 0.28).toFixed(2)})
                  <input type="range" min={0} max={1} step={0.01} value={theme.effects.glassSpecular ?? 0.28} onChange={(e) => patchEffects({ glassSpecular: Number(e.target.value) })} />
                </label>
                <label>
                  Shadow ({(theme.effects.glassShadow ?? 0.4).toFixed(2)})
                  <input type="range" min={0} max={1} step={0.01} value={theme.effects.glassShadow ?? 0.4} onChange={(e) => patchEffects({ glassShadow: Number(e.target.value) })} />
                </label>
                <label>
                  Tint strength ({(theme.effects.glassTintStrength ?? 0.15).toFixed(2)})
                  <input type="range" min={0} max={1} step={0.01} value={theme.effects.glassTintStrength ?? 0.15} onChange={(e) => patchEffects({ glassTintStrength: Number(e.target.value) })} />
                </label>
                <label>
                  Tint color
                  <input type="color" value={theme.effects.glassTintColor ?? theme.accent} onChange={(e) => patchEffects({ glassTintColor: e.target.value })} />
                </label>
              </div>
            ) : null}
            {theme.effects?.particles ? (
              <div className="form-grid" style={{ marginTop: "0.35rem" }}>
                <label>
                  Particle density
                  <select className="sb-input" value={theme.effects.particleDensity ?? "medium"} onChange={(e) => patchEffects({ particleDensity: e.target.value as "low" | "medium" | "high" })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label>
                  Particle size ({(theme.effects.particleSize ?? 1).toFixed(2)}×)
                  <input type="range" min={0.5} max={2.5} step={0.05} value={theme.effects.particleSize ?? 1} onChange={(e) => patchEffects({ particleSize: Number(e.target.value) })} />
                </label>
                <label>
                  Particle speed ({(theme.effects.particleSpeed ?? 1).toFixed(2)}×)
                  <input type="range" min={0.25} max={2.5} step={0.05} value={theme.effects.particleSpeed ?? 1} onChange={(e) => patchEffects({ particleSpeed: Number(e.target.value) })} />
                </label>
                <label>
                  Particle opacity ({(theme.effects.particleOpacity ?? 0.75).toFixed(2)})
                  <input type="range" min={0.15} max={1} step={0.01} value={theme.effects.particleOpacity ?? 0.75} onChange={(e) => patchEffects({ particleOpacity: Number(e.target.value) })} />
                </label>
              </div>
            ) : null}
          </div>
        </VisualsSection>

        <VisualsSection icon={<Visuals3D />} title="Layout & positioning" subtitle="Sidebar, topbar and content">
          <div
            className="layout-preview"
            style={{
              display: "grid",
              gap: 8,
              gridTemplateColumns: (theme.layout?.sidebarPosition ?? "left") === "right" ? "1fr 72px" : (theme.layout?.sidebarPosition ?? "left") === "hidden" ? "1fr" : "72px 1fr",
              border: "1px solid var(--sb-outline-variant)",
              borderRadius: 16,
              padding: 10,
              background: "color-mix(in srgb, var(--sb-surface-container) 70%, transparent)",
              minHeight: 96,
            }}
          >
            {(theme.layout?.sidebarPosition ?? "left") !== "hidden" && (theme.layout?.sidebarPosition ?? "left") === "left" ? (
              <div style={{ borderRadius: 10, background: "var(--sb-secondary-container)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>SIDEBAR</div>
            ) : null}
            <div style={{ display: "grid", gap: 6 }}>
              <div
                style={{
                  height: (theme.layout?.topbarHeight ?? "comfortable") === "compact" ? 18 : (theme.layout?.topbarHeight ?? "comfortable") === "spacious" ? 28 : 22,
                  borderRadius: 999,
                  background: "var(--sb-surface-container-high)",
                  border: "1px solid var(--sb-outline-variant)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  opacity: 1,
                }}
              >
                TOPBAR {(theme.layout?.topbarPosition ?? "sticky").toUpperCase()}
              </div>
              <div
                style={{
                  flex: 1,
                  borderRadius: 10,
                  background: "color-mix(in srgb, var(--sb-primary) 10%, var(--sb-surface-container-high))",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "14px 0",
                  textAlign: "center",
                }}
              >
                CONTENT
                <br />
                <span style={{ fontWeight: 400, opacity: 0.7 }}>{theme.layout?.contentAlignment ?? "stretch"} · {theme.layout?.contentMaxWidth ?? 1280}px</span>
              </div>
            </div>
            {(theme.layout?.sidebarPosition ?? "left") === "right" ? (
              <div style={{ borderRadius: 10, background: "var(--sb-secondary-container)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>SIDEBAR</div>
            ) : null}
          </div>
          <div className="form-grid" style={{ marginTop: "1rem" }}>
            <label>
              Sidebar position
              <select className="sb-input" value={theme.layout?.sidebarPosition ?? "left"} onChange={(e) => patchLayout({ sidebarPosition: e.target.value as NonNullable<VisualTheme["layout"]>["sidebarPosition"] })}>
                <option value="left">Left</option>
                <option value="right">Right</option>
                <option value="hidden">Hidden</option>
              </select>
            </label>
            <label>
              Sidebar width ({theme.layout?.sidebarWidth ?? 272}px)
              <input type="range" min={200} max={360} step={4} value={theme.layout?.sidebarWidth ?? 272} onChange={(e) => patchLayout({ sidebarWidth: Number(e.target.value) })} />
            </label>
            <label>
              Topbar position
              <select className="sb-input" value={theme.layout?.topbarPosition ?? "sticky"} onChange={(e) => patchLayout({ topbarPosition: e.target.value as NonNullable<VisualTheme["layout"]>["topbarPosition"] })}>
                <option value="sticky">Sticky — content slides under search (gap fix)</option>
                <option value="floating">Floating — above content with shadow</option>
                <option value="static">Static — scrolls with page</option>
              </select>
            </label>
            <label>
              Topbar height
              <select className="sb-input" value={theme.layout?.topbarHeight ?? "comfortable"} onChange={(e) => patchLayout({ topbarHeight: e.target.value as NonNullable<VisualTheme["layout"]>["topbarHeight"] })}>
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
                <option value="spacious">Spacious</option>
              </select>
            </label>
            <label>
              Topbar blur ({theme.layout?.topbarBlur ?? 12}px)
              <input type="range" min={0} max={40} value={theme.layout?.topbarBlur ?? 12} onChange={(e) => patchLayout({ topbarBlur: Number(e.target.value) })} />
            </label>
            <label>
              Content alignment
              <select className="sb-input" value={theme.layout?.contentAlignment ?? "stretch"} onChange={(e) => patchLayout({ contentAlignment: e.target.value as NonNullable<VisualTheme["layout"]>["contentAlignment"] })}>
                <option value="stretch">Stretch — full width</option>
                <option value="center">Center — centered</option>
                <option value="left">Left — aligned left</option>
              </select>
            </label>
            <label>
              Content max width ({theme.layout?.contentMaxWidth ?? 1280}px)
              <input type="range" min={720} max={1800} step={10} value={theme.layout?.contentMaxWidth ?? 1280} onChange={(e) => patchLayout({ contentMaxWidth: Number(e.target.value) })} />
            </label>
            <label>
              Content padding ({theme.layout?.contentPadding ?? 22}px)
              <input type="range" min={8} max={48} step={1} value={theme.layout?.contentPadding ?? 22} onChange={(e) => patchLayout({ contentPadding: Number(e.target.value) })} />
            </label>
            <label>
              Card gap ({theme.layout?.cardGap ?? 16}px)
              <input type="range" min={8} max={32} step={1} value={theme.layout?.cardGap ?? 16} onChange={(e) => patchLayout({ cardGap: Number(e.target.value) })} />
            </label>
            <label>
              Card columns
              <select className="sb-input" value={theme.layout?.cardColumns ?? "auto"} onChange={(e) => patchLayout({ cardColumns: e.target.value as NonNullable<VisualTheme["layout"]>["cardColumns"] })}>
                <option value="auto">Auto</option>
                <option value="2">2 columns</option>
                <option value="3">3 columns</option>
                <option value="4">4 columns</option>
              </select>
            </label>
          </div>
        </VisualsSection>

        <VisualsSection icon={<Scroll3D />} title="Scroll & overscroll" subtitle="Gap fix and scroll animations">
          <p className="sb-muted" style={{ marginTop: "0.35rem" }}>Removes the gap when scrolling — content slides under search instead of into empty space. Tune scroll animations up/down.</p>
          <div className="notice" style={{ marginTop: "0.75rem", fontSize: "0.88rem" }}>Sticky topbar = page scrolls in a layer below search (like mobile apps). Floating — with shadow above content.</div>
          <div className="form-grid" style={{ marginTop: "1rem" }}>
            <label>
              Overscroll behavior
              <select className="sb-input" value={theme.scroll?.overscrollBehavior ?? "contain"} onChange={(e) => patchScroll({ overscrollBehavior: e.target.value as NonNullable<VisualTheme["scroll"]>["overscrollBehavior"] })}>
                <option value="contain">Contain — no gap (recommended)</option>
                <option value="none">None — hard stop, no bounce</option>
                <option value="auto">Auto — system bounce</option>
              </select>
            </label>
            <label>
              Scroll behavior
              <select className="sb-input" value={theme.scroll?.scrollBehavior ?? "smooth"} onChange={(e) => patchScroll({ scrollBehavior: e.target.value as NonNullable<VisualTheme["scroll"]>["scrollBehavior"] })}>
                <option value="smooth">Smooth</option>
                <option value="auto">Auto (instant)</option>
              </select>
            </label>
            <label>
              Scrollbar style
              <select className="sb-input" value={theme.scroll?.scrollbarStyle ?? "thin"} onChange={(e) => patchScroll({ scrollbarStyle: e.target.value as NonNullable<VisualTheme["scroll"]>["scrollbarStyle"] })}>
                <option value="thin">Thin</option>
                <option value="overlay">Overlay — accent on hover</option>
                <option value="hidden">Hidden</option>
              </select>
            </label>
            <label>
              Scroll animation
              <select className="sb-input" value={theme.scroll?.scrollAnimation ?? "fade"} onChange={(e) => patchScroll({ scrollAnimation: e.target.value as NonNullable<VisualTheme["scroll"]>["scrollAnimation"] })}>
                <option value="fade">Fade</option>
                <option value="slide">Slide + scale</option>
                <option value="scale">Scale</option>
                <option value="parallax">Parallax</option>
                <option value="none">None</option>
              </select>
            </label>
            <label>
              Duration ({theme.scroll?.scrollAnimationDuration ?? 360}ms)
              <input type="range" min={120} max={900} step={10} value={theme.scroll?.scrollAnimationDuration ?? 360} onChange={(e) => patchScroll({ scrollAnimationDuration: Number(e.target.value) })} />
            </label>
            <label>
              Easing
              <select className="sb-input" value={theme.scroll?.scrollAnimationEasing ?? "easeOut"} onChange={(e) => patchScroll({ scrollAnimationEasing: e.target.value as NonNullable<VisualTheme["scroll"]>["scrollAnimationEasing"] })}>
                <option value="linear">Linear</option>
                <option value="ease">Ease</option>
                <option value="easeIn">EaseIn</option>
                <option value="easeOut">EaseOut</option>
                <option value="easeInOut">EaseInOut</option>
                <option value="spring">Spring</option>
              </select>
            </label>
            <label>
              Stagger ({theme.scroll?.scrollStagger ?? 40}ms)
              <input type="range" min={0} max={120} step={5} value={theme.scroll?.scrollStagger ?? 40} onChange={(e) => patchScroll({ scrollStagger: Number(e.target.value) })} />
            </label>
            <label>
              Parallax intensity ({((theme.scroll?.parallaxIntensity ?? 0.5) * 100).toFixed(0)}%)
              <input type="range" min={0} max={1} step={0.05} value={theme.scroll?.parallaxIntensity ?? 0.5} onChange={(e) => patchScroll({ parallaxIntensity: Number(e.target.value) })} />
            </label>
            <label className="check-row">
              <input type="checkbox" checked={theme.scroll?.revealOnScroll ?? true} onChange={(e) => patchScroll({ revealOnScroll: e.target.checked })} />
              <span>Reveal on scroll — cards appear while scrolling</span>
            </label>
            <label className="check-row">
              <input type="checkbox" checked={theme.scroll?.enableScrollProgress ?? false} onChange={(e) => patchScroll({ enableScrollProgress: e.target.checked })} />
              <span>Show scroll progress bar</span>
            </label>
            <label className="check-row">
              <input type="checkbox" checked={theme.scroll?.hideTopbarOnScroll ?? false} onChange={(e) => patchScroll({ hideTopbarOnScroll: e.target.checked })} />
              <span>Auto-hide topbar on scroll down</span>
            </label>
          </div>
        </VisualsSection>

        <VisualsSection icon={<Visuals3D />} title="Colors & layout" subtitle="Palette, density and shapes">
          <div className="form-grid" style={{ marginTop: "0.5rem" }}>
            <label>
              Preset name
              <input className="sb-input" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
            </label>
            <label>
              Accent
              <input type="color" value={theme.accent} onChange={(e) => patch({ accent: e.target.value })} />
            </label>
            <label>
              Accent secondary
              <input type="color" value={theme.accentSecondary} onChange={(e) => patch({ accentSecondary: e.target.value })} />
            </label>
            <label>
              Background
              <input type="color" value={theme.background} onChange={(e) => patch({ background: e.target.value })} />
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
              <input type="range" min={0} max={100} value={theme.blur} onChange={(e) => patch({ blur: Number(e.target.value) })} />
            </label>
            <label>
              Panel opacity ({theme.opacity.toFixed(2)})
              <input type="range" min={0.05} max={1} step={0.01} value={theme.opacity} onChange={(e) => patch({ opacity: Number(e.target.value) })} />
            </label>
            <label>
              Window corner radius ({theme.cornerRadius}px)
              <input type="range" min={0} max={48} value={theme.cornerRadius} onChange={(e) => patch({ cornerRadius: Number(e.target.value) })} />
            </label>
            <label>
              Font
              <select className="sb-input" value={theme.fontId ?? "figtree"} onChange={(e) => patch({ fontId: e.target.value })}>
                {FONT_OPTIONS.map((font) => (
                  <option key={font.id} value={font.id} style={{ fontFamily: font.stack }}>
                    {font.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Density
              <select className="sb-input" value={theme.density} onChange={(e) => patch({ density: e.target.value as VisualTheme["density"] })}>
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
                <option value="spacious">Spacious</option>
              </select>
            </label>
            <label>
              Sidebar style
              <select className="sb-input" value={theme.sidebarStyle} onChange={(e) => patch({ sidebarStyle: e.target.value as VisualTheme["sidebarStyle"] })}>
                <option value="solid">Solid</option>
                <option value="glass">Glass</option>
                <option value="minimal">Minimal</option>
              </select>
            </label>
            <label>
              Button style
              <select className="sb-input" value={theme.buttonStyle ?? "gradient"} onChange={(e) => patch({ buttonStyle: e.target.value as VisualTheme["buttonStyle"] })}>
                <option value="gradient">Gradient</option>
                <option value="solid">Solid</option>
                <option value="tonal">Tonal</option>
              </select>
            </label>
            <label>
              Card style
              <select className="sb-input" value={theme.cardStyle ?? "glass"} onChange={(e) => patch({ cardStyle: e.target.value as VisualTheme["cardStyle"] })}>
                <option value="glass">Glass</option>
                <option value="solid">Solid</option>
                <option value="outline">Outline</option>
              </select>
            </label>
          </div>
        </VisualsSection>

        <VisualsSection icon={<Motion3D />} title="Motion" subtitle="Animations and export">
          <p className="sb-muted" style={{ marginTop: "0.35rem" }}>Material You 3 motion — enter uses decelerate, exit uses accelerate, and on-screen changes use emphasized easing with short/medium/long duration tokens.</p>
          <div className="form-grid" style={{ marginTop: "1rem" }}>
            <label className="check-row">
              <input type="checkbox" checked={theme.animations} onChange={(e) => patch({ animations: e.target.checked })} />
              <span>Enable animations</span>
            </label>
            <label className="check-row">
              <input type="checkbox" checked={theme.reducedMotion} onChange={(e) => patch({ reducedMotion: e.target.checked })} />
              <span>Reduced motion</span>
            </label>
            <label>
              Motion intensity
              <select className="sb-input" value={theme.motionIntensity ?? "medium"} onChange={(e) => patch({ motionIntensity: e.target.value as VisualTheme["motionIntensity"] })}>
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
              background: theme.backgroundMode === "solid" ? theme.surface : `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo}), ${theme.surface}`,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          >
            <strong style={{ color: theme.accent }}>{theme.name || "Custom Visual"}</strong>
            <p style={{ color: theme.textMuted }}>Cards, buttons, and sidebar update instantly as you tweak values.</p>
            <button className="sb-button">Sample action</button>
          </div>
          <h3 style={{ marginTop: "1.5rem" }}>Export / Import</h3>
          <textarea className="sb-input" style={{ minHeight: 160, marginTop: "0.75rem", fontFamily: "ui-monospace, monospace" }} value={exportJson} readOnly />
          <textarea className="sb-input" style={{ minHeight: 120, marginTop: "0.75rem", fontFamily: "ui-monospace, monospace" }} placeholder="Paste theme JSON to import…" value={importText} onChange={(e) => setImportText(e.target.value)} />
          <Button variant="secondary" style={{ marginTop: "0.75rem" }} onClick={importTheme}>Import JSON</Button>
        </VisualsSection>
      </div>
    </div>
  );
}
