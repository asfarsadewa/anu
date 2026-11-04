// The frame: colour and depth buffers, the baked layers, ramps, grading and depth stamps.
import { clamp, lerp, TW, TH, ZS, depthOf } from '../core.js';

export const rgb = (r, g, b) => (255 << 24 | clamp(b | 0, 0, 255) << 16 | clamp(g | 0, 0, 255) << 8 | clamp(r | 0, 0, 255)) >>> 0;
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
export const bayerAt = (ix, iy) => BAYER[(iy & 3) * 4 + (ix & 3)];
const COOL = [46, 38, 84], WARM = [255, 232, 180];
const ramps = new Map();
// hue-shifted ramp: shadows drift to violet, lights drift to warm yellow
export function rampOf(c) {
  const key = c[0] << 16 | c[1] << 8 | c[2];
  let r = ramps.get(key);
  if (r) return r;
  const mix = (m, t, k) => rgb(lerp(c[0] * m, t[0], k), lerp(c[1] * m, t[1], k), lerp(c[2] * m, t[2], k));
  r = [mix(.42, COOL, .34), mix(.64, COOL, .18), mix(.84, COOL, .05), mix(1, WARM, 0), mix(1.1, WARM, .22)];
  ramps.set(key, r);
  return r;
}
export const mixc = (p, q, t) => rgb(lerp(p & 255, q & 255, t), lerp(p >> 8 & 255, q >> 8 & 255, t), lerp(p >> 16 & 255, q >> 16 & 255, t));
export function tintc(c, r, g, b) { return rgb((c & 255) * r, (c >> 8 & 255) * g, (c >> 16 & 255) * b); }

