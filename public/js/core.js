// Shared maths. No DOM here: the simulation also runs in Node and in the forecast worker.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const ease = t => t * t * (3 - 2 * t);
export const easeOut = t => 1 - (1 - t) * (1 - t);
// a spring settling on 1: overshoots once, then rests. Used for anything set down by hand.
export const settle = t => (t >= 1 ? 1 : 1 - Math.cos(t * 7.5) * Math.exp(-t * 6));

// integer hash, so results match across JavaScript engines
export function hash(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 3) {
  let s = 0, a = .5, n = 0;
  for (let k = 0; k < oct; k++) { s += noise(x, y) * a; n += a; x = x * 2.03 + 17; y = y * 2.03 + 9; a *= .5; }
  return s / n;
}
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* projection: 30-degree orthographic. One world unit is one tile. */
export const TW = 20, TH = 10, ZS = 24.5; // pixels per tile: half width, half height, one unit of z
export const SUN_X = .85, SUN_Y = -.42; // ground shift of a shadow per unit of height. Shadows fall screen-right
export const depthOf = (x, y, z) => (x + y) * .612 + z * .5;
