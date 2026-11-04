// Draws water and mud as a depth-tested heightfield over the land. Each wet cell is a small diamond.
// Water looks at the sky: shallow water is a mirror, deep water is dark, fast water is white.
import { clamp, hash, depthOf, TW, TH, ZS } from '../core.js';
import { C } from '../sim/world.js';
import { rgb, bayerAt, mixc } from './frame.js';
import { hazeAmount } from './terrain.js';
const PAPER = rgb(255, 253, 247);

const hex = a => a.map(c => rgb(c[0], c[1], c[2]));
const DEEP = hex([[28, 70, 108], [36, 88, 126], [50, 110, 146], [72, 136, 168], [110, 170, 194], [168, 212, 222], [226, 244, 244]]);
const MIRROR = hex([[88, 148, 170], [120, 176, 192], [156, 202, 212], [190, 224, 228], [222, 240, 240], [244, 250, 248]]);
const MUD = hex([[68, 50, 44], [86, 64, 50], [106, 80, 58], [126, 98, 70], [148, 120, 88]]);
const FOAM = rgb(244, 250, 248);
const ASH = hex([[126, 122, 122], [150, 146, 144], [176, 172, 168]]);

// a repeating ripple pattern, made once
const RS = 64, RIP = new Float32Array(RS * RS);
for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) {
  const a = Math.sin(x / RS * 6.283 * 3 + Math.sin(y / RS * 6.283 * 2) * 1.2), b = Math.sin((x + y) / RS * 6.283 * 4 + Math.cos(x / RS * 6.283) * 1.4), c = Math.sin((y - x) / RS * 6.283 * 7);
  RIP[y * RS + x] = (a * .45 + b * .35 + c * .2);
}
// pixels covered by one cell, for each pixel alignment. A cell is 5 by 2.5 pixels
const templates = [];
for (let py = 0; py < 4; py++) for (let px = 0; px < 2; px++) {
  const out = [], hx = TW / C, hy = TH / C, cx = px * .5 + .5 * 0, cy = py * .25;
  for (let y = -3; y <= 3; y++) for (let x = -4; x <= 4; x++) {
    const dx = x + .5 - cx - .001, dy = y + .5 - cy - .001;
    const fu = (dx / hx + dy / hy) * .5, fv = (dy / hy - dx / hx) * .5; // cell-local coordinates, each -0.5 .. 0.5 inside the cell
    if (fu < -.5 || fu >= .5 || fv < -.5 || fv >= .5) continue;
    out.push(x, y, fu, fv);
  }
  templates.push(out);
}

