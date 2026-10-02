import { BranchSystem } from './Branch';
import { clamp, clamp01, damp, easeOutCubic, smoothstep } from './math';
import { PetalPool } from './PetalPool';
import { createSurface, getContext2D, PetalSpriteSet } from './PetalSprite';
import {
  DEFAULT_ENGINE_CONFIG,
  THEME_PALETTES,
  type Ctx2D,
  type EngineConfig,
  type EngineOptions,
  type EngineStats,
  type EngineTheme,
  type PetalColors,
  type ScrollSource,
  type SpriteSurface,
  type ThemePalette,
} from './types';

/** Merge user overrides into the defaults (arrays are replaced, not merged). */
function resolveConfig(options: EngineOptions): EngineConfig {
  const d = DEFAULT_ENGINE_CONFIG;
  return {
    ...d,
    ...(options as Partial<EngineConfig>),
    governor: { ...d.governor, ...options.governor },
    petals: {
      ...d.petals,
      ...(options.petals as Partial<EngineConfig['petals']> | undefined),
      velocityResponse: {
        ...d.petals.velocityResponse,
        ...options.petals?.velocityResponse,
      },
    },
    branches: {
      ...d.branches,
      ...(options.branches as Partial<EngineConfig['branches']> | undefined),
    },
  };
}

/** Samples the wave edge: x in [0,1] -> y as a fraction of canvas height, or null when finished. */
export type WipeEdge = () => ((x01: number) => number) | null;

interface Look {
  sprites: PetalSpriteSet;
  layer: SpriteSurface;
  layerCtx: Ctx2D;
  palette: ThemePalette;
  theme: EngineTheme;
  layerDirty: boolean;
  layerTime: number;
}

/**
 * Canvas engine orchestrator.
 *
 * The canvas is fixed to the viewport and lives behind the page content, so
 * petals fall through the whole experience. Each frame composes:
 *
 *  1. A cached **branch layer** (offscreen surface) containing the tree and
 *     its blossoms. It is repainted while growing and then at a modest rate
 *     (`layerRefreshMs`) to animate the wind sway; in between, it is just
 *     one `drawImage`. It fades out as the page scrolls past the hero.
 *  2. The **petal pool**, drawn from pre-rendered sprites.
 *
 * Petal colours come from a user-selectable palette; changing it (or the
 * theme) re-rasterises every sprite and repaints the layer instantly.
 *
 * Scroll velocity is read per frame from a `ScrollSource` (no subscriptions,
 * no allocation) and coupled to petal motion and branch parallax.
 */
