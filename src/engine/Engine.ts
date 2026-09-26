import { BranchSystem } from './Branch';
import { clamp, clamp01, damp, easeOutCubic } from './math';
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

/**
 * Canvas engine orchestrator.
 *
 * Owns the render loop and composes three things each frame:
 *
 *  1. A cached **branch layer** (offscreen surface). Completed branch
 *     segments are stamped into it once; every frame it is composited with a
 *     single `drawImage`.
 *  2. The **growth front**: the few segments currently mid-growth, drawn
 *     directly (plus blossoms while they bloom).
 *  3. The **petal pool**, drawn from pre-rendered sprites.
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

  private readonly sprites: PetalSpriteSet;
  private readonly pool: PetalPool;
  private readonly branches: BranchSystem;
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

  private growElapsedMs = 0;
  private bloomElapsedMs = 0;
  private layerComplete = false;
  private bloomsBaked = false;

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

    this.palette = THEME_PALETTES[this.config.theme];
    this.sprites = new PetalSpriteSet(this.config.petals);
    this.pool = new PetalPool(this.config.petals, this.config.seed);
    this.branches = new BranchSystem(this.config.branches, this.config.seed);

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
   * capped), regenerates the (deterministic) branch tree, and repaints the
   * cached layer at the current growth progress so nothing restarts.
   */
  resize(cssWidth: number, cssHeight: number): void {
    if (this.destroyed) return;

    const w = Math.max(1, Math.floor(cssWidth));
    const h = Math.max(1, Math.floor(cssHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, this.config.maxDpr);

    const sizeUnchanged = w === this.width && h === this.height;
    if (sizeUnchanged && dpr === this.dpr) return;

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
    this.layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (dprChanged || this.sprites.variants.length === 0) {
      this.sprites.build(dpr, this.palette);
    }

    this.pool.resize(w, h, dpr);
    this.branches.generate(w, h);
    this.redrawLayer();

    this.syncLoop();
    if (!this.isRunning()) this.draw();
  }

  /** Switch palette (dark/light). Re-rasterises sprites and the branch layer. */
  setTheme(theme: EngineTheme): void {
    if (this.destroyed) return;
    const next = THEME_PALETTES[theme];
    if (next === this.palette) return;

    this.palette = next;
    if (this.width > 0) {
      this.sprites.build(this.dpr, this.palette);
      this.redrawLayer();
      if (!this.isRunning()) this.draw();
    }
  }

  /** Enable or disable reduced-motion mode (static composition, no loop). */
  setReducedMotion(enabled: boolean): void {
    if (this.destroyed || enabled === this.reducedMotion) return;
    this.reducedMotion = enabled;
    if (enabled) this.finishIntro();
    if (this.width > 0) this.redrawLayer();
    this.syncLoop();
    if (!this.isRunning() && this.width > 0) this.draw();
  }

  /** Pause the loop while the canvas is scrolled out of view. */
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
      // Render the first frame with a nominal step.
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

    // Growth, then bloom once the tree has fully extended.
    if (this.growthProgress() < 1) {
      this.growElapsedMs += dtMs;
    } else if (this.bloomElapsedMs < this.config.bloomDurationMs) {
      this.bloomElapsedMs += dtMs;
    }

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

  /** Skip the intro entirely (reduced motion): tree grown, blooms open. */
  private finishIntro(): void {
    const cfg = this.config;
    this.growElapsedMs = cfg.introDelayMs + cfg.growDurationMs;
    this.bloomElapsedMs = cfg.bloomDurationMs;
    this.bloomsBaked = true;
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /** Clear and repaint the cached branch layer at the current growth state. */
  private redrawLayer(): void {
    const lc = this.layerCtx;
    lc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    lc.clearRect(0, 0, this.width, this.height);

    this.branches.resetCursor();
    const front = this.branches.frontDistance(this.growthProgress());
    this.branches.paintCompleted(lc, front, this.palette);

    if (this.bloomsBaked) {
      this.branches.paintBlooms(lc, this.sprites.blossom, 1);
    }
    this.layerComplete = this.branches.isComplete();
  }

  private draw(): void {
    if (this.destroyed || this.width === 0) return;

    const ctx = this.ctx;
    const dpr = this.dpr;
    const progress = this.growthProgress();
    const front = this.branches.frontDistance(progress);

    // 1. Stamp newly completed segments into the cached layer.
    if (!this.layerComplete) {
      this.branches.paintCompleted(this.layerCtx, front, this.palette);
      this.layerComplete = this.branches.isComplete();
    }

    // Branch parallax against page scroll.
    const scrollY = this.scrollSource ? Math.max(0, this.scrollSource().y) : 0;
    const offsetY = -scrollY * this.config.parallax;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. Composite the cached branch layer: a single drawImage.
    ctx.globalAlpha = this.palette.branchAlpha;
    ctx.drawImage(this.layer, 0, Math.round(offsetY * dpr));
    ctx.globalAlpha = 1;

    // 3. Growth front + blossoms, drawn in CSS-pixel space with parallax.
    ctx.setTransform(dpr, 0, 0, dpr, 0, offsetY * dpr);
    if (!this.layerComplete) {
      ctx.globalAlpha = this.palette.branchAlpha;
      this.branches.paintGrowingFront(ctx, front, this.palette);
      ctx.globalAlpha = 1;
    }

    if (this.layerComplete && !this.bloomsBaked) {
      const bloomT = clamp01(this.bloomElapsedMs / this.config.bloomDurationMs);
      this.branches.paintBlooms(ctx, this.sprites.blossom, bloomT);

      if (bloomT >= 1) {
        // Bake the finished blossoms into the layer so they cost nothing more.
        this.branches.paintBlooms(this.layerCtx, this.sprites.blossom, 1);
        this.bloomsBaked = true;
      }
    }

    // 4. Petals, fading in as the branches near completion.
    const petalAlpha = this.reducedMotion ? 1 : easeOutCubic(clamp01((progress - 0.3) / 0.6));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.pool.draw(ctx, this.sprites, dpr, petalAlpha);

    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
