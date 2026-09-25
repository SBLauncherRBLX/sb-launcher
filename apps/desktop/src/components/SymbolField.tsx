import { useEffect, useRef } from "react";
import { useSpring } from "motion/react";
import type { VisualTheme } from "@sb/contracts";
import { useMotionEnabled } from "../lib/motion";

type Cell = { x: number; y: number; angle: number; phase: number; cross: boolean; color: 0 | 1 | 2 };
const SPACING = { low: 36, medium: 27, high: 20 } as const;
const MAX_CELLS = 2600;

export function createSymbolCells(width: number, height: number, density: keyof typeof SPACING): Cell[] {
  if (width <= 0 || height <= 0) return [];
  const spacing = Math.max(SPACING[density], Math.sqrt((width * height) / MAX_CELLS));
  const cells: Cell[] = [];
  for (let y = spacing * .5; y < height; y += spacing) {
    for (let x = spacing * .5; x < width; x += spacing) {
      const wave = Math.sin(x * .006 + y * .003) * .8 + Math.cos(y * .007 - x * .002) * .65;
      const phase = Math.sin(x * .019 + y * .016) + Math.cos(y * .013 - x * .008);
      cells.push({ x, y, angle: wave, phase: x * .011 + y * .009, cross: phase > 1.05, color: x > width * .68 ? 1 : phase < -.55 ? 2 : 0 });
    }
  }
  return cells;
}

