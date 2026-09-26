import {
  angleDiff,
  clamp,
  clamp01,
  DEG2RAD,
  easeOutBack,
  easeOutCubic,
  lerp,
  mulberry32,
  TAU,
} from './math';
import { createSimplexNoise2D, fbm2D, type Noise2D } from './noise';
import type {
  BlossomTip,
  BranchConfig,
  BranchSegment,
  Ctx2D,
  PetalSprite,
  ThemePalette,
} from './types';

/** Distance tolerance when testing whether a segment has finished growing. */
const EPSILON = 1e-3;

/**
 * Generative branch system.
 *
 * Generation is fully deterministic (seeded) and happens once per viewport
 * size. The result is a flat list of straight segments, each tagged with the
 * distance travelled from its root (`d0` -> `d1`). Growth is then driven by a
 * single scalar, the *front distance*: every segment with `d1 <= front` is
 * complete, and the (few) segments straddling the front are partially drawn.
 * That makes every branch advance at the same speed and lets completed
 * segments be stamped into an offscreen layer exactly once.
 */
export class BranchSystem {
  readonly segments: BranchSegment[] = [];
  readonly tips: BlossomTip[] = [];

  /** Longest root-to-tip distance in the tree; the front's final value. */
  maxDistance = 0;

  private readonly config: BranchConfig;
  private readonly seed: number;

  private rand: () => number = () => 0;
  private noise: Noise2D = () => 0;

  private width = 0;
  private height = 0;
  private scale = 1;
  private step = 9;
  private maxSegmentLength = 0;

  /** Index of the first segment not yet stamped into the offscreen layer. */
  private cursor = 0;

  constructor(config: BranchConfig, seed: number) {
    this.config = config;
    this.seed = seed;
  }

  // -------------------------------------------------------------------------
  // Generation
  // -------------------------------------------------------------------------

  /** Rebuild the whole tree for a viewport. Resets the paint cursor. */
  generate(width: number, height: number): void {
    const cfg = this.config;

    this.segments.length = 0;
    this.tips.length = 0;
    this.cursor = 0;
    this.maxDistance = 0;
    this.maxSegmentLength = 0;

    this.width = width;
    this.height = height;

    this.rand = mulberry32(this.seed);
    this.noise = createSimplexNoise2D(this.seed ^ 0x9e3779b9);

    const diagonal = Math.hypot(width, height);
    this.scale = clamp(diagonal / 1600, 0.55, 1.35);
    this.step = cfg.stepLength * this.scale;

    cfg.roots.forEach((root, index) => {
      this.growBranch({
        x: root.x * width,
        y: root.y * height,
        angle: root.angle * DEG2RAD,
        length: root.length * diagonal,
        width: root.width * this.scale,
        depth: 0,
        distance: 0,
        salt: index * 17.31,
      });
    });

    // Sorting by end distance means "completed" segments are always a prefix.
    this.segments.sort((a, b) => a.d1 - b.d1);
    for (const s of this.segments) {
      if (s.d1 > this.maxDistance) this.maxDistance = s.d1;
    }

    this.selectTips();
  }

  private growBranch(p: {
    x: number;
    y: number;
    angle: number;
    length: number;
    width: number;
    depth: number;
    distance: number;
    salt: number;
  }): void {
    const cfg = this.config;
    const step = this.step;
    const steps = Math.max(3, Math.round(p.length / step));
    const centerX = this.width * 0.5;
    const centerY = this.height * 0.5;
    const forkProbability = cfg.forkProbability * Math.pow(cfg.forkDecay, p.depth);
    const noiseFreq = cfg.noiseScale / this.scale;
    const minWidth = cfg.minWidth * this.scale;

    let px = p.x;
    let py = p.y;
    let heading = p.angle;
    let distance = p.distance;

    for (let i = 0; i < steps; i++) {
      if (this.segments.length >= cfg.maxSegments) break;

      const t = i / steps;

      // Coherent curvature from fractal noise; salt decorrelates branches.
      const n = fbm2D(this.noise, px * noiseFreq + p.salt, py * noiseFreq + p.depth * 9.1, 3);
      heading += n * cfg.curl;

      // Gentle pull toward the viewport interior keeps growth on-screen.
      const toCenter = Math.atan2(centerY - py, centerX - px);
      heading += angleDiff(heading, toCenter) * cfg.interiorBias * (1 - t * 0.3);

      const nx = px + Math.cos(heading) * step;
      const ny = py + Math.sin(heading) * step;

      // Thickness tapers with progress along this branch.
      const w0 = Math.max(minWidth, p.width * Math.pow(1 - t, cfg.taperExponent));
      const w1 = Math.max(minWidth, p.width * Math.pow(1 - (i + 1) / steps, cfg.taperExponent));

      const d0 = distance;
      const d1 = d0 + step;

      this.segments.push({ x0: px, y0: py, x1: nx, y1: ny, w0, w1, d0, d1, depth: p.depth });
      if (step > this.maxSegmentLength) this.maxSegmentLength = step;

      px = nx;
      py = ny;
      distance = d1;

      // Recursive child branching.
      if (
        p.depth < cfg.maxDepth &&
        i >= 2 &&
        i < steps - 3 &&
        this.rand() < forkProbability
      ) {
        const side = this.rand() < 0.5 ? -1 : 1;
        const spread = lerp(cfg.forkAngleMin, cfg.forkAngleMax, this.rand()) * DEG2RAD;
        const remaining = p.length * (1 - t);
        const childLength = remaining * cfg.childLengthFactor * lerp(0.55, 1, this.rand());

        if (childLength > step * 4) {
          this.growBranch({
            x: px,
            y: py,
            angle: heading + side * spread,
            length: childLength,
            width: Math.max(minWidth, w1 * cfg.childWidthFactor),
            depth: p.depth + 1,
            distance,
            salt: p.salt + (i + 1) * 3.7 + p.depth * 11.3,
          });
        }
      }
    }

    // Every terminal point is a candidate for a blossom.
    this.tips.push({
      x: px,
      y: py,
      rotation: heading + Math.PI / 2 + (this.rand() - 0.5) * 1.2,
      size: cfg.blossomSize * this.scale * lerp(1.1, 0.72, clamp01(p.depth / Math.max(1, cfg.maxDepth))),
      depth: p.depth,
    });
  }

