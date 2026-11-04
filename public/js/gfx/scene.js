// Draws one world. Bakes the land and finished buildings, then each frame restores them and draws what moves.
import { clamp, lerp, hash, noise, smooth, settle, depthOf, TW, TH, ZS } from '../core.js';
import { CATALOG } from '../sim/catalog.js';
import { C, DT, STEP, M, MONTH_SECONDS } from '../sim/world.js';
import { Frame, rgb, mixc, tintc, bayerAt } from './frame.js';
import { bakeTerrain, drawFarWater, farGrid, hazeAmount } from './terrain.js';
import { drawFluids } from './water.js';
import { blueprint, cardArt } from './buildings.js';
import { palm, tree, banana, rock, spring, farHut, farTree, farPalm, farBlock } from './flora.js';
import { Particles, Sticks, Debris, Rope, P_DUST, P_SMOKE, P_SPRAY, P_ASH, P_LEAF, P_CHIP, P_SPARK, P_CONFETTI, surfaceAt } from './bodies.js';
import { Crowd } from './toons.js';
import { beginStamp, endStamp, box, quad, tri, pole, sphere, column, mat, WOOD, PAINT_RED, PAINT_BLUE } from './stamps.js';

const PAPER = rgb(255, 253, 247);
const INK = rgb(28, 27, 25), SIGNAL = rgb(255, 214, 10), WHITE = rgb(255, 255, 255), BAD = rgb(232, 72, 56), GOOD = rgb(120, 220, 120);
const SHIRTS = [[188, 64, 54], [58, 110, 160], [228, 214, 180], [86, 136, 90], [214, 160, 60], [130, 84, 150]];
const SKIN = [[198, 146, 104], [176, 124, 88], [156, 106, 76]];
const HATS = [[214, 190, 120], [226, 206, 140], [190, 164, 100]];
const hexc = c => rgb(c[0], c[1], c[2]);
const FONT = { 0: '111101101101111', 1: '110010010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111', '+': '000010111010000', '-': '000000111000000' };

const world_freight = w => (w.level.rail && w.level.rail[0].freight) || 0;
// buses, trucks and rail cars in both axes
const vStamps = new Map();
const BOGIE = .36; // from the middle of a car to each bogie, in tiles
function vehicleStamp(kind, axis, seed = 0) {
  const paint = kind === 'bus' ? seed % 3 : kind === 'truck' ? seed % 2 : 0, key = kind + axis + paint;
  if (vStamps.has(key)) return vStamps.get(key);
  beginStamp(true);
  const B = (u0, v0, z0, u1, v1, z1, m) => (axis === 'x' ? box(u0, v0, z0, u1, v1, z1, m) : box(v0, u0, z0, v1, u1, z1, m));
  const coach = (top, band, band2) => {
    B(-.48, -.15, .05, .48, .15, .3, { top: mat(top, .2), x: mat(band, .2, (u, v, ix, iy) => ((iy % 8 + 8) % 8 === 2 ? band2 : 0)), y: mat(band, .2, (u, v, ix, iy) => ((iy % 8 + 8) % 8 === 2 ? band2 : 0)) });
    const win = mat([54, 70, 92], .1, (u, v, ix) => (ix % 4 === 0 ? band : 0));
    if (axis === 'x') quad([-.42, .153, .17], [.84, 0, 0], [0, 0, .07], win, 1.4); else quad([.153, -.42, .17], [0, .84, 0], [0, 0, .07], win, .8);
    B(-.46, -.13, .3, .46, .13, .33, mat([190, 190, 192], .2));
    B(-.4, -.12, 0, -.2, .12, .05, mat([36, 36, 40], .1)); B(.2, -.12, 0, .4, .12, .05, mat([36, 36, 40], .1));
  };
  if (kind === 'bus') {
    const c = [[214, 120, 40], [50, 140, 110], [58, 110, 180]][paint];
    B(-.32, -.11, .03, .32, .11, .24, { top: mat([230, 230, 224], .2), x: mat(c, .2), y: mat(c, .2) });
    if (axis === 'x') quad([-.28, .112, .12], [.56, 0, 0], [0, 0, .08], mat([54, 70, 92], .1, (u, v, ix) => (ix % 4 === 0 ? c : 0)), 1.4); else quad([.112, -.28, .12], [0, .56, 0], [0, 0, .08], mat([54, 70, 92], .1, (u, v, ix) => (ix % 4 === 0 ? c : 0)), .8);
  } else if (kind === 'truck') {
    const c = paint ? [226, 180, 60] : [70, 130, 90];
    B(-.28, -.1, .03, .05, .1, .2, { top: mat([170, 140, 90], .3), x: mat(c, .2), y: mat(c, .2) }); B(.07, -.1, .03, .28, .1, .18, { top: mat([220, 220, 214], .2), x: mat([230, 230, 224], .2), y: mat([230, 230, 224], .2) });
  } else if (kind === 'krl' || kind === 'krl:head') coach([230, 230, 226], [214, 48, 44], [244, 208, 60]);
  else if (kind === 'ka') coach([60, 70, 120], [232, 232, 226], [60, 90, 160]);
  else if (kind === 'ka:head') { B(-.46, -.15, .05, .46, .15, .36, { top: mat([70, 70, 80], .2), x: mat([230, 110, 40], .2), y: mat([40, 70, 140], .2) }); B(-.4, -.12, 0, -.2, .12, .05, mat([36, 36, 40], .1)); B(.2, -.12, 0, .4, .12, .05, mat([36, 36, 40], .1)); }
  else if (kind === 'steam') { B(-.46, -.14, .05, .46, .14, .22, { top: mat([150, 120, 80], .6), x: mat([92, 64, 48], .3), y: mat([110, 76, 54], .3) }); B(-.4, -.12, 0, -.2, .12, .05, mat([36, 36, 40], .1)); B(.2, -.12, 0, .4, .12, .05, mat([36, 36, 40], .1)); for (let k = 0; k < 10; k++) sphere(axis === 'x' ? -.36 + k * .08 : (k % 3) * .06 - .06, axis === 'x' ? (k % 3) * .06 - .06 : -.36 + k * .08, .24, .03, [226, 196, 110]); }
  else if (kind === 'steam:head') {
    const iron = [44, 44, 50];
    for (let k = 0; k < 10; k++) { const u = -.42 + k * .07; column(axis === 'x' ? u : 0, axis === 'x' ? 0 : u, .2, .3, .11, iron); }
    B(.14, -.15, .05, .46, .15, .4, { top: mat([60, 56, 60], .2), x: mat([36, 36, 42], .2), y: mat([50, 50, 56], .2) });
    for (let k = 0; k < 3; k++) { const u = -.32 + k * .2; sphere(axis === 'x' ? u : .155, axis === 'x' ? .155 : u, .1, .07, [170, 40, 36]); }
    column(axis === 'x' ? -.36 : 0, axis === 'x' ? 0 : -.36, .36, .52, .04, iron);
    sphere(axis === 'x' ? -.05 : 0, axis === 'x' ? 0 : -.05, .4, .05, [226, 190, 80]);
  }
  const st = endStamp();
  vStamps.set(key, st);
  return st;
}
const boatStamp = (() => {
  let s = null;
  return () => {
    if (s) return s;
    beginStamp(true);
    // a jukung: painted hull and two bamboo outriggers
    for (let k = 0; k < 16; k++) {
      const t = k / 15 * 2 - 1, r = (1 - t * t) * .07 + .012, x = t * .4;
      box(x - .027, -r, .01 + t * t * .05, x + .027, r, .07 + t * t * .05, { top: mat([70, 58, 52], .2), y: mat(k % 5 === 0 ? [232, 200, 90] : [196, 58, 48], .2), x: mat([230, 226, 210], .2) });
    }
    for (const s2 of [-1, 1]) { pole([-.34, s2 * .23, .04], [.34, s2 * .23, .04], [190, 170, 110], 2); pole([-.16, 0, .09], [-.16, s2 * .23, .05], [150, 130, 90]); pole([.16, 0, .09], [.16, s2 * .23, .05], [150, 130, 90]); }
    pole([.02, 0, .08], [.02, 0, .46], [120, 96, 70], 2);
    s = endStamp();
    return s;
  };
})();