export function SymbolField({ theme, preview = false }: { theme: VisualTheme; preview?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerX = useSpring(-1000, { stiffness: 240, damping: 32, mass: .7 });
  const pointerY = useSpring(-1000, { stiffness: 240, damping: 32, mass: .7 });
  const energy = useSpring(0, { stiffness: 180, damping: 25, mass: .8 });
  const motionEnabled = useMotionEnabled(theme);
  const density = theme.effects?.symbolDensity ?? "medium";
  const strength = theme.effects?.symbolStrength ?? 1;
  const radius = theme.effects?.symbolRadius ?? 160;
  const opacity = theme.effects?.symbolOpacity ?? .38;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !ctx) return;
    let width = 0, height = 0, pixelRatio = 1;
    let cells: Cell[] = [];
    let raf = 0, settleTimer = 0;
    let inView = !preview;
    let active = false;
    let previous: { x: number; y: number; at: number } | null = null;

    function draw(now: number) {
      if (!ctx) return;
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const x = pointerX.get(), y = pointerY.get(), speed = energy.get();
      const range = radius * (1 + speed * .5);
      const rangeSquared = range * range;
      const time = now * .001;
      const paths: [Path2D, Path2D, Path2D] = [new Path2D(), new Path2D(), new Path2D()];
      const highlight = new Path2D();
      const spacing = Math.max(SPACING[density], Math.sqrt((width * height) / MAX_CELLS));
      const length = Math.min(11, spacing * .34);
      for (const cell of cells) {
        const wave = cell.phase - time * .9;
        const idleAngle = motionEnabled
          ? cell.angle + Math.sin(wave) * .38 + Math.sin(cell.phase * .68 + time * .4) * .12
          : cell.angle;
        const idleLength = motionEnabled ? 1 + Math.sin(wave - .8) * .14 : 1;
        const dx = cell.x - x, dy = cell.y - y;
        const distanceSquared = dx * dx + dy * dy;
        const influence = active && motionEnabled && distanceSquared < rangeSquared
          ? (1 - Math.sqrt(distanceSquared) / range) ** 2
          : 0;
        const response = influence * strength * (.42 + speed * 1.4);
        const tangent = influence ? Math.atan2(dy, dx) + Math.PI / 2 : 0;
        const angle = idleAngle + (influence ? Math.sin(tangent - idleAngle) * response : 0);
        const shift = influence * speed * strength * 14;
        const cx = cell.x + Math.cos(tangent) * shift;
        const cy = cell.y + Math.sin(tangent) * shift;
        const half = length * idleLength * (.5 + influence * speed * .25);
        const vx = Math.cos(angle) * half, vy = Math.sin(angle) * half;
        const path = paths[cell.color];
        path.moveTo(cx - vx, cy - vy);
        path.lineTo(cx + vx, cy + vy);
        if (cell.cross) {
          path.moveTo(cx + vy * .55, cy - vx * .55);
          path.lineTo(cx - vy * .55, cy + vx * .55);
        }
        if (influence > .08) {
          highlight.moveTo(cx - vx, cy - vy);
          highlight.lineTo(cx + vx, cy + vy);
        }
      }
      ctx.lineCap = "round";
      ctx.lineWidth = 1.35;
      ctx.globalAlpha = opacity;
      [theme.accent, theme.accentSecondary, theme.text].forEach((color, index) => {
        ctx.strokeStyle = color;
        ctx.stroke(paths[index]!);
      });
      if (active && motionEnabled) {
        ctx.globalAlpha = Math.min(.6, opacity * (.48 + speed * .32));
        ctx.lineWidth = 2;
        ctx.strokeStyle = theme.accent;
        ctx.stroke(highlight);
      }
      ctx.globalAlpha = 1;
    }

    function frame(now: number) {
      raf = 0;
      draw(now);
      if (motionEnabled && !document.hidden && inView) {
        raf = requestAnimationFrame(frame);
      }
    }
    function schedule() {
      if (!raf && !document.hidden && inView) raf = requestAnimationFrame(frame);
    }
    function resize() {
      const bounds = canvas!.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas!.width = Math.round(width * pixelRatio);
      canvas!.height = Math.round(height * pixelRatio);
      cells = createSymbolCells(width, height, density);
      schedule();
    }
    function move(event: PointerEvent) {
      if (event.pointerType === "touch") return;
      const bounds = canvas!.getBoundingClientRect();
      const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
      if (preview && (x < 0 || y < 0 || x > width || y > height)) return;
      const now = performance.now();
      if (!active) { pointerX.jump(x); pointerY.jump(y); active = true; }
      else { pointerX.set(x); pointerY.set(y); }
      if (previous) {
        const dt = Math.max(16, now - previous.at);
        const velocity = Math.hypot(x - previous.x, y - previous.y) / dt * 1000;
        energy.set(Math.min(1, velocity / 1250));
      }
      previous = { x, y, at: now };
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => { energy.set(0); schedule(); }, 80);
      schedule();
    }
    function leave() {
      active = false;
      previous = null;
      energy.jump(0);
      window.clearTimeout(settleTimer);
      schedule();
    }
    function visibility() {
      if (document.hidden) { window.cancelAnimationFrame(raf); raf = 0; }
      else schedule();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const visibilityObserver = preview ? new IntersectionObserver(entries => {
      inView = entries[0]?.isIntersecting ?? false;
      if (inView) schedule();
      else { window.cancelAnimationFrame(raf); raf = 0; }
    }) : null;
    visibilityObserver?.observe(canvas);
    resize();
    const target: Window | HTMLCanvasElement = preview ? canvas : window;
    if (motionEnabled) target.addEventListener("pointermove", move as EventListener, { passive: true });
    if (preview) canvas.addEventListener("pointerleave", leave);
    else window.addEventListener("blur", leave);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      visibilityObserver?.disconnect();
      target.removeEventListener("pointermove", move as EventListener);
      if (preview) canvas.removeEventListener("pointerleave", leave);
      else window.removeEventListener("blur", leave);
      document.removeEventListener("visibilitychange", visibility);
      window.clearTimeout(settleTimer);
      window.cancelAnimationFrame(raf);
    };
  }, [density, energy, motionEnabled, opacity, pointerX, pointerY, preview, radius, strength, theme.accent, theme.accentSecondary, theme.text]);

  return <canvas ref={canvasRef} className={`symbol-field${preview ? " is-preview" : ""}`} aria-hidden="true" />;
}
