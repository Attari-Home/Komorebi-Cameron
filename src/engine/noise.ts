import { mulberry32 } from './math';

/** A 2D noise function returning values in roughly [-1, 1]. */
export type Noise2D = (x: number, y: number) => number;

// ---------------------------------------------------------------------------
// Permutation table
// ---------------------------------------------------------------------------

/** Build a seeded 512-entry permutation table (256 shuffled values, doubled). */
function buildPermutation(seed: number): Uint8Array {
  const rand = mulberry32(seed);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;

  // Fisher-Yates shuffle.
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = base[i]!;
    base[i] = base[j]!;
    base[j] = tmp;
  }

  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255]!;
  return perm;
}

// ---------------------------------------------------------------------------
// 2D simplex noise
// ---------------------------------------------------------------------------

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

/** Eight unit-ish gradient directions, stored as x,y pairs. */
const GRAD2 = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1]);

/**
 * Seeded 2D simplex noise. Deterministic per seed, smooth, and cheap
 * (three gradient lookups per sample). Output is in approximately [-1, 1].
 */
export function createSimplexNoise2D(seed: number): Noise2D {
  const perm = buildPermutation(seed);

  return (xin: number, yin: number): number => {
    // Skew input space to find the simplex cell.
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);

    // Which of the two triangles of the cell are we in?
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let n0 = 0;
    let n1 = 0;
    let n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = (perm[ii + perm[jj]!]! & 7) * 2;
      t0 *= t0;
      n0 = t0 * t0 * (GRAD2[g]! * x0 + GRAD2[g + 1]! * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = (perm[ii + i1 + perm[jj + j1]!]! & 7) * 2;
      t1 *= t1;
      n1 = t1 * t1 * (GRAD2[g]! * x1 + GRAD2[g + 1]! * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = (perm[ii + 1 + perm[jj + 1]!]! & 7) * 2;
      t2 *= t2;
      n2 = t2 * t2 * (GRAD2[g]! * x2 + GRAD2[g + 1]! * y2);
    }

    return 70 * (n0 + n1 + n2);
  };
}

// ---------------------------------------------------------------------------
// 2D value noise
// ---------------------------------------------------------------------------

/**
 * Seeded 2D value noise with quintic interpolation. Blockier than simplex
 * but even cheaper; useful for coarse, low-frequency modulation.
 * Output is in [-1, 1].
 */
export function createValueNoise2D(seed: number): Noise2D {
  const perm = buildPermutation(seed);

  const lattice = (ix: number, iy: number): number =>
    (perm[(ix & 255) + perm[iy & 255]!]! / 255) * 2 - 1;

  const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

  return (x: number, y: number): number => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = fade(x - x0);
    const fy = fade(y - y0);

    const v00 = lattice(x0, y0);
    const v10 = lattice(x0 + 1, y0);
    const v01 = lattice(x0, y0 + 1);
    const v11 = lattice(x0 + 1, y0 + 1);

    const top = v00 + (v10 - v00) * fx;
    const bottom = v01 + (v11 - v01) * fx;
    return top + (bottom - top) * fy;
  };
}

// ---------------------------------------------------------------------------
// Fractal Brownian motion
// ---------------------------------------------------------------------------

/**
 * Layer several octaves of a base noise for organic, multi-scale curvature.
 * Result is normalised back into roughly [-1, 1].
 */
export function fbm2D(
  noise: Noise2D,
  x: number,
  y: number,
  octaves = 3,
  lacunarity = 2,
  gain = 0.5,
): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;

  for (let o = 0; o < octaves; o++) {
    sum += noise(x * frequency, y * frequency) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return sum / norm;
}
