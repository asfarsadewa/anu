// Every building as a timeline of parts. A part is a stamp with a start and end on the erection timeline.
// The timeline: stakes and scaffold (0 to .2), the body (.2 to .85), munggah molo: the flag on the ridge (.85 to .92),
// then the crew strikes the scaffold (.92 to 1). The struck poles become physical sticks.
import { lerp, hash } from '../core.js';
import { beginStamp, endStamp, compose, quad, tri, box, pole, bamboo, sphere, column, surface, mat,
  TILE, TILE_DARK, THATCH, THATCH_D, IJUK, SHINGLE, ZINC, RUST, WOOD, TEAK, DARKWOOD, IRONWOOD, GEDHEK, PLASTER, PLASTER_WARM, PAINT_BLUE, PAINT_GREEN, PAINT_RED, BRICK, PARAS, STONE, CONCRETE, CARVED, WINDOW, SOIL_M } from './stamps.js';
import { rampOf } from './frame.js';

const cache = new Map();
const FLAG_POLE = [214, 196, 130];

class Plan {
  constructor() { this.parts = []; this.sticks = []; this.lights = []; this.ridge = [0, 0, 1]; this.height = 1; this.hoist = null; this.smoke = null; }
  part(t0, t1, mode, sfx, draw, extra = {}) {
    beginStamp(true); draw();
    this.parts.push({ stamp: endStamp(), t0, t1, mode, sfx, ...extra });
  }
  // Bamboo scaffold around a box. Poles go up one at a time, ledgers tie them, a plank deck sits on top
  scaffold(hx, hy, h, { t0 = 0, t1 = .18, decks = 2, hoist = false, cx = 0, cy = 0 } = {}) {
    const m = .06, X0 = cx - hx - m, X1 = cx + hx + m, Y0 = cy - hy - m, Y1 = cy + hy + m, H = h + .12;
    const corners = [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1], [cx, Y1], [X1, cy]];
    const n = corners.length, span = t1 - t0;
    corners.forEach(([x, y], k) => {
      const a = [x, y, 0], b = [x + (hash(k, 3) - .5) * .02, y + (hash(k, 5) - .5) * .02, H * (.92 + hash(k, 7) * .12)];
      this.part(t0 + span * k / n * .7, t0 + span * (k + 1) / n * .7 + .02, 'pop', 'lash', () => bamboo(a, b, 2), { scaffold: true });
      this.sticks.push([a, b]);
    });
    for (let d = 1; d <= decks; d++) {
      const z = H * d / (decks + .15), dt = t0 + span * (.7 + .14 * d / decks);
      this.part(dt, dt + .02, 'pop', d === 1 ? 'lash' : null, () => {
        bamboo([X0, Y1, z], [X1, Y1, z]); bamboo([X1, Y0, z], [X1, Y1, z]);
        if (d === decks) { bamboo([X0, Y0, z], [X1, Y0, z]); bamboo([X0, Y0, z], [X0, Y1, z]); }
        // rope lashings at the joints
        for (const [px, py] of [[X0, Y1], [X1, Y1], [X1, Y0]]) quad([px - .01, py, z - .01], [.02, 0, 0], [0, 0, .025], mat([230, 216, 170], 0, null, 0), 3);
      }, { scaffold: true });
      this.sticks.push([[X0, Y1, z], [X1, Y1, z]], [[X1, Y0, z], [X1, Y1, z]]);
    }
    // diagonal braces and a ladder on the left face
    this.part(t0 + span * .85, t1, 'pop', null, () => {
      bamboo([X0, Y1, 0], [cx, Y1, H * .5]); bamboo([X1, Y1, 0], [X1, cy, H * .5]);
      bamboo([cx - .12, Y1 + .05, 0], [cx - .12, Y1 + .02, H * .55]); bamboo([cx - .02, Y1 + .05, 0], [cx - .02, Y1 + .02, H * .55]);
      for (let r = 1; r < 5; r++) { const z = H * .55 * r / 5; bamboo([cx - .12, Y1 + .04, z], [cx - .02, Y1 + .04, z]); }
    }, { scaffold: true });
    if (hoist) this.hoist = { x: X1 + .02, y: cy + .05, z: H + .28, top: H + .28, to: [cx, cy] };
  }
  // finish: stamps for the done state, the flag point and the height
  finish(ridge, height) {
    this.ridge = ridge; this.height = height;
    this.body = this.parts.filter(p => !p.scaffold);
    this.done = compose(this.body.map(p => p.stamp));
    return this;
  }
}

function stilts(x0, y0, x1, y1, z, c = [78, 58, 50], n = 2) {
  for (let a = 0; a <= n; a++) for (let b = 0; b <= n; b++) {
    if (a > 0 && a < n && b > 0 && b < n) continue;
    const x = lerp(x0, x1, a / n), y = lerp(y0, y1, b / n);
    column(x, y, 0, z, .026, c);
  }
}
function floorDeck(x0, y0, x1, y1, z, t = .04, m = WOOD) { box(x0, y0, z - t, x1, y1, z, m); }
// a porch rail on the visible sides
function rail(x0, y0, x1, y1, z, c = [150, 116, 76]) {
  pole([x0, y1, z + .13], [x1, y1, z + .13], c); pole([x1, y0, z + .13], [x1, y1, z + .13], c);
  for (let k = 0; k <= 5; k++) { const t = k / 5; pole([lerp(x0, x1, t), y1, z], [lerp(x0, x1, t), y1, z + .13], c); pole([x1, lerp(y0, y1, t), z], [x1, lerp(y0, y1, t), z + .13], c); }
}
function hipRoof(x0, y0, x1, y1, z0, h, inset, m, md = m) {
  // ridge along x, hips at both ends
  const cy = (y0 + y1) / 2, ra = x0 + inset, rb = x1 - inset, z1 = z0 + h;
  // +y slope
  quad([x0, y1, z0], [x1 - x0, 0, 0], [0, 0, 0], m); // nothing, keeps the eave line
  trap([x0, y1, z0], [x1, y1, z0], [rb, cy, z1], [ra, cy, z1], m);
  trap([x1, y0, z0], [x0, y0, z0], [ra, cy, z1], [rb, cy, z1], md);
  tri([x1, y0, z0], [x1, y1, z0], [rb, cy, z1], md);
  tri([x0, y0, z0], [x0, y1, z0], [ra, cy, z1], m);
}
export function trap(a, b, c, d, m) { tri(a, b, c, m); tri(a, c, d, m); }
function gableRoof(x0, y0, x1, y1, z0, h, m, gableM, over = .08) {
  // ridge along x; gable visible on +x
  const cy = (y0 + y1) / 2, z1 = z0 + h;
  trap([x0 - over, y1, z0], [x1 + over, y1, z0], [x1 + over, cy, z1], [x0 - over, cy, z1], m);
  trap([x0 - over, y0, z0], [x1 + over, y0, z0], [x1 + over, cy, z1], [x0 - over, cy, z1], m);
  if (gableM) tri([x1, y0, z0], [x1, y1, z0], [x1, cy, z1], gableM);
}
function shutters(face, a, b, z0, z1, m = PAINT_GREEN) {
  // a dark window with shutters, on +y (face 0) or +x (face 1)
  if (face === 0) {
    quad([a, b + .002, z0], [.1, 0, 0], [0, 0, z1 - z0], WINDOW, 1);
    quad([a - .035, b + .004, z0], [.03, 0, 0], [0, 0, z1 - z0], m);
    quad([a + .105, b + .004, z0], [.03, 0, 0], [0, 0, z1 - z0], m);
  } else {
    quad([b + .002, a, z0], [0, .1, 0], [0, 0, z1 - z0], WINDOW, .6);
    quad([b + .004, a - .035, z0], [0, .03, 0], [0, 0, z1 - z0], m);
    quad([b + .004, a + .105, z0], [0, .03, 0], [0, 0, z1 - z0], m);
  }
}
const door = (face, a, b, z0, z1, m = DARKWOOD) => (face === 0 ? quad([a, b + .003, z0], [.1, 0, 0], [0, 0, z1 - z0], m, 1.6) : quad([b + .003, a, z0], [0, .1, 0], [0, 0, z1 - z0], m, 1));

