// Physics you can see: particles, falling sticks, debris, ropes. All run at the fixed step and read the world's terrain and water.
import { clamp, hash, depthOf, TW, TH, ZS } from '../core.js';
import { rgb, mixc } from './frame.js';
import { DT } from '../sim/world.js';

const G = 7.5; // tile units per second squared. Slightly slow, so a fall reads at this scale

export function surfaceAt(world, x, y) {
  const i = world.idx(x, y);
  if (i < 0) return { ground: -1, water: 0, vx: 0, vy: 0 };
  return { ground: world.gr[i] + world.m[i], water: world.w[i], vx: world.vx[i] / 8, vy: world.vy[i] / 8 };
}

/* ---------- particles ---------- */
const MAX = 900;
export const P_DUST = 0, P_SMOKE = 1, P_SPRAY = 2, P_ASH = 3, P_LEAF = 4, P_CHIP = 5, P_SPARK = 6, P_CONFETTI = 7;
export class Particles {
  constructor() {
    this.n = 0;
    for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'max', 'size']) this[k] = new Float32Array(MAX);
    this.kind = new Uint8Array(MAX); this.col = new Uint32Array(MAX);
  }
  add(kind, x, y, z, vx, vy, vz, life, size = 1, col = 0) {
    let i = this.n < MAX ? this.n++ : (Math.random() * MAX) | 0;
    this.kind[i] = kind; this.x[i] = x; this.y[i] = y; this.z[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz; this.life[i] = life; this.max[i] = life; this.size[i] = size; this.col[i] = col;
  }
  burst(kind, x, y, z, count, speed, life, size, col) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * 6.283, s = speed * (.4 + Math.random() * .6);
      this.add(kind, x, y, z, Math.cos(a) * s, Math.sin(a) * s, speed * (.4 + Math.random()), life * (.6 + Math.random() * .5), size, col);
    }
  }
  step(world, wind) {
    const { x, y, z, vx, vy, vz, life, kind } = this;
    for (let i = 0; i < this.n; i++) {
      life[i] -= DT;
      if (life[i] <= 0) { this.kill(i); i--; continue; }
      const k = kind[i];
      if (k === P_DUST || k === P_SMOKE) { // light things ride the air
        const drag = k === P_SMOKE ? 1.1 : 2.4;
        vx[i] += (wind[0] * .5 - vx[i]) * drag * DT; vy[i] += (wind[1] * .5 - vy[i]) * drag * DT;
        vz[i] += ((k === P_SMOKE ? .28 : .05) - vz[i]) * 1.2 * DT;
      } else if (k === P_ASH || k === P_LEAF) { // flakes fall at terminal speed and drift
        vx[i] += (wind[0] - vx[i]) * 2 * DT; vy[i] += (wind[1] - vy[i]) * 2 * DT;
        vz[i] += (-.5 - vz[i]) * 2 * DT;
      } else if (k === P_CONFETTI) {
        vx[i] += (wind[0] * .6 - vx[i]) * 1.5 * DT; vy[i] += (wind[1] * .6 - vy[i]) * 1.5 * DT;
        vz[i] += (-.45 - vz[i]) * 1.3 * DT;
      } else vz[i] -= G * DT; // spray, chips, sparks
      x[i] += vx[i] * DT; y[i] += vy[i] * DT; z[i] += vz[i] * DT;
      if (k === P_SPRAY || k === P_CHIP || k === P_ASH || k === P_LEAF || k === P_CONFETTI) {
        const s = surfaceAt(world, x[i], y[i]), h = s.ground + s.water;
        if (z[i] < h) {
          if (k === P_CHIP) { z[i] = h; vz[i] *= -.35; vx[i] *= .5; vy[i] *= .5; if (Math.abs(vz[i]) < .25) { life[i] = Math.min(life[i], .5); vz[i] = 0; } } else { this.kill(i); i--; }
        }
      }
    }
  }
  kill(i) {
    const L = --this.n;
    if (i === L) return;
    for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'max', 'size', 'kind', 'col']) this[k][i] = this[k][L];
  }
  draw(frame) {
    const { W, H, pix, zb, OX, OY } = frame;
    for (let i = 0; i < this.n; i++) {
      const X = this.x[i], Y = this.y[i], Z = this.z[i], ix = Math.floor(OX + (X - Y) * TW), iy = Math.floor(OY + (X + Y) * TH - Z * ZS), k = this.kind[i];
      if (ix < 1 || iy < 1 || ix >= W - 1 || iy >= H - 1) continue;
      const a = this.life[i] / this.max[i], px = iy * W + ix, d = depthOf(X, Y, Z);
      if (k === P_DUST || k === P_SMOKE) {
        const r = this.size[i] * (1.6 - a), rr = Math.ceil(r), base = this.col[i] || (k === P_DUST ? rgb(196, 176, 146) : rgb(214, 212, 214));
        for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const j = (iy + dy) * W + ix + dx;
          if (j < 0 || j >= pix.length || d < zb[j] - .4) continue;
          if (hash(ix + dx, iy + dy + (this.life[i] * 20 | 0)) > a * .95) continue;
          pix[j] = mixc(pix[j], base, .75);
        }
      } else {
        if (d < zb[px]) continue;
        const c = this.col[i] || (k === P_SPRAY ? rgb(232, 244, 246) : k === P_ASH ? rgb(150, 146, 146) : k === P_CHIP ? rgb(150, 112, 80) : k === P_SPARK ? rgb(255, 214, 120) : rgb(120, 150, 80));
        pix[px] = c;
        if (this.size[i] > 1) { pix[px + 1] = c; if (this.size[i] > 2) { pix[px - W] = c; pix[px - W + 1] = c; } }
      }
    }
  }
}

