// The people. Each one is a small physical body, drawn as pixels: feet plant on the ground and stay there, a spring carries the hips,
// the spine leans with acceleration, wind and the quake's own ground acceleration, and scarves, baskets and umbrellas swing on verlet points.
// This is presentation. The sim does not know they exist, except the evacuation walkers, whose positions the sim owns.
import { clamp, hash, depthOf, TW, TH, ZS } from '../core.js';
import { CATALOG } from '../sim/catalog.js';
import { DT } from '../sim/world.js';
import { rgb, mixc } from './frame.js';
import { P_DUST, P_SPRAY, P_CHIP } from './bodies.js';

const G = 7.5, TAU = 6.283;
const INK = rgb(30, 26, 34), SHADOW = rgb(40, 40, 60), WOOD = rgb(132, 100, 68), STEEL = rgb(130, 132, 138), ROPE = rgb(96, 78, 56), WET = rgb(226, 240, 244);
const SKIN = [rgb(198, 146, 104), rgb(176, 124, 88), rgb(156, 106, 76)];
const HAIR = [rgb(30, 26, 30), rgb(48, 36, 32), rgb(38, 30, 40)];
const SHIRT = [rgb(206, 66, 54), rgb(52, 112, 176), rgb(240, 226, 190), rgb(70, 146, 92), rgb(232, 168, 48), rgb(142, 86, 168), rgb(232, 110, 120), rgb(40, 150, 160)];
const PANTS = [rgb(52, 46, 54), rgb(62, 66, 88), rgb(92, 76, 62)];
const BATIK = [[rgb(120, 66, 40), rgb(206, 160, 96)], [rgb(44, 58, 104), rgb(186, 176, 150)], [rgb(116, 40, 52), rgb(216, 170, 80)]];
const SCARF = [rgb(236, 226, 214), rgb(70, 130, 150), rgb(214, 104, 120), rgb(120, 100, 170), rgb(238, 196, 90)];
const CAPING = [rgb(222, 196, 124), rgb(232, 212, 146), rgb(200, 172, 106)];
const BROLLY = [rgb(214, 56, 60), rgb(46, 110, 190), rgb(240, 186, 50), rgb(60, 150, 110)];
const WARES = [rgb(90, 160, 80), rgb(226, 160, 60), rgb(214, 80, 60)];

// the local pixel buffer. Each figure draws here first, so it can carry a soft outline as one shape
const BW = 33, BH = 40, AX = 16, AY = 33, buf = new Uint32Array(BW * BH);
const put = (x, y, c) => { const ix = x + AX, iy = y + AY; if (ix >= 0 && iy >= 0 && ix < BW && iy < BH) buf[iy * BW + ix] = c; };
function line(x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx - dy, n = 40;
  for (;;) { put(x0, y0, c); if ((x0 === x1 && y0 === y1) || !n--) break; const e2 = 2 * e; if (e2 > -dy) { e -= dy; x0 += sx; } if (e2 < dx) { e += dx; y0 += sy; } }
}
// writes the buffer to the frame with a soft dark edge. The edge writes no depth
function stamp(frame, sx, sy, d, clipY) {
  const { W, H, pix, zb } = frame;
  for (let iy = 0; iy < BH; iy++) for (let ix = 0; ix < BW; ix++) {
    const k = iy * BW + ix, c = buf[k];
    if (!c && !((ix > 0 && buf[k - 1]) || (ix < BW - 1 && buf[k + 1]) || (iy > 0 && buf[k - BW]) || (iy < BH - 1 && buf[k + BW]))) continue;
    const X = sx + ix - AX, Y = sy + iy - AY;
    if (X < 0 || Y < 0 || X >= W || Y >= H || Y > clipY) continue;
    const j = Y * W + X, dep = d + (AY - iy) * .02;
    if (dep <= zb[j]) continue;
    if (c) { zb[j] = dep; pix[j] = c; } else pix[j] = mixc(pix[j], INK, .55);
  }
  buf.fill(0);
}

// who they are. The kinds come from the town's own streets: market sellers with a yoke, farmers in a caping, children who cannot walk slowly
function dress(k, style) {
  const h = (n) => hash(k * 13 + 5, n), pick = (a, n) => a[(h(n) * a.length) | 0];
  const look = { kind: 'adult', skin: pick(SKIN, 1), hair: pick(HAIR, 2), shirt: pick(SHIRT, 3), pants: pick(PANTS, 4), hat: 0, hatC: 0, skirt: null, tail: 0, tailC: 0, legs: 3, torso: 3, pace: .9 + h(5) * .25, brolly: h(6) < .45 ? pick(BROLLY, 7) : 0, yoke: 0, load: 0, cane: false, lantern: h(8) < .3 };
  switch (k % 9) {
    case 0: look.hat = 'songkok'; look.hatC = rgb(34, 30, 38); break;
    case 1: look.hat = 'hijab'; look.hatC = pick(SCARF, 9); look.skirt = pick(BATIK, 10); look.tail = 2; look.tailC = look.hatC; break;
    case 2: look.kind = 'kid'; look.legs = 2; look.torso = 2; look.pace = 1.45; look.brolly = 0; look.lantern = false; break;
    case 3: look.hat = 'caping'; look.hatC = pick(CAPING, 9); break;
    case 4: look.skirt = pick(BATIK, 10); look.tail = 3; look.tailC = look.hair; break;
    case 5: look.kind = 'seller'; look.yoke = pick(WARES, 11); look.hat = h(12) < .5 ? 'caping' : 0; look.hatC = pick(CAPING, 9); look.pace = .72; look.brolly = 0; break;
    case 6: look.kind = 'elder'; look.hair = rgb(196, 194, 190); look.cane = true; look.pace = .55; look.skirt = h(10) < .5 ? pick(BATIK, 10) : null; look.brolly = 0; break;
    case 7: look.kind = 'kid'; look.legs = 2; look.torso = 2; look.pace = 1.3; look.tail = 2; look.tailC = look.hair; look.brolly = 0; look.lantern = false; break;
    default: if (style === 'bali') { look.load = pick(WARES, 11); look.skirt = pick(BATIK, 10); look.tail = 2; look.tailC = look.hair; } else if (h(9) < .5) { look.hat = 'hijab'; look.hatC = pick(SCARF, 9); look.tail = 2; look.tailC = look.hatC; }
  }
  if (style === 'bali' && k % 9 === 0) { look.hat = 'udeng'; look.hatC = rgb(240, 236, 226); }
  return look;
}