export class Engine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly config: EngineConfig;

  private layer: SpriteSurface;
  private layerCtx: Ctx2D;

  private sprites: PetalSpriteSet;
  private readonly pool: PetalPool;
  private readonly branches: BranchSystem;

  private theme: EngineTheme;
  private petalColors: PetalColors | null;
  private palette: ThemePalette;

  private dpr = 1;
  private width = 0;
  private height = 0;

  private rafId = 0;
  private lastTime = 0;
  private time = 0;

  private started = false;
  private destroyed = false;
  private documentHidden = false;
  private inViewport = true;
  private reducedMotion: boolean;

  /** Previous appearance, kept alive while a theme wipe sweeps across the canvas. */
  private oldLook: Look | null = null;
  private wipeEdge: WipeEdge | null = null;

  private growElapsedMs = 0;
  private layerDirty = true;
  private layerTime = -1;
  private layerMsEma = 0;

  // Ambient glow leaves: a few large, very faint, slowly drifting soft leaves.
  private ambientCount = 0;
  private ambientSeed: Float32Array = new Float32Array(0);

  private scrollSource: ScrollSource | null = null;
  private smoothedVelocity = 0;

  // Quality governor state.
  private frameEma = 16.7;
  private frameCounter = 0;

  constructor(canvas: HTMLCanvasElement, options: EngineOptions = {}) {
    this.canvas = canvas;
    this.config = resolveConfig(options);
    this.reducedMotion = this.config.reducedMotion;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('[komorebi] Could not acquire a 2D canvas context.');
    this.ctx = ctx;

    this.theme = this.config.theme;
    this.petalColors = this.config.petalColors;
    this.palette = this.buildPalette();

    this.sprites = new PetalSpriteSet(this.config.petals);
    this.pool = new PetalPool(this.config.petals, this.config.seed);
    this.branches = new BranchSystem(this.config.branches, this.config.seed);

    // Fewer ambient leaves on lean (mobile) configs.
    this.ambientCount = this.config.petals.maxCount <= 40 ? 3 : 6;
    this.ambientSeed = new Float32Array(this.ambientCount * 4);
    for (let i = 0; i < this.ambientSeed.length; i++) {
      // Deterministic pseudo-random in [0,1): stable across reloads.
      const v = Math.sin((i + 1) * 12.9898 + this.config.seed * 0.001) * 43758.5453;
      this.ambientSeed[i] = v - Math.floor(v);
    }

    this.layer = createSurface(1, 1);
    this.layerCtx = getContext2D(this.layer);

    if (this.reducedMotion) this.finishIntro();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Begin (or resume) the render loop. */
  start(): void {
    if (this.destroyed || this.started) return;
    this.started = true;
    this.documentHidden = typeof document !== 'undefined' && document.hidden;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.syncLoop();
  }

  /** Tear everything down. The instance is unusable afterwards. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;
    this.stopLoop();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.scrollSource = null;
    this.sprites.dispose();
    this.layer.width = 1;
    this.layer.height = 1;
    this.canvas.width = 1;
    this.canvas.height = 1;
  }

  /**
   * Resize to a CSS-pixel viewport. Re-allocates the backing stores (DPR
   * capped) and regenerates the (deterministic) branch tree. Growth progress
   * is preserved, so nothing restarts.
   */
  resize(cssWidth: number, cssHeight: number): void {
    if (this.destroyed) return;

    const w = Math.max(1, Math.floor(cssWidth));
    const h = Math.max(1, Math.floor(cssHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, this.config.maxDpr);

    if (w === this.width && h === this.height && dpr === this.dpr) return;

    this.endWipe();
    const dprChanged = dpr !== this.dpr;
    this.width = w;
    this.height = h;
    this.dpr = dpr;

    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    this.canvas.width = pw;
    this.canvas.height = ph;
    this.layer.width = pw;
    this.layer.height = ph;

    if (dprChanged || this.sprites.variants.length === 0) {
      this.sprites.build(dpr, this.palette);
    }

    this.pool.resize(w, h, dpr);
    this.branches.generate(w, h);
    this.layerDirty = true;

    this.syncLoop();
    if (!this.isRunning()) this.draw();
  }

  /**
   * Apply a theme and (optionally) a user petal palette in one pass. Every
   * petal sprite and blossom is re-rasterised and the branch layer repainted,
   * so the change is instant and costs a single rebuild.
   */
  setAppearance(theme: EngineTheme, colors?: PetalColors | null, wipe?: WipeEdge | null): void {
    if (this.destroyed) return;

    const canWipe = !!wipe && this.width > 0 && !this.reducedMotion;
    if (canWipe) {
      // Hand the current look over to the old side of the wipe and build a
      // fresh one; draw() composites both along the moving edge.
      this.endWipe();
      this.oldLook = {
        sprites: this.sprites,
        layer: this.layer,
        layerCtx: this.layerCtx,
        palette: this.palette,
        theme: this.theme,
        layerDirty: true,
        layerTime: -1,
      };
      this.sprites = new PetalSpriteSet(this.config.petals);
      this.layer = createSurface(this.layer.width, this.layer.height);
      this.layerCtx = getContext2D(this.layer);
      this.wipeEdge = wipe!;
    }

    this.theme = theme;
    if (colors !== undefined) this.petalColors = colors;
    this.palette = this.buildPalette();

    if (this.width > 0) {
      this.sprites.build(this.dpr, this.palette);
      this.layerDirty = true;
      if (!this.isRunning()) this.draw();
    }
  }

  /** Drop the old look once the wipe has fully passed. */
  endWipe(): void {
    if (this.oldLook) {
      this.oldLook.sprites.dispose();
      this.oldLook.layer.width = 1;
      this.oldLook.layer.height = 1;
      this.oldLook = null;
    }
    this.wipeEdge = null;
    if (!this.destroyed && !this.isRunning() && this.width > 0) this.draw();
  }

  /** Enable or disable reduced-motion mode (static composition, no loop). */
  setReducedMotion(enabled: boolean): void {
    if (this.destroyed || enabled === this.reducedMotion) return;
    this.reducedMotion = enabled;
    if (enabled) this.finishIntro();
    this.layerDirty = true;
    this.syncLoop();
    if (!this.isRunning() && this.width > 0) this.draw();
  }

  /** Pause the loop while the canvas is not visible. */
  setInViewport(visible: boolean): void {
    if (this.destroyed || visible === this.inViewport) return;
    this.inViewport = visible;
    this.syncLoop();
  }

  /**
   * Provide a function returning the live scroll state. Called once per
   * frame; it should return the same mutable object each time.
   */
  setScrollSource(source: ScrollSource | null): void {
    this.scrollSource = source;
  }

  /** Smoothed scroll velocity (px/s) the engine is currently applying. */
  getSmoothedVelocity(): number {
    return this.smoothedVelocity;
  }

  getStats(): EngineStats {
    return {
      petalCount: this.pool.count,
      frameMs: this.frameEma,
      dpr: this.dpr,
      growthProgress: this.growthProgress(),
      smoothedVelocity: this.smoothedVelocity,
      running: this.isRunning(),
      layerMs: this.layerMsEma,
    };
  }

  // -------------------------------------------------------------------------
  // Palette
  // -------------------------------------------------------------------------

  private buildPalette(): ThemePalette {
    const base = THEME_PALETTES[this.theme];
    const c = this.petalColors;
    if (!c) return base;
    return {
      ...base,
      petalA: c.petalA,
      petalB: c.petalB,
      petalTint: c.petalTint,
      rim: c.rim,
    };
  }

  // -------------------------------------------------------------------------
  // Loop control
  // -------------------------------------------------------------------------

  private readonly onVisibilityChange = (): void => {
    this.documentHidden = document.hidden;
    this.syncLoop();
  };

  private isRunning(): boolean {
    return this.rafId !== 0;
  }

  private shouldRun(): boolean {
    return (
      this.started &&
      !this.destroyed &&
      !this.documentHidden &&
      this.inViewport &&
      !this.reducedMotion &&
      this.width > 0
    );
  }

  /** Start or stop the rAF loop to match the current run conditions. */
  private syncLoop(): void {
    const run = this.shouldRun();
    if (run && this.rafId === 0) {
      // Reset the clock so the gap while paused never becomes a huge dt.
      this.lastTime = 0;
      this.rafId = requestAnimationFrame(this.frame);
    } else if (!run && this.rafId !== 0) {
      this.stopLoop();
    }
  }

  private stopLoop(): void {
    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.lastTime = 0;
  }

  private readonly frame = (now: number): void => {
    this.rafId = requestAnimationFrame(this.frame);

    if (this.lastTime === 0) {
      this.lastTime = now;
      this.step(1 / 60, 1000 / 60);
      this.draw();
      return;
    }

    const rawMs = now - this.lastTime;
    this.lastTime = now;

    this.trackFrameTime(rawMs);

    // Delta-time clamp: a long stall (GC, tab switch) must not teleport things.
    const dtMs = Math.min(rawMs, this.config.maxDeltaMs);
    this.step(dtMs / 1000, dtMs);
    this.draw();
  };

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  private growthProgress(): number {
    const cfg = this.config;
    return clamp01((this.growElapsedMs - cfg.introDelayMs) / cfg.growDurationMs);
  }

  private step(dt: number, dtMs: number): void {
    this.time += dt;

    if (this.growthProgress() < 1) this.growElapsedMs += dtMs;

    // Scroll velocity: clamp, then damp so wheel ticks become smooth gusts.
    const cfg = this.config;
    const raw = this.scrollSource ? this.scrollSource().velocity : 0;
    const target = clamp(raw, -cfg.velocityClamp, cfg.velocityClamp);
    this.smoothedVelocity = damp(this.smoothedVelocity, target, cfg.velocitySmoothing, dt);
    if (Math.abs(this.smoothedVelocity) < 0.05) this.smoothedVelocity = 0;

    this.pool.update(dt, this.time, this.smoothedVelocity);
  }

  /** Adaptive quality: shed petals if the smoothed frame time runs hot. */
  private trackFrameTime(rawMs: number): void {
    const gov = this.config.governor;
    if (!gov.enabled || rawMs > 200) return; // ignore stalls from tab switches

    this.frameEma = this.frameEma * 0.95 + rawMs * 0.05;
    this.frameCounter++;

    if (this.frameCounter % gov.sampleFrames === 0 && this.frameEma > gov.targetFrameMs) {
      const min = this.config.petals.minCount;
      if (this.pool.count > min) {
        this.pool.setCeiling(Math.max(min, Math.floor(this.pool.count * 0.85)));
      }
    }
  }

  /** Skip the intro entirely (reduced motion): tree fully grown and in bloom. */
  private finishIntro(): void {
    const cfg = this.config;
    this.growElapsedMs = cfg.introDelayMs + cfg.growDurationMs;
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /** Repaint the cached branch layer (tree + blossoms) for the current state. */
  private refreshLayer(front: number): void {
    const t0 = performance.now();
    const lc = this.layerCtx;
    const dpr = this.dpr;

    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalAlpha = 1;
    lc.clearRect(0, 0, this.layer.width, this.layer.height);

    const swayOn = !this.reducedMotion;
    const timeMs = swayOn ? this.time * 1000 : 0;

    lc.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.branches.paint(lc, front, timeMs, swayOn, this.palette);
    this.branches.paintBlossoms(lc, this.sprites.blossom, front, timeMs, dpr);

    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalAlpha = 1;

    this.layerDirty = false;
    this.layerTime = this.time;

    const cost = performance.now() - t0;
    this.layerMsEma = this.layerMsEma === 0 ? cost : this.layerMsEma * 0.9 + cost * 0.1;
  }

  /** Soft, elongated glow "leaves" drifting behind everything. Cheap: N gradient fills. */
  private drawAmbient(ctx: CanvasRenderingContext2D, dpr: number, scrollY: number): void {
    const n = this.ambientCount;
    if (n === 0) return;
    const color = this.palette.petalA;
    const t = this.reducedMotion ? 0 : this.time;
    const W = this.width;
    const H = this.height;
    const light = this.theme === 'light';

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
    for (let i = 0; i < n; i++) {
      const s0 = this.ambientSeed[i * 4]!;
      const s1 = this.ambientSeed[i * 4 + 1]!;
      const s2 = this.ambientSeed[i * 4 + 2]!;
      const s3 = this.ambientSeed[i * 4 + 3]!;

      const r = (Math.min(W, H) * (0.16 + s2 * 0.16)) | 0;
      const x = W * (0.08 + s0 * 0.84) + Math.sin(t * (0.05 + s1 * 0.05) + s3 * 6.28) * W * 0.05;
      // Slow vertical wrap, gently coupled to scroll for parallax depth.
      const yRaw = H * s1 + t * (4 + s2 * 6) - scrollY * (0.03 + s3 * 0.05);
      const y = (((yRaw % (H + r * 2)) + (H + r * 2)) % (H + r * 2)) - r;
      const rot = -0.7 + s3 * 1.4 + Math.sin(t * 0.08 + s0 * 6) * 0.25;
      const alpha = (light ? 0.1 : 0.12) * (0.55 + s2 * 0.45);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(1, 0.5);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, withAlpha(color, alpha));
      grad.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private draw(): void {
    if (this.destroyed || this.width === 0) return;

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const old = this.oldLook;
    const edge = this.wipeEdge;
    if (!old || !edge) {
      this.drawScene(ctx);
      return;
    }

    // Theme wipe: the old look above the edge, the new look below it, exactly
    // matching the page's wave reveal (new theme rises from the bottom).
    const sample = edge();
    if (!sample) {
      this.endWipe();
      this.drawScene(ctx);
      return;
    }

    ctx.save();
    this.clipWipe(ctx, sample, false);
    this.swapLook(old);
    this.drawScene(ctx);
    this.swapLook(old);
    ctx.restore();

    ctx.save();
    this.clipWipe(ctx, sample, true);
    this.drawScene(ctx);
    ctx.restore();
  }

  /** Clip to the region above (`below=false`) or below the wave edge. */
  private clipWipe(
    ctx: CanvasRenderingContext2D,
    edgeAt: (x01: number) => number,
    below: boolean,
  ): void {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const N = 48;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * W;
      const y = edgeAt(i / N) * H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (below) {
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
    } else {
      ctx.lineTo(W, 0);
      ctx.lineTo(0, 0);
    }
    ctx.closePath();
    ctx.clip();
  }

  /** Exchange the live look with `other` (used to render the old side of a wipe). */
  private swapLook(other: Look): void {
    const cur: Look = {
      sprites: this.sprites,
      layer: this.layer,
      layerCtx: this.layerCtx,
      palette: this.palette,
      theme: this.theme,
      layerDirty: this.layerDirty,
      layerTime: this.layerTime,
    };
    this.sprites = other.sprites;
    this.layer = other.layer;
    this.layerCtx = other.layerCtx;
    this.palette = other.palette;
    this.theme = other.theme;
    this.layerDirty = other.layerDirty;
    this.layerTime = other.layerTime;
    Object.assign(other, cur);
  }

  private drawScene(ctx: CanvasRenderingContext2D): void {
    const dpr = this.dpr;
    const cfg = this.config;
    const progress = this.growthProgress();
    const front = this.branches.frontDistance(progress);

    const scrollY = this.scrollSource ? Math.max(0, this.scrollSource().y) : 0;

    // 1. Branch layer: only while the hero is (partly) in view.
    const fade =
      1 - smoothstep(cfg.branchFadeStart * this.height, cfg.branchFadeEnd * this.height, scrollY);

    if (fade > 0.01) {
      const animating = progress < 1;
      const due = this.time - this.layerTime >= cfg.layerRefreshMs / 1000;
      if (this.layerDirty || animating || (due && !this.reducedMotion)) {
        this.refreshLayer(front);
      }

      // Slight parallax: the tree drifts up slower than the page content.
      const offsetY = Math.round(-scrollY * cfg.parallax * dpr);
      ctx.globalAlpha = this.palette.branchAlpha * fade;
      ctx.drawImage(this.layer, 0, offsetY);
      ctx.globalAlpha = 1;
    }

    // 1b. Ambient glow leaves, beneath the petals.
    this.drawAmbient(ctx, dpr, scrollY);

    // 2. Petals, fading in as the branches near completion.
    const intro = this.reducedMotion ? 1 : easeOutCubic(clamp01((progress - 0.3) / 0.6));
    this.pool.draw(ctx, this.sprites, dpr, intro * cfg.petalOpacity);

    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

/** `#rrggbb` -> `rgba(r,g,b,a)`. Falls back to the input for other formats. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1]!, 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha.toFixed(3)})`;
}