/* ---------- sticks: two points and a length. Struck scaffold poles fall with this ---------- */
export class Sticks {
  constructor() { this.list = []; }
  add(a, b, ox, oy, oz, kick, col, life = 3.5) {
    const s = { ax: a[0] + ox, ay: a[1] + oy, az: a[2] + oz, bx: b[0] + ox, by: b[1] + oy, bz: b[2] + oz, life, col, r: 0 };
    s.pax = s.ax - kick[0] * DT; s.pay = s.ay - kick[1] * DT; s.paz = s.az;
    s.pbx = s.bx - kick[0] * DT * 1.4; s.pby = s.by - kick[1] * DT * 1.4; s.pbz = s.bz;
    s.L = Math.hypot(s.ax - s.bx, s.ay - s.by, s.az - s.bz);
    if (this.list.length > 120) this.list.shift();
    this.list.push(s);
  }
  step(world) {
    for (let k = this.list.length - 1; k >= 0; k--) {
      const s = this.list[k];
      if ((s.life -= DT) <= 0) { this.list.splice(k, 1); continue; }
      const vert = (p, q, r, pp, pq, pr) => {
        const vx = (p - pp) * .995, vy = (q - pq) * .995, vz = (r - pr) * .995 - G * DT * DT;
        return [p + vx, q + vy, r + vz, p, q, r];
      };
      [s.ax, s.ay, s.az, s.pax, s.pay, s.paz] = vert(s.ax, s.ay, s.az, s.pax, s.pay, s.paz);
      [s.bx, s.by, s.bz, s.pbx, s.pby, s.pbz] = vert(s.bx, s.by, s.bz, s.pbx, s.pby, s.pbz);
      for (let it = 0; it < 3; it++) {
        const dx = s.bx - s.ax, dy = s.by - s.ay, dz = s.bz - s.az, d = Math.hypot(dx, dy, dz) || 1e-4, e = (d - s.L) / d * .5;
        s.ax += dx * e; s.ay += dy * e; s.az += dz * e; s.bx -= dx * e; s.by -= dy * e; s.bz -= dz * e;
        for (const end of ['a', 'b']) {
          const X = s[end + 'x'], Y = s[end + 'y'], S = surfaceAt(world, X, Y), floor = S.ground + S.water * .6;
          if (s[end + 'z'] < floor) {
            const wet = S.water > .03;
            s[end + 'z'] = floor;
            // friction on the ground. Moving water carries the stick along
            const f = wet ? .6 : .55;
            s['p' + end + 'x'] = X - (X - s['p' + end + 'x']) * f - (wet ? S.vx * DT * .6 : 0);
            s['p' + end + 'y'] = Y - (Y - s['p' + end + 'y']) * f - (wet ? S.vy * DT * .6 : 0);
            const pz = s['p' + end + 'z']; s['p' + end + 'z'] = floor + (floor - pz) * .22;
          }
        }
      }
    }
  }
  draw(frame) {
    for (const s of this.list) {
      const n = Math.ceil(s.L * 30) + 1, fade = s.life < .4 && hash(s.L * 99 | 0, s.life * 30 | 0) > s.life / .4;
      if (fade) continue;
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = s.ax + (s.bx - s.ax) * t, y = s.ay + (s.by - s.ay) * t, z = s.az + (s.bz - s.az) * t;
        frame.plot(x, y, z + .001, (k * 4 | 0) % 7 === 0 ? s.col[0] : s.col[1]);
      }
    }
  }
}