  /** Keep on-screen tips only, capped to `maxBlossoms` with even spacing. */
  private selectTips(): void {
    const cfg = this.config;
    const margin = 12 * this.scale;

    const visible = this.tips.filter(
      (t) =>
        t.x > margin &&
        t.x < this.width - margin &&
        t.y > margin &&
        t.y < this.height - margin,
    );

    let chosen = visible;
    if (visible.length > cfg.maxBlossoms) {
      const stride = visible.length / cfg.maxBlossoms;
      chosen = [];
      for (let i = 0; i < cfg.maxBlossoms; i++) {
        chosen.push(visible[Math.floor(i * stride)]!);
      }
    }

    this.tips.length = 0;
    this.tips.push(...chosen);
  }

  // -------------------------------------------------------------------------
  // Growth state
  // -------------------------------------------------------------------------

  /** Map eased 0..1 growth progress to a front distance along the tree. */
  frontDistance(progress: number): number {
    return easeOutCubic(clamp01(progress)) * this.maxDistance;
  }

  /** True once every segment has been stamped into the offscreen layer. */
  isComplete(): boolean {
    return this.cursor >= this.segments.length;
  }

  /** Forget what has been painted (call after clearing the offscreen layer). */
  resetCursor(): void {
    this.cursor = 0;
  }

  // -------------------------------------------------------------------------
  // Painting
  // -------------------------------------------------------------------------

  /**
   * Stamp every newly completed segment into `ctx` (the offscreen layer).
   * Idempotent per segment: the cursor guarantees each is drawn exactly once.
   */
  paintCompleted(ctx: Ctx2D, front: number, palette: ThemePalette): void {
    const segs = this.segments;
    if (this.cursor >= segs.length) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    while (this.cursor < segs.length && segs[this.cursor]!.d1 <= front + EPSILON) {
      this.strokeSegment(ctx, segs[this.cursor]!, 1, palette);
      this.cursor++;
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /**
   * Draw the partially grown segments at the growth front directly onto the
   * visible canvas. They are cheap (one per active tip) and get stamped into
   * the offscreen layer the frame they finish.
   */
  paintGrowingFront(ctx: Ctx2D, front: number, palette: ThemePalette): void {
    const segs = this.segments;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let k = this.cursor; k < segs.length; k++) {
      const s = segs[k]!;
      // Sorted by d1, so nothing further along can start before the front.
      if (s.d1 - this.maxSegmentLength >= front) break;
      if (s.d0 >= front) continue;

      const f = clamp01((front - s.d0) / (s.d1 - s.d0));
      this.strokeSegment(ctx, s, f, palette);
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /**
   * Draw the blossoms at branch tips. `t` runs 0..1 over the bloom phase and
   * is staggered per tip so the tree flowers progressively.
   */
  paintBlooms(ctx: Ctx2D, sprite: PetalSprite | null, t: number): void {
    if (!sprite || t <= 0) return;

    const tips = this.tips;
    const n = tips.length;

    for (let j = 0; j < n; j++) {
      const tip = tips[j]!;
      const start = n > 1 ? (j / n) * 0.55 : 0;
      const local = clamp01((t - start) / 0.45);
      if (local <= 0) continue;

      const s = (easeOutBack(local) * tip.size) / sprite.cssWidth;

      ctx.save();
      ctx.translate(tip.x, tip.y);
      ctx.rotate(tip.rotation % TAU);
      ctx.scale(s, s);
      ctx.globalAlpha = clamp01(local * 1.4);
      ctx.drawImage(
        sprite.canvas,
        -sprite.cssWidth * 0.5,
        -sprite.cssHeight * 0.5,
        sprite.cssWidth,
        sprite.cssHeight,
      );
      ctx.restore();
    }
  }

  /**
   * One segment (optionally only its first `f` fraction): a dark trunk stroke,
   * then a two-pass pink rim light painted *behind* it via destination-over,
   * so neighbouring segments never overpaint each other's rims.
   */
  private strokeSegment(ctx: Ctx2D, s: BranchSegment, f: number, palette: ThemePalette): void {
    const x1 = s.x0 + (s.x1 - s.x0) * f;
    const y1 = s.y0 + (s.y1 - s.y0) * f;
    const w = (s.w0 + lerp(s.w0, s.w1, f)) * 0.5;

    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.lineTo(x1, y1);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.trunk;
    ctx.lineWidth = w;
    ctx.stroke();

    ctx.globalCompositeOperation = 'destination-over';
    ctx.strokeStyle = palette.rim;

    // Wide, faint pass = glow; narrow, brighter pass = crisp rim.
    ctx.globalAlpha = palette.rimAlpha * 0.22;
    ctx.lineWidth = w + 7 * this.scale;
    ctx.stroke();

    ctx.globalAlpha = palette.rimAlpha;
    ctx.lineWidth = w + 1.8 * this.scale;
    ctx.stroke();

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
