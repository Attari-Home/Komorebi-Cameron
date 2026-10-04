/**
 * Liquid theme transition engine.
 *
 * Whenever the theme (dark/light) or the petal palette changes, a band of
 * "liquid" sweeps diagonally across the viewport. The band is wider than the
 * screen, so there is a moment when the whole viewport is covered; the CSS
 * theme variables swap at exactly that moment, beneath the liquid, and the
 * trailing edge then reveals the new look. The page never flashes.
 *
 * Rendering: a single fixed 2D canvas (owned by `LiquidThemeTransition.tsx`)
 * drawn with one filled path plus a few strokes per frame. No layout, no
 * paint of the page itself, just compositor-friendly canvas work, so it holds
 * the display refresh rate (60 to 120 FPS) and never touches the DOM tree.
 *
 * Fallbacks: with `prefers-reduced-motion`, a hidden tab, or no registered
 * canvas, the change is applied instantly through the regular code paths.
 *
 * Callers use `transitionTheme`, `toggleThemeLiquid` and `transitionPalette`
 * instead of `setTheme` / `setPetalPalette` for user-initiated changes.
 */

import type { PetalPaletteId } from '../data/petalPalettes';
import {
  getCurrentPaletteId,
  isPaletteId,
  resolvePetalColors,
  setPetalPalette,
} from './petalPalette';
import { getCurrentTheme, setTheme, type Theme } from './theme';

/* -------------------------------------------------------------------------- */
/* Types and shared state                                                      */
/* -------------------------------------------------------------------------- */

export interface ThemeTarget {
  theme: Theme;
  palette: PetalPaletteId;
}

type Rgb = readonly [number, number, number];

interface PlayOptions {
  /** Colours of the liquid, resolved for the destination look. */
  bg: Rgb;
  accentA: Rgb;
  accentB: Rgb;
  /** Called once, while the viewport is fully covered. */
  onCovered: () => void;
  /** Called once, when the animation has finished (or was aborted). */
  onDone: () => void;
}

interface Renderer {
  play(options: PlayOptions): void;
}

interface Session {
  renderer: Renderer | null;
  /** The look the running transition is heading to (null when idle). */
  active: { target: ThemeTarget; swapped: boolean } | null;
  /** A request received after the swap, to run when the current wave ends. */
  pending: Partial<ThemeTarget> | null;
}

/** Pinned to globalThis so separately bundled islands share one session. */
const GLOBAL_KEY = Symbol.for('komorebi.liquidTransition');
type GlobalWithSession = typeof globalThis & { [GLOBAL_KEY]?: Session };

function getSession(): Session {
  const g = globalThis as GlobalWithSession;
  return (g[GLOBAL_KEY] ??= { renderer: null, active: null, pending: null });
}

const BG_RGB: Record<Theme, Rgb> = {
  dark: [10, 10, 12], // --bg in the dark theme
  light: [250, 247, 248], // --bg in the light theme
};

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** The look the UI is on, or is currently being swept to. */
function effectiveTarget(): ThemeTarget {
  const session = getSession();
  const base: ThemeTarget = session.active
    ? { ...session.active.target }
    : { theme: getCurrentTheme(), palette: getCurrentPaletteId() };
  return { ...base, ...(session.pending ?? {}) };
}

/** Apply a look immediately, with no wave. Only changes what differs. */
function applyNow(target: ThemeTarget, viaWave: boolean): void {
  if (getCurrentTheme() !== target.theme) {
    // Under the wave the colour handoff is hidden, so skip the CSS fade.
    setTheme(target.theme, { animate: !viaWave });
  }
  if (getCurrentPaletteId() !== target.palette) {
    setPetalPalette(target.palette);
  }
}