/* ---------- debris: a block of pixels cut from a building, with a body ---------- */
export class Debris {
  constructor() { this.list = []; }
  // tear a stamp into chunks. Upper chunks start higher
  shatter(st, x, y, z, world, kick = 1) {
    const size = 5, { w, h, pix, ox, oy, dep } = st;
    for (let r = 0; r < h; r += size) for (let c = 0; c < w; c += size) {
      const cells = [];
      for (let a = r; a < Math.min(h, r + size); a++) for (let b = c; b < Math.min(w, c + size); b++) { const col = pix[a * w + b]; if (col) cells.push(b - c, a - r, col); }
      if (cells.length < 9) continue;
      // screen position of the chunk becomes a world offset at a fixed depth
      const sx = c + size / 2 - ox, sy = r + size / 2 - oy;
      const hz = -sy / ZS, along = sx / TW / 2;
      const px = x + along, py = y - along;
      const a = Math.random() * 6.283, sp = (.15 + Math.random() * .7) * kick;
      this.list.push({ x: px, y: py, z: z + Math.max(0, hz), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: Math.random() * 1.2 * kick, cells, life: 5 + Math.random() * 3.5, floats: hash(c, r) < .5, rest: 0, size });
    }
    if (this.list.length > 260) this.list.splice(0, this.list.length - 260);
  }
  step(world) {
    for (let k = this.list.length - 1; k >= 0; k--) {
      const d = this.list[k];
      if ((d.life -= DT) <= 0) { this.list.splice(k, 1); continue; }
      const S = surfaceAt(world, d.x, d.y), wet = S.water > .02;
      d.vz -= G * DT;
      if (wet && d.z < S.ground + S.water) {
        if (d.floats) { // timber floats and goes where the water goes
          d.vz += (G * 1.5 + (S.ground + S.water - d.z) * 40) * DT; d.vz *= .9;
          d.vx += (S.vx - d.vx) * 3 * DT; d.vy += (S.vy - d.vy) * 3 * DT;
        } else { d.vx *= .9; d.vy *= .9; d.vz *= .9; }
      }
      d.x += d.vx * DT; d.y += d.vy * DT; d.z += d.vz * DT;
      if (d.z < S.ground) { d.z = S.ground; if (d.vz < -.8) { d.vz *= -.28; d.vx *= .6; d.vy *= .6; } else { d.vz = 0; d.vx *= .8; d.vy *= .8; d.rest += DT; } }
    }
  }
  draw(frame) {
    const { W, H, pix, zb, OX, OY } = frame;
    for (const d of this.list) {
      const ax = Math.floor(OX + (d.x - d.y) * TW) - 2, ay = Math.floor(OY + (d.x + d.y) * TH - d.z * ZS) - 2, D = depthOf(d.x, d.y, d.z) + .03, c = d.cells;
      const fading = d.life < .6;
      for (let k = 0; k < c.length; k += 3) {
        if (fading && hash(k, d.life * 25 | 0) > d.life / .6) continue;
        const ix = ax + c[k], iy = ay + c[k + 1];
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
        const i = iy * W + ix;
        if (D <= zb[i]) continue;
        zb[i] = D; pix[i] = c[k + 2];
      }
    }
  }
}

/* ---------- ropes: verlet chains pinned at both ends ---------- */
export class Rope {
  constructor(a, b, n = 8, slack = 1.02) {
    this.n = n; this.p = []; this.q = [];
    for (let k = 0; k <= n; k++) { const t = k / n, pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; this.p.push(pt); this.q.push(pt.slice()); }
    this.slack = slack; this.len = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * slack / n;
  }
  step(a, b, wind, grav = G * .4) {
    const { p, q, n } = this;
    this.len = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * this.slack / n;
    for (let k = 1; k < n; k++) {
      const P = p[k], Q = q[k], vx = (P[0] - Q[0]) * .97 + wind[0] * DT * DT * 3, vy = (P[1] - Q[1]) * .97 + wind[1] * DT * DT * 3, vz = (P[2] - Q[2]) * .97 - grav * DT * DT;
      Q[0] = P[0]; Q[1] = P[1]; Q[2] = P[2]; P[0] += vx; P[1] += vy; P[2] += vz;
    }
    p[0][0] = a[0]; p[0][1] = a[1]; p[0][2] = a[2]; p[n][0] = b[0]; p[n][1] = b[1]; p[n][2] = b[2];
    for (let it = 0; it < 4; it++) for (let k = 0; k < n; k++) {
      const A = p[k], B = p[k + 1], dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], d = Math.hypot(dx, dy, dz) || 1e-4, e = (d - this.len) / d;
      const wa = k === 0 ? 0 : k + 1 === n ? 1 : .5, wb = k === 0 ? 1 : k + 1 === n ? 0 : .5;
      A[0] += dx * e * wa; A[1] += dy * e * wa; A[2] += dz * e * wa; B[0] -= dx * e * wb; B[1] -= dy * e * wb; B[2] -= dz * e * wb;
    }
  }
  draw(frame, color) {
    for (let k = 0; k < this.n; k++) {
      const A = this.p[k], B = this.p[k + 1], steps = Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) * 34) + 1;
      for (let s = 0; s < steps; s++) { const t = s / steps; frame.plot(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t, color); }
    }
  }
}
