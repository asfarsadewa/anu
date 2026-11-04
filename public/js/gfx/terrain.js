// The land. Each screen column walks from near to far over the heightfield, so a full bake is cheap.
// The simulation grid gives heights inside the plot. A coarser grid gives the far land out to the canvas edges.
import { clamp, lerp, hash, noise, smooth, depthOf, TW, TH, ZS, SUN_X, SUN_Y } from '../core.js';
import { C, M, STEP, farAt } from '../sim/world.js';
import { rgb, bayerAt, mixc, tintc } from './frame.js';

const list = a => a.map(c => rgb(c[0], c[1], c[2]));
const GRASS = list([[44, 88, 62], [58, 108, 62], [82, 130, 62], [112, 152, 68], [146, 172, 82]]);
const GRASS_B = list([[46, 92, 60], [62, 114, 58], [88, 136, 60], [120, 158, 66], [156, 178, 80]]);
const FOREST = list([[34, 80, 72], [48, 106, 74], [70, 134, 76], [104, 160, 84], [150, 188, 100]]);
const FOREST_B = list([[52, 92, 66], [78, 120, 66], [112, 148, 70], [150, 174, 84], [190, 200, 110]]);
const FARPADDY = list([[92, 148, 92], [124, 176, 98], [160, 198, 110], [204, 226, 156], [236, 246, 222]]);
const SOIL = list([[92, 62, 52], [112, 78, 58], [132, 96, 68], [152, 116, 80], [172, 138, 96]]);
const SAND = list([[172, 146, 110], [196, 170, 128], [214, 192, 148], [230, 212, 170], [242, 230, 198]]);
const ROCK = list([[58, 52, 72], [74, 68, 84], [92, 84, 100], [110, 102, 114], [130, 122, 130]]);
const MOSS = list([[48, 82, 58], [66, 102, 60], [86, 120, 64]]);
const PADDYMUD = list([[62, 54, 56], [76, 64, 58], [92, 78, 64]]);
const BUNDT = list([[84, 92, 58], [100, 112, 58], [122, 134, 62], [150, 154, 72]]);
const CANALT = list([[70, 58, 56], [86, 72, 62], [100, 86, 72]]);
const LEVEET = list([[108, 100, 96], [128, 120, 110], [148, 140, 124], [168, 160, 140]]);
const SEABED = list([[120, 132, 120], [140, 150, 128], [164, 168, 136], [190, 186, 148]]);
const FERTILE = list([[50, 44, 50], [64, 56, 56], [78, 68, 62], [94, 82, 70], [70, 96, 58]]);
const RIVERBED = list([[86, 90, 88], [104, 106, 98], [124, 122, 108]]);
const FIELDT = list([[96, 134, 66], [116, 150, 70], [140, 164, 78], [164, 170, 94]]);
const PATHT = list([[128, 100, 76], [146, 118, 88], [166, 138, 102], [182, 156, 118]]);
const ASPHALT = list([[66, 64, 70], [78, 76, 80], [90, 88, 90], [102, 100, 100]]);
const WALK = list([[150, 142, 130], [168, 160, 146], [186, 178, 162]]);
const URBANT = list([[116, 104, 80], [136, 122, 92], [154, 140, 104], [170, 158, 118], [186, 176, 134]]);
const URBANG = list([[82, 118, 66], [100, 134, 70], [122, 150, 76]]);
const PARKT = list([[70, 130, 70], [88, 150, 74], [112, 168, 82], [140, 182, 92]]);
const FARTOWN = list([[148, 134, 112], [164, 150, 124], [178, 166, 138], [192, 180, 152]]);
const FARROAD = rgb(138, 132, 124);
const BALLAST = list([[120, 112, 104], [138, 130, 120], [156, 148, 136]]);
const SLEEPER = rgb(92, 70, 56), STEEL = rgb(186, 190, 196);
const RUBBLE = list([[78, 70, 72], [100, 90, 86], [122, 110, 100]]);
const STRATA = [list([[92, 66, 56], [108, 78, 62], [122, 92, 72]]), list([[74, 60, 66], [90, 72, 74], [106, 86, 84]]), list([[56, 50, 72], [68, 62, 82], [84, 76, 92]])];
const BLOOMS = [rgb(246, 242, 226), rgb(240, 196, 84), rgb(226, 120, 140), rgb(170, 140, 220)];
const PAPER = rgb(255, 253, 247);
const pick = (t, v, ix, iy) => t[clamp(Math.floor(v * t.length + (bayerAt(ix, iy) - .5) * .7), 0, t.length - 1)];

