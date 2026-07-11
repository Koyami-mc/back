/** Deterministic integer hash → [0, 1). Same (i, seed) always maps to the same value. */
export function hash01(i: number, seed: number): number {
  let h = (i | 0) + Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** 1D value noise in [0, 1) with smoothstep interpolation between lattice points. */
export function valueNoise1D(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash01(i, seed) * (1 - u) + hash01(i + 1, seed) * u;
}

/** Fractal Brownian motion over valueNoise1D, normalized back to [0, 1]. */
export function fbm1D(x: number, seed: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise1D(x * freq, seed + o * 101);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/**
 * Ridged multifractal noise in [0, 1]: each octave is folded around its
 * midpoint before summing, producing sharp mountain ridgelines.
 */
export function ridgedFbm1D(x: number, seed: number, octaves = 5, lacunarity = 2.1, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise1D(x * freq, seed + o * 101);
    const ridge = 1 - Math.abs(2 * n - 1);
    sum += amp * ridge * ridge;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Seeded PRNG (mulberry32) for reproducible scatter placement. */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
