// Art primitives. Everything is sampled surfaces written to a scratch buffer with depth, then cropped into a stamp.
// A stamp keeps a shadow mask: where its samples land on the ground along the sun.
import { clamp, lerp, hash, noise, depthOf, TW, TH, ZS, SUN_X, SUN_Y } from '../core.js';
import { rgb, rampOf, bayerAt, mixc, tintc } from './frame.js';

const SW = 220, SH = 220, OX = 110, OY = 170;
const sp = new Uint32Array(SW * SH), sz = new Float32Array(SW * SH), sm = new Uint8Array(SW * SH);
let hasShadow = true;

export function beginStamp(shadow = true) { sp.fill(0); sz.fill(-1e9); sm.fill(0); hasShadow = shadow; }
export function endStamp({ edges = true } = {}) {
  if (edges) edgePass();
  let x0 = SW, y0 = SH, x1 = -1, y1 = -1, mx0 = SW, my0 = SH, mx1 = -1, my1 = -1;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const i = y * SW + x;
    if (sp[i]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (sm[i]) { if (x < mx0) mx0 = x; if (x > mx1) mx1 = x; if (y < my0) my0 = y; if (y > my1) my1 = y; }
  }
  if (x1 < 0) return { w: 0, h: 0, ox: 0, oy: 0, pix: new Uint32Array(0), dep: new Float32Array(0), sh: null };
  const w = x1 - x0 + 1, h = y1 - y0 + 1, pix = new Uint32Array(w * h), dep = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y + y0) * SW + x + x0, k = y * w + x;
    pix[k] = sp[i]; dep[k] = sz[i];
  }
  let sh = null;
  if (mx1 >= 0) {
    const mw = mx1 - mx0 + 1, mh = my1 - my0 + 1, bits = new Uint8Array(mw * mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) bits[y * mw + x] = sm[(y + my0) * SW + x + mx0];
    sh = { w: mw, h: mh, ox: OX - mx0, oy: OY - my0, bits };
  }
  return { w, h, ox: OX - x0, oy: OY - y0, pix, dep, sh };
}
// darker where an object sits in front of nothing, a warm rim over another object
function edgePass() {
  const copy = sp.slice();
  for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) {
    const i = y * SW + x;
    if (!copy[i]) continue;
    const d = sz[i];
    if (!copy[i - SW] || !copy[i + SW] || !copy[i - 1] || !copy[i + 1]) { sp[i] = tintc(copy[i], .72, .7, .8); continue; }
    if (d - sz[i - SW] > .26 || d - sz[i - 1] > .26) sp[i] = mixc(copy[i], rgb(255, 232, 180), .3);
    else if (sz[i + 1] - d > .26 || sz[i + SW] - d > .26) sp[i] = tintc(copy[i], .76, .74, .84);
  }
}
function put(x, y, z, color) {
  const ix = Math.floor(OX + (x - y) * TW), iy = Math.floor(OY + (x + y) * TH - z * ZS);
  if (ix < 0 || iy < 0 || ix >= SW || iy >= SH) return;
  const i = iy * SW + ix, d = depthOf(x, y, z);
  if (d <= sz[i]) return;
  sz[i] = d; sp[i] = color;
}
function shadowAt(x, y, z) {
  if (!hasShadow || z < .02) return;
  const ix = Math.floor(OX + (x + SUN_X * z - y - SUN_Y * z) * TW), iy = Math.floor(OY + (x + SUN_X * z + y + SUN_Y * z) * TH);
  if (ix >= 0 && iy >= 0 && ix < SW && iy < SH) sm[iy * SW + ix] = 1;
}
const ixOf = (x, y) => Math.floor(OX + (x - y) * TW), iyOf = (x, y, z) => Math.floor(OY + (x + y) * TH - z * ZS);

// A material: a base colour, a grain amount and an optional pattern(u, v, ix, iy) that returns a colour or a shade offset
export const mat = (c, grain = .5, pattern = null, dither = .5) => ({ c, grain, pattern, dither });

function paint(x, y, z, m, lvl, u, v) {
  const ix = ixOf(x, y), iy = iyOf(x, y, z);
  let color = m.c, l = lvl;
  if (m.pattern) {
    const p = m.pattern(u, v, ix, iy, x, y, z);
    if (typeof p === 'number') l += p; else if (p) color = p;
  }
  const r = rampOf(color);
  put(x, y, z, r[clamp(Math.floor(l + (noise(ix * .9, iy * .9) - .5) * m.grain + (bayerAt(ix, iy) - .5) * m.dither), 0, 4)]);
}