/* ---------- homes by region ---------- */
const HOMES = {
  joglo(P) { // Javanese timber house on a low stilted deck, stepped clay tile roof
    const z = .3, hx = .36, hy = .3, top = z + .32;
    P.scaffold(hx, hy, top + .3);
    P.part(.2, .3, 'rise', 'thud', () => { stilts(-hx, -hy, hx, hy, z - .03); box(-hx - .04, -hy - .04, z - .04, hx + .04, hy + .04, z, WOOD); });
    P.part(.3, .46, 'rise', 'hammer', () => {
      box(-hx + .03, -hy + .03, z, hx - .03, hy - .03, top, { x: GEDHEK, y: GEDHEK, top: DARKWOOD });
      for (const [px, py] of [[-hx + .03, hy - .03], [hx - .03, hy - .03], [hx - .03, -hy + .03]]) column(px, py, z, top, .018, [92, 64, 48]);
      door(0, -.05, hy - .03, z, top - .06);
      shutters(1, -.05, hx - .03, z + .08, top - .06, PAINT_GREEN);
      rail(-hx - .04, -hy - .04, hx + .04, hy + .04, z);
    });
    P.lights.push([hx - .03, 0, z + .16]);
    P.part(.46, .6, 'drop', 'saw', () => {
      for (const s of [-1, 1]) { pole([-hx, s * hy, top], [hx, s * hy, top], [100, 72, 52], 2); }
      pole([0, -hy, top], [0, hy, top + .22], [100, 72, 52], 2);
    });
    P.part(.6, .74, 'drop', 'tile', () => hipRoof(-hx - .1, -hy - .1, hx + .1, hy + .1, top - .01, .17, .05, TILE, TILE_DARK));
    P.part(.74, .84, 'drop', 'tile', () => {
      hipRoof(-hx * .62, -hy * .62, hx * .62, hy * .62, top + .16, .25, hx * .32, TILE, TILE_DARK);
      pole([-.1, 0, top + .41], [.1, 0, top + .41], [226, 200, 150], 2);
    });
    return P.finish([0, 0, top + .42], top + .42);
  },
  bali(P) { // Bali: paras base, brick bands, thick alang-alang thatch
    const z = .24, hx = .34, hy = .3, top = z + .3;
    P.scaffold(hx, hy, top + .32);
    P.part(.2, .34, 'rise', 'brick', () => {
      stilts(-hx, -hy, hx, hy, z - .03, [120, 96, 74]);
      box(-hx - .03, -hy - .03, .0, hx + .03, hy + .03, z, { top: PARAS, x: PARAS, y: PARAS });
    });
    P.part(.34, .5, 'rise', 'brick', () => {
      box(-hx + .02, -hy + .02, z, hx - .02, hy - .02, top, { x: BRICK, y: BRICK, top: DARKWOOD });
      door(0, -.05, hy - .02, z, top - .05, mat([166, 120, 56], .3));
      shutters(1, -.05, hx - .02, z + .08, top - .06, mat([166, 120, 56], .2));
      for (const [px, py] of [[-hx + .02, hy - .02], [hx - .02, hy - .02], [hx - .02, -hy + .02]]) box(px - .025, py - .025, z, px + .025, py + .025, top, PARAS);
    });
    P.lights.push([hx - .02, 0, z + .16]);
    P.part(.5, .66, 'drop', 'saw', () => { pole([-hx, 0, top + .28], [hx, 0, top + .28], [120, 90, 60], 2); for (const s of [-1, 1]) pole([-hx * .3, s * hy, top], [0, 0, top + .28], [120, 90, 60]); });
    P.part(.66, .84, 'drop', 'thud', () => {
      // a thick thatch hip with a clipped edge
      box(-hx - .13, -hy - .13, top - .02, hx + .13, hy + .13, top + .03, THATCH_D);
      hipRoof(-hx - .13, -hy - .13, hx + .13, hy + .13, top + .03, .38, .14, THATCH, THATCH_D);
      pole([-.08, 0, top + .42], [.08, 0, top + .42], [80, 60, 44], 2);
      sphere(0, 0, top + .44, .022, [212, 170, 80]);
    });
    return P.finish([0, 0, top + .45], top + .45);
  },
  betang(P) { // Kalimantan: a long ironwood house on tall stilts with a notched-log ladder
    const z = .5, hx = .43, hy = .24, top = z + .28;
    P.scaffold(hx, hy, top + .24);
    P.part(.2, .36, 'rise', 'thud', () => {
      stilts(-hx, -hy, hx, hy, z - .03, [58, 46, 46], 3);
      box(-hx - .03, -hy - .08, z - .05, hx + .03, hy + .08, z, IRONWOOD);
    });
    P.part(.36, .5, 'rise', 'hammer', () => {
      box(-hx + .02, -hy + .02, z, hx - .02, hy - .02, top, { x: WOOD, y: WOOD, top: DARKWOOD });
      door(0, -.2, hy - .02, z, top - .05); door(0, .1, hy - .02, z, top - .05);
      pole([-.32, hy + .2, 0], [-.22, hy + .07, z], [92, 72, 58], 2); // notched log
      rail(-hx - .03, hy - .02, hx + .03, hy + .08, z, [110, 84, 60]);
    });
    P.lights.push([-.15, hy, z + .12]);
    P.part(.5, .66, 'drop', 'saw', () => { for (const a of [-.4, 0, .4]) { pole([a, hy, top], [a, 0, top + .2], [92, 68, 50]); pole([a, -hy, top], [a, 0, top + .2], [92, 68, 50]); } });
    P.part(.66, .84, 'drop', 'tile', () => {
      gableRoof(-hx, -hy - .11, hx, hy + .11, top - .01, .25, SHINGLE, mat([96, 68, 52], .4, (u, v, ix) => (ix % 3 === 0 ? -.8 : 0)));
      pole([hx + .08, 0, top + .23], [hx + .16, 0, top + .36], [70, 50, 40], 2); pole([-hx - .08, 0, top + .23], [-hx - .16, 0, top + .36], [70, 50, 40], 2); // carved ridge horns
    });
    return P.finish([0, 0, top + .25], top + .36);
  },
  bajo(P) { // Sulawesi sea-gypsy house: painted planks, zinc roof, tall spindly posts
    const z = .36, hx = .3, hy = .3, top = z + .28;
    P.scaffold(hx, hy, top + .24);
    P.part(.2, .34, 'rise', 'thud', () => { stilts(-hx, -hy, hx, hy, z - .03, [104, 84, 66]); box(-hx - .1, -hy - .03, z - .03, hx + .1, hy + .1, z, WOOD); });
    P.part(.34, .5, 'rise', 'hammer', () => {
      box(-hx + .02, -hy + .02, z, hx - .02, hy - .02, top, { x: PAINT_BLUE, y: PAINT_BLUE, top: DARKWOOD });
      door(0, -.05, hy - .02, z, top - .05, mat([232, 226, 204], .1)); shutters(1, -.05, hx - .02, z + .08, top - .06, mat([232, 226, 204], .1));
      rail(-hx - .1, -hy - .03, hx + .1, hy + .1, z, [190, 176, 150]);
    });
    P.lights.push([hx - .02, 0, z + .14]);
    P.part(.5, .66, 'drop', 'saw', () => { pole([-hx, 0, top + .2], [hx, 0, top + .2], [120, 92, 66], 2); });
    P.part(.66, .84, 'drop', 'tile', () => gableRoof(-hx, -hy - .1, hx, hy + .1, top - .01, .22, ZINC, mat([232, 226, 204], .2)));
    return P.finish([0, 0, top + .22], top + .22);
  },
  tongkonan(P) { // Toraja: a saddle roof that sweeps up to both ends, carved walls
    const z = .34, hx = .23, hy = .3, top = z + .28;
    P.scaffold(hx, hy, top + .4);
    P.part(.2, .34, 'rise', 'thud', () => { stilts(-hx, -hy, hx, hy, z - .03, [54, 44, 46]); box(-hx - .02, -hy - .02, z - .04, hx + .02, hy + .02, z, IRONWOOD); });
    P.part(.34, .5, 'rise', 'hammer', () => {
      box(-hx + .02, -hy + .02, z, hx - .02, hy - .02, top, { x: CARVED, y: CARVED, top: DARKWOOD });
      for (const y of [-.2, .05, .2]) { /* the buffalo-horn post on the front */ }
      door(0, -.05, hy - .02, z, top - .08, IRONWOOD);
    });
    P.lights.push([0, hy, z + .14]);
    P.part(.5, .66, 'drop', 'saw', () => {
      column(0, hy + .34, 0, top + .36, .02, [64, 52, 48]); // ridge post under the prow
      pole([0, hy + .34, top + .36], [0, -hy, top + .18], [64, 52, 48]);
      for (const k of [0, 1, 2]) { sphere(0, hy + .35, z + .08 + k * .09, .024, [230, 220, 200]); } // buffalo horns stacked on the post
    });
    P.part(.66, .84, 'drop', 'thud', () => {
      // the boat roof: a surface that rises towards both ends along y
      const ridge = (s) => { const t = s * 2 - 1, u = Math.abs(t); return top + .17 + u * u * .34; };
      const fn = (s, t) => { const y = lerp(-hy - .42, hy + .44, s), side = t * 2 - 1, r = ridge(s); return [side * (hx + .12), y, r - Math.pow(Math.abs(side), 1.3) * (.2 + .05 * (1 - Math.abs(s * 2 - 1)))]; };
      surface(fn, 120, 40, IJUK);
      pole([hx + .12, -hy - .42, top + .32], [hx + .12, hy + .44, top + .32], [150, 136, 110]);
    });
    return P.finish([0, 0, top + .24], top + .52);
  },
  kolonial(P) { // an old Semarang and Jakarta house: white stucco, tall windows, red tiles, a stone plinth
    const z = .28, hx = .36, hy = .32, top = z + .36;
    P.scaffold(hx, hy, top + .3);
    P.part(.2, .34, 'rise', 'brick', () => { stilts(-hx, -hy, hx, hy, z - .03, [130, 124, 116]); box(-hx - .04, -hy - .04, z - .05, hx + .04, hy + .04, z, STONE); box(-.14, hy + .04, 0, .14, hy + .24, .03, STONE); box(-.14, hy + .04, .03, .14, hy + .15, .13, STONE); });
    P.part(.34, .54, 'rise', 'brick', () => {
      box(-hx + .02, -hy + .02, z, hx - .02, hy - .02, top, { x: mat([204, 198, 182], .25), y: PLASTER, top: CONCRETE });
      for (const a of [-.24, .1]) { shutters(0, a, hy - .02, z + .05, top - .05, mat([86, 120, 104], .2)); }
      door(0, -.06, hy - .02, z, top - .04, TEAK);
      shutters(1, -.2, hx - .02, z + .05, top - .05, mat([86, 120, 104], .2)); shutters(1, .1, hx - .02, z + .05, top - .05, mat([86, 120, 104], .2));
    });
    P.lights.push([hx - .02, -.15, z + .18], [.15, hy - .02, z + .18]);
    P.part(.54, .66, 'drop', 'saw', () => pole([-hx, 0, top + .3], [hx, 0, top + .3], [110, 84, 60], 2));
    P.part(.66, .84, 'drop', 'tile', () => hipRoof(-hx - .08, -hy - .08, hx + .08, hy + .08, top, .32, .14, TILE, TILE_DARK));
    return P.finish([0, 0, top + .32], top + .32);
  },
  aceh(P) { // Aceh: a long timber house on stilts with a palm-leaf gable
    const z = .42, hx = .4, hy = .26, top = z + .28;
    P.scaffold(hx, hy, top + .26);
    P.part(.2, .34, 'rise', 'thud', () => { stilts(-hx, -hy, hx, hy, z - .03, [78, 56, 48], 3); box(-hx - .03, -hy - .03, z - .04, hx + .03, hy + .03, z, IRONWOOD); });
    P.part(.34, .5, 'rise', 'hammer', () => {
      box(-hx + .02, -hy + .02, z, hx - .02, hy - .02, top, { x: TEAK, y: TEAK, top: DARKWOOD });
      for (const a of [-.25, .05]) shutters(0, a, hy - .02, z + .08, top - .06, mat([190, 170, 90], .2));
      door(1, -.05, hx - .02, z, top - .05);
      pole([hx + .1, -.03, 0], [hx - .01, -.03, z], [120, 92, 62], 2); pole([hx + .1, .05, 0], [hx - .01, .05, z], [120, 92, 62], 2);
    });
    P.lights.push([-.2, hy, z + .14]);
    P.part(.5, .66, 'drop', 'saw', () => pole([-hx, 0, top + .24], [hx, 0, top + .24], [110, 84, 60], 2));
    P.part(.66, .84, 'drop', 'thud', () => {
      gableRoof(-hx, -hy - .1, hx, hy + .1, top - .01, .3, THATCH_D, mat([150, 110, 66], .4, (u, v, ix, iy) => ((ix + iy) % 4 === 0 ? [214, 180, 90] : 0)));
    });
    return P.finish([0, 0, top + .3], top + .3);
  },
};
const STYLE_MIX = ['joglo', 'bali', 'kolonial', 'bajo', 'tongkonan', 'aceh'];