export class Scene {
  constructor(canvas) {
    this.frame = new Frame(canvas);
    this.fx = new Particles(); this.sticks = new Sticks(); this.debris = new Debris();
    this.world = null; this.vis = new Map(); this.time = 0; this.sfx = () => {}; this.cue = () => {};
    this.staticDirty = true; this.terrainDirty = true; this.rainDrops = []; this.floats = []; this.flags = []; this.crowd = new Crowd(this); this.tufts = []; this.plants = []; this.ropes = new Map();
    this.overlay = { tile: null, ghost: null, valid: true, showGrid: false, forecast: null, chips: null };
    this.dissolve = 0; this.islandBake = null; this.shake = 0; this.insets = { top: 96, bottom: 160 };
    this.lightning = 0; this.ashDim = 0; this.liveAll = false; this.grade = { night: 0 };
  }
  setInsets(top, bottom) { this.insets = { top, bottom }; }
  setWorld(world) {
    this.world = world; this.ashDim = 0; this.cars = []; this.lamps = []; this.vis.clear(); this.crowd.reset(); this.ropes.clear(); this.floats = []; this.flags = [];
    this.fx.n = 0; this.sticks.list = []; this.debris.list = []; this.islandBake = null;
    this.overlay = { tile: null, ghost: null, valid: true, showGrid: false, forecast: null, chips: null };
    this.layout(true);
    this.buildNature();
  }
  layout(force) {
    const dpr = window.devicePixelRatio || 1, dw = Math.round(innerWidth * dpr), dh = Math.round(innerHeight * dpr);
    if (!this.world || !dw || !dh) return;
    const N = this.world.N, plotW = N * 40 + 6, plotH = N * 20 + 110, ins = this.insets;
    const usableH = Math.max(120, innerHeight - ins.top - ins.bottom) * dpr;
    const zoom = Math.max(1, Math.floor(Math.min(dw / plotW, usableH / plotH)));
    const W = Math.ceil(dw / zoom), H = Math.ceil(dh / zoom);
    if (!force && W === this.frame.W && H === this.frame.H && zoom === this.zoom) return;
    this.zoom = zoom; this.dpr = dpr;
    this.frame.resize(W, H);
    this.frame.canvas.style.width = W * zoom / dpr + 'px'; this.frame.canvas.style.height = H * zoom / dpr + 'px';
    this.frame.setView(zoom, W * zoom / dpr, H * zoom / dpr);
    let avg = 0; for (let i = 0; i < N * N; i++) avg += this.world.heights[i];
    avg = avg / (N * N) * STEP;
    const centerY = (ins.top + (innerHeight - ins.bottom)) / 2 * dpr / zoom;
    this.frame.OX = Math.round(W / 2 + W * (this.shiftX || 0)); this.frame.OY = Math.round(centerY - N * TH + avg * ZS);
    this.terrainDirty = true; this.staticDirty = true; this.islandBake = null;
    this.buildDissolveMap();
  }
  screenToTile(cssX, cssY) {
    const { world, frame } = this, f = this.dpr / this.zoom, sx = cssX * f, sy = cssY * f, N = world.N;
    let best = null, bd = -1e9;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const z = world.heights[y * N + x] * STEP, cx = frame.OX + (x - y) * TW, cy = frame.OY + (x + y + 1) * TH - z * ZS;
      if (Math.abs(sx - cx) / TW + Math.abs(sy - cy) / TH <= 1 && x + y > bd) { bd = x + y; best = [x, y]; }
    }
    return best;
  }
  tileToScreen(x, y) {
    const { world, frame } = this, z = world.heights[y * world.N + x] * STEP, f = this.zoom / this.dpr;
    return [(frame.OX + (x - y) * TW) * f, (frame.OY + (x + y + 1) * TH - z * ZS) * f];
  }

  /* ---------- nature around the plot ---------- */
  buildNature() {
    const { world } = this, N = world.N, G = world.G;
    const plants = this.plants = [], tufts = this.tufts = [];
    const free = (x, y) => {
      const i = world.idx(x, y); if (i < 0) return false;
      const m = world.mat0[i];
      if (world.sea != null && world.ground0[i] < world.sea + .02) return false;
      if (m === M.RIVERBED) return false;
      for (const s of world.level.springs || []) if (Math.hypot(s.x - x, s.y - y) < .7) return false;
      if (world.level.river && world.ground0[i] < world.heights[0] * STEP - .3 && world.level.biome === 'river') return false;
      return true;
    };
    const hazedCopy = (s, h) => { const pix = s.pix.slice(); for (let k = 0; k < pix.length; k++) if (pix[k]) pix[k] = mixc(pix[k], PAPER, h); return { ...s, pix }; };
    const stamp = (s, x, y, sway) => {
      const i = world.idx(x, y), d = Math.hypot(x < 0 ? -x : x > N ? x - N : 0, y < 0 ? -y : y > N ? y - N : 0);
      plants.push({ s: hazedCopy(s, hazeAmount(d) * .9), x, y, z: world.ground0[i], sway, phase: hash(x * 100 | 0, y * 100 | 0) * 6 });
    };
    for (let tx = -world.mb; tx < N + world.mf; tx++) for (let ty = -world.mb; ty < N + world.mf; ty++) {
      if (tx >= 0 && ty >= 0 && tx < N && ty < N) continue;
      const front = tx >= N || ty >= N, h = hash(tx * 31 + 7, ty * 17 + 3), px = tx + .25 + hash(tx, ty) * .5, py = ty + .25 + hash(ty, tx + 9) * .5;
      if (!free(px, py)) continue;
      const seaSide = world.sea != null;
      if (h > .5) continue;
      if (front) {
        if (h < .1) stamp(banana(tx & 1), px, py, 1);
      } else if (h < .3) {
        stamp(seaSide || h < .2 ? palm((tx * 3 + ty) & 3) : tree((tx + ty * 5) & 3), px, py, 1);
      } else if (h < .42) stamp(banana(ty & 1), px, py, 1);
    }
    for (const s of world.level.springs || []) plants.push({ s: spring(), x: s.x, y: s.y, z: world.ground0[world.idx(s.x, s.y)] + .02, sway: 0, phase: 0 });
    // grass tufts move in the wind
    const area = (N + 3) * (N + 3), count = Math.min(900, area * 11);
    for (let k = 0; k < count; k++) {
      const x = hash(k, 1) * N, y = hash(k, 2) * N, i = world.idx(x, y);
      if (i < 0 || (world.mat0[i] !== M.GRASS && !(world.mat0[i] === M.URBAN && hash(k, 8) < .35))) continue;
      if (world.sea != null && world.ground0[i] < world.sea) continue;
      tufts.push({ x, y, h: 1 + (hash(k, 3) * 3 | 0), t: hash(k, 4) < .03 ? 2 : hash(k, 4) < .08 ? 1 : 0, phase: x * .9 + y * .9 + hash(k, 5), shade: (hash(k, 6) * 3) | 0 });
    }
  }
  decorateFar() {
    const { frame, world } = this, N = world.N, far = farGrid(world);
    const cell = world.level.farLand === 102 ? .62 : 1.3;
    for (let gy = -36; gy < N + 36; gy += cell) for (let gx = -36; gx < N + 36; gx += cell) {
      const ox = gx < 0 ? -gx : gx > N ? gx - N : 0, oy = gy < 0 ? -gy : gy > N ? gy - N : 0, d = Math.hypot(ox, oy);
      if (d < (world.level.urban ? 2.6 : 4.6) || d > 28) continue;
      const k = (gx * 3 | 0) * 37 + (gy * 3 | 0), h = hash(k, 3), loose = cell < 1 ? .18 : 1, jx = gx + hash(k, 5) * loose, jy = gy + hash(k, 7) * loose;
      const fx = ((jx + 38) * 4) | 0, fy = ((jy + 38) * 4) | 0;
      if (fx < 0 || fy < 0 || fx >= far.S || fy >= far.S) continue;
      const c = fy * far.S + fx, m = far.m[c], z = far.h[c];
      if (world.sea != null && z <= world.sea + .05) continue;
      const u = frame.OX + (jx - jy) * TW, v = frame.OY + (jx + jy) * TH - z * ZS;
      if (u < -30 || v < -30 || u > frame.W + 30 || v > frame.H + 60) continue;
      let s = null;
      if (m === 102) { // town blocks fill every lot between the streets
        const fu = jx * .5 - Math.floor(jx * .5), fv = jy * .5 - Math.floor(jy * .5);
        if (fu < .13 || fv < .13 || noise(jx * .9 + 11, jy * .9) > .6) { if (h > .9 && fu > .13 && fv > .13) s = farPalm(k & 3); else continue; }
        else { const r = hash(k, 11); s = r > .975 ? farBlock(7) : r > .95 ? farBlock(4) : r > .9 ? farBlock(3) : farBlock(r > .55 ? 1 : r > .3 ? 2 : 5); }
      } else if (m === 101 && h < .1) s = farHut(k & 3);
      else if (m === 101 && h < .24) s = farPalm(k & 3);
      else if (m === M.SAND && h < .25) s = farPalm(k & 3);
      if (s) this.blitHazed(s, jx, jy, z, hazeAmount(d));
    }
  }
  blitHazed(st, x, y, z, haze) {
    const { W, H, OX, OY, tPix, tZ } = this.frame, ax = Math.round(OX + (x - y) * TW) - st.ox, ay = Math.round(OY + (x + y) * TH - z * ZS) - st.oy, d0 = depthOf(x, y, z);
    for (let r = 0; r < st.h; r++) for (let c = 0; c < st.w; c++) {
      const col = st.pix[r * st.w + c]; if (!col) continue;
      const px = ax + c, py = ay + r; if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const i = py * W + px, d = d0 + st.dep[r * st.w + c];
      if (d <= tZ[i]) continue;
      tZ[i] = d; tPix[i] = mixc(col, PAPER, haze);
    }
  }

  // Far mountains painted behind the land: pale, cool and low in contrast. Merbabu and Telomoyo stand over Salatiga
  backdropBox() {
    const { frame, world } = this, top = this.insets.top * this.dpr / this.zoom + 10;
    const base = frame.OY - world.heights[0] * STEP * ZS + 6;
    return { base, tall: Math.max(30, base - top) };
  }
  ridgeAt(m, ix, base, tall) {
    const hw = m.w * this.frame.W / 2 * 1.3, h = tall * m.h, u = (ix - m.x * this.frame.W) / hw, side = Math.pow(1 - Math.abs(u), m.tone ? .95 : 1.15), rough = (noise(ix * .06 + m.tone * 9, 3) - .5) * .16 + (noise(ix * .2, 7) - .5) * .03;
    return base - h * clamp(side + rough * side * 2, 0, 1) - (m.tone ? Math.sin(u * 9) * .03 * h * side : 0);
  }
  paintBackdrop(pix, zs) {
    const { frame, world } = this, bd = world.level.backdrop;
    if (!bd) return;
    const { W, H, tKind } = frame, { base, tall } = this.backdropBox();
    const tones = [[[150, 170, 190], [176, 192, 206], [198, 210, 220]], [[126, 150, 176], [156, 176, 196], [190, 204, 216]]];
    for (const m of bd) {
      const cx = m.x * W, hw = m.w * W / 2 * 1.3, h = tall * m.h, t = tones[m.tone];
      for (let ix = Math.max(0, Math.floor(cx - hw)); ix < Math.min(W, cx + hw); ix++) {
        const u = (ix - cx) / hw, ridge = this.ridgeAt(m, ix, base, tall);
        for (let iy = Math.max(0, Math.floor(ridge)); iy < Math.min(H, base); iy++) {
          const i = iy * W + ix, k = tKind[i];
          if (k === 1 || k === 2) continue;
          const fade = 1 - smooth(base - tall * .55, base, iy), depth = (iy - ridge) / h;
          // gullies run down the slope and the upper left side catches the sun
          const gully = noise(u * 16 + m.tone * 5, depth * 3), light = (u + (noise(iy * .07, m.tone * 3 + 21) - .5) * .16 < 0 ? .62 : .32) + (gully - .5) * .55 + (hash(ix, iy) - .5) * .1 - depth * .1;
          const c = t[clamp(Math.floor(light * 3 + (bayerAt(ix, iy) - .5) * .5), 0, 2)];
          pix[i] = mixc(pix[i], rgb(c[0], c[1], c[2]), fade * (.42 + .22 * m.h));
        }
      }
    }
  }
  drawMist() {
    const { frame, world } = this;
    if (!world.level.mist) return;
    const { W, H } = frame, t = this.time, white = rgb(250, 250, 248), cy = frame.OY + world.N * TH;
    for (let b = 0; b < 3; b++) {
      const yc = cy + (b - 1) * world.N * 7 + Math.sin(t * .1 + b * 2) * 12, drift = t * (2 + b * 1.4);
      for (let y = yc - 12; y < yc + 12; y++) {
        const v = 1 - Math.abs(y - yc) / 12;
        for (let x = (y & 1); x < W; x += 2) {
          const n = noise((x + drift) * .02 + b * 9, y * .07 + b * 3);
          if (n > .52) frame.blend(x, y, white, (n - .52) * 1.1 * v);
        }
      }
    }
  }

  /* ---------- baking ---------- */
  bakeLand() {
    const { frame, world } = this;
    bakeTerrain(frame, world);
    this.decorateFar();
    this.paintBackdrop(frame.tPix, null);
    for (let i = 0; i < frame.tPix.length; i++) if (!frame.tPix[i]) frame.tPix[i] = PAPER;
    this.terrainDirty = false; this.staticDirty = true;
  }
  isLive(b) {
    if (b.ruin) return false;
    const v = this.vis.get(b.id), bp = this.bpOf(b);
    return !v || v.t < 1 || bp.sway || b.type === 'kincir' || (this.liveAll && CATALOG[b.type].freq > 0);
  }
  bpOf(b) { return blueprint(b.bridge ? 'jembatan' : b.type, b.facing || b.style, b.variant, b.x, b.y); }
  anchor(b) { const foot = CATALOG[b.type].foot || 1; return [b.x + foot / 2, b.y + foot / 2, b.ground]; }
  composeStatic() {
    const { frame, world } = this;
    frame.pix.set(frame.tPix); frame.zb.set(frame.tZ);
    // worn ground between neighbours: footpaths appear where buildings stand side by side
    this.drawFootpaths();
    this.drawStreetFurniture();
    if (this.dissolve < .98) for (const p of this.plants) if (!p.sway) { frame.blit(p.s, p.x, p.y, p.z); frame.blitShadow(p.s, p.x, p.y, p.z); }
    for (const b of world.buildings) {
      const [x, y, z] = this.anchor(b);
      if (b.ruin) { this.drawRubble(b, x, y, z); continue; }
      if (this.isLive(b)) continue;
      const st = this.bpOf(b).done;
      frame.blit(st, x, y, z); frame.blitShadow(st, x, y, z);
    }
    frame.resolveShadows(frame.tZ);
    frame.bPix.set(frame.pix); frame.bZ.set(frame.zb);
    this.staticDirty = false;
  }
  // power poles and sagging cables along the roads, the sound of every Indonesian street
  drawStreetFurniture() {
    const { frame, world } = this, N = world.N;
    this.lamps = [];
    if (!world.level.roads) return;
    const poleC = rgb(70, 66, 66), wire = rgb(40, 38, 44), poles = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const b = world.buildingAt(x, y);
      if (!b || b.type !== 'jalan' || b.ruin) continue;
      if ((x + y * 3) % 2) continue;
      if (world.level.avenue) for (const [ax, ay] of [[.1, .1], [.1, .9], [.9, .1]]) {
        const tx = x + ax, ty = y + ay, g0 = world.base[world.idx(tx, ty)];
        if (hash(x * 3 + (ax * 9 | 0), y * 5 + (ay * 9 | 0)) < .5) frame.blit(tree(((x + y) & 3), .62), tx, ty, g0), frame.blitShadow(tree(((x + y) & 3), .62), tx, ty, g0);
      }
      const px = x + .92, py = y + .92, i = world.idx(px, py), z = world.base[i];
      for (let k = 0; k < 30; k++) { frame.plot(px, py, z + k / 30 * .8, poleC); }
      frame.plot(px - .04, py + .04, z + .74, poleC); frame.plot(px + .04, py - .04, z + .74, poleC);
      poles.push({ x: px, y: py, z: z + .78 });
      this.lamps.push({ x: px - .08, y: py + .04, z: z + .7 });
    }
    for (let a = 0; a < poles.length; a++) for (let c = a + 1; c < poles.length; c++) {
      const p = poles[a], q = poles[c], L = Math.hypot(p.x - q.x, p.y - q.y);
      if (L > 2.2) continue;
      for (let s = 0; s <= 60; s++) { const t = s / 60, sag = Math.sin(t * Math.PI) * .09 * L; frame.plot(lerp(p.x, q.x, t), lerp(p.y, q.y, t), lerp(p.z, q.z, t) - sag, wire); }
    }
  }
  drawFootpaths() {
    const { frame, world } = this, N = world.N, tones = [rgb(146, 118, 88), rgb(166, 138, 102), rgb(126, 100, 76)];
    const walkable = b => b && !b.ruin && !CATALOG[b.type].crop && !['saluran', 'tanggul', 'sabo', 'bakau', 'kincir'].includes(b.type) && b.done;
    const edge = (x0, y0, x1, y1) => {
      for (let k = 0; k <= 32; k++) {
        const t = k / 32, x = lerp(x0, x1, t), y = lerp(y0, y1, t), i = world.idx(x, y);
        if (i < 0) continue;
        const z = world.base[i] + .002;
        for (const [a, b] of [[0, 0], [.03, -.03], [-.03, .03]]) {
          if (hash((x * 40 | 0) + (a * 90 | 0), y * 40 | 0) > .86) continue;
          const ix = Math.floor(frame.OX + (x + a - y - b) * TW), iy = Math.floor(frame.OY + (x + a + y + b) * TH - z * ZS);
          if (ix < 0 || iy < 0 || ix >= frame.W || iy >= frame.H) continue;
          const px = iy * frame.W + ix;
          if (frame.zb[px] === frame.tZ[px]) frame.pix[px] = tones[hash(ix, iy) * 3 | 0];
        }
      }
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const a = world.buildingAt(x, y);
      if (!walkable(a)) continue;
      const r = world.buildingAt(x + 1, y), d = world.buildingAt(x, y + 1);
      if (r !== a && walkable(r) && world.tileHeight(x, y) === world.tileHeight(x + 1, y)) edge(x + 1, y + .1, x + 1, y + .9);
      if (d !== a && walkable(d) && world.tileHeight(x, y) === world.tileHeight(x, y + 1)) edge(x + .1, y + 1, x + .9, y + 1);
    }
  }
  drawRubble(b, x, y, z) {
    const { frame } = this;
    for (let k = 0; k < 90; k++) {
      const a = hash(b.id, k) * 6.283, r = Math.sqrt(hash(k, b.id + 1)) * .44, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r, h = (1 - r / .44) * .08 * hash(k, 9);
      const c = [[120, 92, 72], [92, 72, 60], [150, 110, 80], [76, 62, 56], [176, 92, 62]][k % 5];
      frame.plot(px, py, z + h + .01, hexc(c)); frame.plot(px + .025, py - .025, z + h + .01, hexc(c));
    }
  }
  buildDissolveMap() {
    const { W, H, OX } = this.frame, cy = this.frame.OY + this.world.N * TH;
    this.dmask = new Uint8Array(W * H);
    const maxD = Math.hypot(W / 2, H / 2) * 1.05;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - OX, (y - cy) * 1.5) / maxD;
      this.dmask[y * W + x] = clamp((1 - d) * 200 + hash(x >> 1, y >> 1) * 48 + bayerAt(x, y) * 7, 0, 255);
    }
  }
  // Bakes the plot alone with its cross-section on white paper
  bakeIsland() {
    const { frame, world } = this, n = frame.W * frame.H;
    const pix = new Uint32Array(n), z = new Float32Array(n), kind = new Uint8Array(n);
    bakeTerrain(frame, world, { island: true, pix, z, kind });
    if (world.level.backdrop) { for (let i = 0; i < n; i++) if (!pix[i]) { pix[i] = PAPER; z[i] = -1e7; } this.paintBackdrop(pix, z); }
    this.islandBake = { pix, z };
  }

  /* ---------- stepping the visible physics ---------- */
  stepPhysics() {
    const w = this.world, wind = w.running ? w.windAt() : [w.windBase[0] * .5, w.windBase[1] * .5];
    this.fx.step(w, wind); this.sticks.step(w); this.debris.step(w);
    this.windNow = wind;
    this.crowd.step();
    this.stepTraffic();
    for (const [id, rope] of this.ropes) if (rope.update) rope.update();
    if (w.running) this.emitWorldFx(wind);
    // ambient spray where falls land
    if (w.running && Math.random() < .5) this.spraySample();
  }
  spraySample() {
    const w = this.world, G = w.G;
    for (let t = 0; t < 8; t++) {
      const cx = 1 + (Math.random() * (G - 2) | 0), cy = 1 + (Math.random() * (G - 2) | 0), i = cy * G + cx;
      if (w.w[i] < .01) continue;
      const eta = w.gr[i] + w.w[i], dx = eta - w.gr[i + 1] - w.w[i + 1], dy = eta - w.gr[i + G] - w.w[i + G];
      if ((dx > .08 && w.qx[i] > .05) || (dy > .08 && w.qy[i] > .05)) {
        const x = (cx + 1) / C - w.mb, y = (cy + 1) / C - w.mb, z = eta - Math.max(dx, dy);
        for (let k = 0; k < 3; k++) this.fx.add(P_SPRAY, x, y, z + .02, (Math.random() - .5) * .6, (Math.random() - .5) * .6, .5 + Math.random() * .7, .4 + Math.random() * .3);
        if (Math.random() < .03) this.sfx('splash');
      }
    }
  }
  // The real cone stands behind the HUD on a phone, so the column rises from the painted peak. A backdrop entry with `plume` names it
  plumeVent() {
    const { frame, world } = this, m = (world.level.backdrop || []).find(b => b.plume != null);
    if (!m) return null;
    const { base, tall } = this.backdropBox(), hw = m.w * frame.W / 2 * 1.3, ix = Math.round(m.x * frame.W + m.plume * hw);
    const s = -2, dx = (ix - frame.OX) / TW, z = (frame.OY + s * TH - this.ridgeAt(m, ix, base, tall)) / ZS;
    return [(s + dx) / 2, (s - dx) / 2, z];
  }
  emitPlume(wind, puffs = Math.random() < .8 ? 1 : 0) {
    const v = this.plumeVent(), p = this.world.plume;
    if (!v || !p) return;
    const k = Math.min(1, p.rate / .03);
    for (let n = 0; n < puffs; n++) {
      if (Math.random() > .35 + .65 * k) continue;
      this.fx.add(P_SMOKE, v[0] + (Math.random() - .5) * .9, v[1] + (Math.random() - .5) * .9, v[2], wind[0] * .6 + (Math.random() - .5) * .7, wind[1] * .6 + (Math.random() - .5) * .7, 2.4 + Math.random() * 2, 4.5 + Math.random() * 2, 3 + k * 2 + Math.random() * 4, Math.random() < .3 ? rgb(52, 48, 52) : rgb(78, 72, 76));
    }
    if (Math.random() < .3 * k) this.fx.add(P_SPARK, v[0], v[1], v[2] + .1, (Math.random() - .5) * 2.4, (Math.random() - .5) * 2.4, 2.5 + Math.random() * 2.5, 1.1, 2);
  }
  emitWorldFx(wind) {
    const w = this.world;
    if (w.plume) {
      this.emitPlume(wind);
      for (let k = 0; k < 3; k++) {
        const N = w.N, x = -3 + Math.random() * (N + 6), y = -3 + Math.random() * (N + 6);
        const i = w.idx(x, y); if (i < 0) continue;
        this.fx.add(P_ASH, x - wind[0] * 1.5, y - wind[1] * 1.5, 2.8 + Math.random(), wind[0], wind[1], -.5, 4);
      }
    }
    // cooking smoke from homes, thin and rare
    if (Math.random() < .12) {
      const homes = w.buildings.filter(b => CATALOG[b.type].home && b.done && !b.ruin);
      if (homes.length) {
        const b = homes[Math.random() * homes.length | 0], bp = this.bpOf(b), [x, y, z] = this.anchor(b);
        this.fx.add(P_SMOKE, x + .1, y, z + bp.height, 0, 0, .25, 2.2, 1);
      }
    }
  }
  /* ---------- traffic: mopeds, angkot and trucks on the roads. They drive on the left ---------- */
  stepTraffic() {
    const w = this.world, N = w.N;
    if (!w.level.roads || (w.transit && w.running)) return;
    if (!this.cars) this.cars = [];
    const reach = w.computeRoads(.12); let roads = 0;
    for (let i = 0; i < reach.length; i++) roads += reach[i];
    const homes = w.people, want = Math.min(10, Math.floor(Math.min(roads, 3 + homes / 5)));
    const g = w.level.gate;
    if (this.cars.length < want && g && reach[g.y * N + g.x] && Math.random() < .02) {
      const k = Math.random(), dx = g.side === 'x' ? (g.x === 0 ? -1 : 1) : 0, dy = g.side === 'y' ? (g.y === 0 ? -1 : 1) : 0;
      this.cars.push({ x: g.x + .5 + dx * .9, y: g.y + .5 + dy * .9, tx: g.x, ty: g.y, px: g.x + dx, py: g.y + dy, kind: k < .65 ? 0 : k < .9 ? 1 : 2, col: k * 1000 | 0, speed: k < .65 ? .95 : .62, life: 12 + Math.random() * 16 });
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i], gx = c.tx + .5, gy = c.ty + .5, dx = gx - c.x, dy = gy - c.y, L = Math.hypot(dx, dy), s = c.speed * DT * (w.running ? 1 : .5) * (w.tileDepth(c.tx, c.ty) > .04 ? .4 : 1);
      c.life -= DT;
      if (L > s) { c.x += dx / L * s; c.y += dy / L * s; c.dx = dx / L; c.dy = dy / L; continue; }
      c.x = gx; c.y = gy;
      if (c.tx === -9) { this.cars.splice(i, 1); continue; }
      const opts = [];
      for (const [a, b] of [[c.tx + 1, c.ty], [c.tx - 1, c.ty], [c.tx, c.ty + 1], [c.tx, c.ty - 1]]) {
        if (a < 0 || b < 0 || a >= N || b >= N || !reach[b * N + a]) continue;
        if (a === c.px && b === c.py) continue;
        opts.push([a, b]);
      }
      // the gate lets a car leave when its time is over
      if (g && c.tx === g.x && c.ty === g.y && (c.life < 0 || !opts.length)) { this.cars.splice(i, 1); continue; }
      c.px = c.tx; c.py = c.ty;
      const next = opts.length ? opts[Math.random() * opts.length | 0] : [c.px, c.py];
      c.tx = next[0]; c.ty = next[1];
    }
  }
  drawTransit() {
    const t = this.world.transit, { frame, world } = this;
    if (!t || !world.running) return false;
    const { W, H, pix, zb, OX, OY } = frame, N = world.N, colors = [[60, 130, 190], [80, 170, 110], [230, 196, 70], [214, 74, 60], [230, 230, 220]];
    for (const v of t.vehicles) {
      const p = t.place(v), L = Math.hypot(p.dx, p.dy) || 1, dx = p.dx / L, dy = p.dy / L, x = p.x + dy * .13, y = p.y - dx * .13, i = world.idx(x, y);
      if (i < 0) continue;
      const tb = world.buildingAt(Math.floor(p.x), Math.floor(p.y));
      let z = world.base[i]; if (tb && tb.bridge) z = world.tileHeight(tb.x, tb.y) * STEP; if (tb && tb.type === 'layang') { const u = (p.x - tb.x - .5) * Math.abs(dx) + (p.y - tb.y - .5) * Math.abs(dy); z = world.tileHeight(tb.x, tb.y) * STEP + .42 * (1 - 4 * u * u); }
      if (v.kind === 0) {
        const sx = Math.round(OX + (x - y) * TW), sy = Math.round(OY + (x + y) * TH - z * ZS), d = depthOf(x, y, z) + .05, ink = rgb(40, 38, 44), shirt = hexc(SHIRTS[v.col % 6]), helm = hexc(colors[v.col % 5]);
        const put = (a, b, c) => { const ix = sx + a, iy = sy + b; if (ix < 0 || iy < 0 || ix >= W || iy >= H) return; const j = iy * W + ix; if (d <= zb[j]) return; zb[j] = d - b * .01; pix[j] = c; };
        put(-1, 0, ink); put(0, 0, ink); put(1, 0, ink); put(0, -1, shirt); put(0, -2, shirt); put(0, -3, helm); put(1, -3, helm); put(-1, -1, ink); put(1, -1, ink);
        if (v.still > .8 && Math.random() < .02) this.fx.add(P_SMOKE, x, y, z + .05, 0, 0, .1, .7, .8, rgb(170, 170, 170));
      } else {
        const st = vehicleStamp(v.kind === 1 ? 'bus' : 'truck', Math.abs(dx) > .5 ? 'x' : 'y', v.col);
        frame.blit(st, x, y, z + .005); frame.blitShadow(st, x, y, z);
      }
    }
    for (const tr of t.trains) {
      const line = tr.line;
      for (let c = 0; c < tr.cars; c++) {
        const s = tr.s - tr.dir * c * 1.05;
        if (s < -.6 || s > line.L + .6) continue;
        const q = line.pos(Math.max(0, Math.min(line.L, s))), o = s < 0 ? s : s > line.L ? s - line.L : 0, ax = Math.abs(q.dx) > 0 ? 'x' : 'y', sgn = 1;
        // two bogies stand on the track. The body takes its height and its slope from them
        const x = q.x + (ax === 'x' ? o * Math.sign(q.dx) : 0), y = q.y + (ax === 'y' ? o * Math.sign(q.dy) : 0), zA = line.zAt(s - BOGIE), zB = line.zAt(s + BOGIE), z = (zA + zB) / 2 + .01;
        const rise = (zB - zA) / (BOGIE * 2) * Math.sign(ax === 'x' ? q.dx : q.dy), tilt = rise * ZS / TW * (ax === 'x' ? 1 : -1);
        const outside = Math.hypot(x < 0 ? -x : x > N ? x - N : 0, y < 0 ? -y : y > N ? y - N : 0);
        if (outside > 1.8) continue;
        const kind = c === 0 ? tr.kind + ':head' : tr.kind;
        const st = vehicleStamp(kind, ax, c);
        if (Math.abs(rise) < .02) { frame.blit(st, x, y, z); frame.blitShadow(st, x, y, z); } else frame.blit(st, x, y, z, { tilt });
        // the coupler to the car in front
        if (c > 0) {
          const s0 = s + tr.dir * .46, s1 = s + tr.dir * .59;
          if (s0 > -.4 && s0 < line.L + .4) for (let u = 0; u <= 6; u++) {
            const sc = s0 + (s1 - s0) * u / 6, pc = line.pos(Math.max(0, Math.min(line.L, sc))), zc = line.zAt(sc) + .1;
            frame.plot(pc.x, pc.y, zc, rgb(38, 34, 38)); frame.plot(pc.x, pc.y, zc + .03, rgb(70, 64, 62));
          }
        }
        if (c === 0) { // smoke and slipping wheels
          if (tr.kind === 'steam' && Math.random() < (tr.slip ? .9 : .5)) this.fx.add(P_SMOKE, x, y, z + .55, tr.dir * -.3 * (ax === 'x' ? Math.sign(q.dx) : 0), tr.dir * -.3 * (ax === 'y' ? Math.sign(q.dy) : 0), .5, 1.7, 2, rgb(190, 190, 192));
          if (tr.slip && Math.random() < .6) this.fx.add(P_SPARK, x, y, z + .05, (Math.random() - .5) * .8, (Math.random() - .5) * .8, .6, .3);
        }
      }
    }
    // people waiting at stops and platforms
    for (const st of t.stops) { let n = 0; for (const c of st.waiting.values()) n += c; for (let k = 0; k < Math.min(6, n); k++) this.crowd.still(`s${st.x},${st.y},${k}`, st.x + .25 + k * .09, st.y + .68, world.tileHeight(st.x, st.y) * STEP, k * 7 + st.x * 3 + 2, 'idle'); }
    for (const st of t.stations) for (let k = 0; k < Math.min(12, st.waiting.length); k++) { const a = st.b.facing || 'x+', side = a[1] === '+' ? 1 : -1, ux = a[0] === 'x' ? -.7 + k * .13 : side * .6, uy = a[0] === 'x' ? side * .6 : -.7 + k * .13; this.crowd.still(`t${st.b.id},${k}`, st.x + ux + .5, st.y + uy + .5, world.tileHeight(st.b.x, st.b.y) * STEP + .1, k * 11 + 4, 'idle'); }
    // crossing arms and lights
    for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
      if (!world.railTile[cy * N + cx]) continue;
      const b = world.buildingAt(cx, cy);
      if (!b || b.type !== 'jalan') continue;
      const closed = t.closed[cy * N + cx], a = world.railAxis.get((cy + 50) * 1000 + cx + 50) || {}, z = world.base[world.idx(cx + .5, cy + .5)];
      const armLen = .42, lift = closed ? 0 : 1;
      for (const s of [-1, 1]) {
        const px = a.x ? cx + .5 + s * .36 : cx + .5 - s * .36, py = a.x ? cy + .5 - s * .36 : cy + .5 + s * .36;
        for (let k = 0; k < 8; k++) frame.plot(px, py, z + k / 8 * .22, rgb(60, 60, 64));
        for (let k = 0; k < 14; k++) { const u = k / 14, ax = a.x ? 0 : -s * u * armLen * (1 - lift), ay = a.x ? s * u * armLen * (1 - lift) : 0; frame.plot(px + ax, py + ay, z + .2 + u * armLen * lift, k % 4 < 2 ? rgb(214, 44, 44) : rgb(244, 240, 232)); }
        if (closed && Math.floor(this.time * 4 + s) % 2 === 0) frame.plot(px, py, z + .24, rgb(255, 60, 40));
      }
    }
    return true;
  }
  drawTraffic() {
    if (this.drawTransit()) return;
    if (!this.cars) return;
    const { frame, world } = this, { W, H, pix, zb, OX, OY } = frame;
    const colors = [[60, 130, 190], [80, 170, 110], [230, 196, 70], [214, 74, 60], [230, 230, 220]];
    for (const c of this.cars) {
      const dx = c.dx || 1, dy = c.dy || 0, off = .13; // keep left: offset from the direction of travel
      const x = c.x + dy * off, y = c.y - dx * off, i = world.idx(x, y);
      if (i < 0) continue;
      const tb = world.buildingAt(c.tx, c.ty), z = tb && tb.bridge ? world.tileHeight(c.tx, c.ty) * STEP : world.base[i], sx = Math.round(OX + (x - y) * TW), sy = Math.round(OY + (x + y) * TH - z * ZS), d = depthOf(x, y, z) + .05;
      const put = (px, py, col) => { const ix = sx + px, iy = sy + py; if (ix < 0 || iy < 0 || ix >= W || iy >= H) return; const j = iy * W + ix; if (d <= zb[j]) return; zb[j] = d + (-py) * .01; pix[j] = col; };
      const along = dx - dy, down = dx + dy; // screen direction
      if (c.kind === 0) { // a moped and its rider
        const ink = rgb(40, 38, 44), shirt = hexc(SHIRTS[c.col % 6]), helm = hexc(colors[c.col % 5]);
        put(-1, 0, ink); put(0, 0, ink); put(1, 0, ink); put(0, -1, shirt); put(0, -2, shirt); put(0, -3, helm); put(1, -3, helm); put(-1, -1, ink); put(1, -1, ink);
      } else {
        const body = c.kind === 2 ? rgb(230, 170, 60) : hexc(colors[c.col % 3]), dark = tintc(body, .7, .68, .8), glass = rgb(60, 70, 90), L = c.kind === 2 ? 4 : 3, slope = (along > 0) === (down > 0) ? 1 : -1;
        for (let a = -L; a <= L; a++) {
          const yy = Math.round(a * .5 * slope * (Math.abs(along) > .1 ? 1 : 0));
          for (let h = 0; h < 5; h++) put(a, yy - h, h === 4 ? tintc(body, 1.1, 1.1, 1.05) : h === 2 || h === 3 ? (a % 2 ? glass : body) : dark);
        }
      }
    }
  }
  walkable(x, y) {
    const w = this.world, i = w.idx(x, y);
    if (i < 0) return false;
    if (w.w[i] > .1) return false;
    return Math.abs(w.base[i] - (w.base[w.idx(x - .1, y - .1)] || 0)) < .25;
  }

  /* ---------- events from the world ---------- */
  handleEvents() {
    const w = this.world;
    for (const e of w.fx) {
      switch (e.kind) {
        case 'placed': {
          this.vis.set(e.b.id, { t: e.b.done ? 1 : 0, lastT: e.b.done ? 1 : 0 });
          this.staticDirty = true;
          if (!e.b.done) this.crowd.makeCrew(e.b);
          break;
        }
        case 'removed': { this.vis.delete(e.b.id); this.crowd.crews.delete(e.b.id); this.staticDirty = true; break; }
        case 'collapse': this.onCollapse(e.b); break;
        case 'harvest': this.onHarvest(e.b, e.y); break;
        case 'quake': this.liveAll = true; this.staticDirty = true; this.sfx('rumble'); this.cue('quake'); break;
        case 'eruption': this.sfx('eruption'); this.shake = 1.5; this.emitPlume([0, 0], 28); this.cue('eruption'); break;
        case 'crest': this.cue('flood'); break;
        case 'wave': this.cue('wave'); break;
        case 'warning': this.cue('warning:' + e.hazard); break;
        case 'kentongan': if (e.on) this.sfx('kentongan'); break;
        case 'slide': this.sfx('collapse'); this.shake = .6; break;
        case 'hungry': this.cue('hungry'); break;
        case 'trainIn': this.sfx('train_horn'); break;
        case 'crossing': this.sfx('crossing_bell'); break;
        case 'trainStop': this.sfx('bus_hiss'); break;
        case 'trainStall': this.sfx('steam_chuff'); this.cue('stall'); break;
        case 'cargo': this.floats.push({ x: e.x, y: e.y, z: 1, t: 0, text: '+' + (world_freight(this.world)), color: SIGNAL }); this.sfx('harvest'); break;
        case 'lostOne': this.fx.add(P_SPRAY, e.x, e.y, 1, 0, 0, .8, .4); break;
        case 'finished': { const v = this.vis.get(e.b.id); if (v) v.t = 1; this.crowd.crews.delete(e.b.id); this.staticDirty = true; break; }
        case 'monthEnd': this.cue('monthEnd', e.log); break;
      }
    }
    w.fx.length = 0;
    if (w.terrainChanged || w.dirtyAll) { this.terrainDirty = true; w.dirty.length = 0; w.terrainChanged = false; w.dirtyAll = false; this.staticDirty = true; }
    if (w.dirty.length) { // rebake only the screen columns over the changed tiles
      if (!this.terrainDirty) {
        let a = 1e9, b = -1e9;
        for (const [x0, y0, x1, y1] of w.dirty) { a = Math.min(a, this.frame.OX + (x0 - y1) * TW); b = Math.max(b, this.frame.OX + (x1 - y0) * TW); }
        bakeTerrain(this.frame, w, { x0: clamp(Math.floor(a) - 2, 0, this.frame.W - 1), x1: clamp(Math.ceil(b) + 2, 0, this.frame.W - 1) });
        this.staticDirty = true;
      }
      w.dirty.length = 0;
    }
    if (!w.quake && this.liveAll) { this.liveAll = false; this.staticDirty = true; }
  }
  onCollapse(b) {
    const [x, y, z] = this.anchor(b), bp = this.bpOf(b);
    this.crowd.startle(x, y);
    this.debris.shatter(bp.done, x, y, z, this.world, CATALOG[b.type].floor < .1 ? .8 : 1.2);
    this.fx.burst(P_DUST, x, y, z + .2, 22, .7, 1.1, 3);
    this.fx.burst(P_CHIP, x, y, z + .4, 26, 1.2, 1.6, 1);
    for (const s of bp.sticks.slice(0, 6)) this.sticks.add(s[0], s[1], x, y, z, [(Math.random() - .5) * 2, (Math.random() - .5) * 2], [rgb(150, 124, 76), rgb(190, 166, 100)], 4);
    this.vis.delete(b.id); this.crowd.crews.delete(b.id);
    this.sfx('collapse'); this.shake = Math.max(this.shake, .5);
    this.staticDirty = true;
    this.floats.push({ x, y, z: z + .8, t: 0, text: 'X', color: BAD });
  }
  onHarvest(b, y) {
    const [x, yy, z] = this.anchor(b);
    this.floats.push({ x, y: yy, z: z + .5, t: 0, text: '+' + y, color: SIGNAL });
    for (let k = 0; k < 18; k++) this.fx.add(P_CONFETTI, x + (Math.random() - .5) * .8, yy + (Math.random() - .5) * .8, z + .1, (Math.random() - .5) * .3, (Math.random() - .5) * .3, .9 + Math.random() * .5, 1, 1, rgb(232, 196, 90));
    this.sfx('harvest');
  }

  /* ---------- erection ---------- */
  updateVisual(b, dt) {
    let v = this.vis.get(b.id);
    if (!v) { v = { t: b.done ? 1 : 0, lastT: b.done ? 1 : 0 }; this.vis.set(b.id, v); }
    if (b.done && v.t >= 1) return v;
    let target = .2;
    if (b.prog > 0) target = .2 + .8 * Math.min(1, b.prog / (b.months > 1 ? .92 : .78));
    if (b.done) target = 1;
    const rate = target >= v.t ? (this.world.running ? .42 : .2) : 0;
    v.lastT = v.t;
    v.t = Math.min(target, v.t + rate * dt);
    const bp = this.bpOf(b), [x, y, z] = this.anchor(b);
    for (const p of bp.parts) {
      if (v.lastT < p.t0 && v.t >= p.t0) {
        if (p.sfx) this.sfx(p.sfx);
        this.fx.add(P_DUST, x + (Math.random() - .5) * .5, y + (Math.random() - .5) * .5, z + .02, 0, 0, .12, .6, 1.4);
      }
      if (p.mode === 'drop' && v.lastT < p.t1 - (p.t1 - p.t0) * .55 && v.t >= p.t1 - (p.t1 - p.t0) * .55) {
        // the part lands: dust and chips where it sits
        this.fx.burst(P_DUST, x, y, z + bp.height * .4, 5, .5, .7, 1.8);
        this.fx.burst(P_CHIP, x, y, z + bp.height * .5, 4, .8, .7, 1);
      }
    }
    if (v.lastT < .85 && v.t >= .85) { this.flags.push({ b, x, y, z, ridge: bp.ridge, t: 0 }); this.sfx('cheer'); this.crowd.cheerAt(x, y); }
    if (v.lastT < .92 && v.t >= .92) { // strike the scaffold: the poles come down
      for (const s of bp.sticks) this.sticks.add(s[0], s[1], x, y, z, [(Math.random() - .5) * 1.2, (Math.random() - .5) * 1.2], [rgb(150, 124, 76), rgb(190, 166, 100)]);
      if (bp.sticks.length) this.sfx('lash');
    }
    if (v.t >= 1) { this.staticDirty = true; this.crowd.crews.delete(b.id); this.fx.burst(P_DUST, x, y, z + .02, 6, .5, .6, 2); }
    return v;
  }
  drawLive(b) {
    const { frame, world } = this, bp = this.bpOf(b), v = this.vis.get(b.id), [x, y, z] = this.anchor(b);
    const wind = this.windNow || [0, 0];
    if (bp.sway && (!v || v.t >= 1)) {
      const k = (wind[0] - wind[1]) * .05 + Math.sin(this.time * 2 + b.x + b.y) * .018 * (1 + Math.abs(wind[0]));
      frame.blit(bp.done, x, y, z, { shear: k });
      frame.blitShadow(bp.done, x, y, z); return;
    }
    if (!v || v.t >= 1) {
      const drift = b.drift || 0, shear = clamp(drift * 1.7, -.5, .5);
      frame.blit(bp.done, x, y, z, { shear }); frame.blitShadow(bp.done, x, y, z);
      if (b.type === 'kincir') this.drawWheel(b, x, y, z);
      return;
    }
    const t = v.t, sway = (b.drift || 0) * 1.7 + Math.sin(this.time * 1.6 + b.id) * (wind[0] * .004);
    for (const p of bp.parts) {
      if (t < p.t0) continue;
      if (p.scaffold && t >= .92) continue;
      const q = clamp((t - p.t0) / Math.max(.001, p.t1 - p.t0), 0, 1), st = p.stamp;
      if (p.mode === 'rise') frame.blit(st, x, y, z, { rows: q * st.h, shear: sway });
      else if (p.mode === 'pop') frame.blit(st, x, y, z, { rows: Math.min(st.h, settle(q) * st.h * 1.02), shear: sway });
      else { // drop: lowered from above, settles with a small bounce
        const lift = (1 - settle(q)) * (p.hoisted ? 40 : 20);
        frame.blit(st, x, y, z, { dy: -Math.max(0, lift) | 0, shear: sway });
        if (p.hoisted && bp.hoistRope !== false && q < 1) this.drawHoist(b, p, x, y, z, q, lift);
      }
      if (q > .5) frame.blitShadow(st, x, y, z);
    }
    if (b.type === 'kincir' && t > .6) this.drawWheel(b, x, y, z);
    this.drawCrew(b, x, y, z, bp, t);
  }
  drawHoist(b, p, x, y, z, q, lift) {
    // the derrick: a pole with a rope down to the load. The load swings as a pendulum and comes to rest
    const { frame } = this, bp = this.bpOf(b), h = bp.hoist;
    if (!h) return;
    const top = [x + h.x, y + h.y, z + h.top + .3];
    const load = [x + (p.hx || 0) + Math.sin(this.time * 3.1) * (1 - q) * .09, y + (p.hy || 0) + Math.cos(this.time * 2.3) * (1 - q) * .05, z + bp.height * .55 + lift / ZS];
    let rope = this.ropes.get(b.id);
    if (!rope) { rope = new Rope(top, load, 7, 1.01); this.ropes.set(b.id, rope); }
    rope.step(top, load, this.windNow || [0, 0]);
    rope.draw(frame, rgb(226, 214, 180));
  }
  drawCrew(b) { this.crowd.drawCrew(b.id); }
  groundAt(x, y) { const i = this.world.idx(x, y); return i < 0 ? 0 : this.world.base[i]; }
  drawWheel(b, x, y, z) {
    const { frame } = this, R = .36, cz = z + .42, a = b.angle || 0, wood = rgb(120, 92, 66), wet = rgb(150, 190, 200);
    for (let k = 0; k < 8; k++) {
      const ang = a + k / 8 * 6.283, ca = Math.cos(ang), sa = Math.sin(ang);
      for (let s = 0; s <= 12; s++) { const r = R * s / 12; frame.plot(x + ca * r, y, cz + sa * r, wood); frame.plot(x + ca * r, y + .1, cz + sa * r, wood); }
      for (let s = 0; s <= 4; s++) { const yy = .1 * s / 4; frame.plot(x + ca * R, y + yy, cz + sa * R, k % 2 ? rgb(172, 144, 96) : wet); }
    }
    for (let s = 0; s < 60; s++) { const ang = s / 60 * 6.283; frame.plot(x + Math.cos(ang) * R, y, cz + Math.sin(ang) * R, wood); frame.plot(x + Math.cos(ang) * R, y + .1, cz + Math.sin(ang) * R, wood); }
    if (b.lift && this.world.running && Math.random() < .3) this.fx.add(P_SPRAY, x + Math.cos(a) * R, y + .05, cz + Math.sin(a) * R, 0, 0, 0, .4);
  }
  drawCrops(b) {
    const { frame, world } = this, N = 7, stage = b.done ? b.growth : 0, v = this.vis.get(b.id);
    if (v && v.t < .35) return;
    const reveal = v ? clamp((v.t - .35) / .5, 0, 1) : 1;
    const H0 = [2, 3, 4, 5][Math.min(3, stage)];
    const pal = [[[132, 186, 86], [160, 206, 96]], [[92, 156, 76], [130, 186, 86]], [[86, 142, 66], [132, 170, 72]], [[188, 166, 70], [226, 196, 90]]][Math.min(3, stage)].map(hexc);
    const dark = tintc(pal[0], .7, .72, .8);
    const wind = this.windNow || [.3, 0], gustBase = Math.hypot(wind[0], wind[1]);
    for (let a = 0; a < N; a++) for (let c = 0; c < N; c++) {
      if (hash(a * 3 + b.id, c) > reveal) continue;
      const px = b.x + (a + 1) / (N + 1), py = b.y + (c + 1) / (N + 1), base = world.base[world.idx(px, py)];
      const sway = Math.sin(this.time * 2.4 - (px + py) * 1.6) * gustBase * 1.5;
      const sx = frame.OX + (px - py) * TW, sy = frame.OY + (px + py) * TH - base * ZS, d = depthOf(px, py, base) + .01;
      for (let k = 0; k < H0; k++) {
        const ix = Math.floor(sx + sway * (k / H0)), iy = Math.floor(sy) - k;
        if (ix < 0 || iy < 0 || ix >= frame.W || iy >= frame.H) continue;
        const i = iy * frame.W + ix;
        if (d <= frame.zb[i]) continue;
        frame.pix[i] = k === H0 - 1 ? pal[1] : k < 1 ? dark : pal[0];
        frame.zb[i] = d + k * .005;
      }
    }
    if (stage < 3 && this.world.running && hash(b.id, 2) < .6) { // a farmer works the row
      const t = this.time * .06 + b.id, px = b.x + .2 + (Math.sin(t) * .5 + .5) * .6, py = b.y + .2 + (Math.sin(t * .7 + 1) * .5 + .5) * .6;
      this.crowd.still(`f${b.id}`, px, py, world.base[world.idx(px, py)], b.id * 5 + 3, 'farm', q => { q.hat = 'caping'; q.hatC = hexc(HATS[b.id % 3]); q.skirt = null; q.tail = 0; q.tailPts = null; q.legs = 3; q.torso = 3; q.kind = 'adult'; q.crouch = 1.4; });
    }
  }
  drawTufts() {
    const { frame } = this, { W, H, pix, zb, OX, OY } = frame, wind = this.windNow || [.3, 0], w = this.world;
    const lit = [rgb(92, 142, 66), rgb(112, 158, 70), rgb(138, 174, 80)], top = [rgb(150, 182, 86), rgb(166, 192, 96), rgb(180, 200, 104)];
    const t = Math.floor(this.time * 8) / 8, gust = (wind[0] - wind[1]) * .9;
    for (const a of this.tufts) {
      const i0 = w.idx(a.x, a.y), g = w.base[i0];
      if (w.buildingAt(Math.floor(a.x), Math.floor(a.y))) continue;
      if (w.w[i0] > .04) continue;
      const sx = OX + (a.x - a.y) * TW, sy = OY + (a.x + a.y) * TH - g * ZS, d = depthOf(a.x, a.y, g) + .001;
      const ph = Math.sin(t * 1.2 + a.phase) + .5 * Math.sin(t * 2.6 + a.phase * 2);
      for (let k = 1; k <= a.h; k++) {
        const ix = Math.round(sx + (ph * .9 + gust) * k / 3), iy = Math.floor(sy) - k;
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
        const i = iy * W + ix;
        if (d <= zb[i] - .02) continue;
        pix[i] = k === a.h ? (a.t === 2 ? rgb(240, 200, 84) : a.t === 1 ? rgb(250, 246, 226) : top[a.shade]) : lit[a.shade];
      }
    }
  }
  drawBoat(b) {
    const { frame, world } = this, sideOf = () => {
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) { const i = world.idx(b.x + .5 + dx, b.y + .5 + dy); if (i >= 0 && world.w[i] > .05) return [dx, dy]; }
      return [0, 1];
    };
    const [dx, dy] = sideOf(), x = b.x + .5 + dx * .62, y = b.y + .5 + dy * .62, i = world.idx(x, y), s = i < 0 ? 0 : world.gr[i] + world.w[i];
    const bob = Math.sin(this.time * 1.7 + b.id) * .012, roll = i < 0 ? 0 : (world.w[i + 1] - world.w[i - 1]) * 1.2;
    frame.blit(boatStamp(), x, y, s + .01 + bob, { shear: clamp(roll + Math.sin(this.time * 1.3) * .03, -.3, .3) });
  }
  drawKite(b) {
    const { frame, world } = this, wind = world.windBase, L = Math.hypot(wind[0], wind[1]) || 1, ux = wind[0] / L, uy = wind[1] / L, h = b.kite;
    if (h < .2 && !world.running) return;
    const hand = [b.x + .5, b.y + .5, b.ground + .25], lift = h * .34;
    const flap = Math.sin(this.time * 2.3 + b.id) * .1, cx = b.x + .5 + ux * lift * .9 + flap * uy, cy = b.y + .5 + uy * lift * .9 - flap * ux, cz = b.ground + .25 + lift + Math.sin(this.time * 1.7 + b.id * 2) * .06;
    let rope = this.ropes.get('k' + b.id);
    if (!rope) { rope = new Rope(hand, [cx, cy, cz], 9, 1.012); this.ropes.set('k' + b.id, rope); }
    rope.step(hand, [cx, cy, cz], this.windNow || [0, 0]);
    rope.draw(frame, rgb(244, 240, 226));
    this.crowd.still(`k${b.id}`, b.x + .5, b.y + .5, b.ground, b.id * 18 + 2, 'stretch');
    // the kite: a diamond with a tail, drawn over everything because it flies high
    const sx = Math.floor(frame.OX + (cx - cy) * TW), sy = Math.floor(frame.OY + (cx + cy) * TH - cz * ZS), col = [rgb(214, 62, 54), rgb(250, 208, 70), rgb(60, 120, 190), rgb(240, 240, 230)][b.id % 4], c2 = rgb(240, 240, 230);
    for (let r = -3; r <= 3; r++) for (let q = -(3 - Math.abs(r)); q <= 3 - Math.abs(r); q++) frame.put(sx + q, sy + r, r < 0 ? col : (q === 0 ? c2 : tintc(col, .8, .78, .84)));
    for (let k = 0; k < 7; k++) frame.put(sx + Math.round(Math.sin(this.time * 4 + k) * (k * .35) - ux * k * .4), sy + 4 + k, k % 2 ? col : c2);
  }
  drawFlags() {
    const { frame } = this, wind = this.windNow || [.3, 0];
    for (let k = this.flags.length - 1; k >= 0; k--) {
      const f = this.flags[k];
      f.t += 1 / 30;
      if (f.t > 9 || f.b.ruin) { this.flags.splice(k, 1); continue; }
      const px = f.x + f.ridge[0], py = f.y + f.ridge[1], pz = f.z + f.ridge[2], rise = clamp(f.t / .6, 0, 1), H0 = 9 * rise;
      const sx = Math.floor(frame.OX + (px - py) * TW), sy = Math.floor(frame.OY + (px + py) * TH - pz * ZS), dir = (wind[0] - wind[1]) >= 0 ? 1 : -1, speed = Math.min(1, Math.hypot(wind[0], wind[1]) + .25);
      for (let r = 0; r < H0; r++) frame.put(sx, sy - r, rgb(226, 206, 150));
      for (let c = 1; c <= 7; c++) {
        const droop = (1 - speed) * c * .5, wave = Math.sin(this.time * 8 - c * .9) * (c / 7) * 1.2 * speed;
        const ox = sx + dir * c, oy = Math.round(sy - H0 + droop + wave);
        for (let r = 0; r < 4; r++) frame.put(ox, oy + r, r < 2 ? rgb(214, 44, 44) : rgb(244, 240, 232));
      }
    }
  }
  drawFloats() {
    const { frame } = this;
    for (let k = this.floats.length - 1; k >= 0; k--) {
      const f = this.floats[k];
      f.t += 1 / 30;
      if (f.t > 1.8) { this.floats.splice(k, 1); continue; }
      const sx = Math.floor(frame.OX + (f.x - f.y) * TW), sy = Math.floor(frame.OY + (f.x + f.y) * TH - f.z * ZS - f.t * 12);
      this.text(f.text, sx, sy, f.color);
    }
  }
  text(s, x, y, color) {
    const { frame } = this, w = s.length * 4;
    let cx = x - (w >> 1);
    for (const ch of s) {
      const g = FONT[ch];
      if (g) for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r * 3 + c] === '1') {
        for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) frame.put(cx + c + a, y + r + b, INK);
      }
      if (g) for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r * 3 + c] === '1') frame.put(cx + c, y + r, color);
      cx += 4;
    }
  }

  /* ---------- grading ---------- */
  gradeNow() {
    const w = this.world, W = w.running ? w.weather : w.weatherNow();
    let u = w.running ? w.t / MONTH_SECONDS : -1;
    let gain = [1.01, 1, .98], lift = [0, 0, 0], night = 0, sat = 1;
    if (u >= 0) {
      const dusk = smooth(.62, .8, u) * (1 - smooth(.86, .95, u)), dark = smooth(.84, .94, u);
      gain = [lerp(lerp(1, 1.06, dusk), .36, dark), lerp(lerp(1, .84, dusk), .42, dark), lerp(lerp(1, .68, dusk), .66, dark)];
      lift = [lerp(0, 8, dusk) + dark * 5, lerp(0, 2, dusk) + dark * 6, dark * 16];
      night = dark;
    }
    const wet = clamp(W.rain / .016, 0, 1);
    if (W.rain > 0 && u >= 0) {
      const k = .94 - wet * .26;
      gain = [gain[0] * k, gain[1] * (k + .02), gain[2] * (k + .07)]; sat = .94 - wet * .3;
      night = Math.max(night, wet * .35);
    } else if (W.rain > 0) { gain = [.98, .99, 1.01]; }
    this.ashDim += ((w.plume ? Math.min(1, w.plume.rate / .03) : 0) - this.ashDim) * .015;
    if (this.ashDim > .005) { const k = this.ashDim; gain = [gain[0] * (1 - .17 * k), gain[1] * (1 - .2 * k), gain[2] * (1 - .22 * k)]; sat *= 1 - .22 * k; }
    if (W.id === 'berawan') { gain = [gain[0] * .94, gain[1] * .95, gain[2] * .98]; sat = .92; }
    if (this.lightning > 0) { const f = this.lightning * 70; lift = [lift[0] + f, lift[1] + f, lift[2] + f * 1.1]; }
    if (this.dissolve > 0) { const k = this.dissolve; gain = [lerp(gain[0], 1, k), lerp(gain[1], 1, k), lerp(gain[2], 1, k)]; lift = [lift[0] * (1 - k), lift[1] * (1 - k), lift[2] * (1 - k)]; sat = lerp(sat, 1, k); night *= 1 - k; }
    this.frame.setGrade(gain, lift, sat);
    this.grade.night = night;
  }

  /* ---------- the frame ---------- */
  render(dt) {
    const { frame, world } = this;
    this.time += dt;
    this.handleEvents();
    if (this.terrainDirty) this.bakeLand();
    if (this.staticDirty) this.composeStatic();
    frame.restore();
    drawFarWater(frame, this.time);
    drawFluids(frame, world, this.time);
    this.drawTufts();
    for (const p of this.plants) if (p.sway && this.dissolve < .98) {
      const k = this.windNow ? (this.windNow[0] - this.windNow[1]) * .035 : .01;
      frame.blit(p.s, p.x, p.y, p.z, { shear: k + Math.sin(this.time * 1.4 + p.phase) * .02 });
    }
    for (const b of world.buildings) {
      if (b.ruin) continue;
      this.updateVisual(b, dt);
      if (CATALOG[b.type].crop) this.drawCrops(b);
      if (b.type === 'dermaga' && b.done) this.drawBoat(b);
      if (b.type === 'pompa' && b.pumping && world.running) { const [px, py, pz] = this.anchor(b); for (let k = 0; k < 2; k++) this.fx.add(P_SPRAY, px + .5, py, pz + .22, .9 + Math.random() * .4, (Math.random() - .5) * .2, .3, .5); if (Math.random() < .08) this.fx.add(P_SMOKE, px - .18, py - .14, pz + .6, 0, 0, .3, 1.4, 1, rgb(90, 88, 90)); }
      if (this.isLive(b)) this.drawLive(b);
      if (b.type === 'lapangan' && (b.done || b.prog > .6)) this.drawKite(b);
    }
    this.crowd.draw();
    this.drawTraffic();
    frame.resolveShadows(frame.zb); // shadows from things that move, on what they touch
    this.sticks.draw(frame); this.debris.draw(frame); this.fx.draw(frame);
    this.drawFlags();
    this.drawOverlay();
    this.applyDissolve();
    this.gradeNow();
    frame.applyGrade();
    this.drawNightLights();
    this.drawMist();
    this.drawRain(dt);
    this.drawOverlayFront();
    this.drawFloats();
    this.applyShake();
    frame.present();
  }
  applyDissolve() {
    const k = this.dissolve;
    if (k <= 0) return;
    const { frame, world } = this;
    if (!this.islandBake) this.bakeIsland();
    const { pix, zb, tZ } = frame, ip = this.islandBake.pix, iz = this.islandBake.z, dm = this.dmask, th = (1 - k) * 255;
    for (let i = 0, n = pix.length; i < n; i++) {
      if (dm[i] < th) continue;
      if (zb[i] !== frame.bZ[i] && zb[i] !== tZ[i]) continue; // something living stands here
      if (iz[i] > -1e8) { if (Math.abs(iz[i] - tZ[i]) > .001) pix[i] = ip[i]; } else if (zb[i] === tZ[i] || frame.tKind[i] !== 0) pix[i] = PAPER;
    }
  }
  drawNightLights() {
    const n = this.grade.night;
    if (n < .12) return;
    const { frame, world } = this, warm = rgb(255, 204, 120);
    this.crowd.lights();
    for (const l of this.lamps || []) {
      const sx = Math.floor(frame.OX + (l.x - l.y) * TW), sy = Math.floor(frame.OY + (l.x + l.y) * TH - l.z * ZS);
      for (let dy = 0; dy <= 18; dy++) { const w = dy * .55; for (let dx = -w; dx <= w; dx++) if ((sx + dx + sy + dy) & 1) frame.blend(sx + dx, sy + dy, rgb(255, 216, 150), (1 - dy / 18) * .28 * n); }
      frame.put(sx, sy, rgb(255, 240, 200)); frame.put(sx + 1, sy, rgb(255, 240, 200));
    }
    for (const b of world.buildings) {
      if (b.ruin) continue;
      const v = this.vis.get(b.id);
      if (!v || v.t < 1) continue;
      const bp = this.bpOf(b), [x, y, z] = this.anchor(b);
      for (const l of bp.lights) {
        const sx = Math.floor(frame.OX + (x + l[0] - y - l[1]) * TW), sy = Math.floor(frame.OY + (x + l[0] + y + l[1]) * TH - (z + l[2]) * ZS);
        for (let dy = -3; dy <= 3; dy++) for (let dx = -4; dx <= 4; dx++) {
          const dd = dx * dx / 16 + dy * dy / 9;
          if (dd > 1) continue;
          frame.blend(sx + dx, sy + dy, warm, (1 - dd) * .3 * n);
        }
        frame.put(sx, sy, warm); frame.put(sx + 1, sy, warm); frame.put(sx, sy + 1, warm); frame.put(sx + 1, sy + 1, warm);
      }
    }
  }
  drawRain(dt) {
    const { frame, world } = this, W = world.running ? world.weather : null, rate = W ? W.rain : 0;
    const want = Math.floor(rate * 15000 * (frame.W * frame.H) / 330000), drops = this.rainDrops;
    while (drops.length < want) drops.push({ x: Math.random() * frame.W, y: Math.random() * frame.H, s: .75 + Math.random() * .5, end: Math.random() });
    if (drops.length > want) drops.length = want;
    if (!drops.length) { if (rate <= 0) this.lightning = 0; return; }
    const wind = this.windNow || [0, 0], slant = clamp((wind[0] - wind[1]) * 1.1, -2, 2), col = rgb(206, 224, 236);
    for (const d of drops) {
      d.y += d.s * 330 * dt; d.x += slant * 60 * dt * d.s;
      if (d.y > frame.H * (.4 + d.end * .7)) { // a raindrop lands: a small ring
        frame.blend(d.x, d.y, col, .8); frame.blend(d.x - 1, d.y, col, .4); frame.blend(d.x + 1, d.y, col, .4);
        d.y = -8 - Math.random() * 40; d.x = Math.random() * frame.W;
        continue;
      }
      const L = 4 + d.s * 3 | 0;
      for (let k = 0; k < L; k++) frame.blend(d.x - slant * k * .3, d.y - k, col, .42 - k * .04);
    }
    if (rate >= .012) {
      if (this.lightning <= 0 && Math.random() < .003) { this.lightning = 1; this.sfx('thunder'); } else this.lightning = Math.max(0, this.lightning - dt * 4);
    } else this.lightning = 0;
  }
  applyShake() {
    const { frame, world } = this, { W, H, pix } = frame;
    let amp = this.shake;
    this.shake = Math.max(0, this.shake - .03);
    if (world.quake) { const t = this.time; amp += Math.abs(world.groundAccel(world.N / 2, world.N / 2)) * .35; }
    if (amp < .15) return;
    // each row slides sideways: the ground's wave passing under the picture
    const t = this.time * 22;
    for (let y = 0; y < H; y++) {
      const dx = Math.round(Math.sin(t + y * .05) * amp + (Math.random() - .5) * amp * .5);
      if (!dx) continue;
      const a = y * W;
      if (dx > 0) pix.copyWithin(a + dx, a, a + W - dx); else pix.copyWithin(a, a - dx, a + W);
    }
  }

  /* ---------- plan overlay ---------- */
  drawOverlay() {
    const { frame, world, overlay } = this;
    if (overlay.ghost) {
      const g = overlay.ghost, foot = CATALOG[g.type].foot || 1, z = world.heights[g.y * world.N + g.x] * STEP;
      frame.blit(cardArt(g.type, world.level.style), g.x + foot / 2, g.y + foot / 2, z + .002);
    }
  }
  diamond(x, y, foot, color, fill) {
    const { frame, world } = this, N = world.N, z = world.heights[clamp(y, 0, N - 1) * N + clamp(x, 0, N - 1)] * STEP;
    const cx = frame.OX + (x - y) * TW, top = frame.OY + (x + y) * TH - z * ZS, hw = TW * foot, hh = TH * foot;
    for (let a = -hw; a <= hw; a++) {
      const span = (1 - Math.abs(a) / hw) * hh, ax = Math.round(cx + a), y0 = Math.round(top + hh - span), y1 = Math.round(top + hh + span);
      if (color) { if (a & 1 || Math.abs(a) === hw) { frame.put(ax, y0, color); frame.put(ax, y1, color); } }
      if (fill != null) for (let iy = y0; iy <= y1; iy++) if ((ax + iy) % 2 === 0) frame.blend(ax, iy, fill[0], fill[1]);
    }
  }
  drawOverlayFront() {
    const { frame, world, overlay } = this, N = world.N;
    if (world.running) return;
    if (overlay.forecast) {
      const fc = overlay.forecast;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const d = fc.depth[y * N + x];
        if (d > .03) this.diamond(x, y, 1, null, [rgb(54, 130, 220), clamp(.25 + d * 1.6, 0, .8)]);
      }
      for (const a of fc.alerts) {
        const X = frame.OX + (a.x + .5 - a.y - .5) * TW, Y = frame.OY + (a.x + a.y + 1) * TH - world.heights[a.y * N + a.x] * STEP * ZS - 12;
        this.bang(X | 0, Y | 0, a.kind === 'dry' ? rgb(120, 190, 240) : SIGNAL);
      }
    }
    if (overlay.showGrid) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const bad = overlay.isValid && !overlay.isValid(x, y);
        if (!bad) this.diamond(x, y, 1, rgb(255, 255, 255), null);
      }
    }
    if (overlay.tile) {
      const [x, y] = overlay.tile, foot = overlay.foot || 1;
      this.diamond(x, y, foot, overlay.valid ? SIGNAL : BAD, [overlay.valid ? SIGNAL : BAD, .34]);
    }
    if (overlay.chips) {
      const c = overlay.chips, Y = c.y;
      this.text(c.text, c.x, Y, SIGNAL);
    }
  }
  bang(x, y, color) {
    for (const [a, b] of [[0, 0], [0, 1], [0, 2], [0, 3], [0, 5]]) { for (const [p, q] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) this.frame.put(x + a + p, y + b + q, INK); }
    for (const [a, b] of [[0, 0], [0, 1], [0, 2], [0, 3], [0, 5]]) this.frame.put(x + a, y + b, color);
  }
}
