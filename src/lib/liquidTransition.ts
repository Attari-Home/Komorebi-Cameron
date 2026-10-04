/**
 * Liquid theme transition: a waterfall that rewrites the page as it falls.
 *
 * Whenever the theme (dark/light) or the petal palette changes, one sheet of
 * water pours down the viewport in a single continuous motion: a wavy front
 * with long drips running ahead of it, glossy flow streaks, foam and spray.
 *
 * How the theme changes "as it flows" (the best path, used wherever the View
 * Transitions API exists):
 *   1. The browser snapshots the page in its OLD theme.
 *   2. The new theme is applied underneath (the snapshot hides the swap).
 *   3. The NEW page is revealed through a clip-path whose bottom edge is the
 *      falling water front, so everything above the front is already in the
 *      new theme while everything below is still the old one. A canvas draws
 *      the water itself on top of that boundary.
 *
 * Fallback (no View Transitions): an opaque curtain of water falls over the
 * whole screen, the theme swaps while it is fully covered, and the curtain
 * keeps falling away. Same shape, same single motion.
 *
 * Both paths are compositor-friendly (one canvas, a clip-path, no layout), so
 * they hold the display refresh rate. With `prefers-reduced-motion`, a hidden
 * tab or no registered canvas, the change is simply applied instantly.
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
  /** Colours of the water, resolved for the destination look. */
  bg: Rgb;
  accentA: Rgb;
  accentB: Rgb;
  /** Applies the new look. Called exactly once, at the right moment. */
  apply: () => void;
  /** Called once, when the animation has finished (or was aborted). */
  onDone: () => void;
}

interface Renderer {
  play(options: PlayOptions): void;
  dispose(): void;
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
    // Under the water the colour handoff is hidden, so skip the CSS fade.
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
    apply: () => {
      if (active.swapped) return;
      active.swapped = true;
      applyNow(active.target, true);
    },
    onDone: () => {
      // Safety net: if the animation was aborted before swapping, still apply.
      if (!active.swapped) {
        active.swapped = true;
        applyNow(active.target, true);
      }
      session.active = null;
      const queued = session.pending;
      session.pending = null;
      if (queued) request(queued);
    },
  });
}

/** Pour to a specific theme. */
export function transitionTheme(theme: Theme): void {
  request({ theme });
}

/** Pour to the opposite theme (relative to where the UI is heading). */
export function toggleThemeLiquid(): Theme {
  const next: Theme = effectiveTarget().theme === 'dark' ? 'light' : 'dark';
  request({ theme: next });
  return next;
}

/** Pour to a specific petal palette. */
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
/* Colour helpers                                                              */
/* -------------------------------------------------------------------------- */

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

const luminance = (c: Rgb): number => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

/* -------------------------------------------------------------------------- */
/* Water geometry                                                              */
/* -------------------------------------------------------------------------- */

const REVEAL_MS = 1800;
const COVER_MS = 2000;
/** Horizontal sampling step of the front, in CSS px. */
const STEP = 6;
const MAX_DPR = 1.75;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number): number => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/**
 * Falling-water easing: it starts gently, gathers speed, and ends fast, so the
 * sheet feels like it is pulled down by gravity rather than slid by a tween.
 */
const fall = (p: number): number => 0.5 * smooth(p) + 0.5 * p * p;

interface Drip {
  /** Horizontal centre as a fraction of the viewport width. */
  xf: number;
  /** Half-width in px. */
  half: number;
  /** Length as a fraction of the viewport height. */
  len: number;
  /** When it starts to stretch, as a fraction of the run. */
  delay: number;
}

function makeDrips(w: number): Drip[] {
  const count = Math.max(6, Math.round(w / 90));
  const drips: Drip[] = [];
  for (let i = 0; i < count; i++) {
    const cell = (i + Math.random() * 0.8 + 0.1) / count;
    drips.push({
      xf: cell,
      half: 20 + Math.random() * 44,
      len: 0.05 + Math.pow(Math.random(), 1.5) * 0.22,
      delay: Math.random() * 0.22,
    });
  }
  return drips;
}