const FAR_R = 38, FAR_RES = 4;
const WATER = list([[34, 78, 112], [46, 96, 130], [60, 118, 150], [84, 144, 170], [124, 178, 196], [190, 224, 228]]);

// the far land is level data: it is the same for every screen size
export function farGrid(world) {
  if (world._far) return world._far;
  const level = world.level, N = level.N, S = (2 * FAR_R + N) * FAR_RES, h = new Float32Array(S * S), m = new Uint8Array(S * S);
  const sea = world.sea;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const wx = (x + .5) / FAR_RES - FAR_R, wy = (y + .5) / FAR_RES - FAR_R;
    let [fh, fm] = farAt(world, wx, wy);
    h[y * S + x] = fh; m[y * S + x] = fm;
  }
  let zmax = 0;
  for (let i = 0; i < S * S; i++) if (h[i] > zmax) zmax = h[i];
  world._far = { h, m, S, zmax, sea };
  return world._far;
}

// opts.island: draw only the plot and rim, with a cross-section under it. Used for the title and the win
export function bakeTerrain(frame, world, opts = {}) {
  const { W, H, OX, OY } = frame, far = farGrid(world), { G, mb, N, base, mat } = world;
  const x0 = opts.x0 || 0, x1 = opts.x1 == null ? W - 1 : opts.x1, island = !!opts.island, partial = opts.x1 != null;
  const pix = opts.pix || frame.tPix, zb = opts.z || frame.tZ, kind = opts.kind || frame.tKind;
  const seaH = world.sea, simMin = -mb, simMax = N + world.mf;
  const rim = opts.rim == null ? .75 : opts.rim, zBottom = -1.15;
  let zmax = far.zmax;
  for (let i = 0; i < G * G; i++) if (base[i] > zmax) zmax = base[i];
  zmax += .1;
  const S = far.S, fh = far.h, fm = far.m;
  // height anywhere; flat water in the far field
  const heightAt = (x, y) => {
    if (island) {
      if (x < -rim || y < -rim || x > N + rim || y > N + rim) return -1e9;
    }
    if (x >= simMin && y >= simMin && x < simMax && y < simMax) {
      const cx = ((x + mb) * C) | 0, cy = ((y + mb) * C) | 0;
      return base[cy * G + cx];
    }
    if (island) return -1e9;
    // far land is bilinear, so its slopes stay smooth
    const gx = (x + FAR_R) * FAR_RES - .5, gy = (y + FAR_R) * FAR_RES - .5, fx = Math.floor(gx), fy = Math.floor(gy);
    if (fx < 0 || fy < 0 || fx >= S - 1 || fy >= S - 1) return -1e9;
    const u = gx - fx, v = gy - fy, c = fy * S + fx;
    const h = fh[c] + (fh[c + 1] - fh[c]) * u + (fh[c + S] - fh[c]) * v + (fh[c] - fh[c + 1] - fh[c + S] + fh[c + S + 1]) * u * v;
    return seaH != null && h < seaH ? seaH : h;
  };
  const farMat = (x, y) => {
    const fx = ((x + FAR_R) * FAR_RES) | 0, fy = ((y + FAR_R) * FAR_RES) | 0;
    return fx < 0 || fy < 0 || fx >= S || fy >= S ? 100 : fm[fy * S + fx];
  };
  // grid lines of tiles are hinted by a very small tone change
  const dv = .055;
  const vTop = (0 - OY) / TH - 2, vBottom = (H - OY) / TH + zmax * ZS / TH + 1;
  if (!partial && !island) frame.farW.length = 0;
  frame.recordFar = !partial && !island; frame.noHaze = island;
  for (let ix = x0; ix <= x1; ix++) {
    const u = (ix + .5 - OX) / TW;
    let yTop = H;
    for (let v = vBottom; v > vTop && yTop > 0; v -= dv) {
      const x = (v + u) / 2, y = (v - u) / 2;
      const h = heightAt(x, y);
      if (h < -1e8) continue;
      const sy = OY + v * TH - h * ZS;
      if (sy >= yTop) continue;
      const iy0 = Math.max(0, Math.ceil(sy));
      const inSim = x >= simMin && y >= simMin && x < simMax && y < simMax;
      const skip = partial && !inSim; // a partial bake only rewrites the simulated land. Far trees stay
      if (!skip) for (let iy = yTop - 1; iy >= iy0; iy--) {
        const inPlot = x >= -.02 && y >= -.02 && x <= N + .02 && y <= N + .02, i = iy * W + ix, z = (OY + v * TH - (iy + .5)) / ZS, cm = inSim ? world.mat[world.idx(x, y)] : 0, wall = h - z > (cm === M.ROAD || cm === M.RAIL ? .15 : inPlot || island ? .05 : .15);
        if (island && wall && z < zBottom + (noise(ix * .23, 3) - .5) * .5) { pix[i] = 0; kind[i] = 0; zb[i] = -1e9; continue; }
        const px = x, py = y;
        zb[i] = depthOf(px, py, wall ? z : h);
        const c = wall
          ? wallColor(world, px, py, z, h, ix, iy, inSim, island)
          : topColor(world, px, py, h, ix, iy, inSim, farMat, heightAt, kind, i, frame);
        pix[i] = c;
        if (wall) kind[i] = inPlot || island ? 2 : 5;
      }
      yTop = iy0;
    }
    // above the land: paper
    if (yTop > 0 && !partial) for (let iy = 0; iy < yTop; iy++) { const i = iy * W + ix; pix[i] = 0; kind[i] = 0; zb[i] = -1e9; }
  }
  // crisp ledges: a warm lip where a top meets a cliff under it, and a dark seam at the foot of every cliff
  for (let iy = 1; iy < H - 1; iy++) for (let ix = x0; ix <= x1; ix++) {
    const i = iy * W + ix, k = kind[i];
    if (k !== 1) continue;
    if (kind[i + W] === 2) pix[i] = mixc(pix[i], rgb(255, 232, 180), .28);
    else if (kind[i - W] === 2) pix[i] = tintc(pix[i], .68, .66, .8);
    else if (iy > 1 && kind[i - 2 * W] === 2 && bayerAt(ix, iy) > .5) pix[i] = tintc(pix[i], .84, .82, .9);
  }
}

