import type { RGB, Vec2 } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TAU = Math.PI * 2;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

// ---------------------------------------------------------------------------
// Scalar helpers
// ---------------------------------------------------------------------------

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Inverse of lerp: where does `value` sit between `a` and `b` (unclamped)? */
export function invLerp(a: number, b: number, value: number): number {
  return a === b ? 0 : (value - a) / (b - a);
}

export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  return lerp(outMin, outMax, invLerp(inMin, inMax, value));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01(invLerp(edge0, edge1, x));
  return t * t * (3 - 2 * t);
}

/**
 * Frame-rate independent exponential smoothing.
 * `lambda` is the rate (1/s); higher converges faster.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Shortest signed angular difference `to - from`, in (-PI, PI]. */
export function angleDiff(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
}

export function lerpAngle(from: number, to: number, t: number): number {
  return from + angleDiff(from, to) * t;
}

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

export function easeInCubic(t: number): number {
  return t * t * t;
}

export function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutQuart(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u * u;
}

export function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/** Overshoots slightly past 1 before settling; used for blossom bloom. */
export function easeOutBack(t: number, overshoot = 1.70158): number {
  const c3 = overshoot + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + overshoot * u * u;
}

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

/**
 * mulberry32: tiny, fast, well-distributed 32-bit seeded PRNG.
 * Returns a function producing floats in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rand: () => number, min: number, max: number): number {
  return min + (max - min) * rand();
}

// ---------------------------------------------------------------------------
// Vector helpers (allocating; use only outside hot loops)
// ---------------------------------------------------------------------------

export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function vecAdd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vecSub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vecScale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function vecLength(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function vecDist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function vecNormalize(a: Vec2): Vec2 {
  const len = Math.hypot(a.x, a.y);
  return len === 0 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len };
}

export function vecFromAngle(angle: number, length = 1): Vec2 {
  return { x: Math.cos(angle) * length, y: Math.sin(angle) * length };
}

export function vecRotate(a: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

/** Parse "#rgb" or "#rrggbb" into 0-255 channels. */
export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) {
    h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  }
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  };
}

export function rgbToCss(color: RGB, alpha = 1): string {
  return `rgba(${color.r},${color.g},${color.b},${alpha})`;
}
