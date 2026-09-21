import { useLayoutEffect } from "react";
import { useAppStore } from "../store";
import { useLiquid } from "../lib/liquid";

/** Base materials and range fill stay active independently of the optional glass renderer. */
export function MaterialAppearance() {
  const glass = useAppStore(s => Boolean(s.theme.effects?.glass));
  const liquid = useLiquid(s => s.settings.enabled);
  const liquidControls = useLiquid(s => s.settings.controls);
  const frostedLiquid = useLiquid(s => s.settings.frostedLiquidControls);
  useLayoutEffect(() => {
    document.documentElement.dataset.material = !glass && !liquid ? "on" : "off";
    document.documentElement.dataset.materialControls = (liquid ? !liquidControls : !(glass && frostedLiquid)) ? "on" : "off";
    document.documentElement.dataset.materialButtons = !liquid && !(glass && frostedLiquid) ? "on" : "off";
    return () => { delete document.documentElement.dataset.material; };
  }, [glass, liquid, liquidControls, frostedLiquid]);
  useLayoutEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const update = (el: HTMLInputElement) => {
      const min = Number(el.min || 0), max = Number(el.max || 100);
      const progress = max > min ? Math.max(0, Math.min(100, 100 * (Number(el.value) - min) / (max - min))) : 0;
      const next = `${progress}%`;
      if (el.style.getPropertyValue("--m3-progress") !== next) el.style.setProperty("--m3-progress", next);
    };
    const scan = () => root.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(update);
    const onInput = (e: Event) => { if (e.target instanceof HTMLInputElement && e.target.type === "range") update(e.target); };
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; scan(); });
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["value", "min", "max"] });
    root.addEventListener("input", onInput);
    scan();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); root.removeEventListener("input", onInput); };
  }, []);
  return null;
}
