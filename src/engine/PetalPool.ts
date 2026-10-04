import { clamp, mulberry32, randRange } from './math';
import type { Ctx2D, PetalBuffers, PetalConfig } from './types';
import type { PetalSpriteSet } from './PetalSprite';

/** How a petal is being (re)spawned. */
const SpawnMode = {
  /** Anywhere in the viewport; used for the initial scatter. */
  Anywhere: 0,
  /** Just above the top edge. */
  Top: 1,
  /** Just below the bottom edge (petal was pushed up by upward scrolling). */
  Bottom: 2,
} as const;

type SpawnMode = (typeof SpawnMode)[keyof typeof SpawnMode];

/**
 * Fixed-capacity, structure-of-arrays petal pool.
 *
 * - Every field lives in its own typed array, allocated once at construction.
 * - Petals are never created or destroyed: when one leaves the viewport it is
 *   re-seeded in place ("recycled") at the opposite edge.
 * - `count` is the number of *active* petals (30-60, sized from viewport area
 *   and DPR). Changing it never reallocates.
 *
 * Together this keeps the per-frame update allocation-free and GC-silent.
 */
export class PetalPool implements PetalBuffers {
  readonly capacity: number;

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

  /** Number of active petals. */
  count = 0;

  private readonly config: PetalConfig;
  private readonly rand: () => number;
  private width = 0;
  private height = 0;
  /** Upper bound set by the quality governor. */
  private ceiling: number;
  /** Visitor-chosen density multiplier (1 = the signature look). See `setDensity`. */
  private moodDensity = 1;
  private dpr = 1;

  constructor(config: PetalConfig, seed: number) {
    this.config = config;
    // Headroom above the signature count so the density control can go denser.
    this.capacity = Math.ceil(config.maxCount * 2.2);
    this.ceiling = config.maxCount;
    this.rand = mulberry32(seed ^ 0x51ed270b);

    const n = this.capacity;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.vrot = new Float32Array(n);
    this.flip = new Float32Array(n);
    this.vflip = new Float32Array(n);
    this.scale = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.z = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.swayFreq = new Float32Array(n);
    this.swayAmp = new Float32Array(n);
    this.fall = new Float32Array(n);
    this.variant = new Uint8Array(n);
  }

  // -------------------------------------------------------------------------
  // Sizing
  // -------------------------------------------------------------------------

  /** Petal count appropriate for a viewport, clamped to [minCount, ceiling]. */
  computeTargetCount(width: number, height: number, dpr: number): number {
    const cfg = this.config;
    let n = ((width * height) / cfg.areaPerPetal) * this.moodDensity;
    if (width < 640) n *= 0.75; // small screens: fewer, less busy
    if (dpr > 1.75) n *= 0.9; // dense screens: fill-rate is costlier
    const d = this.moodDensity;
    const upper = Math.max(cfg.minCount, this.ceiling) * Math.max(1, d);
    const lower = d < 1 ? Math.max(6, Math.round(cfg.minCount * d)) : cfg.minCount;
    return clamp(Math.round(n), lower, Math.min(this.capacity, Math.round(upper)));
  }

  /** Adapt to a new viewport size, preserving relative petal positions. */
  resize(width: number, height: number, dpr: number): void {
    const prevW = this.width;
    const prevH = this.height;
    this.width = width;
    this.height = height;
    this.dpr = dpr;

    const target = this.computeTargetCount(width, height, dpr);

    if (prevW === 0 || prevH === 0) {
      this.count = target;
      for (let i = 0; i < this.count; i++) this.spawn(i, SpawnMode.Anywhere);
      return;
    }

    const sx = width / prevW;
    const sy = height / prevH;
    for (let i = 0; i < this.count; i++) {
      this.x[i] = this.x[i]! * sx;
      this.y[i] = this.y[i]! * sy;
    }

    this.setActiveCount(target);
  }

  /** Change the active count without reallocating. New petals scatter in. */
  setActiveCount(next: number): void {
    const target = clamp(Math.round(next), 0, this.capacity);
    for (let i = this.count; i < target; i++) this.spawn(i, SpawnMode.Anywhere);
    this.count = target;
  }

  /**
   * Petal density control: scales how many petals are in the air relative to
   * the signature look (1). Petals are added or removed in place, so there is
   * no respawn pop and no reallocation.
   */
  setDensity(density: number): void {
    this.moodDensity = clamp(density, 0.1, 2.2);
    if (this.width > 0 && this.height > 0) {
      this.setActiveCount(this.computeTargetCount(this.width, this.height, this.dpr));
    }
  }