interface Geometry {
  w: number;
  h: number;
  amp: number;
  maxDrip: number;
  /** Number of samples across the width (inclusive of both ends). */
  n: number;
  xs: Float32Array;
  /** Water front (the leading, lower edge), y per sample. */
  lead: Float32Array;
  /** Trailing (upper) edge, only used by the cover fallback. */
  trail: Float32Array;
}

function makeGeometry(w: number, h: number): Geometry {
  const n = Math.max(2, Math.ceil(w / STEP) + 1);
  return {
    w,
    h,
    amp: Math.min(Math.max(h * 0.035, 14), 38),
    maxDrip: h * 0.28,
    n,
    xs: new Float32Array(n),
    lead: new Float32Array(n),
    trail: new Float32Array(n),
  };
}

/**
 * Fill `out` with the y of an edge at vertical position `Y`.
 * `dripScale` shrinks the drips (the trailing edge is calmer than the front).
 */
function shapeEdge(
  g: Geometry,
  out: Float32Array,
  Y: number,
  p: number,
  phase: number,
  drips: readonly Drip[],
  dripScale: number,
  phaseOffset: number,
): void {
  const { w, h, amp, n, xs } = g;
  const k1 = (Math.PI * 2) / (w * 0.42);
  const k2 = (Math.PI * 2) / (w * 0.19);
  const k3 = (Math.PI * 2) / (w * 0.083);

  for (let i = 0; i < n; i++) {
    const x = Math.min(w, i * STEP);
    xs[i] = x;
    const ph = phase + phaseOffset;
    let y =
      Y +
      amp *
        (0.5 * Math.sin(x * k1 + ph) +
          0.3 * Math.sin(x * k2 - ph * 1.4 + 1.1) +
          0.2 * Math.sin(x * k3 + ph * 2.3 + 2.3));

    let drip = 0;
    for (let d = 0; d < drips.length; d++) {
      const dr = drips[d]!;
      const u = Math.abs(x - dr.xf * w) / dr.half;
      if (u >= 1) continue;
      const grow = smooth((p - dr.delay) / 0.38);
      const profile = Math.pow(1 - u * u, 1.15);
      const len = dr.len * h * dripScale * grow * profile;
      if (len > drip) drip = len;
    }
    out[i] = y + drip;
  }
}

/* -------------------------------------------------------------------------- */
/* Renderer                                                                    */
/* -------------------------------------------------------------------------- */

interface ViewTransitionLike {
  ready: Promise<void>;
  finished: Promise<void>;
  skipTransition(): void;
}

type DocWithVT = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransitionLike;
};

const WAVE_CLASS = 'kc-wave';
const CLIP_STYLE_ID = 'kc-wave-clip';
const VT_NAME = 'kc-water';

