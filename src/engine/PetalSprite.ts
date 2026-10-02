import { hexToRgb, mixRgb, rgbToCss, TAU } from './math';
import type { Ctx2D, PetalConfig, PetalSprite, SpriteSurface, ThemePalette } from './types';

// ---------------------------------------------------------------------------
// Surface helpers
// ---------------------------------------------------------------------------

/** Create an OffscreenCanvas where available, else a detached <canvas>. */
export function createSurface(width: number, height: number): SpriteSurface {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/** Get a 2D context from either kind of surface. Throws if unavailable. */
export function getContext2D(surface: SpriteSurface): Ctx2D {
  const ctx = (surface as HTMLCanvasElement).getContext('2d') as Ctx2D | null;
  if (!ctx) throw new Error('[komorebi] 2D canvas context is unavailable.');
  return ctx;
}

// ---------------------------------------------------------------------------
// Petal geometry
// ---------------------------------------------------------------------------

interface PetalVariantSpec {
  /** >1 is taller/narrower, <1 is shorter/wider. */
  aspect: number;
  /** Side belly fullness. */
  bulge: number;
  /** Depth of the sakura notch at the tip (fraction of height). */
  notch: number;
  /** 0..1 colour shift from deep pink toward pale blush. */
  tone: number;
}

/** Six visually distinct petals. `variantCount` uses the first N. */
const VARIANT_SPECS: readonly PetalVariantSpec[] = [
  { aspect: 1.0, bulge: 1.0, notch: 0.14, tone: 0.0 },
  { aspect: 1.12, bulge: 0.92, notch: 0.12, tone: 0.28 },
  { aspect: 0.92, bulge: 1.1, notch: 0.16, tone: 0.55 },
  { aspect: 1.06, bulge: 1.04, notch: 0.1, tone: 0.82 },
  { aspect: 0.96, bulge: 0.95, notch: 0.18, tone: 0.4 },
  { aspect: 1.16, bulge: 0.88, notch: 0.13, tone: 1.0 },
];

/** Nominal petal body size in CSS px, before per-variant aspect adjustments. */
const PETAL_BASE_WIDTH = 28;
const PETAL_BASE_HEIGHT = 36;

interface PetalPaint {
  base: string;
  mid: string;
  tip: string;
  rim: string;
  vein: string;
}

/**
 * Trace a sakura petal centred on the origin: rounded belly, pointed base at
 * +y, and the characteristic notch between two lobes at -y.
 */
function tracePetal(ctx: Ctx2D, w: number, h: number, bulge: number, notch: number): void {
  const lobeX = w * 0.26;
  const notchY = -h * (0.5 - notch);

  ctx.beginPath();
  ctx.moveTo(0, h * 0.5);
  ctx.bezierCurveTo(-w * 0.55 * bulge, h * 0.36, -w * 0.62 * bulge, -h * 0.22, -lobeX, -h * 0.5);
  ctx.quadraticCurveTo(-w * 0.1, -h * 0.53, 0, notchY);
  ctx.quadraticCurveTo(w * 0.1, -h * 0.53, lobeX, -h * 0.5);
  ctx.bezierCurveTo(w * 0.62 * bulge, -h * 0.22, w * 0.55 * bulge, h * 0.36, 0, h * 0.5);
  ctx.closePath();
}

function paintPetal(
  ctx: Ctx2D,
  w: number,
  h: number,
  bulge: number,
  notch: number,
  paint: PetalPaint,
): void {
  tracePetal(ctx, w, h, bulge, notch);

  const body = ctx.createLinearGradient(0, h * 0.5, 0, -h * 0.5);
  body.addColorStop(0, paint.base);
  body.addColorStop(0.55, paint.mid);
  body.addColorStop(1, paint.tip);
  ctx.fillStyle = body;
  ctx.fill();

  // Soft highlight on the upper lobes.
  const sheen = ctx.createRadialGradient(0, -h * 0.18, 0, 0, -h * 0.18, h * 0.42);
  sheen.addColorStop(0, 'rgba(255,255,255,0.32)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fill();

  // Fine rim.
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = paint.rim;
  ctx.stroke();

  // Central vein from base toward the notch.
  ctx.beginPath();
  ctx.moveTo(0, h * 0.46);
  ctx.quadraticCurveTo(w * 0.02, h * 0.05, 0, -h * (0.5 - notch) + 2);
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = paint.vein;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Sprite set
// ---------------------------------------------------------------------------

/**
 * Pre-renders every petal bitmap once, so the render loop is a single
 * `drawImage` per petal with no path construction, gradients, or state churn.
 *
 * Bitmaps are rasterised at `pixelScale` (the engine's capped DPR) so they
 * stay crisp on high-density displays. Call `build()` again when the theme
 * or DPR changes.
 */
export class PetalSpriteSet {
  variants: PetalSprite[] = [];
  blossom: PetalSprite | null = null;

  private readonly config: Pick<PetalConfig, 'variantCount' | 'spriteWidth' | 'spriteHeight'>;

  constructor(config: Pick<PetalConfig, 'variantCount' | 'spriteWidth' | 'spriteHeight'>) {
    this.config = config;
  }

  build(pixelScale: number, palette: ThemePalette): void {
    this.dispose();

    const { variantCount, spriteWidth, spriteHeight } = this.config;
    const count = Math.max(4, Math.min(variantCount, VARIANT_SPECS.length));

    const a = hexToRgb(palette.petalA);
    const b = hexToRgb(palette.petalB);
    const tint = hexToRgb(palette.petalTint);

    for (let i = 0; i < count; i++) {
      const spec = VARIANT_SPECS[i]!;
      const sprite = this.createSprite(spriteWidth, spriteHeight, pixelScale);
      const ctx = getContext2D(sprite.canvas);
      ctx.setTransform(pixelScale, 0, 0, pixelScale, sprite.pixelWidth / 2, sprite.pixelHeight / 2);

      const base = mixRgb(a, b, 0.12 + spec.tone * 0.3);
      const tip = mixRgb(b, tint, 0.15 + spec.tone * 0.35);
      const mid = mixRgb(base, tip, 0.55);

      const root = Math.sqrt(spec.aspect);
      paintPetal(ctx, PETAL_BASE_WIDTH / root, PETAL_BASE_HEIGHT * root, spec.bulge, spec.notch, {
        base: rgbToCss(base, 0.96),
        mid: rgbToCss(mid, 0.94),
        tip: rgbToCss(tip, 0.9),
        rim: rgbToCss(tint, 0.34),
        vein: rgbToCss(a, 0.32),
      });

      this.variants.push(sprite);
    }

    this.blossom = this.buildBlossom(pixelScale, a, b, tint);
  }

  dispose(): void {
    this.variants = [];
    this.blossom = null;
  }

  // -------------------------------------------------------------------------

  private createSprite(cssWidth: number, cssHeight: number, pixelScale: number): PetalSprite {
    const pixelWidth = Math.ceil(cssWidth * pixelScale);
    const pixelHeight = Math.ceil(cssHeight * pixelScale);
    return {
      canvas: createSurface(pixelWidth, pixelHeight),
      cssWidth,
      cssHeight,
      pixelWidth,
      pixelHeight,
    };
  }

  /** Five-petal blossom used at branch tips. */
  private buildBlossom(
    pixelScale: number,
    a: ReturnType<typeof hexToRgb>,
    b: ReturnType<typeof hexToRgb>,
    tint: ReturnType<typeof hexToRgb>,
  ): PetalSprite {
    const size = 52;
    const sprite = this.createSprite(size, size, pixelScale);
    const ctx = getContext2D(sprite.canvas);
    ctx.setTransform(pixelScale, 0, 0, pixelScale, sprite.pixelWidth / 2, sprite.pixelHeight / 2);

    const base = mixRgb(a, b, 0.2);
    const tip = mixRgb(b, tint, 0.4);
    const paint: PetalPaint = {
      base: rgbToCss(base, 0.98),
      mid: rgbToCss(mixRgb(base, tip, 0.55), 0.96),
      tip: rgbToCss(tip, 0.94),
      rim: rgbToCss(tint, 0.38),
      vein: rgbToCss(a, 0.3),
    };

    const petalW = 19;
    const petalH = 23;

    for (let k = 0; k < 5; k++) {
      ctx.save();
      ctx.rotate((k * TAU) / 5);
      ctx.translate(0, -petalH * 0.5 + 1.5);
      paintPetal(ctx, petalW, petalH, 1.0, 0.15, paint);
      ctx.restore();
    }

    // Centre and stamens.
    ctx.beginPath();
    ctx.arc(0, 0, 3.4, 0, TAU);
    ctx.fillStyle = rgbToCss(mixRgb(tint, a, 0.15), 1);
    ctx.fill();

    ctx.fillStyle = rgbToCss(a, 0.85);
    for (let k = 0; k < 5; k++) {
      const angle = (k * TAU) / 5 + Math.PI / 5;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * 6, Math.sin(angle) * 6, 1, 0, TAU);
      ctx.fill();
    }

    return sprite;
  }
}