function request(change: Partial<ThemeTarget>): void {
  if (typeof window === 'undefined') return;

  const session = getSession();
  const next: ThemeTarget = { ...effectiveTarget(), ...change };

  // A wave is mid-flight.
  if (session.active) {
    if (!session.active.swapped) {
      // Not swapped yet: simply retarget the wave that is already running.
      session.active.target = next;
    } else {
      session.pending = { ...(session.pending ?? {}), ...change };
    }
    return;
  }

  const current: ThemeTarget = { theme: getCurrentTheme(), palette: getCurrentPaletteId() };
  if (next.theme === current.theme && next.palette === current.palette) return;

  const renderer = session.renderer;
  if (!renderer || prefersReducedMotion() || document.hidden) {
    applyNow(next, false);
    return;
  }

  session.active = { target: next, swapped: false };
  const active = session.active;
  const colors = resolvePetalColors(next.palette, next.theme);

  renderer.play({
    bg: BG_RGB[next.theme],
    accentA: hexToRgb(colors.petalA),
    accentB: hexToRgb(colors.petalB),
    onCovered: () => {
      active.swapped = true;
      applyNow(active.target, true);
    },
    onDone: () => {
      // Safety net: if the animation was aborted before covering, still apply.
      if (!active.swapped) applyNow(active.target, true);
      session.active = null;
      const queued = session.pending;
      session.pending = null;
      if (queued) request(queued);
    },
  });
}

/** Sweep to a specific theme. */
export function transitionTheme(theme: Theme): void {
  request({ theme });
}

/** Sweep to the opposite theme (relative to where the UI is heading). */
export function toggleThemeLiquid(): Theme {
  const next: Theme = effectiveTarget().theme === 'dark' ? 'light' : 'dark';
  request({ theme: next });
  return next;
}

/** Sweep to a specific petal palette. */
export function transitionPalette(palette: PetalPaletteId): void {
  if (!isPaletteId(palette)) return;
  request({ palette });
}

/** Called by `LiquidThemeTransition.tsx`. Returns an unregister function. */
export function registerLiquidCanvas(canvas: HTMLCanvasElement): () => void {
  const session = getSession();
  const renderer = createRenderer(canvas);
  session.renderer = renderer;
  return () => {
    if (session.renderer === renderer) session.renderer = null;
    renderer.dispose();
  };
}

/* -------------------------------------------------------------------------- */
/* Renderer                                                                    */
/* -------------------------------------------------------------------------- */

const DURATION_MS = 1500;
/** Wave samples along the edge. Plenty for a smooth curve, trivially cheap. */
const SAMPLES = 72;
const MAX_DPR = 1.75;

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgba = (c: Rgb, a: number): string => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/** Smooth in/out with a slightly fast middle, so the covered moment is brief. */
const easeInOut = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * t);

interface Renderer2D extends Renderer {
  dispose(): void;
}