// light level from a surface normal; the sun is upper left
export function lightOf(nx, ny, nz) {
  const L = Math.hypot(nx, ny, nz) || 1;
  const d = (nx * -.42 + ny * .34 + nz * .84) / L;
  return clamp(1.25 + d * 2.6, 0, 4.4);
}
const STEP = .021;

// quad from corner a, along edges e1 and e2. Light from its normal
export function quad(a, e1, e2, m, lvlOverride) {
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  // the normal must face the camera
  if (n[0] + n[1] + n[2] * 1.2 < 0) { n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; }
  const lvl = lvlOverride == null ? lightOf(n[0], n[1], n[2]) : lvlOverride;
  const lu = Math.hypot(e1[0], e1[1], e1[2]), lv = Math.hypot(e2[0], e2[1], e2[2]);
  const nu = Math.max(1, Math.ceil(lu / STEP)), nv = Math.max(1, Math.ceil(lv / STEP));
  for (let p = 0; p <= nu; p++) for (let q = 0; q <= nv; q++) {
    const s = p / nu, t = q / nv, x = a[0] + e1[0] * s + e2[0] * t, y = a[1] + e1[1] * s + e2[1] * t, z = a[2] + e1[2] * s + e2[2] * t;
    paint(x, y, z, m, lvl, s * lu, t * lv);
    if ((p & 1) === 0 && (q & 1) === 0) shadowAt(x, y, z);
  }
}
// triangle (for gables and hips)
export function tri(a, b, c, m) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (n[0] + n[1] + n[2] * 1.2 < 0) { n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; }
  const lvl = lightOf(n[0], n[1], n[2]);
  const lu = Math.hypot(e1[0], e1[1], e1[2]), lv = Math.hypot(e2[0], e2[1], e2[2]);
  const nu = Math.max(1, Math.ceil(lu / STEP)), nv = Math.max(1, Math.ceil(lv / STEP));
  for (let p = 0; p <= nu; p++) for (let q = 0; q <= nv - p * nv / nu; q++) {
    const s = p / nu, t = q / nv, x = a[0] + e1[0] * s + e2[0] * t, y = a[1] + e1[1] * s + e2[1] * t, z = a[2] + e1[2] * s + e2[2] * t;
    paint(x, y, z, m, lvl, s * lu, t * lv);
    if ((p & 1) === 0 && (q & 1) === 0) shadowAt(x, y, z);
  }
}
// box: top, left face (+y) and right face (+x). m may be { top, y, x } or one material
export function box(x0, y0, z0, x1, y1, z1, m) {
  const top = m.top || m, fy = m.y || m, fx = m.x || m;
  quad([x0, y0, z1], [x1 - x0, 0, 0], [0, y1 - y0, 0], top, 3.3);
  quad([x0, y1, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], fy, 2.3);
  quad([x1, y0, z0], [0, y1 - y0, 0], [0, 0, z1 - z0], fx, 1.25);
}
// a thin pole between two points: one or two pixels wide. Bamboo nodes come from the colour function
export function pole(a, b, c, width = 1, colorOf = null) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(2, Math.ceil(L / .012));
  const ramp = rampOf(c);
  for (let k = 0; k <= n; k++) {
    const t = k / n, x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t), z = lerp(a[2], b[2], t);
    const col = colorOf ? colorOf(t * L, z) : null;
    put(x, y, z, col || ramp[3]);
    if (width > 1) { const ox = .0252; put(x + ox, y - ox, z, col ? tintc(col, .72, .7, .82) : ramp[1]); }
    if (k % 3 === 0) shadowAt(x, y, z);
  }
}
const BAMBOO_C = [186, 166, 98];
export const bamboo = (a, b, width = 1) => {
  const r = rampOf(BAMBOO_C);
  pole(a, b, BAMBOO_C, width, (d) => ((d * 24 | 0) % 7 === 0 ? r[1] : r[3]));
};
export function sphere(x, y, z, rad, c, rough = 0) {
  const ramp = rampOf(c), rp = rad * 28.28, px = OX + (x - y) * TW, py = OY + (x + y) * TH - z * ZS;
  for (let iy = Math.floor(py - rp); iy <= py + rp; iy++) for (let ix = Math.floor(px - rp); ix <= px + rp; ix++) {
    if (ix < 0 || iy < 0 || ix >= SW || iy >= SH) continue;
    const dx = (ix + .5 - px) / rp, dy = (iy + .5 - py) / rp, nn = dx * dx + dy * dy;
    if (nn > 1) continue;
    const nz = Math.sqrt(1 - nn), d = depthOf(x, y, z) + rad * nz, i = iy * SW + ix;
    if (d <= sz[i]) continue;
    let l = clamp(-.55 * dx - .6 * dy + .58 * nz, 0, 1);
    if (rough) l += (hash(ix, iy) - .5) * rough;
    sz[i] = d; sp[i] = ramp[clamp(Math.floor(l * 4.4 + .2 + (bayerAt(ix, iy) - .5) * .7), 0, 4)];
    if (hasShadow && (ix & 1) === 0 && (iy & 1) === 0) shadowAt(x + dx * rad * .7, y + dy * rad * .7, z);
  }
}
// a vertical cylinder, for posts that need to read as round
export function column(x, y, z0, z1, rad, c) {
  const n = Math.ceil((z1 - z0) * ZS * 1.4), rp = rad * 28.28, ramp = rampOf(c);
  for (let k = 0; k <= n; k++) {
    const z = lerp(z0, z1, k / n), px = OX + (x - y) * TW, py = OY + (x + y) * TH - z * ZS;
    for (let ix = Math.floor(px - rp); ix <= px + rp; ix++) {
      const dx = (ix + .5 - px) / rp;
      if (Math.abs(dx) > 1) continue;
      const iy = Math.floor(py);
      if (ix < 0 || iy < 0 || ix >= SW || iy >= SH) continue;
      const i = iy * SW + ix, d = depthOf(x, y, z) + rad * Math.sqrt(1 - dx * dx);
      if (d <= sz[i]) continue;
      sz[i] = d;
      sp[i] = ramp[clamp(Math.floor(2.4 - dx * 1.6 + (bayerAt(ix, iy) - .5) * .4), 0, 4)];
    }
    if (k % 2 === 0) shadowAt(x, y, z);
  }
}
// a free surface u,v -> [x,y,z], with light from its local normal. Curved roofs use this
export function surface(fn, nu, nv, m) {
  for (let p = 0; p <= nu; p++) for (let q = 0; q <= nv; q++) {
    const s = p / nu, t = q / nv, a = fn(s, t), bx = fn(Math.min(1, s + .02), t), by = fn(s, Math.min(1, t + .02));
    const e1 = [bx[0] - a[0], bx[1] - a[1], bx[2] - a[2]], e2 = [by[0] - a[0], by[1] - a[1], by[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] + n[1] + n[2] * 1.2 < 0) { n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; }
    paint(a[0], a[1], a[2], m, lightOf(n[0], n[1], n[2]), s, t);
    if ((p & 3) === 0 && (q & 3) === 0) shadowAt(a[0], a[1], a[2]);
  }
}
// compose several stamps into one, keeping depth order. Used for a finished building
export function compose(stamps, { edges = false } = {}) {
  beginStamp(true);
  for (const st of stamps) {
    const ax = OX - st.ox, ay = OY - st.oy;
    for (let r = 0; r < st.h; r++) for (let c = 0; c < st.w; c++) {
      const k = r * st.w + c, col = st.pix[k];
      if (!col) continue;
      const px = ax + c, py = ay + r;
      if (px < 0 || py < 0 || px >= SW || py >= SH) continue;
      const i = py * SW + px;
      if (st.dep[k] <= sz[i]) continue;
      sz[i] = st.dep[k]; sp[i] = col;
    }
    if (st.sh) {
      const m = st.sh, mx = OX - m.ox, my = OY - m.oy;
      for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) if (m.bits[r * m.w + c]) { const px = mx + c, py = my + r; if (px >= 0 && py >= 0 && px < SW && py < SH) sm[py * SW + px] = 1; }
    }
  }
  return endStamp({ edges });
}