export class Toon {
  constructor(k, x, y, z, style) {
    Object.assign(this, dress(k, style));
    this.k = k; this.x = x; this.y = y; this.z = z; this.vx = 0; this.vy = 0; this.vz = 0; this.air = false;
    this.ax = (x - y) * TW; this.ay = (x + y) * TH - z * ZS; // where the body was last step, in pixels. The secondary motion reads this
    this.f = [{ x: x - .02, y: y + .02, z, t: 1, fx: x, fy: y, fz: z, tx: x, ty: y, tz: z, dur: .2, lift: 0 }, { x: x + .02, y: y - .02, z, t: 1, fx: x, fy: y, fz: z, tx: x, ty: y, tz: z, dur: .2, lift: 0 }];
    this.hs = this.legs === 2 ? 3 : 4; this.next = 0; this.hy = 0; this.hv = 0; this.crouch = 0; this.lx = 0; this.lv = 0; this.hx = 0; this.hxv = 0; this.swing = 0;
    this.face = hash(k, 21) < .5 ? 1 : -1; this.back = false;
    this.act = 'wait'; this.pose = 'idle'; this.timer = hash(k, 22) * 3; this.tx = x; this.ty = y; this.speed = 0; this.moving = false; this.pal = null; this.down = 0;
    this.umb = 0; this.tilt = 0; this.tv = 0; this.depth = 0; this.t = hash(k, 23) * 9; this.hit = 0; this.deck = null; this.light = null;
    const pts = n => Array.from({ length: n }, (_, i) => ({ x: this.ax, y: this.ay - 6 + i, px: this.ax, py: this.ay - 6 + i }));
    this.tailPts = this.tail ? pts(this.tail) : null;
    this.pans = this.yoke ? [pts(1)[0], pts(1)[0]] : null;
  }
  ground(world) { const i = world.idx(this.x, this.y); return i < 0 ? { g: this.z, d: 0, i: -1 } : { g: this.deck != null ? this.deck : world.base[i], d: this.deck != null ? 0 : world.w[i], i }; }
  // one step of the body. Locomotion has already set vx and vy
  body(scene, wind) {
    const world = scene.world, { g, d, i } = this.ground(world);
    this.t += DT; this.depth = d;
    // wading and floating. Deep water carries a body with the flow, and the arms go up
    const floating = d > .3;
    if (i >= 0 && d > .05) { const k = clamp(d * 3, 0, 1) * 2.5 * DT; this.vx += (world.vx[i] / 8 - this.vx) * k; this.vy += (world.vy[i] / 8 - this.vy) * k; }
    this.x += this.vx * DT; this.y += this.vy * DT;
    const speed = Math.hypot(this.vx, this.vy), want = floating ? g + d - .2 + Math.sin(this.t * 3) * .015 : g;
    // gravity. A small rise is a step. A big one is a hop with a crouch first. A drop is a fall with a landing
    if (!this.air) {
      if (want > this.z + .09) { this.vz = Math.sqrt(2 * G * (want - this.z + .1)); this.air = true; this.hv -= 5; } else if (want < this.z - .09) { this.air = true; this.vz = 0; } else this.z += (want - this.z) * .35;
    }
    if (this.air) {
      this.vz -= G * DT; this.z += this.vz * DT;
      if (this.z <= want && this.vz <= 0) {
        const hit = -this.vz; this.z = want; this.air = false; this.vz = 0; this.hv += hit * 7;
        for (const ft of this.f) { ft.x = this.x + (ft.x - this.x) * .5; ft.y = this.y + (ft.y - this.y) * .5; ft.z = want; ft.t = 1; ft.lift = 0; }
        if (hit > 1.4) scene.fx.burst(d > .02 ? P_SPRAY : P_DUST, this.x, this.y, want + .02, 3, .35, .35, 1.1);
      }
    }
    // the feet. A foot stays where it landed until the body has walked away from it
    if (!this.air && !floating) this.stepFeet(scene, speed, i, d); else for (const ft of this.f) { ft.x = this.x; ft.y = this.y; ft.z = this.z; ft.lift = this.air ? .06 : 0; ft.t = 1; }
    // the hips ride a spring. Each footfall presses it down
    this.hv += (-190 * (this.hy - this.crouch) - 15 * this.hv) * DT; this.hy += this.hv * DT; this.hy = clamp(this.hy, -2, 4);
    // the spine leans with what the body feels: its own acceleration, the wind and the ground
    const nx = (this.x - this.y) * TW, ny = (this.x + this.y) * TH - this.z * ZS, sv = (nx - this.ax) / DT, sy = (ny - this.ay) / DT;
    const lastV = this.sv || 0, acc = (sv - lastV) / DT; this.sv = sv;
    const blow = wind[0] - wind[1], strong = Math.abs(blow) > .7 ? blow * .9 : blow * .25;
    let target = clamp(sv * .08, -1.2, 1.2) + strong + clamp(acc * .004, -1.5, 1.5);
    if (this.kind === 'elder') target += this.face * .7;
    if (this.pose === 'hammer') target += this.face * (Math.sin(this.t * 5) > 0 ? .5 : -.3);
    if (this.pose === 'farm') target += this.face * 2.2;
    if (this.pose === 'idle' || this.pose === 'talk') { target += Math.sin(this.t * 1.3 + this.k) * .45; this.hv += Math.sin(this.t * 2.1 + this.k) * .06; } // weight shifts from foot to foot, and the chest breathes
    this.lv += (70 * (target - this.lx) - 9 * this.lv) * DT;
    if (world.quake && i >= 0) { const a = world.groundAccel(this.x, this.y); this.lv += a * .9 * DT * 60 * .12; this.hv += Math.abs(a) * .12 * DT * 60; if (!this.air && Math.abs(a) > 5 && Math.random() < .02) { this.air = true; this.vz = .55; } }
    this.lx += this.lv * DT; this.lx = clamp(this.lx, -4, 4);
    // the head trails the shoulders a little
    this.hxv += (90 * (-this.lv * .03 - this.hx) - 11 * this.hxv) * DT; this.hx += this.hxv * DT; this.hx = clamp(this.hx, -1, 1);
    if (Math.abs(sv) > 2) this.face = sv > 0 ? 1 : -1;
    const down = (this.vx + this.vy); if (Math.abs(down) > .04) this.back = down < 0;
    // the arm swing follows the feet
    const a = (this.f[0].x - this.f[1].x) * this.vx + (this.f[0].y - this.f[1].y) * this.vy;
    this.swing += (clamp(a / Math.max(.02, speed * .16), -1, 1) - this.swing) * .3;
    this.secondary(nx, ny, sy, wind, blow, scene);
    this.ax = nx; this.ay = ny;
  }
  stepFeet(scene, speed, i, d) {
    const world = scene.world, stride = clamp(.055 + speed * .2, .055, .34), n = speed > .001 ? 1 / speed : 0, px = -this.vy * n, py = this.vx * n, lead = .1;
    for (let s = 0; s < 2; s++) {
      const ft = this.f[s];
      if (ft.t < 1) {
        ft.t = Math.min(1, ft.t + DT / ft.dur);
        const u = ft.t; ft.x = ft.fx + (ft.tx - ft.fx) * u; ft.y = ft.fy + (ft.ty - ft.fy) * u; ft.z = ft.fz + (ft.tz - ft.fz) * u; ft.lift = Math.sin(u * 3.1416) * (.05 + speed * .08);
        if (ft.t >= 1) { // the foot lands
          ft.lift = 0; this.hv += 2.2 + speed * 6;
          if (d > .012) { if (Math.random() < .7) scene.fx.burst(P_SPRAY, ft.x, ft.y, ft.z + d + .01, 2, .3 + speed * .25, .3, 1); } else if (speed > .75) scene.fx.add(P_DUST, ft.x, ft.y, ft.z + .02, -this.vx * .2, -this.vy * .2, .1, .35, .9);
          else if (i >= 0 && world.m && world.m[i] > .03) scene.fx.add(P_CHIP, ft.x, ft.y, ft.z + .03, 0, 0, .35, .25, 1, rgb(96, 76, 58));
        }
      }
    }
    const ft = this.f[this.next], other = this.f[1 - this.next];
    if (ft.t >= 1 && (other.t >= 1 || speed > .7)) {
      const side = (this.next ? 1 : -1) * .04, hx = this.x + px * side + this.vx * lead, hy = this.y + py * side + this.vy * lead;
      if (Math.hypot(ft.x - hx, ft.y - hy) > stride || Math.abs(this.z - ft.z) > .09) {
        ft.fx = ft.x; ft.fy = ft.y; ft.fz = ft.z; ft.dur = clamp(stride / (speed * 1.7 + .05), .09, .24);
        ft.tx = hx + this.vx * ft.dur * .6; ft.ty = hy + this.vy * ft.dur * .6;
        const j = world.idx(ft.tx, ft.ty); ft.tz = this.deck != null ? this.deck : j < 0 ? this.z : world.base[j];
        ft.t = 0; this.next = 1 - this.next;
      }
    }
  }
  // verlet points in screen pixels: hair and scarves stream, the seller's baskets swing, and the umbrella opens and tilts
  secondary(nx, ny, sy, wind, blow, scene) {
    if (this.tailPts) {
      let ox = nx - this.face * 2, oy = ny - this.legs - this.torso - this.hs + 2 + this.hy;
      for (const n of this.tailPts) {
        const vx = (n.x - n.px) * .93, vy = (n.y - n.py) * .93; n.px = n.x; n.py = n.y;
        n.x += vx + blow * 30 * DT * DT * 60; n.y += vy + 90 * DT * DT;
        const dx = n.x - ox, dy = n.y - oy, L = Math.hypot(dx, dy) || 1, s = 1.25 / L; n.x = ox + dx * s; n.y = oy + dy * s; ox = n.x; oy = n.y;
      }
    }
    if (this.pans) this.pans.forEach((n, s) => {
      const ex = nx + (s ? 6 : -6), ey = ny - this.legs - this.torso + 1 + this.hy, vx = (n.x - n.px) * .985, vy = (n.y - n.py) * .96; n.px = n.x; n.py = n.y;
      n.x += vx + blow * 12 * DT * DT * 60; n.y += vy + 140 * DT * DT;
      const dx = n.x - ex, dy = n.y - ey, L = Math.hypot(dx, dy) || 1, s2 = 3 / L; n.x = ex + dx * s2; n.y = ey + dy * s2;
    });
    const rain = scene.rainNow || 0, open = this.brolly && rain > 0 && this.depth < .15 && this.act !== 'cover' && !this.fallen;
    this.umb += ((open ? 1 : 0) - this.umb) * .07;
    this.tv += (60 * (clamp(blow * 1.2, -2, 2) - this.lx * .3 - this.tilt) - 8 * this.tv) * DT; this.tilt += this.tv * DT;
    if (this.umb > .8 && rain > .004 && Math.random() < .05) scene.fx.add(P_SPRAY, this.x, this.y, this.z + .62, (Math.random() - .5) * .5, (Math.random() - .5) * .5, .4, .25);
  }
  // walks toward the target. Returns true on arrival
  go(tx, ty, speed, wet) {
    const dx = tx - this.x, dy = ty - this.y, L = Math.hypot(dx, dy);
    const v = Math.min(speed * (this.depth > .02 ? Math.max(.4, 1 - this.depth * 2.2) : 1) * (wet ? 1.3 : 1), L * 5), gx = L > 1e-4 ? dx / L * v : 0, gy = L > 1e-4 ? dy / L * v : 0;
    const a = (speed > .7 ? 5 : 2.6) * DT, ex = gx - this.vx, ey = gy - this.vy, e = Math.hypot(ex, ey), k = e > a ? a / e : 1;
    this.vx += ex * k; this.vy += ey * k;
    return L < .025;
  }
  brake() { this.vx *= .84; this.vy *= .84; }
  jump(v = 1.7) { if (!this.air) { this.air = true; this.vz = v; this.hv -= 6; } }

