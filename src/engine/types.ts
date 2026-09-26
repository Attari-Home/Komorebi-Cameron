/**
 * Shared types, configuration shapes, and default tuning values for the
 * Komorebi canvas engine.
 *
 * The engine is framework-agnostic: nothing in `src/engine` imports React,
 * Astro, or Lenis. It talks to the outside world through `ScrollState`
 * (read per frame) and plain method calls.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type EngineTheme = 'dark' | 'light';

/** A 2D context from either an on-screen or an offscreen canvas. */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A drawable surface: OffscreenCanvas where supported, <canvas> otherwise. */
export type SpriteSurface = HTMLCanvasElement | OffscreenCanvas;

export interface Vec2 {
  x: number;
  y: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Recursively optional version of a config type, for user overrides. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

// ---------------------------------------------------------------------------
// Scroll
// ---------------------------------------------------------------------------

/**
 * Live scroll snapshot published by `scrollBus`. The object is mutated in
 * place every update; the engine reads it once per frame with zero allocation.
 */
export interface ScrollState {
  /** Current (animated) scroll offset in CSS px. */
  y: number;
  /** Signed scroll velocity in CSS px per second. Positive = scrolling down. */
  velocity: number;
  /** Normalised document scroll progress, 0..1. */
  progress: number;
  /** Last non-zero scroll direction: 1 down, -1 up, 0 never scrolled. */
  direction: -1 | 0 | 1;
  /** Maximum scroll offset of the document in CSS px. */
  limit: number;
}

export type ScrollSource = () => Readonly<ScrollState>;

// ---------------------------------------------------------------------------
// Petals
// ---------------------------------------------------------------------------

export interface PetalConfig {
  /** Lower / upper bound on simultaneously active petals. */
  minCount: number;
  maxCount: number;
  /** Viewport area (CSS px squared) budgeted per petal when sizing the pool. */
  areaPerPetal: number;
  /** Number of pre-rendered sprite variants (4-6). */
  variantCount: number;
  /** CSS-pixel size of each petal sprite canvas. */
  spriteWidth: number;
  spriteHeight: number;
  /** Petal draw scale range, mapped from depth. */
  sizeRange: readonly [number, number];
  /** Base fall speed range in px/s (before depth scaling). */
  fallSpeed: readonly [number, number];
  /** Ambient wind in px/s. */
  driftSpeed: number;
  /** Horizontal sway amplitude range in px/s. */
  swayAmplitude: readonly [number, number];
  /** Sway angular frequency range in rad/s. */
  swayFrequency: readonly [number, number];
  /** In-plane rotation speed range in rad/s. */
  spinSpeed: readonly [number, number];
  /** Tumble (pseudo-3D flip) speed range in rad/s. */
  flipSpeed: readonly [number, number];
  /** Per-petal opacity range, mapped from depth. */
  alphaRange: readonly [number, number];
  /** Depth range; 1 is nearest (largest, fastest), lower is farther. */
  depthRange: readonly [number, number];
  /** How strongly scroll velocity pushes petals. */
  velocityResponse: {
    /** Extra vertical px/s per px/s of scroll velocity. */
    vertical: number;
    /** Extra horizontal swirl px/s per px/s of scroll velocity. */
    horizontal: number;
    /** Extra spin multiplier per px/s of scroll velocity. */
    spin: number;
    /** Scroll velocity is clamped to +/- this (px/s) before coupling. */
    maxInfluence: number;
  };
  /** Velocity easing rate (1/s). Higher = snappier response to wind/scroll. */
  inertia: number;
  /** Off-screen margin in px before a petal is recycled. */
  margin: number;
}

/**
 * Structure-of-arrays petal state. One typed array per field; index `i`
 * addresses a single petal across all arrays. No per-petal objects exist,
 * so the update loop never allocates.
 */
export interface PetalBuffers {
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  rot: Float32Array;
  vrot: Float32Array;
  flip: Float32Array;
  vflip: Float32Array;
  scale: Float32Array;
  alpha: Float32Array;
  z: Float32Array;
  phase: Float32Array;
  swayFreq: Float32Array;
  swayAmp: Float32Array;
  fall: Float32Array;
  variant: Uint8Array;
}

/** A pre-rendered bitmap plus its logical (CSS px) size. */
export interface PetalSprite {
  canvas: SpriteSurface;
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

/** Where a root branch enters the viewport. Coordinates are viewport fractions. */
export interface BranchRootSpec {
  x: number;
  y: number;
  /** Screen-space heading in degrees. 0 = right, 90 = down. */
  angle: number;
  /** Length as a fraction of the viewport diagonal. */
  length: number;
  /** Base trunk width in px (before viewport scaling). */
  width: number;
}

export interface BranchConfig {
  roots: readonly BranchRootSpec[];
  /** Length of each growth step in px (before viewport scaling). */
  stepLength: number;
  /** Noise sampling frequency in 1/px. */
  noiseScale: number;
  /** Max heading change per step (radians) at full noise amplitude. */
  curl: number;
  /** 0..1 pull of the heading toward the viewport centre per step. */
  interiorBias: number;
  /** Maximum recursion depth for child branches. */
  maxDepth: number;
  /** Probability per step of forking a child at depth 0. */
  forkProbability: number;
  /** Multiplier applied to fork probability per depth level. */
  forkDecay: number;
  forkAngleMin: number;
  forkAngleMax: number;
  /** Child length relative to the parent's remaining length. */
  childLengthFactor: number;
  /** Child base width relative to the parent width at the fork. */
  childWidthFactor: number;
  /** Width falloff exponent: w = w0 * (1 - t) ^ taperExponent. */
  taperExponent: number;
  /** Floor for branch width in px. */
  minWidth: number;
  /** Hard cap on total segments. */
  maxSegments: number;
  /** Blossom display width in px at scale 1. */
  blossomSize: number;
  maxBlossoms: number;
}

/**
 * One straight piece of a branch. `d0` / `d1` are distances travelled along
 * the tree from its root, so growth can be driven by a single "front
 * distance" value and every branch advances at the same speed.
 */
export interface BranchSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w0: number;
  w1: number;
  d0: number;
  d1: number;
  depth: number;
}

export interface BlossomTip {
  x: number;
  y: number;
  rotation: number;
  /** Display width in CSS px. */
  size: number;
  depth: number;
}

// ---------------------------------------------------------------------------
// Theme palettes
// ---------------------------------------------------------------------------

export interface ThemePalette {
  petalA: string;
  petalB: string;
  petalTint: string;
  trunk: string;
  rim: string;
  /** Rim-light opacity for the thin inner rim (glow is derived from it). */
  rimAlpha: number;
  /** Overall opacity of the branch layer when composited. */
  branchAlpha: number;
}

export const THEME_PALETTES: Record<EngineTheme, ThemePalette> = {
  dark: {
    petalA: '#FF70A6',
    petalB: '#FFB7C5',
    petalTint: '#FFF1F5',
    trunk: '#040405',
    rim: '#FF70A6',
    rimAlpha: 0.42,
    branchAlpha: 1,
  },
  light: {
    petalA: '#E23A79',
    petalB: '#F58FA8',
    petalTint: '#FFF7F9',
    trunk: '#3B2431',
    rim: '#E23A79',
    rimAlpha: 0.28,
    branchAlpha: 0.6,
  },
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export interface GovernorConfig {
  enabled: boolean;
  /** If the smoothed frame time exceeds this (ms), reduce petal count. */
  targetFrameMs: number;
  /** Frames between governor evaluations. */
  sampleFrames: number;
}

export interface EngineConfig {
  seed: number;
  theme: EngineTheme;
  reducedMotion: boolean;
  /** Device-pixel-ratio ceiling. Rendering above 2x costs a lot for little gain. */
  maxDpr: number;
  /** Largest simulated time step; longer gaps (tab switches) are clamped. */
  maxDeltaMs: number;
  introDelayMs: number;
  growDurationMs: number;
  bloomDurationMs: number;
  /** Branch layer parallax against page scroll (fraction of scrollY). */
  parallax: number;
  /** Damping rate (1/s) for scroll velocity smoothing. */
  velocitySmoothing: number;
  /** Raw scroll velocity clamp in px/s. */
  velocityClamp: number;
  governor: GovernorConfig;
  petals: PetalConfig;
  branches: BranchConfig;
}

export type EngineOptions = DeepPartial<EngineConfig>;

export interface EngineStats {
  petalCount: number;
  frameMs: number;
  dpr: number;
  growthProgress: number;
  smoothedVelocity: number;
  running: boolean;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  seed: 0x4b4f4d4f, // "KOMO"
  theme: 'dark',
  reducedMotion: false,
  maxDpr: 2,
  maxDeltaMs: 50,
  introDelayMs: 250,
  growDurationMs: 3600,
  bloomDurationMs: 1500,
  parallax: 0.18,
  velocitySmoothing: 7,
  velocityClamp: 4000,
  governor: {
    enabled: true,
    targetFrameMs: 20,
    sampleFrames: 90,
  },
  petals: {
    minCount: 30,
    maxCount: 60,
    areaPerPetal: 24000,
    variantCount: 6,
    spriteWidth: 44,
    spriteHeight: 52,
    sizeRange: [0.4, 0.95],
    fallSpeed: [18, 46],
    driftSpeed: 14,
    swayAmplitude: [10, 34],
    swayFrequency: [0.4, 1.1],
    spinSpeed: [0.3, 1.4],
    flipSpeed: [0.8, 2.6],
    alphaRange: [0.3, 0.92],
    depthRange: [0.45, 1],
    velocityResponse: {
      vertical: 0.14,
      horizontal: 0.05,
      spin: 0.0006,
      maxInfluence: 2600,
    },
    inertia: 2.6,
    margin: 60,
  },
  branches: {
    roots: [
      { x: 1.04, y: -0.04, angle: 150, length: 0.56, width: 13 },
      { x: -0.04, y: 1.04, angle: 335, length: 0.5, width: 12 },
      { x: -0.03, y: 0.1, angle: 22, length: 0.3, width: 8 },
      { x: 1.04, y: 0.66, angle: 196, length: 0.34, width: 8 },
    ],
    stepLength: 9,
    noiseScale: 0.0042,
    curl: 0.11,
    interiorBias: 0.01,
    maxDepth: 4,
    forkProbability: 0.085,
    forkDecay: 0.72,
    forkAngleMin: 18,
    forkAngleMax: 46,
    childLengthFactor: 0.7,
    childWidthFactor: 0.68,
    taperExponent: 1.4,
    minWidth: 0.7,
    maxSegments: 2400,
    blossomSize: 30,
    maxBlossoms: 44,
  },
};