// ballast, sleepers and two steel rails along the line
function railColor(world, x, y, ix, iy, fine) {
  const tx = Math.floor(x), ty = Math.floor(y), fx = x - tx - .5, fy = y - ty - .5, a = world.railAxis.get((ty + 50) * 1000 + tx + 50) || { x: true };
  let c = pick(BALLAST, .5 + (fine - .5) * .9, ix, iy);
  const lane = (acrossF, alongF) => {
    if (Math.abs(acrossF) > .34) return;
    if ((((alongF + .5) * 6) % 1 + 1) % 1 < .34) c = SLEEPER;
    if (Math.abs(Math.abs(acrossF) - .18) < .022) c = STEEL;
  };
  if (a.x) lane(fy, fx);
  if (a.y) lane(fx, fy);
  return c;
}
// a road tile: asphalt strips towards its linked neighbours, a pavement on both sides, a dashed centre line
function roadColor(world, x, y, ix, iy, fine) {
  const tx = Math.floor(x), ty = Math.floor(y), fx = x - tx - .5, fy = y - ty - .5;
  const isRoad = (a, c) => { const b = world.buildingAt(a, c); return b && (b.type === 'jalan' || b.type === 'layang') && !b.ruin; };
  const g = world.level.gate, gateN = g && g.x === tx && g.y === ty;
  const n = isRoad(tx, ty - 1) || (gateN && g.side === 'y' && ty === 0), s = isRoad(tx, ty + 1) || (gateN && g.side === 'y' && ty === world.N - 1), w = isRoad(tx - 1, ty) || (gateN && g.side === 'x' && tx === 0), e = isRoad(tx + 1, ty) || (gateN && g.side === 'x' && tx === world.N - 1);
  const half = .3, onV = Math.abs(fx) < half && ((fy < 0 && n) || (fy >= 0 && s) || Math.abs(fy) < half), onH = Math.abs(fy) < half && ((fx < 0 && w) || (fx >= 0 && e) || Math.abs(fx) < half);
  if (!onV && !onH) return pick(WALK, .5 + (fine - .5) * .5 + (((Math.floor(x * 10) + Math.floor(y * 10)) & 1) ? .12 : -.12), ix, iy);
  const dash = (t) => ((t * 5 + .25) % 1 + 1) % 1 < .5;
  if (n && s && !e && !w && Math.abs(fx) < .022 && dash(fy)) return rgb(226, 218, 190);
  if (e && w && !n && !s && Math.abs(fy) < .022 && dash(fx)) return rgb(226, 218, 190);
  return pick(ASPHALT, .5 + (noise(x * 6, y * 6) - .5) * .4 + (fine - .5) * .16, ix, iy);
}
// forest canopy: each crown is a cell with a lit upper-left side and a dark gap around it
function crowns(x, y, slope, fine, ix, iy) {
  const f = 1.9, gx = x * f, gy = y * f, cx = Math.floor(gx), cy = Math.floor(gy);
  let best = 9, bi = 0, bj = 0, bdx = 0, bdy = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const hx = cx + i + hash(cx + i, cy + j), hy = cy + j + hash(cy + j + 91, cx + i + 37), dx = gx - hx, dy = gy - hy, d = dx * dx + dy * dy;
    if (d < best) { best = d; bi = cx + i; bj = cy + j; bdx = dx; bdy = dy; }
  }
  const r = Math.sqrt(best), tone = hash(bi * 3 + 1, bj * 5 + 2);
  // light falls from the upper left of each crown
  const light = .42 + (bdy - bdx * .4) * -.4 + tone * .22 - r * .36 + slope * .22 + (fine - .5) * .1;
  if (r > .62 + tone * .1) return FOREST[0];
  return pick(tone > .86 ? FOREST_B : FOREST, light, ix, iy);
}
function hazeOf(world, x, y) {
  const N = world.N, ox = x < 0 ? -x : x > N ? x - N : 0, oy = y < 0 ? -y : y > N ? y - N : 0;
  return Math.hypot(ox, oy);
}

