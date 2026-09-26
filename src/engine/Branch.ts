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

/** Number of logarithmic width buckets used to batch strokes. */
const WIDTH_BINS = 20;

/** Distance (px, before scale) over which a blossom opens behind the growth front. */
const BLOOM_SPAN = 240;

/** A point on the tree that may receive blossoms. */
interface Node {
  x: number;
  y: number;
  depth: number;
  root: number;
  d: number;
  isTip: boolean;
}

/**
 * Generative branch system with continuous wind sway.
 *
 * Generation is deterministic (seeded) and runs once per viewport size,
 * producing a flat list of straight segments tagged with the distance
 * travelled from their root (`d0` -> `d1`).
 *
 * Painting is *stateless*: `paint()` redraws the whole tree for a given
 * growth front and time. That is what makes the sway possible: every node is
 * displaced by a function of `(root, distance, time)`, so adjacent segments,
 * forks, and blossoms always stay perfectly connected.
 *
 *   swayY = sin(time * 0.0006 + branchIndex + d * wave) * amplitude * ramp(d)
 *
 * To keep a full repaint cheap, segments are bucketed by width and drawn as a
 * few dozen batched `Path2D` strokes (rim glow, rim line, trunk) instead of
 * thousands of individual stroke calls.
 */
export class BranchSystem {
  readonly segments: BranchSegment[] = [];
  readonly tips: BlossomTip[] = [];

  /** Longest root-to-tip distance in the tree. */
  maxDistance = 0;

  private readonly config: BranchConfig;
  private readonly seed: number;

  private rand: () => number = () => 0;
  private noise: Noise2D = () => 0;

  private width = 0;
  private height = 0;
  private scale = 1;
  private step = 9;
  private bloomSpan = BLOOM_SPAN;

  private readonly nodes: Node[] = [];
  private binLists: number[][] = [];
  private binWidths: number[] = [];

  /** Scratch outputs of computeSway (avoids per-call allocation). */
  private swayX = 0;
  private swayY = 0;
  private swayAmp = 0;

  constructor(config: BranchConfig, seed: number) {
    this.config = config;
    this.seed = seed;
  }

  // -------------------------------------------------------------------------
  // Generation
  // -------------------------------------------------------------------------