export function drawFluids(frame, world, time, opts = {}) {
  const { G, w, m, gr, vx, vy, mb, ash, mudstop } = world, { W, H, pix, zb, OX, OY } = frame;
  const tick = Math.floor(time * 10), rx = tick >> 1, ry = tick;
  const clip = opts.rim != null ? opts.rim : null, N = world.N, sea = world.sea;
  const hx = TW / C, hy = TH / C;
  for (let cy = 0; cy < G; cy++) {
    for (let cx = 0; cx < G; cx++) {
      const i = cy * G + cx, wv = w[i], mv = m[i], av = ash[i];
      if (wv < .002 && mv < .012 && av < .006) continue;
      const wx = (cx + .5) / C - mb, wy = (cy + .5) / C - mb;
      if (clip != null && (wx < -clip || wy < -clip || wx > N + clip || wy > N + clip)) continue;
      const g0 = gr[i], eta = g0 + mv + wv;
      const left = cx > 0 ? i - 1 : i, right = cx < G - 1 ? i + 1 : i, up = cy > 0 ? i - G : i, down = cy < G - 1 ? i + G : i;
      const sx = OX + (wx - wy) * TW, syf = OY + (wx + wy) * TH - eta * ZS;
      const ax = Math.floor(sx), ay = Math.floor(syf);
      const fpx = sx - ax >= .25 ? 1 : 0, fpy = clamp(Math.floor((syf - ay) * 4), 0, 3);
      const tpl = templates[fpy * 2 + fpx];
      const speed = Math.hypot(vx[i], vy[i]);
      const etaL = gr[left] + m[left] + w[left], etaR = gr[right] + m[right] + w[right], etaU = gr[up] + m[up] + w[up], etaD = gr[down] + m[down] + w[down];
      const isMud = mv > wv * .6 && mv > .012, isAshOnly = wv < .002 && mv <= .012;
      const slopeX = (w[left] > .003 ? etaL : eta) - (w[right] > .003 ? etaR : eta), slopeY = (w[up] > .003 ? etaU : eta) - (w[down] > .003 ? etaD : eta);
      const gx = (w[right] - w[left]) * .5, gy = (w[down] - w[up]) * .5;
      const d0 = depthOf(wx, wy, eta);
      const outside = Math.hypot(wx < 0 ? -wx : wx > N ? wx - N : 0, wy < 0 ? -wy : wy > N ? wy - N : 0), wash = outside > .02 ? hazeAmount(outside) : 0;
      for (let k = 0; k < tpl.length; k += 4) {
        const ix = ax + tpl[k], iy = ay + tpl[k + 1];
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
        const px = iy * W + ix, depth = wv + tpl[k + 2] * gx + tpl[k + 3] * gy;
        if (isAshOnly) { // grey ash lying on the ground
          if (outside > .4) continue;
          if (bayerAt(ix, iy) * .05 > av) continue;
          if (d0 < zb[px] - .03) continue;
          { const ac = ASH[(hash(ix, iy) * 3) | 0]; pix[px] = wash ? mixc(ac, PAPER, wash) : ac; }
          continue;
        }
        const noiseEdge = hash(ix >> 1, iy) * .004;
        if (!isMud && depth < .0022 + noiseEdge) continue;
        const d = d0 + (tpl[k + 2] + tpl[k + 3]) * .05;
        if (d <= zb[px]) continue;
        zb[px] = d;
        let col;
        if (isMud) {
          const r = RIP[((iy + (ry >> 2)) & 63) * RS + (ix & 63)];
          col = MUD[clamp(Math.floor(2 + r * 1.1 + (bayerAt(ix, iy) - .5) * .8 + (slopeX - slopeY) * 4), 0, 4)];
          if (mv < .05) col = mixc(pix[px], col, .35 + mv * 13);
          pix[px] = wash ? mixc(col, PAPER, wash) : col;
          continue;
        }
        // moving water drags the ripples with it
        const fx = (ix + Math.round(vx[i] * time * .05) + rx) & 63, fy = (iy + Math.round(vy[i] * time * .05) - (ry >> 1)) & 63;
        const r = RIP[fy * RS + fx];
        const light = (slopeX * 9 - slopeY * 7) + r * .55;
        if (wv < .16) { // shallow: a mirror of the sky over the ground
          const idx = clamp(Math.floor(2.4 + light * 2.2 + (bayerAt(ix, iy) - .5) * .8), 0, 5);
          col = MIRROR[idx];
          const clear = clamp(depth * 16, .28, .9);
          col = mixc(pix[px], col, clear);
        } else {
          const lv = 3 - clamp((wv - .16) * 6, 0, 2.2) + light * 1.6;
          col = DEEP[clamp(Math.floor(lv + (bayerAt(ix, iy) - .5) * .9), 0, 6)];
        }
        const foam = speed > 7 ? (speed - 7) * .09 : 0;
        if (foam > 0 && hash(ix + (tick >> 1), iy - tick) < foam) col = FOAM;
        else if (r > .78 && hash(ix, iy + (tick >> 2)) > .78) col = FOAM;
        pix[px] = wash ? mixc(col, PAPER, wash) : col;
      }
      // falls: a visible sheet where this cell stands over its lower neighbour
      if (wv > .006 && !isMud && outside < .6) {
        const dropX = eta - Math.max(etaR, gr[right]), dropY = eta - Math.max(etaD, gr[down]);
        if (cx < G - 1 && dropX > .05 && world.qx[i] > .13) sheet(frame, wx + .0625, wy, eta, dropX, 1, tick, speed, d0, cx);
        if (cy < G - 1 && dropY > .05 && world.qy[i] > .13) sheet(frame, wx, wy + .0625, eta, dropY, 0, tick, speed, d0, cy);
      }
    }
  }
}
function sheet(frame, wx, wy, eta, drop, xFace, tick, speed, d0) {
  const { W, H, pix, zb, OX, OY } = frame;
  const n = 3, spanX = xFace ? -.0625 : .0625;
  for (let s = -1; s <= 1; s++) {
    const ax = wx + (xFace ? 0 : s * spanX), ay = wy + (xFace ? s * spanX : 0);
    const sx = Math.floor(OX + (ax - ay) * TW), sy = Math.floor(OY + (ax + ay) * TH - eta * ZS), rows = Math.min(H, Math.ceil(drop * ZS));
    for (let r = 0; r < rows; r++) {
      const iy = sy + r;
      if (iy < 0 || iy >= H || sx < 0 || sx >= W) continue;
      const px = iy * W + sx, z = eta - r / ZS, d = depthOf(ax, ay, z) + .01;
      if (d <= zb[px]) continue;
      zb[px] = d;
      const h = hash(sx, (r - tick * 2) >> 2);
      pix[px] = h > .7 ? FOAM : h > .3 ? MIRROR[3] : MIRROR[1];
    }
  }
}