/* ---------- materials ---------- */
const strip = (dark, every, w = 1) => (u, v, ix, iy) => (((iy % every) + every) % every < w ? dark : 0);
export const TILE = mat([176, 88, 58], .55, (u, v, ix, iy) => ((iy % 3 + 3) % 3 === 0 ? -1.1 : ((ix + (iy >> 1)) % 5 === 0 ? -.4 : .1)));
export const TILE_DARK = mat([146, 72, 52], .55, (u, v, ix, iy) => ((iy % 3 + 3) % 3 === 0 ? -1.1 : ((ix + (iy >> 1)) % 5 === 0 ? -.4 : .1)));
export const THATCH = mat([176, 146, 92], .9, (u, v, ix, iy) => ((hash(ix, iy >> 1) - .5) * 1.6 + ((iy % 4 + 4) % 4 === 0 ? -.6 : 0)));
export const THATCH_D = mat([132, 108, 74], .9, (u, v, ix, iy) => ((hash(ix, iy >> 1) - .5) * 1.5 + ((iy % 4 + 4) % 4 === 0 ? -.6 : 0)));
export const IJUK = mat([58, 52, 54], .7, (u, v, ix, iy) => (hash(ix, iy >> 1) - .5) * 1.4); // black palm fibre
export const SHINGLE = mat([88, 72, 66], .5, (u, v, ix, iy) => ((iy % 3 + 3) % 3 === 0 ? -1 : (hash(ix >> 1, iy >> 2) - .5) * .9));
export const ZINC = mat([160, 164, 166], .3, (u, v, ix) => (ix % 3 === 0 ? -.7 : .15), .2);
export const RUST = mat([146, 96, 72], .6, (u, v, ix) => (ix % 3 === 0 ? -.7 : .15));
export const WOOD = mat([120, 84, 58], .5, (u, v, ix, iy) => (((iy >> 1) % 2 === 0 ? -.2 : .1) + (hash(ix >> 2, iy >> 1) - .5) * .4));
export const TEAK = mat([146, 96, 58], .5, (u, v, ix, iy) => (hash(ix >> 3, iy) - .5) * .5);
export const DARKWOOD = mat([78, 54, 44], .4);
export const IRONWOOD = mat([66, 50, 48], .4);
export const GEDHEK = mat([190, 164, 108], .25, (u, v, ix, iy) => (((ix >> 1) + (iy >> 1)) % 2 === 0 ? -.75 : .25), .2); // woven bamboo wall
export const PLASTER = mat([228, 220, 200], .3, null, .35);
export const PLASTER_WARM = mat([226, 204, 156], .3, null, .35);
export const PAINT_BLUE = mat([92, 152, 170], .3, (u, v, ix, iy) => ((iy % 3 + 3) % 3 === 0 ? -.8 : 0));
export const PAINT_GREEN = mat([88, 140, 100], .3, (u, v, ix, iy) => ((iy % 3 + 3) % 3 === 0 ? -.8 : 0));
export const PAINT_RED = mat([170, 56, 48], .3);
export const BRICK = mat([170, 86, 62], .4, (u, v, ix, iy) => {
  const r = iy >> 1; if ((iy & 1) === 0) return -1.1;
  return ((ix + r * 2) % 5 === 0 ? -.9 : (hash((ix + r * 2) >> 2, r) - .5) * .9);
}, .1);
export const PARAS = mat([182, 170, 142], .6, (u, v, ix, iy) => (iy % 4 === 0 ? -.7 : (hash(ix >> 2, iy >> 2) - .5) * .6)); // soft Bali limestone
export const STONE = mat([140, 134, 126], .8, (u, v, ix, iy) => (hash(ix >> 2, iy >> 1) - .5) * 1.1);
export const CONCRETE = mat([166, 160, 150], .5, null, .4);
export const CARVED = mat([120, 44, 40], .2, (u, v, ix, iy) => { // Toraja carving: bands of red, black, white, ochre
  const a = (ix + iy * 2) % 8, b = (ix - iy * 2 + 80) % 8;
  if (a === 0 || b === 0) return [228, 216, 190];
  if (iy % 6 === 0) return [38, 34, 38];
  if (a === 4 && b === 4) return [216, 170, 72];
  return 0;
}, .1);
export const WINDOW = mat([40, 38, 52], .1);
export const WARM_WINDOW = mat([255, 196, 110], .1);
export const SOIL_M = mat([120, 88, 64], .8);