function topColor(world, x, y, h, ix, iy, inSim, farMat, heightAt, kind, i, frame) {
  const n = noise(x * 1.4, y * 1.4), fine = hash(ix, iy);
  let c, m = M.GRASS, isFarWater = false;
  if (inSim) {
    const ci = world.idx(x, y); m = ci < 0 ? 0 : world.mat[ci];
    if (m === 100 || m === 101) inSim = false;
  }
  const d = hazeOf(world, x, y);
  // slope light from the height differences, for land without terraces
  const dx = heightAt(x + .25, y) - h, dy = heightAt(x, y + .25) - h;
  const slope = clamp((dx * 2.6 - dy * 1.6), -1, 1);
  if (!inSim) { m = world.sea != null && h <= world.sea + .001 ? 200 : farMat(x, y); if (m === M.RIVERBED) m = 200; }
  kind[i] = d > .02 ? 4 : 1;
  switch (m) {
    case 200: { // far sea
      kind[i] = 3;
      if (frame.recordFar) frame.farW.push(i, ix, iy);
      c = WATER[2];
      break;
    }
    case 100: c = crowns(x, y, slope, fine, ix, iy); break;
    case 101: { // far sawah: terraces follow the height contours. Some hold bright water, some hold green rice
      const band = Math.floor(h / .14), fr = h / .14 - band, tone = hash(band, Math.floor(x * .35) + Math.floor(y * .35) * 57);
      c = fr < .16 ? FARPADDY[0] : pick(FARPADDY, tone > .62 ? .8 + fine * .2 : .3 + tone * .55 + (fine - .5) * .1, ix, iy);
      break;
    }
    case M.ROCK: c = pick(ROCK, .45 + (n - .5) * .9 + slope * .4 + (fine - .5) * .16, ix, iy); break;
    case M.SAND: c = pick(SAND, .5 + (n - .5) * .55 + (fine - .5) * .14 + slope * .2, ix, iy); if (fine > .992) c = SAND[0]; break;
    case M.SOIL: c = pick(SOIL, .46 + (n - .5) * .7 + (fine - .5) * .2, ix, iy); if (fine > .985) c = SOIL[4]; break;
    case M.FERTILE: c = pick(FERTILE, .36 + (n - .5) * .7 + (fine - .5) * .2, ix, iy); if (fine > .94) c = FERTILE[4]; break;
    case M.BUND: c = pick(BUNDT, .55 + (n - .5) * .8 + (fine - .5) * .3, ix, iy); break;
    case M.PADDY: c = pick(PADDYMUD, .5 + (n - .5) * .7 + (fine - .5) * .3, ix, iy); break;
    case M.CANAL: c = pick(CANALT, .5 + (n - .5) * .7 + (fine - .5) * .3, ix, iy); break;
    case M.LEVEE: {
      const u = (x + y) * 6, v = (x - y) * 6, fu = u - Math.floor(u), fv = v - Math.floor(v);
      c = fu < .14 || fv < .14 ? LEVEET[0] : pick(LEVEET, .3 + hash(Math.floor(u), Math.floor(v)) * .7, ix, iy);
      break;
    }
    case M.SEABED: c = pick(SEABED, .5 + (n - .5) * .7 + (fine - .5) * .2, ix, iy); break;
    case M.RIVERBED: c = pick(RIVERBED, .5 + (n - .5) * .9 + (fine - .5) * .5, ix, iy); break;
    case M.FIELD: c = pick(FIELDT, .5 + (noise(x * 3, y * 3) - .5) * .7 + (fine - .5) * .22, ix, iy); break;
    case M.PATH: c = pick(PATHT, .5 + (n - .5) * .6 + (fine - .5) * .3, ix, iy); break;
    case M.ROAD: c = roadColor(world, x, y, ix, iy, fine); break;
    case M.STEPS: c = (ix * 3 + iy) % 7 === 0 ? STEP_DARK : STEP_LIGHT; break;
    case M.RAIL: { c = railColor(world, x, y, ix, iy, fine); const rb = world.buildingAt(Math.floor(x), Math.floor(y)); if (rb && rb.type === 'jalan') { const rc = roadColor(world, x, y, ix, iy, fine), fx = x - Math.floor(x) - .5, fy = y - Math.floor(y) - .5, a = world.railAxis.get((Math.floor(y) + 50) * 1000 + Math.floor(x) + 50) || {}; if (!(a.x ? Math.abs(Math.abs(fy) - .18) < .02 : Math.abs(Math.abs(fx) - .18) < .02)) c = rc; } break; }
    case M.URBAN: {
      const g = noise(x * 1.1 + 40, y * 1.1), g2 = noise(x * 5, y * 5);
      c = g + (g2 - .5) * .35 > .54 ? pick(URBANG, .5 + (g2 - .5) * .8 + (fine - .5) * .3, ix, iy) : pick(URBANT, .5 + (n - .5) * .5 + (fine - .5) * .22, ix, iy);
      if (fine > .994) c = URBANT[0];
      break;
    }
    case M.PARK: c = pick(PARKT, .5 + (noise(x * 4, y * 4) - .5) * .9 + (fine - .5) * .2, ix, iy); if (fine > .985) c = BLOOMS[(hash(ix * 3, iy) * BLOOMS.length) | 0]; break;
    case 102: { // far town ground: a loose grid of lanes, yards and small gardens
      const u = x * .5, v = y * .5, fu = u - Math.floor(u), fv = v - Math.floor(v);
      if (fu < .07 || fv < .07) c = FARROAD;
      else if (noise(x * .9 + 11, y * .9) > .6) c = crowns(x * 1.4, y * 1.4, 0, fine, ix, iy);
      else c = pick(FARTOWN, .5 + (n - .5) * .7 + (fine - .5) * .2, ix, iy);
      break;
    }
    case M.RUBBLE: c = pick(RUBBLE, .5 + (fine - .5) * .8, ix, iy); break;
    default: { // grass with a small tone change per tile, so the grid reads without lines
      const tx = Math.floor(x), ty = Math.floor(y), inPlot = tx >= 0 && ty >= 0 && tx < world.N && ty < world.N;
      const t = inPlot && (tx + ty) & 1 ? GRASS_B : GRASS;
      c = pick(t, .5 + (n - .5) * .62 + (noise(x * 4.5, y * 4.5) - .5) * .3 + (fine - .5) * .12 + slope * .25, ix, iy);
      if (fine > .991) c = BLOOMS[(hash(ix * 3, iy) * BLOOMS.length) | 0];
    }
  }
  if (m === M.GRASS || m === M.URBAN || m === M.PARK || m === M.ROAD || m === 102 || m === 100 || m === M.SAND || m === M.SOIL || m === 101 || m === M.ROCK || m === M.FERTILE) {
    if (inTerrainShadow(world, heightAt, x, y, h, inSim)) c = tintc(c, .6, .58, .76);
  }
  if (!inSim && world.level.rail && !frame.noHaze && m !== 200) for (const r of world.level.rail) {
    const p = r.path, a = p[0], b = p[1], y2 = p[p.length - 1], z2 = p[p.length - 2];
    const hit = (q, o) => { const dx = Math.sign(q[0] - o[0]), dy = Math.sign(q[1] - o[1]), ox = x - q[0] - .5, oy = y - q[1] - .5, al = ox * dx + oy * dy, ac = ox * dy - oy * dx; return al > 0 && Math.abs(ac) < .28 && (((al * 6) % 1 < .34) || Math.abs(Math.abs(ac) - .18) < .03); };
    if (hit(a, b) || hit(y2, z2)) c = BALLAST[0];
  }
  const gate = world.level.gate;
  if (gate && !frame.noHaze && d > .02) {
    const fx = x - gate.x - .5, fy = y - gate.y - .5;
    if (m !== 200 && ((gate.side === 'y' && Math.abs(fx) < .3 && (gate.y === 0 ? y < 0 : y > world.N)) || (gate.side === 'x' && Math.abs(fy) < .3 && (gate.x === 0 ? x < 0 : x > world.N)))) c = pick(ASPHALT, .5 + (fine - .5) * .2, ix, iy);
  }
  if (d > .02 && m !== 200 && !frame.noHaze) c = mixc(c, PAPER, hazeAmount(d));
  return c;
}
const STEP_LIGHT = rgb(204, 196, 178), STEP_DARK = rgb(176, 168, 150);
// The land past the plot is a pale wash. It never competes with the plot, and it fades to paper far from it
export const hazeAmount = d => (d < .02 ? 0 : Math.min(1, .3 + smooth(0, 1.5, d) * .42 + smooth(1.5, 12, d) * .28));