function createRenderer(canvas: HTMLCanvasElement): Renderer2D {
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });

  let rafId = 0;
  let fallbackTimer = 0;
  let finish: (() => void) | null = null;

  const ys = new Float32Array(SAMPLES + 1);
  const lead = new Float32Array(SAMPLES + 1);
  const trail = new Float32Array(SAMPLES + 1);

  const stop = () => {
    cancelAnimationFrame(rafId);
    window.clearTimeout(fallbackTimer);
    rafId = 0;
    fallbackTimer = 0;
    canvas.style.display = 'none';
  };

  const play = (options: PlayOptions) => {
    // No 2D context (very old browser): behave like reduced motion.
    if (!ctx) {
      options.onCovered();
      options.onDone();
      return;
    }

    let w = 0;
    let h = 0;
    let dpr = 1;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
    };

    resize();
    canvas.style.display = 'block';

    let covered = false;
    let done = false;

    const complete = () => {
      if (done) return;
      done = true;
      stop();
      finish = null;
      options.onDone();
    };
    finish = complete;

    const cover = () => {
      if (covered) return;
      covered = true;
      options.onCovered();
    };

    const start = performance.now();

    const frame = (now: number) => {
      if (done) return;

      if (window.innerWidth !== w || window.innerHeight !== h) resize();

      const elapsed = now - start;
      const p = Math.min(elapsed / DURATION_MS, 1);

      // --- Geometry, in a frame rotated onto the screen diagonal -------------
      const theta = Math.atan2(h, w);
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const hx = (w * cos + h * sin) / 2; // half-extent along the sweep
      const hy = (w * sin + h * cos) / 2; // half-extent across the sweep

      const amp = Math.min(Math.max(Math.min(w, h) * 0.07, 26), 84);
      const curve = hx * 0.1; // the front bows forward in the middle
      const slack = hx * 0.16; // guaranteed fully-covered window
      const band = 2 * hx + 2 * amp + curve + slack;

      const startL = -hx - amp;
      const endL = hx + band + amp + curve;
      const L = startL + (endL - startL) * easeInOut(p);
      const T = L - band;

      // Fully covered: the front is past the far edge and the tail not yet in.
      if (!covered && L >= hx + amp + curve + slack * 0.25) cover();

      // --- Edge curves ---------------------------------------------------------
      const phase = elapsed * 0.0042;
      const k1 = (Math.PI * 2) / (hy * 0.95);
      const k2 = (Math.PI * 2) / (hy * 0.5);
      const k3 = (Math.PI * 2) / (hy * 0.24);

      for (let i = 0; i <= SAMPLES; i++) {
        const y = -hy - 40 + ((2 * hy + 80) * i) / SAMPLES;
        ys[i] = y;
        const bow = curve * (y / hy) * (y / hy);
        const front =
          0.55 * Math.sin(y * k1 + phase) +
          0.3 * Math.sin(y * k2 - phase * 1.37 + 1.3) +
          0.15 * Math.sin(y * k3 + phase * 2.1 + 2.4);
        const tail =
          0.55 * Math.sin(y * k1 - phase * 0.8 + 2.2) +
          0.3 * Math.sin(y * k2 + phase * 1.1 + 0.4) +
          0.15 * Math.sin(y * k3 - phase * 1.9 + 3.1);
        lead[i] = L + amp * front - bow;
        trail[i] = T + amp * tail - bow;
      }

      // --- Draw --------------------------------------------------------------
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(theta);

      const path = (xs: Float32Array, offset: number) => {
        ctx.moveTo(xs[0] + offset, ys[0]);
        for (let i = 1; i <= SAMPLES; i++) ctx.lineTo(xs[i] + offset, ys[i]);
      };

      // Liquid body: opaque destination background with glowing meniscus edges.
      const gx0 = T - amp - curve;
      const gx1 = L + amp;
      const grad = ctx.createLinearGradient(gx0, 0, gx1, 0);
      const tint = mix(options.bg, options.accentA, 0.34);
      const glowEdge = mix(options.bg, options.accentB, 0.55);
      grad.addColorStop(0, rgba(options.accentA, 0.95));
      grad.addColorStop(0.04, rgba(tint, 1));
      grad.addColorStop(0.16, rgba(options.bg, 1));
      grad.addColorStop(0.86, rgba(options.bg, 1));
      grad.addColorStop(0.965, rgba(glowEdge, 1));
      grad.addColorStop(1, rgba(options.accentB, 1));

      ctx.beginPath();
      path(lead, 0);
      for (let i = SAMPLES; i >= 0; i--) ctx.lineTo(trail[i], ys[i]);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Ripples travelling ahead of the front and behind the tail.
      ctx.lineJoin = 'round';
      for (let r = 1; r <= 3; r++) {
        const ahead = r * (amp * 0.62);
        ctx.beginPath();
        path(lead, ahead);
        ctx.strokeStyle = rgba(options.accentA, 0.34 / r);
        ctx.lineWidth = Math.max(1, 3.4 - r * 0.8);
        ctx.stroke();

        ctx.beginPath();
        path(trail, -ahead);
        ctx.strokeStyle = rgba(options.accentA, 0.24 / r);
        ctx.lineWidth = Math.max(1, 3 - r * 0.7);
        ctx.stroke();
      }

      // Meniscus: soft accent band, then a thin bright foam line.
      ctx.beginPath();
      path(lead, 0);
      ctx.strokeStyle = rgba(options.accentA, 0.42);
      ctx.lineWidth = 14;
      ctx.stroke();

      ctx.beginPath();
      path(lead, 0);
      ctx.strokeStyle = rgba(mix(options.accentB, [255, 255, 255], 0.55), 0.85);
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.beginPath();
      path(trail, 0);
      ctx.strokeStyle = rgba(options.accentB, 0.55);
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();

      if (p >= 1) {
        cover(); // never leave without swapping
        complete();
        return;
      }
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);

    // If rAF is throttled or stalls (background tab, heavy hitch), never leave
    // the visitor stuck behind a curtain or on the wrong theme.
    fallbackTimer = window.setTimeout(() => {
      cover();
      complete();
    }, DURATION_MS + 600);
  };

  return {
    play,
    dispose() {
      // Settle any run in flight (applies the pending look, then hides).
      finish?.();
      stop();
    },
  };
}