  /* ---------- the drawing ---------- */
  draw(scene) {
    const { frame, world } = scene, sx = Math.floor(frame.OX + (this.x - this.y) * TW), sy = Math.floor(frame.OY + (this.x + this.y) * TH - this.z * ZS);
    const { g, d, i } = this.ground(world), gy = Math.floor(frame.OY + (this.x + this.y) * TH - g * ZS);
    const surf = d > .012 ? Math.floor(gy - d * ZS) : 1e6, depth = depthOf(this.x, this.y, Math.max(this.z, g + d)) + .07;
    if (i < 0) return;
    // the shadow stays on the ground and shrinks as the body rises
    const up = clamp((gy - sy) / 14, 0, 1), sw = this.pose === 'fallen' ? 4 : Math.round(2 - up);
    if (d <= .012) for (let dx = -sw; dx <= sw + 1; dx++) { const ix = sx + dx; if (ix < 0 || gy < 0 || ix >= frame.W || gy >= frame.H) continue; const j = gy * frame.W + ix; if (frame.zb[j] < depth) frame.pix[j] = mixc(frame.pix[j], SHADOW, Math.abs(dx - .5) > sw - .5 ? .22 : .46); }
    if (this.pose === 'fallen') this.drawFallen(); else this.drawUpright(world);
    stamp(frame, sx, sy, depth, surf);
    if (surf < 1e6) { // a ring on the water around the legs
      const r = 2 + Math.round((Math.sin(this.t * (Math.hypot(this.vx, this.vy) > .05 ? 9 : 3)) + 1)), Y = surf + 1;
      for (let dx = -r; dx <= r + 1; dx++) { const X = sx + dx; if (X >= 0 && Y >= 0 && X < frame.W && Y < frame.H) { const j = Y * frame.W + X; if (frame.zb[j] < depth + .1) frame.pix[j] = mixc(frame.pix[j], WET, Math.abs(dx - .5) > r - 1.5 ? .7 : .22); } }
    }
    this.light = this.lantern && this.pose !== 'fallen' && !this.brollyOut ? [sx + this.face * 3, sy - this.legs - 1] : null;
  }
  drawFallen() {
    const f = this.face, s = this.down < .25, sh = this.shirt, sd = mixc(sh, INK, .2), low = this.skirt ? this.skirt[0] : this.pants;
    if (s) { // sits up just before standing
      line(0, 0, f * 4, 0, low); put(f * 4, 0, INK); line(-f, -1, -f, -3, sh); line(0, -1, 0, -3, sd);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) put(-f * 2 + c - 1 + (f > 0 ? 0 : 1), -6 + r, r === 0 ? this.hair : this.skin);
      put(f, -2, this.skin); return;
    }
    // flat on the ground, one arm still waving
    line(-f * 4, 0, -f, 0, low); line(-f * 4, -1, -f, -1, low); put(-f * 5, 0, INK); put(-f * 5, -1, INK);
    line(0, 0, f * 3, 0, sd); line(0, -1, f * 3, -1, sh);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) put(f * (4 + c), -r, c === 2 ? this.hair : r === 2 ? this.hair : this.skin);
    put(f * 2, -2, this.skin); if (Math.sin(this.t * 14) > 0) put(f * 2, -3, this.skin); else put(f, -3, this.skin);
  }
  arm(x0, y0, dx, dy, sleeve, hand) {
    const x1 = x0 + dx, y1 = y0 + dy;
    line(x0, y0, x1, y1, sleeve); put(x1, y1, hand);
  }
  drawUpright(world) {
    const { face: f, back, legs, torso, skin, shirt, hs, t } = this, x0 = this.x, y0 = this.y, z0 = this.z, wide = hs === 4 ? 1 : 0;
    const pose = this.pose, hip = -legs + Math.round(this.hy), lean = this.lx;
    const hipX = Math.round(lean * .3), shX = Math.round(lean * .8), top = hip - torso, hd = top - hs, headX = shX + Math.round(this.hx) - 1 + (hs === 4 ? (f > 0 ? 0 : -1) : (f > 0 ? 0 : 0));
    const foot = ft => [(ft.x - x0 - (ft.y - y0)) * TW, (ft.x - x0 + ft.y - y0) * TH - (ft.z + ft.lift - z0) * ZS];
    const [ax, ay] = foot(this.f[0]), [bx, by] = foot(this.f[1]), legC = this.pants, shoe = rgb(26, 24, 30);
    const a0 = Math.round(clamp(ax, -9, 9)), a1 = Math.round(clamp(ay, -9, 3)), b0 = Math.round(clamp(bx, -9, 9)), b1 = Math.round(clamp(by, -9, 3));
    const shade = mixc(shirt, INK, .24), sleeve = this.kind === 'seller' ? shade : shirt, far = this.handFor(-1, pose), near = this.handFor(1, pose), bs = shX + f * (wide ? 2 : 1), fs = shX - f * (wide ? 1 : 0);
    // the far arm goes behind the body
    this.arm(bs, top, far[0], far[1], shade, mixc(skin, INK, .2));
    if (this.pans) this.drawYokeBack(shX, top);
    // legs: a line from the hip to where the foot really is. A sarong hides them to the shin
    if (this.skirt) {
      const [k, c2] = this.skirt, low = Math.max(a1, b1) - 1;
      line(hipX - wide, hip, a0, a1, skin); line(hipX + wide, hip, b0, b1, skin);
      for (let y = hip; y <= low; y++) { const w = wide + (y > hip + 1 ? 1 : 0); for (let x = hipX - w; x <= hipX + w; x++) put(x, y, ((x + y * 2 + this.k) % 3) ? k : c2); }
    } else { line(hipX - wide, hip, a0, a1, legC); line(hipX + wide, hip, b0, b1, mixc(legC, INK, .18)); if (wide) put(hipX, hip, legC); }
    put(a0, a1, shoe); put(a0 + f, a1, shoe); put(b0, b1, shoe); put(b0 + f, b1, shoe);
    // the torso follows the lean. The side away from the sun is darker, and the lowest row is the belt or hem
    for (let r = 0; r < torso; r++) {
      const y = hip - 1 - r, x = Math.round(hipX + (shX - hipX) * (r + 1) / torso), lo = r === 0;
      for (let c = -wide; c <= (wide ? wide : 1); c++) put(x + c, y, c === (f > 0 ? -wide : (wide || 1)) || lo ? shade : shirt);
    }
    this.drawHead(headX, hd, f, back, pose);
    if (this.load) { const w = Math.round(this.hx - lean * .15), ty = hd - 1; line(headX + w, ty, headX + hs - 1 + w, ty, rgb(184, 150, 96)); line(headX + w, ty - 1, headX + hs - 1 + w, ty - 1, this.load); put(headX + 1 + w, ty - 2, this.load); }
    // the near arm and whatever it holds
    this.arm(fs, top, near[0], near[1], sleeve, skin);
    const hx = fs + near[0], hy = top + near[1];
    if (this.cane && pose !== 'cover') line(hx, hy, hx + f, 0, WOOD);
    if (pose === 'hammer') { line(hx, hy, hx + near[2], hy + near[3], WOOD); const tx = hx + near[2], ty = hy + near[3]; put(tx, ty, STEEL); put(tx + f, ty, STEEL); put(tx - f, ty, STEEL); }
    if (pose === 'carry') { const py = top - 1 + Math.round(this.hy * .3), tilt = Math.round(this.hv * .05); line(shX - 6, py - tilt, shX + 7, py + tilt, rgb(178, 142, 94)); line(shX - 5, py + 1 - tilt, shX + 6, py + 1 + tilt, rgb(132, 100, 68)); }
    if (this.pans) this.drawYokeFront();
    if (this.tailPts) this.drawTail();
    if (this.umb > .15 && (pose === 'walk' || pose === 'idle' || pose === 'talk' || pose === 'look')) this.drawBrolly(hx, hy, hd);
    this.brollyOut = this.umb > .4;
  }
  // [dx, dy] of a hand from its shoulder. side is -1 for the far arm and 1 for the near arm
  handFor(side, pose) {
    const f = this.face, t = this.t, s = this.swing * side;
    switch (pose) {
      case 'cover': return [side > 0 ? f : -f + 1, -4];
      case 'up': return [side * 2, -3 - (Math.sin(t * 13 + side) > 0 ? 1 : 0)];
      case 'cheer': return [side * 2, this.air ? -4 : -3];
      case 'run': return [Math.round(s * 2.4), Math.abs(s) > .4 ? 0 : 1];
      case 'wave': if (side > 0) return [f * 2, -3 - (Math.sin(t * 11) > 0 ? 1 : 0)]; break;
      case 'talk': if (side > 0) return [f * 2, Math.sin(t * 7 + this.k) > .1 ? 0 : 1]; break;
      case 'stretch': return [side, -4];
      case 'carry': return side > 0 ? [f, -1] : [0, 2];
      case 'farm': return [f * 2, 2];
      case 'alarm': return side > 0 ? [f * 3, -1 + Math.round(Math.sin(t * 9))] : [-f * 2, -2];
      case 'hammer': {
        if (side < 0) return [f, 2];
        const u = (t * 2.6 + this.k) % 1, a = u < .75 ? u / .75 * 2.2 : 2.2 * (1 - (u - .75) / .25); // a slow lift and a fast blow
        return [Math.round(f * (2 - a * .6)), Math.round(1 - a * 1.6), Math.round(f * (2 - a * 1.2)), Math.round(-a * 1.6)];
      }
    }
    if (this.umb > .4 && side > 0) return [f * 4, -1];
    if (this.cane && side > 0) return [f * 2, 2];
    if (this.pans) return side > 0 ? [f, -1] : [-f, 1];
    if (this.shield && side > 0) return [f, -4];
    return [Math.round(s * 2), 2];
  }
  drawHead(x, y, f, back, pose) {
    const { skin, hair, hat, hatC, hs } = this, last = hs - 1, at = c => (f > 0 ? c : last - c); // column c counts from the back of the head
    const cell = (c, r, col) => put(x + at(c), y + r, col), blush = mixc(skin, rgb(214, 90, 80), .3), mouth = pose === 'cheer' || pose === 'up' || pose === 'alarm' ? rgb(120, 40, 44) : blush;
    if (hat === 'hijab') {
      for (let r = 0; r < hs; r++) for (let c = 0; c < hs; c++) cell(c, r, r === last ? mixc(hatC, INK, .14) : hatC);
      if (back) return;
      if (hs === 4) { cell(1, 1, skin); cell(2, 1, skin); cell(3, 1, skin); cell(1, 2, skin); cell(2, 2, INK); cell(3, 2, skin); } else { cell(1, 1, INK); cell(2, 1, skin); }
      return;
    }
    if (back) { for (let r = 0; r < hs; r++) for (let c = 0; c < hs; c++) cell(c, r, r < last || this.kind === 'kid' ? hair : skin); } else if (hs === 4) {
      for (let c = 0; c < 4; c++) cell(c, 0, hair);
      cell(0, 1, hair); cell(1, 1, hair); cell(2, 1, skin); cell(3, 1, skin);
      cell(0, 2, hair); cell(1, 2, skin); cell(2, 2, INK); cell(3, 2, skin);
      cell(0, 3, skin); cell(1, 3, skin); cell(2, 3, skin); cell(3, 3, mouth);
    } else {
      for (let c = 0; c < 3; c++) cell(c, 0, hair);
      cell(0, 1, hair); cell(1, 1, INK); cell(2, 1, skin);
      cell(0, 2, skin); cell(1, 2, skin); cell(2, 2, mouth);
    }
    const last2 = last;
    const m = x + (hs - 1) / 2, bob = Math.round(this.hx);
    if (hat === 'caping') { line(m - 3.5 + bob, y, m + 3.5 + bob, y, hatC); line(m - 2.5 + bob, y - 1, m + 2.5 + bob, y - 1, mixc(hatC, INK, .1)); line(m - 1 + bob, y - 2, m + 1 + bob, y - 2, mixc(hatC, INK, .2)); }
    else if (hat === 'songkok') { line(x, y - 1, x + last2, y - 1, hatC); line(x, y, x + last2, y, hatC); }
    else if (hat === 'udeng') { line(x, y, x + last2, y, hatC); put(x + at(last2), y - 1, hatC); put(x + at(last2 - 1), y - 1, hatC); }
  }
  drawTail() {
    const bx = Math.floor(this.ax), by = Math.floor(this.ay);
    for (const n of this.tailPts) put(Math.round(n.x) - bx, Math.round(n.y) - by, this.tailC);
  }
  drawYokeBack(shX, y) { const c = rgb(150, 116, 74), dip = Math.round(this.hy * .4); line(shX - 6, y - 1 - dip, shX, y - 1, c); line(shX + 1, y - 1, shX + 7, y - 1 - dip, c); }
  drawYokeFront() {
    const bx = Math.floor(this.ax), by = Math.floor(this.ay), top = -this.legs - this.torso + 1;
    this.pans.forEach((n, s) => {
      const x = Math.round(n.x) - bx, y = Math.round(n.y) - by;
      line(s ? 6 : -6, top - 2, x, y, ROPE);
      line(x - 2, y, x + 2, y, this.yoke); line(x - 2, y + 1, x + 2, y + 1, rgb(176, 138, 88)); line(x - 1, y + 2, x + 1, y + 2, rgb(142, 108, 70));
    });
  }
  drawBrolly(hx, hy, headTop) {
    const c = this.brolly, tilt = this.tilt, f = this.face, w = Math.round(this.umb * 5), top = headTop - 3, cx = hx - f * 2 + Math.round(tilt * .9);
    line(hx, hy, cx, top, rgb(60, 54, 54));
    for (let u = -w; u <= w; u++) {
      const px = cx + u, py = Math.round(top - w * .55 + Math.abs(u) * .55 + u * tilt * .12);
      put(px, py, (u + 40) % 2 ? c : mixc(c, INK, .14)); put(px, py + 1, mixc(c, INK, .32));
    }
    put(cx, Math.round(top - w * .55) - 1, INK);
  }
}