export class Frame {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.lutR = new Uint8Array(256); this.lutG = new Uint8Array(256); this.lutB = new Uint8Array(256);
    this.setGrade([1, 1, 1], [0, 0, 0]);
    this.OX = 0; this.OY = 0;
  }
  resize(W, H) {
    if (W === this.W && H === this.H) return;
    this.W = W; this.H = H;
    this.canvas.width = W; this.canvas.height = H;
    this.image = this.ctx.createImageData(W, H);
    const n = W * H;
    this.pix = new Uint32Array(this.image.data.buffer);
    this.zb = new Float32Array(n);
    this.tPix = new Uint32Array(n); this.tZ = new Float32Array(n); this.tKind = new Uint8Array(n);
    this.bPix = new Uint32Array(n); this.bZ = new Float32Array(n);
    this.shadow = new Uint8Array(n);
    this.farW = []; // animated far-water pixels
  }
  restore() { this.pix.set(this.bPix); this.zb.set(this.bZ); }
  sx(x, y) { return this.OX + (x - y) * TW; }
  sy(x, y, z) { return this.OY + (x + y) * TH - z * ZS; }
  // gain per channel, then a lift towards a tint. Night and rain are made of this
  setGrade(gain, lift, sat = 1) {
    const { lutR, lutG, lutB } = this;
    for (let k = 0; k < 256; k++) {
      lutR[k] = clamp(k * gain[0] + lift[0], 0, 255); lutG[k] = clamp(k * gain[1] + lift[1], 0, 255); lutB[k] = clamp(k * gain[2] + lift[2], 0, 255);
    }
    this.sat = sat;
  }
  applyGrade() {
    const { pix, lutR, lutG, lutB } = this, sat = this.sat;
    if (sat >= .995) {
      for (let i = 0, n = pix.length; i < n; i++) { const c = pix[i]; pix[i] = 0xff000000 | lutB[c >> 16 & 255] << 16 | lutG[c >> 8 & 255] << 8 | lutR[c & 255]; }
    } else {
      const k = (sat * 256) | 0, q = 256 - k;
      for (let i = 0, n = pix.length; i < n; i++) {
        const c = pix[i], r = c & 255, g = c >> 8 & 255, b = c >> 16 & 255, l = (r * 77 + g * 150 + b * 29) >> 8;
        pix[i] = 0xff000000 | lutB[(b * k + l * q) >> 8] << 16 | lutG[(g * k + l * q) >> 8] << 8 | lutR[(r * k + l * q) >> 8];
      }
    }
  }
  present() { this.ctx.putImageData(this.image, 0, 0); }
  // one pixel with a depth test, at a world position
  plot(x, y, z, color) {
    const ix = Math.floor(this.OX + (x - y) * TW), iy = Math.floor(this.OY + (x + y) * TH - z * ZS);
    if (ix < 0 || iy < 0 || ix >= this.W || iy >= this.H) return;
    const i = iy * this.W + ix, d = depthOf(x, y, z);
    if (d <= this.zb[i]) return;
    this.zb[i] = d; this.pix[i] = color;
  }
  // a screen pixel with no depth test: overlays and particles in front of everything
  put(ix, iy, color) { if (ix >= 0 && iy >= 0 && ix < this.W && iy < this.H) this.pix[(iy | 0) * this.W + (ix | 0)] = color; }
  blend(ix, iy, color, a) {
    ix |= 0; iy |= 0;
    if (ix < 0 || iy < 0 || ix >= this.W || iy >= this.H) return;
    const i = iy * this.W + ix; this.pix[i] = mixc(this.pix[i], color, a);
  }
  // A stamp is a small baked picture with depth, drawn at a world anchor.
  // opts: rows (how many rows to show, counted from the bottom), dx, dy, shear (pixels per row from the base), tilt
  blit(st, x, y, z, opts) {
    const { W, H, pix, zb } = this;
    const ax = Math.round(this.OX + (x - y) * TW) - st.ox + (opts && opts.dx || 0), ay = Math.round(this.OY + (x + y) * TH - z * ZS) - st.oy + (opts && opts.dy || 0);
    const d0 = depthOf(x, y, z), sw = st.w, sh = st.h, sp = st.pix, sd = st.dep;
    const y0 = opts && opts.rows != null ? Math.max(0, sh - Math.ceil(opts.rows)) : 0, shear = opts && opts.shear || 0, base = st.oy;
    const yTop = opts && opts.hideBelow != null ? opts.hideBelow : sh;
    for (let r = y0; r < sh && r < yTop; r++) {
      const py = ay + r;
      if (py < 0 || py >= H) continue;
      const off = shear ? Math.round((base - r) * shear) : 0;
      for (let c = 0, k = r * sw; c < sw; c++, k++) {
        const col = sp[k];
        if (!col) continue;
        const px = ax + c + off;
        if (px < 0 || px >= W) continue;
        const i = py * W + px, d = d0 + sd[k];
        if (d <= zb[i]) continue;
        zb[i] = d; pix[i] = col;
      }
    }
  }
  // the same stamp mask written to the shadow buffer, for a hard shadow on the ground
  blitShadow(st, x, y, z, level = 1) {
    if (!st.sh) return;
    const m = st.sh, { W, H, shadow } = this, ax = Math.round(this.OX + (x - y) * TW) - m.ox, ay = Math.round(this.OY + (x + y) * TH - z * ZS) - m.oy;
    for (let r = 0; r < m.h; r++) {
      const py = ay + r;
      if (py < 0 || py >= H) continue;
      for (let c = 0, k = r * m.w; c < m.w; c++, k++) {
        if (!m.bits[k]) continue;
        const px = ax + c;
        if (px < 0 || px >= W) continue;
        const i = py * W + px;
        if (shadow[i] < level) shadow[i] = level;
      }
    }
  }
  // darken ground under the shadow buffer. Only where the terrain itself is the top surface
  resolveShadows(zRef) {
    const { shadow, pix, zb, tKind } = this;
    for (let i = 0, n = shadow.length; i < n; i++) {
      const s = shadow[i];
      if (!s) continue;
      shadow[i] = 0;
      if (tKind[i] === 0 || zb[i] !== zRef[i]) continue;
      const c = pix[i];
      pix[i] = rgb((c & 255) * .56, (c >> 8 & 255) * .54, (c >> 16 & 255) * .72);
    }
  }
}