function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext('2d', { alpha: true });

  let running = false;
  let abort: (() => void) | null = null;

  const play = (options: PlayOptions) => {
    if (!ctx || running) {
      options.apply();
      options.onDone();
      return;
    }
    running = true;

    const doc = document as DocWithVT;
    const root = document.documentElement;
    const canUseVT = typeof doc.startViewTransition === 'function';
    const mode: 'reveal' | 'cover' = canUseVT ? 'reveal' : 'cover';
    const duration = mode === 'reveal' ? REVEAL_MS : COVER_MS;

    let w = window.innerWidth;
    let h = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    let geo = makeGeometry(w, h);
    const drips = makeDrips(w);
    const trailDrips = makeDrips(w);

    const sheen: Rgb = luminance(options.bg) > 0.5 ? [255, 255, 255] : mix(options.accentB, [255, 255, 255], 0.7);
    const rim: Rgb = luminance(options.bg) > 0.5 ? mix(options.accentA, [255, 255, 255], 0.15) : sheen;

    // Per-run random streaks and bubbles (stable within the run).
    const streakCount = Math.max(24, Math.round(w / 20));
    const streaks = Array.from({ length: streakCount }, (_, i) => ({
      xf: (i + Math.random()) / streakCount,
      len: 50 + Math.random() * 190,
      width: 0.8 + Math.random() * 1.8,
      speed: 0.004 + Math.random() * 0.006,
      alpha: 0.1 + Math.random() * 0.22,
      phase: Math.random() * 10,
    }));
    const bubbles = Array.from({ length: 34 }, () => ({
      xf: Math.random(),
      depth: Math.random(),
      r: 1.5 + Math.random() * 4.5,
      speed: 0.01 + Math.random() * 0.03,
      phase: Math.random() * 10,
    }));

    let applied = false;
    let finished = false;
    let rafId = 0;
    let safetyTimer = 0;
    let clipStyle: HTMLStyleElement | null = null;
    let vt: ViewTransitionLike | null = null;

    const applyOnce = () => {
      if (applied) return;
      applied = true;
      options.apply();
    };

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      geo = makeGeometry(w, h);
    };

    const setClip = (css: string) => {
      if (!clipStyle) return;
      clipStyle.textContent = `html.${WAVE_CLASS}::view-transition-new(root){clip-path:${css}}`;
    };

    const cleanup = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(rafId);
      window.clearTimeout(safetyTimer);
      applyOnce(); // never leave without applying the new look
      canvas.style.display = 'none';
      canvas.style.removeProperty('view-transition-name');
      clipStyle?.remove();
      clipStyle = null;
      root.classList.remove(WAVE_CLASS);
      running = false;
      abort = null;
      options.onDone();
    };
    abort = cleanup;

    resize();

    /* ---------------------------------------------------------------- draw -- */

    const drawWater = (p: number, elapsed: number) => {
      const c = ctx;
      if (!c) return;
      if (window.innerWidth !== w || window.innerHeight !== h) resize();

      const g = geo;
      const { amp, maxDrip, n, xs, lead, trail } = g;
      const phase = elapsed * 0.0046;
      const e = fall(p);

      // The cover fallback needs a band tall enough to blanket the screen.
      const bandH =
        mode === 'cover' ? g.h + amp * 2 + maxDrip * 0.6 + g.h * 0.15 : Math.min(g.h * 0.34, 300);

      let Y: number;
      if (mode === 'reveal') {
        const y0 = -amp - 12;
        const y1 = g.h + maxDrip + amp + 16;
        Y = y0 + (y1 - y0) * e;
      } else {
        const y0 = -amp - 12;
        const y1 = bandH + g.h + amp + maxDrip * 0.6 + 16;
        Y = y0 + (y1 - y0) * e;
      }

      shapeEdge(g, lead, Y, p, phase, drips, 1, 0);
      if (mode === 'cover') shapeEdge(g, trail, Y - bandH, p, phase, trailDrips, 0.6, 2.4);

      // Coverage moment for the fallback: every point of the front is below the
      // viewport, every point of the tail still above it.
      if (mode === 'cover' && !applied) {
        let minLead = Infinity;
        for (let i = 0; i < n; i++) if (lead[i]! < minLead) minLead = lead[i]!;
        if (minLead >= g.h + 4) applyOnce();
      }

      // Reveal mode: the new page shows above the front.
      if (mode === 'reveal') {
        const pts: string[] = ['0px -4px', `${g.w}px -4px`];
        for (let i = n - 1; i >= 0; i--) {
          pts.push(`${xs[i]!.toFixed(1)}px ${Math.max(lead[i]!, -4).toFixed(1)}px`);
        }
        setClip(`polygon(${pts.join(',')})`);
      }

      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, g.w, g.h);
      c.lineJoin = 'round';
      c.lineCap = 'round';

      const frontAt = (xf: number): number => {
        const idx = Math.min(n - 1, Math.max(0, Math.round((xf * g.w) / STEP)));
        return lead[idx]!;
      };

      const tintA = mix(options.bg, options.accentA, 0.3);
      const tintB = mix(options.bg, options.accentB, 0.5);

      if (mode === 'cover') {
        // Opaque sheet between the tail and the front.
        const gradient = c.createLinearGradient(0, Y - bandH - amp, 0, Y + maxDrip);
        gradient.addColorStop(0, rgba(tintA, 1));
        gradient.addColorStop(0.08, rgba(options.bg, 1));
        gradient.addColorStop(0.82, rgba(options.bg, 1));
        gradient.addColorStop(0.95, rgba(tintB, 1));
        gradient.addColorStop(1, rgba(options.accentB, 1));
        c.beginPath();
        c.moveTo(xs[0]!, lead[0]!);
        for (let i = 1; i < n; i++) c.lineTo(xs[i]!, lead[i]!);
        for (let i = n - 1; i >= 0; i--) c.lineTo(xs[i]!, trail[i]!);
        c.closePath();
        c.fillStyle = gradient;
        c.fill();

        // Tail rim.
        c.beginPath();
        c.moveTo(xs[0]!, trail[0]!);
        for (let i = 1; i < n; i++) c.lineTo(xs[i]!, trail[i]!);
        c.strokeStyle = rgba(options.accentA, 0.6);
        c.lineWidth = 2;
        c.stroke();
      } else {
        // Translucent wet band above the front, over the freshly revealed page.
        const top = Y - bandH - amp;
        const gradient = c.createLinearGradient(0, top, 0, Y + maxDrip);
        gradient.addColorStop(0, rgba(tintA, 0));
        gradient.addColorStop(0.45, rgba(tintA, 0.2));
        gradient.addColorStop(0.8, rgba(tintB, 0.46));
        gradient.addColorStop(1, rgba(options.accentB, 0.7));
        c.beginPath();
        c.moveTo(xs[0]!, lead[0]!);
        for (let i = 1; i < n; i++) c.lineTo(xs[i]!, lead[i]!);
        for (let i = n - 1; i >= 0; i--) {
          const wob = 0.82 + 0.18 * Math.sin(xs[i]! * 0.011 + phase * 1.6);
          c.lineTo(xs[i]!, lead[i]! - bandH * wob);
        }
        c.closePath();
        c.fillStyle = gradient;
        c.fill();
      }

      // Flow streaks: thin glossy lines running down into the front.
      for (let s = 0; s < streaks.length; s++) {
        const st = streaks[s]!;
        const yEnd = frontAt(st.xf) - 2;
        const len = st.len * (0.65 + 0.35 * Math.sin(elapsed * st.speed + st.phase));
        const x = st.xf * g.w;
        c.beginPath();
        c.moveTo(x, yEnd - len);
        c.lineTo(x, yEnd);
        c.strokeStyle = rgba(sheen, st.alpha * (mode === 'cover' ? 0.55 : 1));
        c.lineWidth = st.width;
        c.stroke();
        c.beginPath();
        c.moveTo(x, yEnd - len * 0.3);
        c.lineTo(x, yEnd);
        c.strokeStyle = rgba(sheen, Math.min(0.55, st.alpha * 1.9));
        c.stroke();
      }

      // Ripples trailing the front, then the foam rim.
      for (let r = 1; r <= 2; r++) {
        c.beginPath();
        c.moveTo(xs[0]!, lead[0]! - r * 15);
        for (let i = 1; i < n; i++) c.lineTo(xs[i]!, lead[i]! - r * 15);
        c.strokeStyle = rgba(options.accentA, 0.26 / r);
        c.lineWidth = 3 - r * 0.7;
        c.stroke();
      }

      c.beginPath();
      c.moveTo(xs[0]!, lead[0]!);
      for (let i = 1; i < n; i++) c.lineTo(xs[i]!, lead[i]!);
      c.strokeStyle = rgba(options.accentA, 0.4);
      c.lineWidth = 12;
      c.stroke();
      c.strokeStyle = rgba(rim, 0.9);
      c.lineWidth = 1.8;
      c.stroke();

      // Bubbles rising through the wet band.
      c.lineWidth = 1;
      for (let b = 0; b < bubbles.length; b++) {
        const bu = bubbles[b]!;
        const yFront = frontAt(bu.xf);
        const cycle = (elapsed * bu.speed * 0.01 + bu.phase) % 1;
        const by = yFront - 10 - cycle * Math.min(bandH, 240) * (0.4 + 0.6 * bu.depth);
        c.beginPath();
        c.arc(bu.xf * g.w, by, bu.r, 0, Math.PI * 2);
        c.strokeStyle = rgba(sheen, 0.22 * (1 - cycle));
        c.stroke();
      }

      // Drip tips: a glossy bead, and droplets breaking away below it.
      for (let d = 0; d < drips.length; d++) {
        const dr = drips[d]!;
        const grow = smooth((p - dr.delay) / 0.38);
        if (grow < 0.12) continue;
        const x = dr.xf * g.w;
        const tip = frontAt(dr.xf);
        const rad = 2.6 + dr.half * 0.06;
        c.beginPath();
        c.arc(x, tip + rad * 0.6, rad, 0, Math.PI * 2);
        c.fillStyle = rgba(options.accentB, 0.85);
        c.fill();
        c.beginPath();
        c.arc(x - rad * 0.3, tip, rad * 0.35, 0, Math.PI * 2);
        c.fillStyle = rgba(sheen, 0.95);
        c.fill();
        for (let k = 1; k <= 2; k++) {
          const dy = tip + rad * 2 + k * (16 + (elapsed * 0.05 + d * 13) % 22);
          c.beginPath();
          c.arc(x + Math.sin(d * 4 + k) * 3, dy, Math.max(0.8, rad * (0.55 - k * 0.15)), 0, Math.PI * 2);
          c.fillStyle = rgba(options.accentB, 0.55 / k);
          c.fill();
        }
      }
    };

    /* ---------------------------------------------------------------- loop -- */

    const startLoop = () => {
      if (finished) return;
      const start = performance.now();

      const frame = (now: number) => {
        if (finished) return;
        const elapsed = now - start;
        const p = Math.min(elapsed / duration, 1);
        drawWater(p, elapsed);
        if (p >= 1) {
          cleanup();
          return;
        }
        rafId = requestAnimationFrame(frame);
      };
      rafId = requestAnimationFrame(frame);
    };

    // Never leave the visitor behind a curtain or on the wrong theme.
    safetyTimer = window.setTimeout(cleanup, duration + 1200);

    if (mode === 'reveal') {
      // The clip starts empty so the new page cannot flash before the first frame.
      clipStyle = document.createElement('style');
      clipStyle.id = CLIP_STYLE_ID;
      document.head.appendChild(clipStyle);
      setClip('polygon(0 0,0 0,0 0)');
      root.classList.add(WAVE_CLASS);

      try {
        vt = doc.startViewTransition!(async () => {
          applyOnce();
          // Rendering is paused inside this callback, so wait on a timer (not
          // rAF) for React to flush the theme change into the DOM.
          await new Promise<void>((resolve) => window.setTimeout(resolve, 60));
          canvas.style.display = 'block';
          canvas.style.setProperty('view-transition-name', VT_NAME);
        });
      } catch {
        vt = null;
      }

      if (!vt) {
        cleanup();
        return;
      }

      vt.ready.then(
        () => {
          // A running animation on the transition's pseudo-elements keeps the
          // view transition alive for as long as the water is falling.
          try {
            root.animate([{ opacity: 1 }, { opacity: 1 }], {
              duration: duration + 80,
              pseudoElement: '::view-transition-group(root)',
            });
          } catch {
            /* the safety timer covers this */
          }
          startLoop();
        },
        () => cleanup(),
      );
      vt.finished.then(cleanup, cleanup);
    } else {
      canvas.style.display = 'block';
      startLoop();
    }
  };

  return {
    play,
    dispose() {
      abort?.();
    },
  };
}
