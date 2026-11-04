// Trees, palms, rocks and far huts as stamps. Near plants sway with the wind field through a row shear.
import { hash, lerp } from '../core.js';
import { beginStamp, endStamp, sphere, column, pole, box, quad, tri, bamboo, mat, THATCH, THATCH_D, TILE, TILE_DARK, WOOD, GEDHEK, STONE } from './stamps.js';
import { trap } from './buildings.js';

const cache = new Map();
const memo = (key, fn) => { let s = cache.get(key); if (!s) { s = fn(); cache.set(key, s); } return s; };

export const palm = (seed = 0) => memo('palm' + seed, () => {
  beginStamp(true);
  const lean = (hash(seed, 3) - .5) * .5, lean2 = (hash(seed, 4) - .5) * .3, h = 1.5 + hash(seed, 5) * .7;
  const at = t => [lean * t * t, lean2 * t * t, h * t];
  for (let k = 0; k < 14; k++) { const a = at(k / 14), b = at((k + 1) / 14); pole(a, b, k % 2 ? [120, 100, 80] : [102, 86, 70], 2); }
  const top = at(1);
  for (let f = 0; f < 11; f++) {
    const ang = f / 11 * 6.283 + hash(seed, f) * .3, L = .42 + hash(seed, f + 20) * .24, droop = .36 + hash(seed, f + 40) * .22, ca = Math.cos(ang), sa = Math.sin(ang);
    for (let s = 0; s < 12; s++) {
      const t0 = s / 12, x = top[0] + ca * L * t0, y = top[1] + sa * L * t0, z = top[2] + .1 * Math.sin(t0 * 2) - droop * t0 * t0;
      // leaflets hang off the rib
      const c = t0 < .15 ? [96, 124, 66] : hash(f, s) > .5 ? [84, 134, 66] : [58, 108, 62];
      pole([x, y, z], [x - sa * .05 * (1 - t0), y + ca * .05 * (1 - t0), z - .07], c);
      pole([x, y, z], [x + sa * .05 * (1 - t0), y - ca * .05 * (1 - t0), z - .07], c);
    }
  }
  sphere(top[0], top[1], top[2] - .02, .05, [110, 96, 60]);
  return endStamp();
});
const BROAD = [[46, 92, 62], [66, 112, 64], [92, 136, 70]];
export const tree = (seed = 0, scale = 1) => memo(`tree${seed}:${scale}`, () => {
  beginStamp(true);
  const h = (.7 + hash(seed, 5) * .4) * scale;
  column(0, 0, 0, h, .05 * scale, [92, 76, 62]);
  for (let n = 0; n < 150; n++) {
    const a = hash(n + seed * 50, 1) * 6.283, r = Math.sqrt(hash(n + seed * 50, 2)) * .46 * scale, z = h + (hash(n + seed * 50, 3) - .35) * .55 * scale - r * .3, t = hash(n + seed * 50, 4) + (z - h) * .7;
    sphere(Math.cos(a) * r, Math.sin(a) * r, z, (.035 + hash(n, 6) * .04) * scale, t > .78 ? [134, 164, 80] : t > .34 ? BROAD[1] : BROAD[0], .3);
  }
  return endStamp();
});
export const banana = (seed = 0) => memo('ban' + seed, () => {
  beginStamp(true);
  column(0, 0, 0, .38, .03, [120, 138, 76]);
  for (let f = 0; f < 7; f++) {
    const ang = f / 7 * 6.283 + hash(seed, f), L = .32 + hash(seed, f + 9) * .12, ca = Math.cos(ang), sa = Math.sin(ang);
    for (let s = 0; s < 9; s++) {
      const t = s / 9, x = ca * L * t, y = sa * L * t, z = .38 + .12 * Math.sin(t * 2.2) - t * t * .2, w = .055 * Math.sin(t * 3.1 + .2);
      pole([x - sa * w, y + ca * w, z], [x + sa * w, y - ca * w, z - .006], f % 2 ? [108, 158, 74] : [84, 138, 68]);
    }
  }
  return endStamp();
});
export const rock = (seed = 0) => memo('rock' + seed, () => {
  beginStamp(true);
  for (let n = 0; n < 4; n++) sphere((hash(seed, n) - .5) * .14, (hash(seed, n + 5) - .5) * .14, .03 + hash(seed, n + 9) * .05, .04 + hash(seed, n + 13) * .05, [122, 116, 118], .5);
  return endStamp();
});
export const spring = () => memo('spring', () => {
  beginStamp(true);
  for (let n = 0; n < 12; n++) { const a = n / 12 * 5.2 - 1, r = .17 + hash(n, 1) * .05; sphere(Math.cos(a) * r, Math.sin(a) * r, .03 + hash(n, 2) * .05, .05 + hash(n, 3) * .03, [110, 104, 112], .5); }
  sphere(-.08, -.08, .12, .1, [92, 86, 100], .5);
  sphere(-.15, .02, .08, .06, [84, 112, 70], .5);
  return endStamp();
});
// the far village: small roofs seen through haze
export const farHut = (seed = 0) => memo('hut' + seed % 4, () => {
  beginStamp(true);
  const m = seed % 2 ? TILE : THATCH, md = seed % 2 ? TILE_DARK : THATCH_D, hx = .22, hy = .18;
  box(-hx, -hy, 0, hx, hy, .18, { x: mat([200, 180, 140], .3), y: mat([220, 204, 168], .3), top: WOOD });
  trap([-hx - .05, hy + .05, .18], [hx + .05, hy + .05, .18], [hx - .05, 0, .38], [-hx + .05, 0, .38], m);
  tri([hx + .05, -hy - .05, .18], [hx + .05, hy + .05, .18], [hx - .05, 0, .38], md);
  return endStamp();
});
export const farTree = (seed = 0) => memo('ft' + seed % 5, () => {
  beginStamp(true);
  column(0, 0, 0, .3, .018, [70, 62, 56]);
  for (let n = 0; n < 40; n++) {
    const a = hash(n + seed * 9, 1) * 6.283, r = Math.sqrt(hash(n + seed * 9, 2)) * .2, z = .32 + (hash(n + seed * 9, 3) - .4) * .3 - r * .4;
    sphere(Math.cos(a) * r, Math.sin(a) * r, z, .03, hash(n, 4) > .6 ? [84, 124, 72] : [44, 86, 60]);
  }
  return endStamp();
});
// far town buildings. Height and roof vary by seed
export const farBlock = (seed = 0) => memo('fb' + seed % 9, () => {
  beginStamp(true);
  const k = seed % 9, walls = [[226, 216, 190], [236, 226, 208], [206, 214, 200], [230, 196, 170], [214, 206, 196]], w = walls[k % 5], tall = k === 7 ? .78 : k === 3 ? .4 : .16 + (k % 2) * .05, hx = .22 + (k % 3) * .02, hy = .18;
  box(-hx, -hy, 0, hx, hy, tall, { x: mat([w[0] * .78 | 0, w[1] * .78 | 0, w[2] * .82 | 0], .2), y: mat(w, .2, (u, v, ix, iy) => (iy % 4 === 1 && ix % 3 === 1 ? [70, 70, 84] : 0), .2), top: mat([150, 146, 136], .3) });
  if (tall < .6) { const m = k === 5 ? mat([160, 164, 166], .3) : TILE, md = k === 5 ? mat([130, 134, 136], .3) : TILE_DARK; trap([-hx - .03, hy + .03, tall], [hx + .03, hy + .03, tall], [hx, 0, tall + .15], [-hx, 0, tall + .15], m); tri([hx + .03, -hy - .03, tall], [hx + .03, hy + .03, tall], [hx, 0, tall + .15], md); }
  if (k === 4) { for (let n = 0; n < 8; n++) { const u = n / 7, r = .2 * Math.sqrt(1 - u * u * .9); box(-r, -r, tall + u * .2, r, r, tall + .02 + u * .2, { x: mat([50, 110, 100], .2), y: mat([70, 140, 124], .2), top: mat([80, 150, 130], .2) }); } column(.2, .16, 0, tall + .42, .025, [234, 230, 216]); }
  if (k === 3) column(0, 0, tall, tall + .1, .05, [224, 130, 54]);
  return endStamp();
});
export const farPalm = (seed = 0) => memo('fp' + seed % 3, () => {
  beginStamp(true);
  const lean = (hash(seed, 3) - .5) * .25;
  for (let k = 0; k < 6; k++) pole([lean * k / 6 * k / 6, 0, k / 6 * .7], [lean * (k + 1) / 6 * (k + 1) / 6, 0, (k + 1) / 6 * .7], [96, 84, 70]);
  for (let f = 0; f < 7; f++) { const a = f / 7 * 6.283, ca = Math.cos(a), sa = Math.sin(a); for (let s = 0; s < 6; s++) { const t = s / 6; pole([lean + ca * .22 * t, sa * .22 * t, .7 - t * t * .14], [lean + ca * .22 * (t + .16), sa * .22 * (t + .16), .7 - (t + .16) * (t + .16) * .14], f % 2 ? [64, 112, 62] : [90, 134, 68]); } }
  return endStamp();
});