/* ---------- other buildings ---------- */
const BUILD = {
  rumah(P, style, variant, x, y) {
    if (style === 'mix') style = STYLE_MIX[Math.floor(hash(x * 13 + 1, y * 17 + 3) * 6)];
    return (HOMES[style] || HOMES.joglo)(P);
  },
  panggung(P) { // a home on very tall posts for shallow water
    const z = .68, hx = .3, hy = .3, top = z + .26;
    P.scaffold(hx, hy, top + .2, { decks: 3 });
    P.part(.2, .36, 'rise', 'thud', () => { stilts(-hx, -hy, hx, hy, z - .03, [104, 84, 66], 2); for (const s of [-1, 1]) { pole([-hx, s * hy, .25], [hx, s * hy, .25], [120, 96, 72]); pole([s * hx, -hy, .25], [s * hx, hy, .25], [120, 96, 72]); } box(-hx - .1, -hy - .03, z - .03, hx + .1, hy + .12, z, WOOD); });
    P.part(.36, .54, 'rise', 'hammer', () => {
      box(-hx + .02, -hy + .02, z, hx - .02, hy - .02, top, { x: PAINT_GREEN, y: PAINT_GREEN, top: DARKWOOD });
      door(0, -.05, hy - .02, z, top - .05, mat([232, 226, 204], .1)); shutters(1, -.05, hx - .02, z + .08, top - .06, mat([232, 226, 204], .1));
      rail(-hx - .1, -hy - .03, hx + .1, hy + .12, z, [190, 176, 150]);
    });
    P.lights.push([hx - .02, 0, z + .14]);
    P.part(.54, .84, 'drop', 'tile', () => gableRoof(-hx, -hy - .1, hx, hy + .1, top - .01, .2, RUST, mat([232, 226, 204], .2)));
    return P.finish([0, 0, top + .2], top + .2);
  },
  bata(P) { // a plastered brick house with a tile roof and a small terrace
    const hx = .38, hy = .32, top = .52;
    P.scaffold(hx, hy, top + .34, { decks: 2 });
    P.part(.2, .3, 'rise', 'dig', () => box(-hx - .04, -hy - .04, 0, hx + .04, hy + .04, .08, STONE));
    P.part(.3, .52, 'rise', 'brick', () => box(-hx, -hy, .08, hx, hy, top, { x: BRICK, y: BRICK, top: BRICK }));
    P.part(.52, .62, 'rise', 'brick', () => {
      box(-hx - .002, -hy - .002, .08, hx + .002, hy + .002, top, { x: PLASTER_WARM, y: PLASTER, top: BRICK });
      box(-hx - .004, -hy - .004, .08, hx + .004, hy + .004, .15, { x: mat([120, 92, 76], .3), y: mat([140, 106, 84], .3), top: BRICK });
      door(0, -.2, hy + .001, .08, top - .1, TEAK); shutters(0, .08, hy + .001, .22, top - .1, PAINT_GREEN);
      shutters(1, -.2, hx + .001, .22, top - .1, PAINT_GREEN); shutters(1, .1, hx + .001, .22, top - .1, PAINT_GREEN);
    });
    P.lights.push([hx, -.15, .3], [hx, .15, .3], [.12, hy, .3]);
    P.part(.62, .72, 'drop', 'saw', () => { pole([-hx, 0, top + .24], [hx, 0, top + .24], [110, 84, 60], 2); for (const a of [-hx, 0, hx]) { pole([a, hy, top], [a, 0, top + .24], [110, 84, 60]); } });
    P.part(.72, .84, 'drop', 'tile', () => {
      hipRoof(-hx - .08, -hy - .08, hx + .08, hy + .08, top, .28, .12, TILE, TILE_DARK);
      box(hx * .1, -.06, top + .18, hx * .1 + .08, .02, top + .34, BRICK); // chimney
    });
    return P.finish([0, 0, top + .28], top + .34);
  },
  warung(P) { // an open stall with a striped awning and shelves of jars
    const hx = .34, hy = .28, top = .42;
    P.scaffold(hx, hy, top + .22, { decks: 1 });
    P.part(.2, .34, 'rise', 'thud', () => { box(-hx, -hy, 0, hx, hy, .05, STONE); for (const [a, b] of [[-hx, hy], [hx, hy], [hx, -hy], [-hx, -hy]]) column(a, b, .05, top, .02, [104, 76, 56]); });
    P.part(.34, .5, 'rise', 'hammer', () => {
      box(-hx, -hy, .05, hx - .03, -hy + .05, top, GEDHEK); box(-hx, -hy, .05, -hx + .05, hy, top, GEDHEK);
      box(-.2, hy - .13, .05, hx - .02, hy - .03, .2, { top: TEAK, y: PLASTER_WARM, x: TEAK }); // counter
      for (let k = 0; k < 5; k++) column(-.14 + k * .09, hy - .08, .2, .26, .012, [[190, 90, 60], [220, 190, 90], [90, 140, 90], [200, 200, 180], [190, 90, 60]][k]);
      box(-hx + .06, -hy + .06, .22, hx - .08, -hy + .1, .24, TEAK);
      for (let k = 0; k < 6; k++) column(-.2 + k * .08, -hy + .08, .24, .3, .012, [[220, 190, 90], [90, 140, 90], [190, 90, 60]][k % 3]);
    });
    P.lights.push([0, 0, .32]);
    P.part(.5, .68, 'drop', 'saw', () => {
      const stripe = mat([212, 74, 58], .2, (u, v) => (Math.floor(u / .09) % 2 ? [236, 226, 200] : 0));
      trap([-hx - .05, hy + .14, top - .05], [hx + .1, hy + .14, top - .05], [hx + .1, 0, top + .13], [-hx - .05, 0, top + .13], stripe);
      trap([-hx - .05, -hy - .08, top - .05], [hx + .1, -hy - .08, top - .05], [hx + .1, 0, top + .13], [-hx - .05, 0, top + .13], stripe);
      tri([hx + .1, -hy - .08, top - .05], [hx + .1, hy + .14, top - .05], [hx + .1, 0, top + .13], mat([104, 76, 56], .3));
    });
    P.part(.68, .84, 'drop', 'hammer', () => {
      box(.1, hy + .12, top - .2, .36, hy + .14, top - .08, mat([226, 196, 90], .2)); // sign
      for (let k = 0; k < 3; k++) { pole([.14 + k * .08, hy + .141, top - .12], [.18 + k * .08, hy + .141, top - .12], [90, 60, 44]); pole([.14 + k * .08, hy + .141, top - .16], [.2 + k * .08, hy + .141, top - .16], [90, 60, 44]); }
    });
    return P.finish([0, 0, top + .13], top + .13);
  },
  lumbung(P) { // a rice barn: a bonnet-shaped thatch on posts with rat guards
    const z = .36, hx = .24, hy = .24;
    P.scaffold(hx + .04, hy + .04, z + .66, { decks: 2 });
    P.part(.2, .36, 'rise', 'thud', () => {
      for (const [a, b] of [[-hx, -hy], [hx, -hy], [-hx, hy], [hx, hy]]) { column(a, b, 0, z, .028, [84, 62, 52]); sphere(a, b, z - .05, .05, [130, 106, 86]); }
      box(-hx - .04, -hy - .04, z - .02, hx + .04, hy + .04, z + .02, DARKWOOD);
    });
    P.part(.36, .6, 'rise', 'hammer', () => {
      const fn = (s, t) => { const a = t * 6.283 / 4 + (s * 0) ; return [0, 0, 0]; };
      // curved bonnet: stacked rings narrowing and bulging
      for (let k = 0; k < 16; k++) {
        const u = k / 15, r = (hx + .05) * (1 + Math.sin(u * 3.1) * .34) * (1 - u * .62), zz = z + .03 + u * .42;
        box(-r, -r, zz, r, r, zz + .036, { top: THATCH, x: THATCH_D, y: THATCH });
      }
    });
    P.part(.6, .84, 'drop', 'tile', () => {
      hipRoof(-.17, -.17, .17, .17, z + .47, .18, .1, THATCH, THATCH_D);
      box(hx - .03, -.05, z + .08, hx + .04, .04, z + .22, DARKWOOD); // the loft door
    });
    P.lights.push([.2, 0, z + .14]);
    return P.finish([0, 0, z + .65], z + .65);
  },
  kentongan(P) { // a bamboo watch tower with a hanging slit drum
    const z = .8, hx = .18;
    P.scaffold(hx, hx, .9, { decks: 2 });
    P.part(.2, .46, 'rise', 'thud', () => {
      for (const [a, b] of [[-hx, -hx], [hx, -hx], [-hx, hx], [hx, hx]]) bamboo([a * 1.5, b * 1.5, 0], [a, b, z], 2);
      for (const zz of [.25, .55]) { const k = 1.5 - .5 * zz / z; bamboo([-hx * k, hx * k, zz], [hx * k, hx * k, zz]); bamboo([hx * k, -hx * k, zz], [hx * k, hx * k, zz]); bamboo([-hx * k, -hx * k, zz], [-hx * k, hx * k, zz]); }
      bamboo([hx * 1.5, hx * 1.5, 0], [-hx * 1.1, hx * 1.1, .55]);
    });
    P.part(.46, .62, 'rise', 'hammer', () => {
      box(-hx - .05, -hx - .05, z - .02, hx + .05, hx + .05, z + .02, WOOD);
      for (const [a, b] of [[-hx, hx], [hx, hx], [hx, -hx]]) column(a, b, z, z + .24, .012, [160, 140, 86]);
      rail(-hx, -hx, hx, hx, z, [186, 166, 98]);
    });
    P.part(.62, .74, 'drop', 'lash', () => {
      // the slit drum: a hollow log hanging from the crossbeam
      column(0.02, hx - .04, z + .05, z + .2, .035, [120, 74, 48]);
      quad([.02, hx - .005, z + .08], [.004, 0, 0], [0, 0, .08], mat([30, 24, 22], 0), 1);
    });
    P.part(.74, .84, 'drop', 'thud', () => hipRoof(-hx - .08, -hx - .08, hx + .08, hx + .08, z + .22, .2, .14, THATCH, THATCH_D));
    return P.finish([0, 0, z + .42], z + .42);
  },
  balai(P) { // a great joglo hall on four teak pillars, on a stone plinth. 2 x 2 tiles
    const S = .86, top = 1.1, cx = 0, cy = 0;
    P.scaffold(S, S, top + .75, { decks: 3, hoist: true, t1: .14 });
    P.part(.14, .2, 'rise', 'dig', () => { box(-S - .04, -S - .04, 0, S + .04, S + .04, .05, STONE); });
    P.part(.2, .28, 'rise', 'brick', () => {
      box(-S, -S, .05, S, S, .13, STONE);
      // steps at the front
      box(-.2, S, .05, .2, S + .1, .09, STONE); box(S, -.2, .05, S + .1, .2, .09, STONE);
    });
    // saka guru: pillars lifted one by one by the hoist
    [[-.32, .32], [.32, .32], [.32, -.32], [-.32, -.32]].forEach(([a, b], k) => {
      P.part(.28 + k * .05, .33 + k * .05, 'drop', 'thud', () => { column(a, b, .13, top, .04, [146, 96, 58]); sphere(a, b, .15, .05, [120, 116, 110]); }, { hoisted: true, hx: a, hy: b });
    });
    // outer pillars
    P.part(.48, .54, 'rise', 'hammer', () => {
      for (const a of [-.74, -.25, .25, .74]) { column(a, .74, .13, top - .36, .022, TEAK.c); column(.74, a, .13, top - .36, .022, TEAK.c); column(a, -.74, .13, top - .36, .022, TEAK.c); column(-.74, a, .13, top - .36, .022, TEAK.c); }
    });
    // tumpang sari: the stepped carved ceiling frame
    P.part(.54, .62, 'drop', 'saw', () => {
      for (let k = 0; k < 4; k++) { const r = .42 - k * .08, z = top + k * .05; box(-r, -r, z, r, r, z + .05, { top: DARKWOOD, x: mat([170, 120, 60], .4, (u, v, ix) => (ix % 4 === 0 ? [216, 180, 90] : 0)), y: mat([190, 138, 70], .4, (u, v, ix) => (ix % 4 === 0 ? [216, 180, 90] : 0)) }); }
    }, { hoisted: true, hx: 0, hy: 0 });
    P.part(.62, .7, 'drop', 'tile', () => hipRoof(-S - .12, -S - .12, S + .12, S + .12, top - .38, .28, .28, TILE, TILE_DARK));
    P.part(.7, .78, 'drop', 'tile', () => hipRoof(-.72, -.72, .72, .72, top - .12, .3, .26, TILE, TILE_DARK));
    P.part(.78, .84, 'drop', 'tile', () => {
      hipRoof(-.44, -.44, .44, .44, top + .16, .48, .36, TILE, TILE_DARK);
      pole([-.1, 0, top + .64], [.1, 0, top + .64], [226, 200, 150], 2);
    });
    P.lights.push([.42, .42, .5], [-.3, .74, .4], [.74, -.3, .4], [.74, .3, .4], [.3, .74, .4]);
    return P.finish([0, 0, top + .65], top + .65);
  },
  sawah(P) { // stakes and a string, then a farmer's seedling bed. The bund itself is in the terrain
    P.part(0, .1, 'pop', 'dig', () => { for (const [a, b] of [[-.42, -.42], [.42, -.42], [-.42, .42], [.42, .42]]) bamboo([a, b, 0], [a, b, .16]); }, { scaffold: true });
    P.part(.1, .2, 'pop', 'dig', () => { bamboo([-.42, .42, .13], [.42, .42, .13]); bamboo([.42, -.42, .13], [.42, .42, .13]); }, { scaffold: true });
    P.part(.2, .34, 'rise', 'dig', () => box(-.5, -.5, -.01, .5, .5, .0, SOIL_M));
    return P.finish([0, 0, .2], .1);
  },
  saluran(P) {
    P.part(0, .1, 'pop', 'dig', () => { for (const [a, b] of [[-.3, -.3], [.3, -.3], [-.3, .3], [.3, .3]]) bamboo([a, b, 0], [a, b, .14]); }, { scaffold: true });
    P.part(.2, .6, 'rise', 'dig', () => { for (const [a, b] of [[-.31, -.31], [.31, -.31], [-.31, .31], [.31, .31]]) sphere(a, b, .012, .03, [120, 112, 104]); });
    return P.finish([0, 0, .1], .05);
  },
  tanggul(P) { // gabion baskets of stone stacked by hand. The ground lifts under them
    P.part(0, .1, 'pop', 'lash', () => { for (const [a, b] of [[-.45, -.45], [.45, -.45], [-.45, .45], [.45, .45]]) bamboo([a, b, 0], [a, b, .3]); }, { scaffold: true });
    P.part(.2, .6, 'rise', 'thud', () => { for (let k = 0; k < 4; k++) { box(-.42 + k * .21, .4, 0, -.24 + k * .21, .47, .05, STONE); box(.4, -.42 + k * .21, 0, .47, -.24 + k * .21, .05, STONE); } });
    return P.finish([0, 0, .2], .05);
  },
  bambu(P) { // a clump of bamboo: culms, then leaves
    const culms = [];
    for (let k = 0; k < 11; k++) {
      const a = hash(k, 1) * 6.283, r = .06 + hash(k, 2) * .2, x = Math.cos(a) * r, y = Math.sin(a) * r, h = .95 + hash(k, 3) * .55;
      culms.push({ x, y, h, lean: [Math.cos(a) * (.1 + hash(k, 4) * .24), Math.sin(a) * (.1 + hash(k, 4) * .24)] });
    }
    P.part(0, .2, 'pop', 'dig', () => { sphere(0, 0, .02, .1, [84, 70, 54], .6); });
    culms.forEach((c, k) => P.part(.2 + k * .04, .34 + k * .04, 'rise', k % 3 === 0 ? 'lash' : null, () => {
      for (let s = 0; s < 8; s++) {
        const t0 = s / 8, t1 = (s + 1) / 8, bend = t => t * t;
        const a = [c.x + c.lean[0] * bend(t0), c.y + c.lean[1] * bend(t0), c.h * t0], b = [c.x + c.lean[0] * bend(t1), c.y + c.lean[1] * bend(t1), c.h * t1];
        bamboo(a, b, s < 4 ? 2 : 1);
      }
    }));
    P.part(.72, .9, 'rise', 'lash', () => {
      for (let n = 0; n < 150; n++) {
        const c = culms[n % culms.length], t = .45 + hash(n, 5) * .55, x = c.x + c.lean[0] * t * t, y = c.y + c.lean[1] * t * t, z = c.h * t, s = .05 + hash(n, 6) * .14;
        const a = hash(n, 7) * 6.283;
        sphere(x + Math.cos(a) * s, y + Math.sin(a) * s, z - s * .4, .018 + hash(n, 8) * .02, hash(n, 9) > .55 ? [120, 160, 80] : hash(n, 9) > .2 ? [84, 130, 70] : [58, 100, 62]);
      }
    });
    const pl = P.finish([0, 0, 1.2], 1.2);
    pl.sway = true;
    return pl;
  },
  bakau(P) { // mangrove: an arch of stilt roots and a dark round crown
    P.part(0, .2, 'pop', 'dig', () => { sphere(0, 0, .04, .04, [60, 80, 50]); });
    P.part(.2, .55, 'rise', null, () => {
      for (let k = 0; k < 9; k++) {
        const a = k / 9 * 6.283 + .3, r = .24 + hash(k, 1) * .1, x = Math.cos(a) * r, y = Math.sin(a) * r, top = [x * .15, y * .15, .32];
        for (let s = 0; s < 5; s++) { const t0 = s / 5, t1 = (s + 1) / 5; pole([lerp(x, top[0], t0), lerp(y, top[1], t0), Math.sin(t0 * 1.5) * .33], [lerp(x, top[0], t1), lerp(y, top[1], t1), Math.sin(t1 * 1.5) * .33], [84, 66, 56], 2); }
      }
      column(0, 0, .3, .6, .03, [84, 66, 56]);
    });
    P.part(.55, .9, 'rise', null, () => {
      for (let n = 0; n < 130; n++) {
        const a = hash(n, 1) * 6.283, r = Math.sqrt(hash(n, 2)) * .34, z = .58 + hash(n, 3) * .26 - r * .25;
        sphere(Math.cos(a) * r, Math.sin(a) * r, z, .03 + hash(n, 4) * .03, hash(n, 5) > .68 ? [86, 126, 70] : hash(n, 5) > .25 ? [52, 96, 62] : [36, 74, 58], .3);
      }
    });
    const pl = P.finish([0, 0, .9], .9);
    pl.sway = true;
    return pl;
  },
  dermaga(P) { // a jetty on piles
    P.part(0, .2, 'pop', 'lash', () => { for (const a of [-.42, -.14, .14, .42]) { column(a, -.2, -.2, .28, .022, [92, 74, 60]); column(a, .2, -.2, .28, .022, [92, 74, 60]); } }, {});
    for (let k = 0; k < 8; k++) P.part(.25 + k * .05, .3 + k * .05, 'drop', 'hammer', () => box(-.48 + k * .125, -.23, .22, -.48 + (k + 1) * .125 - .012, .23, .26, WOOD));
    P.part(.72, .84, 'drop', 'lash', () => { for (const a of [-.42, .42]) column(a, .2, .26, .42, .022, [150, 120, 90]); for (let k = 0; k < 6; k++) sphere(.3 - k * .03, .05, .28 + (k % 2) * .015, .018, [200, 186, 150]); });
    return P.finish([0, 0, .42], .42);
  },
  sabo(P) { // a concrete comb in a bamboo form
    P.scaffold(.42, .1, .55, { decks: 1 });
    P.part(.2, .5, 'rise', 'brick', () => box(-.48, -.08, 0, .48, .08, .14, CONCRETE));
    for (let k = 0; k < 5; k++) P.part(.5 + k * .06, .58 + k * .06, 'rise', 'brick', () => box(-.48 + k * .21, -.08, .14, -.48 + k * .21 + .12, .08, .46, CONCRETE));
    return P.finish([0, 0, .47], .47);
  },
  lapangan(P) { // an open field with a low bench
    P.part(0, .15, 'pop', 'dig', () => { for (const [a, b] of [[-.44, -.44], [.44, -.44], [-.44, .44], [.44, .44]]) bamboo([a, b, 0], [a, b, .1]); });
    P.part(.5, .7, 'drop', 'hammer', () => { box(.2, .3, .08, .4, .36, .1, WOOD); column(.22, .33, 0, .08, .012, [100, 76, 56]); column(.38, .33, 0, .08, .012, [100, 76, 56]); });
    return P.finish([0, 0, .2], .1);
  },
  kincir(P) { // the wheel's frame. The wheel is drawn each frame and turns with the water
    P.scaffold(.34, .12, .62, { decks: 1 });
    P.part(.2, .5, 'rise', 'thud', () => { for (const s of [-1, 1]) { pole([-.3, s * .12, -.02], [0, s * .12, .42], [120, 92, 66], 2); pole([.3, s * .12, -.02], [0, s * .12, .42], [120, 92, 66], 2); } pole([0, -.18, .42], [0, .18, .42], [84, 62, 48], 2); });
    P.part(.5, .84, 'drop', 'saw', () => { bamboo([-.1, -.2, .1], [-.1, -.42, .48]); bamboo([.1, -.2, .1], [.1, -.42, .48]); bamboo([-.1, -.42, .48], [.1, -.42, .48]); });
    return P.finish([0, 0, .42], .42);
  },

  jalan(P) { // cones and a hand roller while the crew lays the road
    P.part(0, .15, 'pop', 'dig', () => { for (const [a, b] of [[-.42, -.42], [.42, .42]]) { column(a, b, 0, .06, .016, [226, 96, 44]); } }, { scaffold: true });
    P.part(.15, .8, 'rise', 'dig', () => { column(.25, .2, .03, .09, .05, [84, 84, 92]); pole([.25, .2, .08], [.05, .02, .22], [110, 90, 70], 2); }, { scaffold: true });
    return P.finish([0, 0, .1], .02);
  },

  masjid(P) { return BUILD.ibadah(P, 'joglo'); },
  gereja(P) { return BUILD.ibadah(P, 'tongkonan'); },
  klenteng(P) { // a Chinese temple: red walls, gold trim, a swallow-tail ridge, lanterns
    const hx = .36, hy = .32, top = .36, RED = mat([186, 44, 40], .2), REDD = mat([146, 32, 36], .2), GOLD = [232, 184, 70];
    P.scaffold(hx, hy, top + .4, { decks: 2 });
    P.part(.2, .32, 'rise', 'dig', () => { box(-hx - .06, -hy - .06, 0, hx + .06, hy + .06, .05, STONE); box(-.12, hy + .06, 0, .12, hy + .16, .03, STONE); });
    P.part(.32, .52, 'rise', 'brick', () => {
      box(-hx, -hy, .05, hx, hy, top, { x: REDD, y: RED, top: DARKWOOD });
      door(0, -.08, hy + .001, .05, top - .06, mat([120, 30, 30], .1)); quad([-.09, hy + .003, .05], [.18, 0, 0], [0, 0, .015], mat(GOLD, .1), 3);
      for (const a of [-.27, .17]) quad([a, hy + .002, .12], [.08, 0, 0], [0, 0, .12], mat([240, 200, 110], .1, (u, v, ix, iy) => ((ix + iy) % 3 === 0 ? [120, 30, 30] : 0)), 2.6);
      for (const a of [-.32, .32]) column(a, hy + .05, .05, top, .018, [170, 36, 36]);
      for (const a of [-.2, .2]) { sphere(a, hy + .13, .06, .03, [226, 190, 90]); }
    });
    P.lights.push([-.2, hy, top - .02], [.2, hy, top - .02], [hx, 0, top - .05]);
    P.part(.52, .66, 'drop', 'saw', () => { for (const a of [-.2, .2]) { sphere(a, hy + .07, top - .05, .03, [226, 60, 50]); column(a, hy + .07, top - .02, top + .02, .006, [230, 190, 90]); } });
    P.part(.66, .84, 'drop', 'tile', () => {
      const G1 = mat([214, 150, 60], .5, (u, v, ix, iy) => ((iy % 3 + 3) % 3 === 0 ? -1 : .1));
      const ridge = s => top + .28 + Math.pow(Math.abs(s * 2 - 1), 3) * .16;
      surface((s, t) => { const X = lerp(-hx - .16, hx + .16, s), Y = lerp(0, hy + .14, t); return [X, Y, ridge(s) - t * .3 - t * t * .02 + Math.pow(Math.abs(s * 2 - 1), 3) * t * .04]; }, 90, 40, G1);
      surface((s, t) => { const X = lerp(-hx - .16, hx + .16, s), Y = lerp(0, -hy - .14, t); return [X, Y, ridge(s) - t * .3]; }, 90, 30, mat([176, 118, 50], .5));
      for (let k = 0; k <= 40; k++) { const s = k / 40; pole([lerp(-hx - .16, hx + .16, s), 0, ridge(s)], [lerp(-hx - .16, hx + .16, s), 0, ridge(s) + .03], k % 8 < 2 ? [70, 150, 120] : [220, 60, 50], 2); }
      sphere(0, 0, top + .36, .03, GOLD);
    });
    return P.finish([0, 0, top + .4], top + .44);
  },
  alun(P) { // Lapangan Pancasila: the town square with a flag and two banyans
    P.part(0, 1, 'rise', null, () => {
      box(-.92, -.92, 0, .92, .92, .006, { top: mat([116, 158, 76], .6, (u, v) => (Math.floor(u / .24) % 2 ? .22 : -.12)), x: mat([96, 130, 70], .3), y: mat([96, 130, 70], .3) });
      for (const s of [-1, 1]) { box(-.92, s * .02 - .02, .006, .92, s * .02 + .02, .008, mat([206, 196, 170], .3)); box(s * .02 - .02, -.92, .006, s * .02 + .02, .92, .008, mat([206, 196, 170], .3)); }
      for (let k = 0; k < 40; k++) { const t = k / 40 * 1.84 - .92; column(t, .92, 0, .05, .006, [226, 222, 208]); column(.92, t, 0, .05, .006, [226, 222, 208]); }
      box(-.1, -.1, 0, .1, .1, .05, { top: mat([190, 182, 164], .3), x: mat([150, 144, 130], .3), y: mat([170, 164, 148], .3) });
      column(0, 0, .05, .95, .01, [228, 228, 228]);
      for (let c = 0; c < 9; c++) for (let r = 0; r < 6; r++) quad([c * .018, 0, .93 - r * .022], [.018, 0, 0], [0, 0, .022], mat(r < 3 ? [214, 44, 44] : [244, 240, 232], 0, null, 0), 3);
      for (const [x, y] of [[-.55, -.55], [-.55 + 1.1, -.55 + 1.1]]) {
        column(x, y, 0, .4, .05, [88, 74, 62]);
        for (let n = 0; n < 240; n++) { const a = hash(n, x * 5 | 0) * 6.283, r = Math.sqrt(hash(n, 3)) * .42, z = .6 + (hash(n, 4) - .4) * .34 - r * .34; sphere(x + Math.cos(a) * r, y + Math.sin(a) * r, z, .03 + hash(n, 6) * .02, hash(n, 5) > .68 ? [120, 158, 84] : hash(n, 5) > .28 ? [72, 118, 68] : [48, 92, 60], .3); }
        for (let k = 0; k < 7; k++) { const a = k * .9, px = x + Math.cos(a) * .24, py = y + Math.sin(a) * .24; pole([px, py, .45], [px, py, 0], [110, 94, 78]); }
      }
    });
    return P.finish([0, 0, 1], .95);
  },
  prasasti(P) { // the Plumpungan stone under a small joglo roof, with a low fence
    P.part(0, 1, 'rise', null, () => {
      box(-.34, -.34, 0, .34, .34, .04, STONE);
      for (let n = 0; n < 12; n++) sphere((hash(n, 1) - .5) * .18, (hash(n, 2) - .5) * .12, .08 + hash(n, 3) * .1, .08, [118, 112, 106], .5);
      for (let k = 0; k < 4; k++) pole([-.08, .08, .08 + k * .03], [.07, .08, .08 + k * .03], [76, 70, 66]);
      for (const [a, b] of [[-.26, -.26], [.26, -.26], [-.26, .26], [.26, .26]]) column(a, b, .04, .42, .014, [106, 78, 56]);
      hipRoof(-.34, -.34, .34, .34, .42, .12, .14, TILE, TILE_DARK); hipRoof(-.17, -.17, .17, .17, .52, .14, .1, TILE, TILE_DARK);
      for (let k = 0; k <= 20; k++) { const t = k / 20 * .68 - .34; column(t, .34, .04, .1, .004, [230, 226, 214]); column(.34, t, .04, .1, .004, [230, 226, 214]); }
    });
    return P.finish([0, 0, .66], .66);
  },
  kampus(P) { // a campus block in 2 x 2: white walls, long windows, a flag
    const S = .84, top = .78, WALL = mat([232, 228, 214], .25, null, .3), WD = mat([190, 188, 176], .25, null, .3);
    P.scaffold(S, S - .22, top + .3, { decks: 3, hoist: true, t1: .14 });
    P.part(.14, .22, 'rise', 'dig', () => box(-S - .04, -S - .04, 0, S + .04, S + .04, .04, CONCRETE));
    for (let k = 0; k < 2; k++) {
      const z = .04 + k * .37;
      P.part(.22 + k * .2, .34 + k * .2, 'rise', 'brick', () => {
        box(-S, -S + .22, z, S, S - .22, z + .37, { x: WD, y: WALL, top: CONCRETE });
        quad([-S + .06, S - .22 + .003, z + .09], [2 * S - .12, 0, 0], [0, 0, .2], mat([70, 104, 130], .2, (u, v, ix) => (ix % 5 === 0 ? [232, 228, 214] : 0)), 2);
        quad([S + .003, -.4, z + .09], [0, .8, 0], [0, 0, .2], mat([56, 84, 108], .2, (u, v, ix) => (ix % 5 === 0 ? [190, 188, 176] : 0)), 1.1);
      });
    }
    P.lights.push([-.4, S - .22, .25], [.3, S - .22, .25], [-.2, S - .22, .62], [.5, S - .22, .62], [S, 0, .25], [S, 0, .62]);
    P.part(.66, .84, 'drop', 'tile', () => { hipRoof(-S - .08, -S + .14, S + .08, S - .14, .78, .22, .22, TILE, TILE_DARK); column(.5, S + .0, .04, 1.06, .008, [226, 226, 226]); for (let c = 0; c < 8; c++) for (let r = 0; r < 5; r++) quad([.5 + c * .017, S, 1.04 - r * .02], [.017, 0, 0], [0, 0, .02], mat(r < 2.5 ? [214, 44, 44] : [244, 240, 232], 0, null, 0), 3); });
    return P.finish([0, 0, 1], 1.06);
  },

  halte(P) { // a bus shelter: blue steel, a bench, a sign
    const c = [62, 120, 176], steel = mat(c, .2);
    P.part(0, .2, 'rise', 'dig', () => box(-.4, -.24, 0, .4, .24, .03, CONCRETE));
    P.part(.2, .5, 'rise', 'hammer', () => { for (const [a, b] of [[-.32, -.15], [.32, -.15], [-.32, .15], [.32, .15]]) column(a, b, .03, .34, .012, c); box(-.28, -.14, .03, .28, -.1, .22, mat([180, 210, 226], .2)); });
    P.part(.5, .66, 'drop', 'lash', () => { box(-.24, -.08, .1, .24, .02, .12, TEAK); });
    P.part(.66, .84, 'drop', 'tile', () => { box(-.38, -.22, .34, .38, .22, .365, { top: steel, x: mat([40, 92, 140], .2), y: mat([40, 92, 140], .2) }); column(.42, .2, .03, .5, .01, [180, 180, 184]); box(.38, .18, .44, .47, .2, .52, mat([232, 196, 60], .1)); });
    P.lights.push([0, 0, .32]);
    return P.finish([0, 0, .4], .36);
  },
  kantor(P) { // an office tower: glass bands and a roof sign
    const hx = .4, hy = .38, F = .3, floors = 6, top = floors * F, GLASS = mat([86, 136, 170], .2, (u, v, ix, iy) => (ix % 4 === 0 ? [190, 208, 220] : (iy % 3 === 0 ? -.5 : .1)), .1), GLASSD = mat([58, 100, 134], .2, (u, v, ix, iy) => (ix % 4 === 0 ? [140, 160, 176] : (iy % 3 === 0 ? -.5 : .1)), .1);
    P.scaffold(hx, hy, top + .12, { decks: 4, hoist: true, t1: .16 });
    P.part(.16, .22, 'rise', 'dig', () => box(-hx - .03, -hy - .03, 0, hx + .03, hy + .03, .05, CONCRETE));
    for (let k = 0; k < floors; k++) { const z = .05 + k * F; P.part(.22 + k * .1, .3 + k * .1, 'rise', 'brick', () => { box(-hx, -hy, z, hx, hy, z + F - .02, { x: GLASSD, y: GLASS, top: CONCRETE }); box(-hx - .003, -hy - .003, z + F - .03, hx + .003, hy + .003, z + F, CONCRETE); }); if (k % 2) P.lights.push([hx, -.2 + k * .06, z + .15], [-.2 + k * .05, hy, z + .15]); }
    P.part(.8, .84, 'drop', 'tile', () => { box(-.2, -.2, top + .05, .2, .2, top + .14, CONCRETE); box(hx - .02, -.2, top + .05, hx, .2, top + .22, mat([196, 58, 48], .1, (u, v, ix) => (ix % 3 === 0 ? [240, 232, 200] : 0))); });
    return P.finish([0, 0, top + .26], top + .24);
  },
  stasiun(P, facing = 'x+') { // a colonial station hall with a canopy over the platform on the rail side
    const along = facing[0] === 'x', sign = facing[1] === '+' ? 1 : -1;
    const R = (u0, v0, z0, u1, v1, z1, m) => { const a0 = along ? u0 : v0 * sign, a1 = along ? u1 : v1 * sign, b0 = along ? v0 * sign : u0, b1 = along ? v1 * sign : u1; box(Math.min(a0, a1), Math.min(b0, b1), z0, Math.max(a0, a1), Math.max(b0, b1), z1, m); };
    const C = (u, v, z0, z1, r, c) => column(along ? u : v * sign, along ? v * sign : u, z0, z1, r, c);
    const WALL = { x: mat([206, 200, 186], .25), y: PLASTER, top: CONCRETE };
    P.scaffold(.88, .86, .9, { decks: 2, hoist: true, t1: .14 });
    P.part(.14, .22, 'rise', 'dig', () => { R(-.96, -.92, 0, .96, .92, .04, CONCRETE); R(-.96, .35, .04, .96, .92, .1, mat([190, 182, 164], .3)); });
    P.part(.22, .4, 'rise', 'brick', () => {
      R(-.86, -.82, .04, .86, .3, .46, WALL);
      for (let k = -2; k <= 2; k++) { R(k * .32 - .08, .3, .1, k * .32 + .08, .305, .36, mat([70, 104, 130], .2)); }
    });
    P.part(.4, .54, 'rise', 'brick', () => { R(-.3, -.82, .04, .3, .34, .72, WALL); R(-.1, .335, .52, .1, .345, .68, mat([240, 236, 220], .1)); C(0, .35, .58, .63, .05, [240, 236, 216]); C(0, .36, .6, .61, .012, [40, 40, 44]); });
    P.lights.push([0, along ? .3 * sign : 0, .3]);
    P.part(.54, .66, 'drop', 'tile', () => {
      if (along) { hipRoof(-.92, -.88, .92, .36, .46, .24, .2, TILE, TILE_DARK); hipRoof(-.36, -.88, .36, .4, .72, .26, .12, TILE, TILE_DARK); }
      else { hipRoof(-.88 * (sign > 0 ? 1 : -1) < 0 ? -.88 : -.36, -.92, sign > 0 ? .36 : .88, .92, .46, .24, .2, TILE, TILE_DARK); hipRoof(sign > 0 ? -.88 : -.4, -.36, sign > 0 ? .4 : .88, .36, .72, .26, .12, TILE, TILE_DARK); }
    }, { hoisted: true, hx: 0, hy: 0 });
    P.part(.66, .78, 'rise', 'hammer', () => { for (let k = -3; k <= 3; k++) C(k * .28, .78, .1, .48, .012, [96, 110, 96]); });
    P.part(.78, .84, 'drop', 'hammer', () => R(-.94, .46, .48, .94, .92, .515, { top: mat([120, 136, 120], .3), x: mat([90, 104, 90], .3), y: mat([90, 104, 90], .3) }));
    return P.finish([0, 0, 1], .98);
  },
  layang(P, facing = 'x+') { // a flyover across the rail. The road runs across the rail axis
    const acrossX = facing[0] !== 'x';
    P.part(0, .25, 'rise', 'thud', () => { for (const s of [-.46, .46]) for (const t of [-.22, .22]) column(acrossX ? s : t, acrossX ? t : s, 0, .34, .03, [140, 134, 124]); });
    P.part(.25, .84, 'drop', 'brick', () => {
      const deck = mat([84, 84, 88], .3), rim = [178, 172, 160];
      surface((s, t) => { const u = s * 2 - 1, v = (t - .5) * .6, z = .42 * (1 - u * u); return acrossX ? [u * .5, v, z] : [v, u * .5, z]; }, 70, 24, deck);
      for (const side of [-.3, .3]) for (let k = 0; k <= 30; k++) { const u = k / 15 - 1, z = .42 * (1 - u * u) + .03; column(acrossX ? u * .5 : side, acrossX ? side : u * .5, z - .02, z + .03, .008, rim); }
    });
    return P.finish([0, 0, .55], .5);
  },
  gigi(P, facing = 'x+') { // a toothed rack between the rails
    const along = facing[0] === 'x';
    P.part(0, .84, 'rise', 'hammer', () => { for (let k = 0; k < 12; k++) { const u = -.46 + k * .083, c = k % 2 ? [226, 196, 90] : [150, 140, 110]; if (along) box(u, -.03, 0, u + .05, .03, .03, mat(c, 0)); else box(-.03, u, 0, .03, u + .05, .03, mat(c, 0)); } });
    return P.finish([0, 0, .1], .03);
  },
  jembatan(P) { // a bridge: piers first, then the deck and rails
    const c = [132, 126, 118];
    P.part(0, .3, 'rise', 'thud', () => { for (const s of [-1, 1]) for (const a of [-.3, .3]) column(a, s * .34, -.42, -.02, .04, c); });
    P.part(.3, .6, 'drop', 'hammer', () => box(-.5, -.42, -.05, .5, .42, 0, { top: mat([96, 94, 96], .3), x: CONCRETE, y: CONCRETE }));
    P.part(.6, .84, 'rise', 'hammer', () => { for (const s of [-1, 1]) { for (let k = 0; k <= 8; k++) column(-.5 + k * .125, s * .42, 0, .09, .008, [190, 186, 176]); box(-.5, s * .42 - .012, .09, .5, s * .42 + .012, .105, CONCRETE); } });
    return P.finish([0, 0, .2], .1);
  },
  ruko(P, style, variant, x, y) { // a shophouse: rolling shutter below, a balcony above, a water tank on the roof
    const paints = [[176, 214, 196], [236, 206, 150], [226, 170, 160], [186, 204, 226], [232, 228, 208]], c = paints[Math.floor(hash(x * 5 + 1, y * 7 + 2) * 5)];
    const WALL = mat(c, .25, null, .3), WALLD = mat([c[0] * .86 | 0, c[1] * .86 | 0, c[2] * .9 | 0], .25, null, .3), hx = .38, hy = .36, f1 = .36, f2 = .72;
    P.scaffold(hx, hy, f2 + .22, { decks: 2 });
    P.part(.2, .34, 'rise', 'brick', () => box(-hx, -hy, 0, hx, hy, f1, { x: BRICK, y: BRICK, top: CONCRETE }));
    P.part(.34, .46, 'rise', 'brick', () => {
      box(-hx - .002, -hy - .002, 0, hx + .002, hy + .002, f1, { x: WALLD, y: WALL, top: CONCRETE });
      // rolling shutters on the road sides
      const rib = mat([150, 154, 158], .1, (u, v, ix, iy) => (iy % 2 ? -.8 : .2), .1);
      quad([-.28, hy + .004, .01], [.56, 0, 0], [0, 0, .25], rib, 2.2);
      quad([hx + .004, -.28, .01], [0, .56, 0], [0, 0, .25], mat([70, 64, 66], .1), 1);
      for (const a of [-.2, 0, .2]) column(hx + .02, a, .02, .09, .03, [[200, 80, 60], [220, 190, 90], [90, 140, 96]][(a * 5 + 1) | 0] || [200, 80, 60]);
    });
    P.lights.push([hx, 0, .16]);
    P.part(.46, .58, 'rise', 'brick', () => box(-hx, -hy, f1, hx, hy, f2, { x: WALLD, y: WALL, top: CONCRETE }));
    P.part(.58, .68, 'drop', 'hammer', () => {
      // awning and signboard
      trap([-hx - .02, hy + .12, f1 - .04], [hx + .02, hy + .12, f1 - .04], [hx + .02, hy, f1 + .02], [-hx - .02, hy, f1 + .02], mat([60, 130, 170], .2, (u) => (Math.floor(u / .1) % 2 ? [232, 232, 220] : 0)));
      quad([hx + .005, -.3, f1 + .03], [0, .6, 0], [0, 0, .09], mat(c[0] > 200 ? [196, 58, 48] : [40, 90, 150], .1, (u, v, ix) => (ix % 3 === 0 ? [240, 232, 200] : 0)), 2.4);
    });
    P.part(.68, .76, 'rise', 'hammer', () => {
      for (const a of [-.2, .08]) shutters(0, a, hy + .002, f1 + .1, f2 - .06, mat([120, 84, 58], .2));
      shutters(1, -.05, hx + .002, f1 + .1, f2 - .06, mat([120, 84, 58], .2));
      rail(-hx, hy, hx, hy + .06, f1 + .04, [60, 60, 64]);
    });
    P.lights.push([.13, hy, f1 + .2], [hx, 0, f1 + .2]);
    P.part(.76, .84, 'drop', 'lash', () => {
      box(-hx - .01, -hy - .01, f2, hx + .01, hy + .01, f2 + .05, { x: WALLD, y: WALL, top: mat([120, 112, 104], .4) });
      column(-.14, -.1, f2 + .05, f2 + .1, .05, [120, 120, 124]); column(-.14, -.1, f2 + .1, f2 + .2, .06, [224, 130, 54]); // the water tank
      pole([.2, -.2, f2 + .05], [.2, -.2, f2 + .34], [150, 150, 154]); pole([.14, -.2, f2 + .3], [.26, -.2, f2 + .3], [150, 150, 154]); // an antenna
    });
    return P.finish([0, 0, f2 + .34], f2 + .2);
  },
  rusun(P) { // a block of flats: floors rise one at a time inside tall bamboo
    const hx = .42, hy = .38, F = .34, floors = 5, top = floors * F;
    P.scaffold(hx, hy, top + .12, { decks: 4, hoist: true, t1: .16 });
    const WALL = mat([226, 220, 202], .25, null, .3), WALLD = mat([186, 180, 172], .25, null, .3), PAINT = mat([92, 150, 150], .2);
    P.part(.16, .22, 'rise', 'dig', () => box(-hx - .03, -hy - .03, 0, hx + .03, hy + .03, .05, CONCRETE));
    for (let k = 0; k < floors; k++) {
      const z = .05 + k * F, t0 = .22 + k * .1;
      P.part(t0, t0 + .06, 'rise', 'brick', () => {
        box(-hx, -hy, z, hx, hy, z + F, { x: WALLD, y: WALL, top: CONCRETE });
        quad([-hx, hy + .003, z], [2 * hx, 0, 0], [0, 0, .035], PAINT, 2.2); quad([hx + .003, -hy, z], [0, 2 * hy, 0], [0, 0, .035], mat([70, 120, 122], .2), 1.2);
      });
      P.part(t0 + .06, t0 + .1, 'drop', 'hammer', () => {
        for (const a of [-.3, -.05, .2]) {
          quad([a, hy + .003, z + .09], [.13, 0, 0], [0, 0, .17], WINDOW, 1);
          quad([hx + .003, a, z + .09], [0, .13, 0], [0, 0, .17], WINDOW, .6);
          box(a - .015, hy, z + .04, a + .15, hy + .07, z + .06, CONCRETE); // balcony
          pole([a - .015, hy + .07, z + .13], [a + .15, hy + .07, z + .13], [70, 70, 74]);
          // laundry on some balconies
          if (hash(k, a * 40 | 0) > .35) for (let c = 0; c < 3; c++) pole([a + c * .05, hy + .072, z + .13], [a + c * .05, hy + .072, z + .08], [[214, 80, 70], [240, 236, 220], [80, 130, 190], [226, 190, 80]][(k + c) % 4], 2);
        }
      });
      if (k % 2 === 0) P.lights.push([hx, -.25, z + .17], [-.24, hy, z + .17]); else P.lights.push([hx, .15, z + .17]);
    }
    P.part(.78, .84, 'drop', 'tile', () => {
      box(-hx - .01, -hy - .01, .05 + top, hx + .01, hy + .01, .1 + top, { x: WALLD, y: WALL, top: mat([128, 120, 112], .4) });
      for (const a of [-.22, .14]) { column(a, -.1, .1 + top, .14 + top, .06, [120, 120, 124]); column(a, -.1, .14 + top, .26 + top, .07, [224, 130, 54]); }
    });
    return P.finish([0, 0, top + .34], top + .26);
  },
  pasar(P) { // a market hall: a zinc roof on posts, stalls full of colour
    const hx = .44, hy = .4, top = .42;
    P.scaffold(hx, hy, top + .24, { decks: 1 });
    P.part(.2, .3, 'rise', 'dig', () => box(-hx, -hy, 0, hx, hy, .03, CONCRETE));
    P.part(.3, .46, 'rise', 'thud', () => { for (const a of [-hx, 0, hx]) for (const b of [-hy, hy]) column(a, b, .03, top, .018, [100, 96, 96]); });
    P.part(.46, .62, 'drop', 'hammer', () => {
      const goods = [[210, 70, 54], [236, 180, 60], [90, 150, 80], [230, 120, 50], [200, 200, 170], [130, 90, 150]];
      for (const [a, b] of [[-.26, .22], [.08, .22], [.26, -.08], [-.1, -.1]]) {
        box(a - .12, b - .08, .03, a + .12, b + .08, .13, { top: TEAK, x: DARKWOOD, y: TEAK });
        for (let k = 0; k < 9; k++) sphere(a - .09 + (k % 3) * .09, b - .05 + (k / 3 | 0) * .05, .15, .016, goods[(k + Math.round(a * 9)) % 6 < 0 ? 0 : Math.abs((k + Math.round(a * 9)) % 6)]);
      }
      for (let k = 0; k < 5; k++) column(hx - .03, -.3 + k * .15, .03, .09, .026, [170, 134, 88]); // baskets
    });
    P.lights.push([0, 0, .3]);
    P.part(.62, .84, 'drop', 'tile', () => {
      const z = mat([164, 168, 170], .35, (u, v, ix) => (ix % 3 === 0 ? -.7 : (hash(ix >> 3, 4) > .8 ? -.4 : .15)), .2);
      gableRoof(-hx, -hy - .1, hx, hy + .1, top - .01, .22, z, mat([120, 96, 80], .4));
      quad([hx + .11, -.22, top + .02], [0, .44, 0], [0, 0, .07], mat([196, 58, 48], .1, (u, v, ix) => (ix % 3 === 0 ? [240, 232, 200] : 0)), 2.6);
    });
    return P.finish([0, 0, top + .22], top + .22);
  },
  sekolah(P) { // a long classroom block: white walls, green doors, a flag in the yard
    const hx = .42, hy = .24, top = .34;
    P.scaffold(hx, hy, top + .22, { decks: 1 });
    P.part(.2, .3, 'rise', 'dig', () => box(-hx - .03, -hy - .03, 0, hx + .03, hy + .22, .025, CONCRETE));
    P.part(.3, .52, 'rise', 'brick', () => {
      box(-hx, -hy, .025, hx, hy, top, { x: mat([190, 186, 176], .2), y: PLASTER, top: CONCRETE });
      quad([-hx, hy + .002, .025], [2 * hx, 0, 0], [0, 0, .05], mat([96, 140, 96], .2), 2.3);
      for (const a of [-.34, -.1, .14]) { door(0, a, hy + .002, .03, top - .08, PAINT_GREEN); quad([a + .12, hy + .002, .12], [.08, 0, 0], [0, 0, .12], WINDOW, 1); }
      for (const a of [-.34, -.1, .14, .3]) column(a + .05, hy + .05, .025, top, .012, [230, 226, 214]);
    });
    P.lights.push([-.2, hy, .2], [.1, hy, .2]);
    P.part(.52, .84, 'drop', 'tile', () => gableRoof(-hx, -hy - .08, hx, hy + .1, top - .01, .2, TILE, mat([220, 214, 200], .3)));
    P.part(.84, .9, 'rise', null, () => {
      column(.3, hy + .3, .0, .62, .008, [226, 226, 226]);
      for (let c = 0; c < 6; c++) for (let r = 0; r < 4; r++) quad([.3 + c * .015, hy + .3, .6 - r * .022], [.015, 0, 0], [0, 0, .022], mat(r < 2 ? [214, 44, 44] : [244, 240, 232], 0, null, 0), 3);
    });
    return P.finish([0, 0, top + .2], top + .2);
  },
  ibadah(P, style) { // masjid, pura or gereja, by region
    if (style === 'bali') { // a pura: a split gate and a tiered meru
      P.scaffold(.38, .38, 1.05, { decks: 2 });
      P.part(.2, .34, 'rise', 'brick', () => { box(-.42, -.42, 0, .42, .42, .06, PARAS); });
      P.part(.34, .5, 'rise', 'brick', () => { for (const s of [-1, 1]) { box(.42 - .1, s * .14 - .06, .06, .42, s * .14 + .06, .42, { x: BRICK, y: BRICK, top: PARAS }); box(.42 - .08, s * .14 - .04, .42, .42 - .02, s * .14 + .04, .52, PARAS); } });
      P.part(.5, .84, 'rise', 'thud', () => {
        box(-.26, -.26, .06, .1, .1, .3, { x: BRICK, y: BRICK, top: PARAS });
        for (let k = 0; k < 5; k++) { const r = .32 - k * .05, z = .3 + k * .14; box(-.08 - r, -.08 - r, z, -.08 + r, -.08 + r, z + .03, IJUK); hipRoof(-.08 - r, -.08 - r, -.08 + r, -.08 + r, z + .03, .1, r * .6, IJUK); }
      });
      return P.finish([-.08, -.08, 1.05], 1.05);
    }
    if (style === 'tongkonan') { // a white church with a small steeple
      P.scaffold(.3, .4, .9, { decks: 2 });
      P.part(.2, .46, 'rise', 'brick', () => { box(-.28, -.38, 0, .28, .38, .42, { x: mat([196, 192, 182], .2), y: PLASTER, top: CONCRETE }); door(1, -.05, .28, 0, .22, TEAK); for (const a of [-.25, 0, .22]) quad([a, .382, .14], [.07, 0, 0], [0, 0, .18], mat([120, 170, 200], .2), 2.2); });
      P.part(.46, .66, 'drop', 'tile', () => gableRoof(-.28, -.38, .28, .38, .41, .0, TILE));
      P.part(.46, .66, 'drop', 'tile', () => { trap([-.3, .4, .41], [.3, .4, .41], [.3, 0, .68], [-.3, 0, .68], TILE); trap([-.3, -.4, .41], [.3, -.4, .41], [.3, 0, .68], [-.3, 0, .68], TILE_DARK); tri([.28, -.38, .41], [.28, .38, .41], [.28, 0, .67], PLASTER); });
      P.part(.66, .84, 'rise', 'hammer', () => { box(.16, -.08, .4, .3, .08, .86, { x: mat([196, 192, 182], .2), y: PLASTER, top: CONCRETE }); pole([.23, 0, .86], [.23, 0, 1.02], [90, 80, 70], 2); pole([.17, 0, .97], [.29, 0, .97], [90, 80, 70], 2); });
      P.lights.push([.28, 0, .2]);
      return P.finish([.23, 0, 1.02], 1.02);
    }
    // a masjid: a tiered roof or a dome by region, and a minaret
    P.scaffold(.38, .38, .9, { decks: 2, hoist: false });
    P.part(.2, .3, 'rise', 'dig', () => box(-.42, -.42, 0, .42, .42, .05, CONCRETE));
    P.part(.3, .5, 'rise', 'brick', () => {
      box(-.34, -.34, .05, .34, .34, .4, { x: mat([196, 192, 182], .2), y: PLASTER, top: CONCRETE });
      for (const a of [-.24, -.04, .16]) { quad([a, .343, .1], [.1, 0, 0], [0, 0, .2], mat([88, 150, 130], .2), 2.2); quad([.343, a, .1], [0, .1, 0], [0, 0, .2], mat([70, 120, 110], .2), 1.2); sphere(a + .05, .345, .3, .05, [88, 150, 130]); sphere(.345, a + .05, .3, .05, [70, 120, 110]); }
    });
    P.lights.push([.34, 0, .2], [0, .34, .2], [-.2, .34, .2], [.34, -.2, .2]);
    if (style === 'joglo' || style === 'mix' || style === 'kolonial') {
      P.part(.5, .84, 'drop', 'tile', () => { // Javanese tiered roof, the old form
        hipRoof(-.42, -.42, .42, .42, .39, .15, .2, SHINGLE); hipRoof(-.27, -.27, .27, .27, .52, .16, .16, SHINGLE); hipRoof(-.14, -.14, .14, .14, .66, .16, .08, SHINGLE);
        pole([0, 0, .82], [0, 0, .96], [214, 190, 90], 2);
      });
    } else {
      P.part(.5, .84, 'drop', 'tile', () => { // a round dome
        for (let k = 0; k < 14; k++) { const u = k / 13, r = .3 * Math.sqrt(1 - u * u * .92); box(-r, -r, .4 + u * .3, r, r, .42 + u * .3, { x: mat([40, 96, 90], .2), y: mat([58, 124, 110], .2), top: mat([70, 140, 124], .2) }); }
        pole([0, 0, .7], [0, 0, .82], [226, 190, 80], 2);
      });
    }
    P.part(.7, .84, 'rise', 'brick', () => { column(.34, .34, .05, .92, .05, [232, 228, 214]); column(.34, .34, .72, .76, .075, [200, 194, 180]); column(.34, .34, .9, 1.0, .03, [88, 150, 130]); });
    return P.finish([0, 0, .96], .96);
  },
  taman(P) { // a small park: a path, flower beds, two trees, a bench
    P.part(0, .2, 'pop', 'dig', () => { for (const [a, b] of [[-.44, -.44], [.44, .44]]) bamboo([a, b, 0], [a, b, .1]); }, { scaffold: true });
    P.part(.2, .5, 'rise', 'dig', () => {
      box(-.08, -.5, 0, .08, .5, .004, mat([190, 176, 150], .4)); box(-.5, -.08, 0, .5, .08, .004, mat([190, 176, 150], .4));
      for (let k = 0; k < 40; k++) { const s = (hash(k, 1) - .5) * .8, t = (hash(k, 2) - .5) * .8; if (Math.abs(s) > .12 && Math.abs(t) > .12) sphere(s, t, .02, .014, [[220, 80, 90], [240, 200, 80], [240, 240, 220], [170, 110, 200]][k % 4]); }
    });
    P.part(.5, .84, 'rise', 'lash', () => {
      for (const [x, y] of [[-.28, -.28], [.28, .28]]) {
        column(x, y, 0, .34, .022, [92, 76, 62]);
        for (let n = 0; n < 60; n++) { const a = hash(n, x * 9 | 0) * 6.283, r = Math.sqrt(hash(n, 3)) * .2, z = .42 + (hash(n, 4) - .4) * .24 - r * .3; sphere(x + Math.cos(a) * r, y + Math.sin(a) * r, z, .025, hash(n, 5) > .6 ? [130, 170, 84] : [70, 124, 70], .3); }
      }
      box(.14, -.3, .05, .3, -.25, .065, WOOD); column(.16, -.28, 0, .05, .008, [90, 70, 56]); column(.28, -.28, 0, .05, .008, [90, 70, 56]);
    });
    return P.finish([0, 0, .5], .5);
  },
  pompa(P) { // a pump house: a concrete hut, a big pipe, an exhaust stack
    P.scaffold(.3, .26, .55, { decks: 1 });
    P.part(.2, .46, 'rise', 'brick', () => { box(-.32, -.28, 0, .32, .28, .34, { x: mat([140, 136, 128], .4), y: CONCRETE, top: CONCRETE }); door(0, -.05, .28, 0, .22, mat([70, 110, 150], .2)); });
    P.part(.46, .68, 'drop', 'thud', () => {
      for (let k = 0; k < 10; k++) column(.32 + k * .018, .0, .15 - k * .002, .24 - k * .002, .05, [66, 112, 150]);
      for (let k = 0; k < 8; k++) column(-.36 + k * .018, .0, .03, .13, .045, [66, 112, 150]);
    });
    P.part(.68, .84, 'drop', 'tile', () => { gableRoof(-.32, -.28, .32, .28, .34, .1, ZINC, CONCRETE); column(-.18, -.14, .34, .6, .022, [60, 58, 60]); });
    P.lights.push([.0, .28, .26]);
    return P.finish([0, 0, .6], .5);
  },
};