  /** Rebuild the whole tree for a viewport. */
  generate(width: number, height: number): void {
    const cfg = this.config;

    this.segments.length = 0;
    this.tips.length = 0;
    this.nodes.length = 0;
    this.maxDistance = 0;

    this.width = width;
    this.height = height;

    this.rand = mulberry32(this.seed);
    this.noise = createSimplexNoise2D(this.seed ^ 0x9e3779b9);

    const diagonal = Math.hypot(width, height);
    this.scale = clamp(diagonal / 1600, 0.55, 1.35);
    this.step = cfg.stepLength * this.scale;
    this.bloomSpan = BLOOM_SPAN * this.scale;

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
        root: index,
      });
    });

    // Sorted by end distance: within a width bucket, growth is a prefix scan.
    this.segments.sort((a, b) => a.d1 - b.d1);
    for (const s of this.segments) {
      if (s.d1 > this.maxDistance) this.maxDistance = s.d1;
    }

    this.buildBins();
    this.buildBlossoms();
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
    root: number;
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

      this.segments.push({
        x0: px,
        y0: py,
        x1: nx,
        y1: ny,
        w0,
        w1,
        d0,
        d1,
        depth: p.depth,
        root: p.root,
      });

      px = nx;
      py = ny;
      distance = d1;

      // Recursive child branching.
      if (p.depth < cfg.maxDepth && i >= 2 && i < steps - 3 && this.rand() < forkProbability) {
        const side = this.rand() < 0.5 ? -1 : 1;
        const spread = lerp(cfg.forkAngleMin, cfg.forkAngleMax, this.rand()) * DEG2RAD;
        const remaining = p.length * (1 - t);
        const childLength = remaining * cfg.childLengthFactor * lerp(0.55, 1, this.rand());

        // Fork nodes are blossom candidates too.
        this.nodes.push({ x: px, y: py, depth: p.depth, root: p.root, d: distance, isTip: false });

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
            root: p.root,
          });
        }
      }
    }

    this.nodes.push({ x: px, y: py, depth: p.depth, root: p.root, d: distance, isTip: true });
  }

  /** Bucket segment indices by (log) width so strokes can be batched. */
  private buildBins(): void {
    const segs = this.segments;
    this.binLists = Array.from({ length: WIDTH_BINS }, () => []);
    this.binWidths = new Array<number>(WIDTH_BINS).fill(1);
    if (segs.length === 0) return;

    let minW = Infinity;
    let maxW = 0;
    for (const s of segs) {
      const w = (s.w0 + s.w1) * 0.5;
      if (w < minW) minW = w;
      if (w > maxW) maxW = w;
    }
    const logSpan = Math.log(maxW / minW) || 1;

    const sums = new Float64Array(WIDTH_BINS);
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]!;
      const w = (s.w0 + s.w1) * 0.5;
      const b = Math.min(WIDTH_BINS - 1, Math.floor((Math.log(w / minW) / logSpan) * WIDTH_BINS));
      this.binLists[b]!.push(i);
      sums[b] = sums[b]! + w;
    }
    for (let b = 0; b < WIDTH_BINS; b++) {
      const count = this.binLists[b]!.length;
      this.binWidths[b] = count > 0 ? sums[b]! / count : 1;
    }
  }

  /**
   * Turn tree nodes into blossom clusters. Every tip gets a cluster; interior
   * fork nodes get one with probability `nodeBlossomChance`. Clusters are
   * ordered by distance so they open progressively behind the growth front.
   */
  private buildBlossoms(): void {
    const cfg = this.config;
    const margin = 10 * this.scale;

    const candidates = this.nodes
      .filter((n) => n.isTip || this.rand() < cfg.nodeBlossomChance)
      .filter(
        (n) =>
          n.x > margin && n.x < this.width - margin && n.y > margin && n.y < this.height - margin,
      )
      .sort((a, b) => a.d - b.d);

    const all: BlossomTip[] = [];
    for (const node of candidates) {
      const depthFactor = clamp01(node.depth / Math.max(1, cfg.maxDepth));
      const base = cfg.blossomSize * this.scale * lerp(1.15, 0.7, depthFactor);

      let count = Math.round(lerp(cfg.clusterSize[0], cfg.clusterSize[1], this.rand()));
      if (!node.isTip) count = Math.max(1, count - 1);

      for (let k = 0; k < count; k++) {
        const angle = this.rand() * TAU;
        const radius = k === 0 ? 0 : base * cfg.clusterRadius * (0.55 + this.rand() * 0.7);
        all.push({
          x: node.x + Math.cos(angle) * radius,
          y: node.y + Math.sin(angle) * radius,
          rotation: this.rand() * TAU,
          size: base * lerp(0.78, 1.15, this.rand()),
          depth: node.depth,
          root: node.root,
          d: node.d,
        });
      }
    }

    // Cap the total, keeping an even spread along the growth order.
    if (all.length > cfg.maxBlossoms) {
      const stride = all.length / cfg.maxBlossoms;
      for (let i = 0; i < cfg.maxBlossoms; i++) this.tips.push(all[Math.floor(i * stride)]!);
    } else {
      this.tips.push(...all);
    }
  }

  // -------------------------------------------------------------------------
  // Growth + sway
  // -------------------------------------------------------------------------

  /**
   * Map 0..1 growth progress to a front distance. The front runs a little past
   * the deepest tip so the last blossoms have room to open.
   */
  frontDistance(progress: number): number {
    return easeOutCubic(clamp01(progress)) * (this.maxDistance + this.bloomSpan);
  }

  /**
   * Wind displacement for a node at distance `d` along root `root`.
   *
   * Vertical: sin(time * 0.0006 + branchIndex + d * wave). Amplitude ramps up
   * with distance from the root (roots stay anchored, tips move most), and a
   * small phase-shifted lateral component makes the motion feel like a
   * breeze rather than a bounce. The result is written to swayX / swayY.
   */
  private computeSway(root: number, d: number, timeMs: number): void {
    if (this.swayAmp === 0 || this.maxDistance === 0) {
      this.swayX = 0;
      this.swayY = 0;
      return;
    }
    const cfg = this.config;
    const ramp = Math.pow(clamp01(d / this.maxDistance), 1.3);
    const phase = timeMs * cfg.swayFrequency + root + d * cfg.swayWave;
    this.swayY = Math.sin(phase) * this.swayAmp * ramp;
    this.swayX = Math.sin(phase * 0.8 + 1.7) * this.swayAmp * 0.45 * ramp;
  }

  // -------------------------------------------------------------------------
  // Painting
  // -------------------------------------------------------------------------

  /**
   * Repaint the branches for the given growth front and time.
   *
   * @param ctx     target context, already scaled to CSS pixels
   * @param front   growth front distance (see `frontDistance`)
   * @param timeMs  simulated time in ms (drives the sway)
   * @param sway    false disables sway entirely (reduced motion)
   */
  paint(ctx: Ctx2D, front: number, timeMs: number, sway: boolean, palette: ThemePalette): void {
    const segs = this.segments;
    if (segs.length === 0 || front <= 0) return;

    this.swayAmp = sway ? this.config.swayAmplitude * this.scale : 0;

    const paths: Array<Path2D | null> = new Array<Path2D | null>(WIDTH_BINS).fill(null);

    for (let b = 0; b < WIDTH_BINS; b++) {
      const list = this.binLists[b]!;
      if (list.length === 0) continue;

      let path: Path2D | null = null;

      for (let k = 0; k < list.length; k++) {
        const s = segs[list[k]!]!;
        // Within a bucket d0 is ascending, so nothing further has started yet.
        if (s.d0 >= front) break;

        const f = s.d1 <= front ? 1 : (front - s.d0) / (s.d1 - s.d0);

        this.computeSway(s.root, s.d0, timeMs);
        const ax = s.x0 + this.swayX;
        const ay = s.y0 + this.swayY;

        this.computeSway(s.root, s.d0 + (s.d1 - s.d0) * f, timeMs);
        const bx = s.x0 + (s.x1 - s.x0) * f + this.swayX;
        const by = s.y0 + (s.y1 - s.y0) * f + this.swayY;

        if (!path) path = new Path2D();
        path.moveTo(ax, ay);
        path.lineTo(bx, by);
      }

      paths[b] = path;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';

    // Pass 1: wide, faint rim = soft glow.
    ctx.strokeStyle = palette.rim;
    ctx.globalAlpha = palette.rimAlpha * 0.22;
    for (let b = 0; b < WIDTH_BINS; b++) {
      const path = paths[b];
      if (!path) continue;
      ctx.lineWidth = this.binWidths[b]! + 7 * this.scale;
      ctx.stroke(path);
    }

    // Pass 2: narrow, brighter rim = crisp edge light.
    ctx.globalAlpha = palette.rimAlpha;
    for (let b = 0; b < WIDTH_BINS; b++) {
      const path = paths[b];
      if (!path) continue;
      ctx.lineWidth = this.binWidths[b]! + 1.8 * this.scale;
      ctx.stroke(path);
    }

    // Pass 3: the dark trunk on top.
    ctx.strokeStyle = palette.trunk;
    ctx.globalAlpha = 1;
    for (let b = 0; b < WIDTH_BINS; b++) {
      const path = paths[b];
      if (!path) continue;
      ctx.lineWidth = this.binWidths[b]!;
      ctx.stroke(path);
    }

    ctx.globalAlpha = 1;
  }

  /**
   * Draw the blossom clusters. Each opens as the growth front passes its
   * node (with a slight overshoot), then follows the same sway as the branch
   * it grows from. The context transform is overwritten per blossom; the
   * caller must restore it afterwards.
   */
  paintBlossoms(
    ctx: Ctx2D,
    sprite: PetalSprite | null,
    front: number,
    timeMs: number,
    dpr: number,
  ): void {
    if (!sprite) return;

    const tips = this.tips;
    const span = this.bloomSpan;

    for (let j = 0; j < tips.length; j++) {
      const tip = tips[j]!;
      const local = clamp01((front - tip.d) / span);
      if (local <= 0) continue;

      this.computeSway(tip.root, tip.d, timeMs);
      const x = tip.x + this.swayX;
      const y = tip.y + this.swayY;

      // Blossoms nod a little with the breeze.
      const nod = this.swayAmp === 0 ? 0 : this.swayY * 0.02;
      const rot = tip.rotation + nod;
      const s = ((easeOutBack(local) * tip.size) / sprite.cssWidth) * dpr;
      const c = Math.cos(rot) * s;
      const sn = Math.sin(rot) * s;

      ctx.setTransform(c, sn, -sn, c, x * dpr, y * dpr);
      ctx.globalAlpha = clamp01(local * 1.6);
      ctx.drawImage(
        sprite.canvas,
        -sprite.cssWidth * 0.5,
        -sprite.cssHeight * 0.5,
        sprite.cssWidth,
        sprite.cssHeight,
      );
    }

    ctx.globalAlpha = 1;
  }
}