/* ---------- the town's people ---------- */
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export class Crowd {
  constructor(scene) { this.scene = scene; this.people = []; this.evac = new Map(); this.crews = new Map(); this.statics = new Map(); this.count = 0; }
  reset() { this.people = []; this.evac = new Map(); this.crews = new Map(); this.statics = new Map(); }
  spawn(x, y, z) { return new Toon(this.count++ * 7 + 3, x, y, z, this.scene.world.level.style); }

  step() {
    const { scene } = this, w = scene.world, wind = scene.windNow || [0, 0];
    scene.rainNow = w.running && w.weather ? w.weather.rain : 0;
    this.steer(w, wind);
    if (w.evac.length) this.stepEvac(w, wind);
    this.stepCrews(w, wind);
    for (const p of this.statics.values()) { p.brake(); p.body(scene, wind); }
    // statics keep a body only while the stop or farm that made them still draws them
    for (const [key, p] of this.statics) { if (p.seen !== scene.time && (p.idle = (p.idle || 0) + DT) > 1) this.statics.delete(key); else if (p.seen === scene.time) p.idle = 0; }
  }
  /* the walkers */
  steer(w, wind) {
    const { scene } = this, want = Math.min(22, Math.ceil(w.people / 2.5));
    while (this.people.length < want) {
      const homes = w.buildings.filter(b => CATALOG[b.type].home && !b.ruin && b.done), anchors = homes.length ? homes : w.buildings;
      if (!anchors.length) break;
      const a = anchors[Math.random() * anchors.length | 0], x = a.x + (Math.random() < .5 ? 0 : 1), y = a.y + (Math.random() < .5 ? 0 : 1), i = w.idx(x, y);
      this.people.push(this.spawn(x, y, i < 0 ? 0 : w.base[i]));
    }
    while (this.people.length > want) this.people.pop();
    const hide = w.evac.length > 0, won = w.done && w.done.won, quake = !!w.quake, ash = !!w.plume;
    for (const p of this.people) {
      p.hidden = hide;
      if (hide) continue;
      if (p.fallen) { // on the ground, then back up
        p.down -= DT; p.brake(); p.pose = 'fallen'; p.crouch = 0;
        if (p.down <= 0) { p.fallen = false; p.lx = 0; p.lv = 0; p.pose = 'idle'; p.jump(.7); p.act = 'wait'; p.timer = .5; }
        p.body(scene, wind); continue;
      }
      // a hard shove from the ground puts a body down
      if (Math.abs(p.lx) > 3.1 && !p.air) { p.fallen = true; p.down = 1.2 + Math.random(); p.face = p.lx > 0 ? 1 : -1; p.brake(); p.hv = 0; p.body(scene, wind); continue; }
      p.t0 = (p.t0 || 0) + DT;
      p.crouch = 0; p.shield = false;
      if (won) { p.act = 'cheer'; }
      else if (quake) { if (p.act !== 'flee' && p.act !== 'cover') { p.act = 'cover'; p.timer = 1 + Math.random() * 3; } } else if (p.act === 'cover' && !ash) { p.act = 'wait'; p.timer = .4 + Math.random(); }
      const wet = scene.rainNow > .001 && !p.umb;
      switch (p.act) {
        case 'cheer': p.pose = 'cheer'; p.brake(); if (!p.air && Math.random() < .05) p.jump(1.4 + Math.random() * .5); break;
        case 'cover': // arms over the head, knees bent, feet braced
          p.pose = 'cover'; p.crouch = 1.6; p.brake(); break;
        case 'flee': { // runs from what fell
          p.pose = 'run'; p.timer -= DT;
          if (p.go(p.tx, p.ty, 1.15, false) || p.timer <= 0) { p.act = 'wait'; p.timer = .6 + Math.random() * 1.5; p.pose = 'alarm'; }
          break;
        }
        case 'go': {
          const running = p.kind === 'kid' && Math.sin(p.t0 * .7 + p.k) > .3, sp = (running ? .9 : .36) * p.pace * (ash ? 2.2 : 1);
          p.pose = running || ash ? 'run' : 'walk'; p.shield = wet && !ash; if (ash) p.pose = 'run';
          if (p.kind === 'kid' && !p.air && running && Math.random() < .006) p.jump(1);
          if (p.go(p.tx, p.ty, sp, wet)) { p.act = 'wait'; p.vx *= .4; p.vy *= .4; p.timer = (ash ? .1 : .4 + Math.random() * 3.6) * (p.kind === 'elder' ? 1.8 : 1); this.idleFor(p); }
          break;
        }
        case 'talk': {
          p.brake(); p.timer -= DT; p.pose = 'talk';
          const o = p.partner; if (o) { const sv = (o.x - o.y) - (p.x - p.y); if (Math.abs(sv) > .01) p.face = sv > 0 ? 1 : -1; p.back = false; }
          if (p.timer <= 0) { p.act = 'wait'; p.partner = null; p.timer = .2; p.pose = 'idle'; }
          break;
        }
        default: { // waiting: some small piece of life, then the next corner
          p.brake(); p.timer -= DT;
          if (p.timer <= 0) this.choose(p, w);
          else if (p.pose === 'wave' && Math.random() < .004) p.pose = 'idle';
          else if (p.pose === 'look' && Math.random() < .02) { p.face = -p.face; }
          else if (p.pose === 'hop' && !p.air && Math.random() < .05) p.jump(.95);
        }
      }
      p.body(scene, wind);
    }
    this.separate();
  }
  idleFor(p) {
    const r = Math.random();
    p.pose = 'idle';
    if (p.kind === 'kid' && r < .4) { p.pose = 'hop'; return; }
    // meet someone: both stop, turn and talk
    for (const o of this.people) {
      if (o === p || o.hidden || o.act === 'talk' || o.fallen || Math.hypot(o.x - p.x, o.y - p.y) > .34) continue;
      if (r < .6 && o.act !== 'flee' && o.act !== 'cover') { const T = 2 + Math.random() * 3; p.act = 'talk'; o.act = 'talk'; p.timer = T; o.timer = T; p.partner = o; o.partner = p; return; }
    }
    for (const o of this.people) if (o !== p && Math.hypot(o.x - p.x, o.y - p.y) < 1.1 && r < .5) { p.pose = 'wave'; const sv = (o.x - o.y) - (p.x - p.y); p.face = sv > 0 ? 1 : -1; return; }
    if (r < .22) p.pose = 'look'; else if (r < .3) p.pose = 'stretch';
  }
  choose(p, w) {
    const { scene } = this, cx = Math.round(p.x), cy = Math.round(p.y), here = w.idx(p.x, p.y);
    // in water, the next corner is the highest one
    if (here >= 0 && w.w[here] > .04) {
      let best = null, bh = -1e9;
      for (const [a, b] of DIRS) { const i = w.idx(cx + a, cy + b); if (i >= 0 && w.base[i] + (w.w[i] > .1 ? -1 : 0) > bh) { bh = w.base[i] + (w.w[i] > .1 ? -1 : 0); best = [cx + a, cy + b]; } }
      if (best) { p.tx = best[0]; p.ty = best[1]; p.act = 'go'; return; }
    }
    const [a, b] = DIRS[Math.random() * 4 | 0], ax = cx + a, ay = cy + b;
    if (ax < -.1 || ay < -.1 || ax > w.N + .1 || ay > w.N + .1 || !scene.walkable(ax, ay)) { p.timer = .4; return; }
    p.tx = ax; p.ty = ay; p.act = 'go';
  }
  // bodies do not pass through each other
  separate() {
    const P = this.people;
    for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) {
      const p = P[a], o = P[b], dx = p.x - o.x, dy = p.y - o.y, d2 = dx * dx + dy * dy;
      if (d2 > .012 || p.hidden) continue;
      const d = Math.sqrt(d2) || .01, push = (.11 - d) * 1.1 / d;
      p.vx += dx * push; p.vy += dy * push; o.vx -= dx * push; o.vy -= dy * push;
    }
  }
  // what happens near a sudden event: a building falls and everyone close runs from it
  startle(x, y, R = 1.6) {
    for (const p of this.people) {
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || .01;
      if (d > R || p.fallen || p.hidden) continue;
      p.jump(1 + (R - d) * .5);
      p.lv += (dx - dy) / d * 14;
      p.act = 'flee'; p.timer = 2.2; p.tx = Math.round(p.x + dx / d * 2); p.ty = Math.round(p.y + dy / d * 2);
      const w = this.scene.world, N = w.N; p.tx = clamp(p.tx, 0, N); p.ty = clamp(p.ty, 0, N);
      if (!this.scene.walkable(p.tx, p.ty)) { p.tx = Math.round(p.x); p.ty = Math.round(p.y); }
    }
  }
  // the roof goes on: everyone close jumps for it
  cheerAt(x, y, R = 1.8) { for (const p of this.people) if (!p.hidden && !p.fallen && Math.hypot(p.x - x, p.y - y) < R && p.act !== 'flee') { p.jump(1.3 + Math.random() * .5); p.pose = 'cheer'; p.act = 'wait'; p.timer = .9 + Math.random(); } }

  /* the evacuation: the sim owns where they are, and the body makes it look like running */
  stepEvac(w, wind) {
    const { scene } = this;
    let n = 0;
    for (const e of w.evac) {
      n++;
      if (e.lost) { this.evac.delete(e); continue; }
      let p = this.evac.get(e);
      if (!p) { const i = w.idx(e.x, e.y); p = new Toon((e.home * 3 + n) * 7 + 1, e.x, e.y, i < 0 ? 0 : w.base[i], w.level.style); p.brolly = 0; this.evac.set(e, p); }
      const dx = e.x - p.x, dy = e.y - p.y;
      p.vx = dx / DT * .5; p.vy = dy / DT * .5; if (Math.hypot(p.vx, p.vy) > 2.4) { const k = 2.4 / Math.hypot(p.vx, p.vy); p.vx *= k; p.vy *= k; }
      p.pose = e.delay > 0 ? 'alarm' : e.safe ? 'cheer' : 'run';
      if (e.safe && !p.air && Math.random() < .035) p.jump(1.15 + Math.random() * .5);
      if (!e.safe && e.delay <= 0 && p.look === undefined) p.look = 1;
      p.body(scene, wind);
    }
  }
  /* the crew: real workers who walk to a spot, hammer, and go fetch the next plank */
  stepCrews(w, wind) {
    const { scene } = this;
    for (const [id, crew] of this.crews) {
      const b = w.buildings.find(q => q.id === id), vis = b && scene.vis.get(id);
      if (!b || !vis || b.done && vis.t >= 1) { this.crews.delete(id); continue; }
      const [x, y, z] = scene.anchor(b), foot = CATALOG[b.type].foot || 1, R = .54 * foot + .06, t = vis.t, working = w.running && t < .85, party = t >= .85 && t < .92, bp = scene.bpOf(b), flat = bp.height < .3;
      crew.forEach((p, k) => {
        const px = x + Math.cos(p.a) * R, py = y + Math.sin(p.a) * R;
        p.deck = !flat && k === 0 && t > .3 && t < .85 ? z + Math.min(bp.height * .7, (t - .2) * bp.height) : null;
        p.crouch = 0;
        if (party) { p.pose = 'cheer'; p.brake(); if (!p.air && Math.random() < .05) p.jump(1.3 + Math.random() * .4); } else if (!working) {
          p.pose = 'idle'; p.go(px, py, .3); if (Math.hypot(px - p.x, py - p.y) < .03) p.brake();
        } else if (k === 1 && !flat) { // the carrier: out to the pile, back with a plank
          const out = p.phase === 'fetch', tx = out ? x + Math.cos(p.a) * (R + .42) : px, ty = out ? y + Math.sin(p.a) * (R + .42) : py;
          p.pose = out ? 'walk' : 'carry';
          if (p.go(tx, ty, .42)) { p.wait2 = (p.wait2 || 0) + DT; p.crouch = 1.4; if (p.wait2 > .55) { p.wait2 = 0; p.phase = out ? 'bring' : 'fetch'; if (!out) { p.a += (Math.random() - .5) * 1.2; } } }
        } else if (p.go(px, py, .4)) { // the rest hammer at their spot, then shift along the wall
          p.brake(); p.pose = 'hammer'; const sv = (x - y) - (p.x - p.y); if (Math.abs(sv) > .02) p.face = sv > 0 ? 1 : -1; p.back = false;
          const u = (p.t * 2.6 + p.k) % 1, lastU = p.lastU === undefined ? u : p.lastU; p.lastU = u;
          if (lastU < .93 && u >= .93) { p.hv += 5; if (Math.random() < .55) scene.fx.add(P_CHIP, p.x + (x - p.x) * .3, p.y + (y - p.y) * .3, p.z + .2, (Math.random() - .5) * .6, (Math.random() - .5) * .6, .7, .4); }
          p.shift = (p.shift || 2 + Math.random() * 3) - DT; if (p.shift <= 0) { p.shift = 0; p.a += (Math.random() < .5 ? -1 : 1) * (.4 + Math.random() * .8); }
        } else p.pose = 'walk';
        p.body(scene, wind);
      });
    }
  }
  makeCrew(b) {
    const { scene } = this, w = scene.world, foot = CATALOG[b.type].foot || 1, n = foot > 1 ? 4 : b.type === 'sawah' || b.type === 'saluran' ? 2 : 3, crew = [], [x, y] = scene.anchor(b), R = .54 * foot + .06;
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU + .6, px = x + Math.cos(a) * R, py = y + Math.sin(a) * R, i = w.idx(px, py), p = new Toon((b.id + k) * 9 + 3, px, py, i < 0 ? 0 : w.base[i], w.level.style);
      // builders look like builders
      p.hat = 'caping'; p.hatC = CAPING[k % 3]; p.a = a; p.skirt = null; p.tail = 0; p.tailPts = null; p.yoke = 0; p.pans = null; p.cane = false; p.load = 0; p.brolly = 0; p.legs = 3; p.torso = 3; p.kind = 'adult'; p.phase = 'fetch'; p.lantern = false;
      crew.push(p);
    }
    this.crews.set(b.id, crew);
  }
  drawCrew(id) { const crew = this.crews.get(id); if (crew) for (const p of crew) p.draw(this.scene); }

  /* figures the scene places by hand: people at stops and platforms, the farmer, the child with the kite */
  still(key, x, y, z, k, pose, setup) {
    let p = this.statics.get(key);
    const { scene } = this;
    if (!p) { p = new Toon(k, x, y, z, scene.world.level.style); p.brolly = 0; p.yoke = 0; p.pans = null; p.cane = false; if (setup) setup(p); this.statics.set(key, p); }
    p.seen = scene.time; p.pose = pose;
    const dx = x - p.x, dy = y - p.y; if (Math.hypot(dx, dy) > .002) { p.vx = dx / DT * .1; p.vy = dy / DT * .1; }
    p.draw(scene);
  }
  draw() {
    const { scene } = this;
    for (const p of this.people) if (!p.hidden) p.draw(scene);
    for (const p of this.evac.values()) p.draw(scene);
  }
  lights() { // the lantern each carrier holds at night
    const { scene } = this, n = scene.grade.night, { frame } = scene;
    if (n < .25) return;
    const warm = rgb(255, 214, 140);
    for (const p of this.people) {
      if (p.hidden || !p.light) continue;
      const [X, Y] = p.light;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const dd = (dx * dx + dy * dy) / 9; if (dd <= 1) frame.blend(X + dx, Y + dy, warm, (1 - dd) * .34 * n); }
      frame.put(X, Y, rgb(255, 240, 200));
    }
  }
}