export function blueprint(type, style, variant, x, y) {
  const mix = type === 'rumah' && style === 'mix';
  const key = `${type}:${['stasiun', 'layang', 'gigi'].includes(type) ? style : type === 'rumah' ? (mix ? `mix${Math.floor(hash(x * 13 + 1, y * 17 + 3) * 6)}` : style) : type === 'ibadah' ? style : type === 'ruko' ? Math.floor(hash(x * 5 + 1, y * 7 + 2) * 5) : ''}`;
  let bp = cache.get(key);
  if (bp) return bp;
  const P = new Plan();
  bp = BUILD[type](P, style, variant, x, y);
  cache.set(key, bp);
  return bp;
}

// Picture for a card and the drag ghost. Terrain cards have no building, so they get their own small tile
const arts = new Map();
const tileBase = (mTop) => { box(-.5, -.5, -.14, .5, .5, 0, { top: mTop, x: SOIL_M, y: SOIL_M }); };
const GRASS_M = mat([96, 142, 70], .9);
const WATER_M = mat([130, 190, 214], .3, (u, v, ix, iy) => ((ix + iy * 2) % 7 === 0 ? [226, 244, 244] : 0));
export function cardArt(type, style) {
  const key = type + ':' + style;
  if (arts.has(key)) return arts.get(key);
  let st;
  const makers = {
    sawah() {
      tileBase(mat([104, 124, 66], .8));
      box(-.42, -.42, .0, .42, .42, .004, WATER_M);
      for (let a = 0; a < 6; a++) for (let c = 0; c < 6; c++) pole([-.36 + a * .145, -.36 + c * .145, .004], [-.36 + a * .145, -.36 + c * .145, .1], [124, 178, 84]);
    },
    saluran() {
      tileBase(mat([122, 92, 66], .8));
      box(-.17, -.5, -.03, .17, .5, .0, WATER_M);
      box(-.5, -.17, -.03, .5, .17, .0, WATER_M);
    },
    tanggul() {
      tileBase(GRASS_M);
      box(-.5, -.5, 0, .5, .5, .34, { top: STONE, x: STONE, y: STONE });
    },
    jalan() {
      tileBase(mat([172, 164, 150], .5));
      box(-.3, -.5, 0, .3, .5, .002, mat([78, 76, 80], .4));
      for (let k = 0; k < 4; k++) box(-.02, -.42 + k * .25, .002, .02, -.3 + k * .25, .004, mat([226, 218, 190], 0, null, 0));
    },
    gigi() { tileBase(mat([120, 114, 106], .6)); for (const s of [-.2, .2]) box(-.5, s - .015, 0, .5, s + .015, .02, mat([100, 100, 106], .2)); for (let k = 0; k < 12; k++) box(-.46 + k * .083, -.04, 0, -.41 + k * .083, .04, .035, mat(k % 2 ? [226, 196, 90] : [150, 140, 110], 0)); },
    lapangan() {
      tileBase(mat([132, 168, 80], .8));
      pole([0, 0, 0], [.34, -.1, .62], [230, 226, 210]);
      for (let r = 0; r < 7; r++) { const w = (3.5 - Math.abs(r - 3)) * .018; pole([.34 - w, -.1 + w, .7 - r * .024], [.34 + w, -.1 - w, .7 - r * .024], r < 3 ? [214, 62, 54] : [250, 208, 70]); }
    },
  };
  if (makers[type]) { beginStamp(false); makers[type](); st = endStamp(); }
  else st = blueprint(type, style === 'mix' ? 'joglo' : style, 0, 0, 0).done;
  arts.set(key, st);
  return st;
}