function inTerrainShadow(world, heightAt, x, y, z, inSim) {
  const step = inSim ? .09 : .35, n = inSim ? 14 : 8;
  for (let k = 1; k <= n; k++) {
    const t = k * step;
    if (heightAt(x - SUN_X * t, y - SUN_Y * t) > z + t + .02) return true;
  }
  return false;
}

function wallColor(world, x, y, z, top, ix, iy, inSim, island) {
  const depth = top - z, d = hazeOf(world, x, y);
  // far land uses plain slope colour
  if (!inSim && !island) {
    const c = pick(FOREST, .22 + (noise(x * 2, z * 5) - .5) * .7, ix, iy);
    return mixc(c, PAPER, hazeAmount(d));
  }
  // which face: walls on the +x side of a column sit in shade
  const side = (Math.abs(x - Math.round(x)) < Math.abs(y - Math.round(y))) ? .82 : 1;
  // island cross-section: strata, then roots
  if (island && z < -.02) {
    const band = z < -.75 ? 2 : z < -.32 ? 1 : 0, wob = (noise(ix * .13, z * 6) - .5) * .25;
    let c = pick(STRATA[band], .5 + wob + (hash(ix, iy) - .5) * .25, ix, iy);
    if (hash(ix, 91) > .93 && z > -.9 && z < -.1) c = rgb(68, 48, 44); // a root
    return tintc(c, side, side, side * 1.02);
  }
  if (d > .02 && !island) return mixc(pick(ROCK, .5, ix, iy), PAPER, hazeAmount(d));
  // moss hangs over the lip, longer where a creeper falls
  const creeper = hash(ix, 77) > .9 ? hash(ix, 78) * .3 : 0;
  if (depth < .05 + noise(x * 3, top) * .08 + creeper) {
    const c = pick(MOSS, .5 + (hash(ix, iy) - .5) * .7 + (creeper ? -.2 : .15), ix, iy);
    return tintc(c, side, side, side);
  }
  // andesite courses: terrace walls are laid stone, with rough joints
  const ry = z / .085, row = Math.floor(ry), fr = ry - row, along = (x - y) * 5.5 + row * .5, col = Math.floor(along), fc = along - col;
  if (fr < .17 || fc < .1) return tintc(rgb(62, 56, 66), side, side, side);
  const c = pick(ROCK, .34 + hash(col, row) * .5 + (hash(ix, iy) - .5) * .2 - depth * .1, ix, iy);
  return tintc(c, side, side, side);
}

// the moving far sea, stepped at 8 fps so it stays hand-drawn
export function drawFarWater(frame, t) {
  const f = frame.farW, pix = frame.pix, tick = Math.floor(t * 8);
  for (let k = 0; k < f.length; k += 3) {
    const i = f[k], ix = f[k + 1], iy = f[k + 2];
    const a = hash((ix >> 1) + (tick >> 2), iy >> 1), b = hash((ix >> 2) - tick, (iy >> 1) + 57);
    const glint = a * .5 + b * .5;
    let c = WATER[glint > .9 ? 4 : glint > .72 ? 3 : glint > .32 ? 2 : 1];
    pix[i] = mixc(c, PAPER, .8);
  }
}