  /** Quality governor hook: lower (or restore) the maximum active count. */
  setCeiling(ceiling: number): void {
    this.ceiling = clamp(Math.round(ceiling), this.config.minCount, this.capacity);
    const allowed = Math.round(this.ceiling * Math.max(1, this.moodDensity));
    if (this.count > allowed) this.count = allowed;
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  /**
   * Advance the simulation.
   *
   * @param dt        seconds since the last step (already clamped)
   * @param time      total simulated seconds (drives sway phase)
   * @param velocity  smoothed scroll velocity in px/s, signed
   */
  update(dt: number, time: number, velocity: number): void {
    const cfg = this.config;
    const vr = cfg.velocityResponse;
    const w = this.width;
    const h = this.height;
    const margin = cfg.margin;

    const influence = clamp(velocity, -vr.maxInfluence, vr.maxInfluence);
    const spinBoost = 1 + Math.abs(influence) * vr.spin;
    const follow = 1 - Math.exp(-cfg.inertia * dt);
    // Slowly breathing ambient wind so the field never feels mechanical.
    const wind = cfg.driftSpeed * (0.6 + 0.4 * Math.sin(time * 0.13));

    const { x, y, vx, vy, rot, vrot, flip, vflip, z, phase, swayFreq, swayAmp, fall } = this;

    for (let i = 0; i < this.count; i++) {
      const depth = z[i]!;
      const ph = phase[i]!;

      const sway = Math.sin(time * swayFreq[i]! + ph) * swayAmp[i]!;
      const targetVx = (wind + sway) * depth + influence * vr.horizontal * depth * Math.sin(ph);
      const targetVy = fall[i]! * depth + influence * vr.vertical * depth;

      vx[i] = vx[i]! + (targetVx - vx[i]!) * follow;
      vy[i] = vy[i]! + (targetVy - vy[i]!) * follow;

      x[i] = x[i]! + vx[i]! * dt;
      y[i] = y[i]! + vy[i]! * dt;
      rot[i] = rot[i]! + vrot[i]! * dt * spinBoost;
      flip[i] = flip[i]! + vflip[i]! * dt;

      // Recycle off-screen petals in place.
      if (y[i]! > h + margin) {
        this.spawn(i, SpawnMode.Top);
      } else if (y[i]! < -margin - h * 0.35) {
        this.spawn(i, SpawnMode.Bottom);
      } else if (x[i]! < -margin) {
        x[i] = w + margin * 0.5;
      } else if (x[i]! > w + margin) {
        x[i] = -margin * 0.5;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /**
   * Draw every active petal with one `drawImage` from its pre-rendered
   * sprite. Rotation, tumble, and scale are folded into a single
   * `setTransform`, so there is no save/restore or path work per petal.
   *
   * The caller's transform and alpha are clobbered; reset them afterwards.
   */
  draw(ctx: Ctx2D, sprites: PetalSpriteSet, dpr: number, globalAlpha: number): void {
    if (globalAlpha <= 0.001 || sprites.variants.length === 0) return;

    const { x, y, rot, flip, scale, alpha, variant } = this;
    const variants = sprites.variants;
    const vCount = variants.length;

    for (let i = 0; i < this.count; i++) {
      const a = alpha[i]! * globalAlpha;
      if (a < 0.01) continue;

      const sprite = variants[variant[i]! % vCount]!;
      const s = scale[i]! * dpr;
      const c = Math.cos(rot[i]!) * s;
      const sn = Math.sin(rot[i]!) * s;
      // Pseudo-3D tumble: squash local x by |cos(flip)| (never fully flat).
      const squash = 0.3 + 0.7 * Math.abs(Math.cos(flip[i]!));

      ctx.setTransform(c * squash, sn * squash, -sn, c, x[i]! * dpr, y[i]! * dpr);
      ctx.globalAlpha = a;
      ctx.drawImage(
        sprite.canvas,
        -sprite.cssWidth * 0.5,
        -sprite.cssHeight * 0.5,
        sprite.cssWidth,
        sprite.cssHeight,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** (Re)initialise every field of petal `i`. */
  private spawn(i: number, mode: SpawnMode): void {
    const cfg = this.config;
    const rand = this.rand;
    const w = this.width;
    const h = this.height;

    const depth = randRange(rand, cfg.depthRange[0], cfg.depthRange[1]);
    // Normalise depth to 0..1 within its range for size/alpha mapping.
    const dn = (depth - cfg.depthRange[0]) / Math.max(1e-6, cfg.depthRange[1] - cfg.depthRange[0]);

    this.z[i] = depth;
    this.scale[i] =
      (cfg.sizeRange[0] + (cfg.sizeRange[1] - cfg.sizeRange[0]) * Math.pow(dn, 1.15)) *
      randRange(rand, 0.88, 1.08);
    this.alpha[i] = cfg.alphaRange[0] + (cfg.alphaRange[1] - cfg.alphaRange[0]) * (0.25 + 0.75 * dn);

    this.phase[i] = rand() * Math.PI * 2;
    this.swayFreq[i] = randRange(rand, cfg.swayFrequency[0], cfg.swayFrequency[1]);
    this.swayAmp[i] = randRange(rand, cfg.swayAmplitude[0], cfg.swayAmplitude[1]);
    this.fall[i] = randRange(rand, cfg.fallSpeed[0], cfg.fallSpeed[1]);

    this.rot[i] = rand() * Math.PI * 2;
    this.vrot[i] = randRange(rand, cfg.spinSpeed[0], cfg.spinSpeed[1]) * (rand() < 0.5 ? -1 : 1);
    this.flip[i] = rand() * Math.PI * 2;
    this.vflip[i] = randRange(rand, cfg.flipSpeed[0], cfg.flipSpeed[1]);

    this.variant[i] = Math.floor(rand() * cfg.variantCount);

    this.x[i] = rand() * w;
    switch (mode) {
      case SpawnMode.Top:
        this.y[i] = -cfg.margin * (0.4 + rand() * 0.6) - rand() * h * 0.15;
        break;
      case SpawnMode.Bottom:
        this.y[i] = h + cfg.margin * (0.4 + rand() * 0.6) + rand() * h * 0.15;
        break;
      default:
        this.y[i] = rand() * h;
        break;
    }

    // Start at roughly terminal velocity so recycled petals don't "pop".
    this.vx[i] = 0;
    this.vy[i] = this.fall[i]! * depth;
  }
}
