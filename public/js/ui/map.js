// The archipelago, drawn from rough coastlines at low resolution. Each level has a pin.
const ISLANDS = [
  [[95.3, 5.6], [97.5, 5.2], [100.5, 2.5], [103.5, .3], [104.5, -2], [106, -3.2], [105.8, -5.8], [104.5, -5.8], [102.2, -4], [100.5, -1.5], [98.7, 1.5], [96.5, 3.5]],
  [[105.2, -6.8], [106.8, -6], [108.6, -6.7], [110.8, -6.4], [112.7, -6.9], [114.5, -7.8], [114.4, -8.7], [112, -8.4], [109, -7.8], [106.5, -7.4]],
  [[114.6, -8.2], [115.7, -8.2], [115.4, -8.8], [114.7, -8.5]],
  [[116, -8.5], [117, -8.3], [119, -8.3], [122.8, -8.3], [123, -8.7], [119, -8.9], [116.2, -8.9]],
  [[119.5, -9.5], [120.8, -9.8], [120.2, -10.2]],
  [[123.5, -10.2], [125, -9], [127.2, -8.4], [125.5, -9.5], [124, -10.2]],
  [[109, 1.5], [109.6, 2], [111.5, 2.7], [113, 3.2], [115, 5], [116.7, 7], [118.9, 5], [117.8, 3.5], [117.5, 1], [116.5, -1.5], [116, -3.8], [114.5, -4], [111.5, -3.3], [110, -2.8], [109, -.5]],
  [[119.4, -5.6], [120.4, -5.4], [120.5, -2.9], [121.6, -4.8], [122.9, -5.4], [122.3, -3.3], [121.4, -1.9], [123.3, -1], [121.7, -.9], [120.2, -1], [120.3, .4], [123, .9], [125, 1.6], [124.2, .3], [121, .1], [119.7, .2], [119, -2.5]],
  [[127.5, -.3], [128.6, .4], [128.1, 2.2], [127.6, 1.2]],
  [[128, -3], [130.5, -3.3], [130, -3.6], [128.2, -3.5]],
  [[126, -3.2], [127.2, -3.3], [126.8, -3.8]],
  [[131, -1], [132.5, -.5], [134, -.8], [135, -3.3], [137.5, -1.6], [141, -2.6], [141, -9.1], [138, -8.3], [138.5, -6.5], [135, -4.3], [132.7, -4], [132.8, -2.8]],
];
const inside = (poly, x, y) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const hash = (x, y) => { let h = (x | 0) * 374761393 + (y | 0) * 668265263; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const COORD = { kampung: [107.6, -6.9], rob: [110.4, -6.95], ciliwung: [106.8, -6.2], bajo: [123.6, -5.3], layangan: [115.26, -8.7], subak: [115.26, -8.5], lindu: [110.4, -7.8], lereng: [119.9, -3], merapi: [110.25, -7.5], pesisir: [95.3, 5.55], nusantara: [131, -6.5], salatiga: [110.5, -7.33], solo: [110.8, -7.57], tugu: [110.36, -7.79], ambarawa: [110.4, -7.26], manggarai: [106.85, -6.21] };

export function drawMap(canvas, levels, progress, active) {
  const W = canvas.width = 360, H = canvas.height = 170, g = canvas.getContext('2d'), img = g.createImageData(W, H), px = new Uint32Array(img.data.buffer);
  const lon = x => 93.5 + x / W * 49, lat = y => 8.2 - y / H * 20.5;
  const PAPER = 0xfff7fdff, SEA = [0xffefece6, 0xffe8e2da], COAST = 0xff3c4a3a;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const lo = lon(x), la = lat(y);
    let land = false;
    for (const p of ISLANDS) if (inside(p, lo, la)) { land = true; break; }
    px[y * W + x] = land ? -1 : ((x + y) % 7 === 0 && (y % 7 === 0) ? SEA[0] : PAPER);
  }
  const copy = px.slice();
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (copy[i] !== 4294967295 && copy[i] !== -1 && (copy[i] | 0) !== -1) continue;
    const edge = (copy[i - 1] | 0) !== -1 || (copy[i + 1] | 0) !== -1 || (copy[i - W] | 0) !== -1 || (copy[i + W] | 0) !== -1;
    const n = hash(x >> 2, y >> 2), m = hash(x, y);
    if (edge) { px[i] = 0xff5d7a64; continue; }
    const shades = [0xff4e8a58, 0xff4f9a5f, 0xff5ea868, 0xff6fb474];
    px[i] = shades[Math.min(3, Math.floor(n * 3 + m * 1.2))];
  }
  g.putImageData(img, 0, 0);
  levels.forEach((L, k) => {
    const c = COORD[L.id] || [118, -2], x = Math.round((c[0] - 93.5) / 49 * W), y = Math.round((8.2 - c[1]) / 20.5 * H), stars = progress[L.id] || 0;
    // pins that share a place step apart
    const ox = { 0: -2, 1: 4, 2: -6, 4: 7, 5: -5, 6: 7, 8: -6, 11: 11 }[k] || 0, oy = { 0: 8, 1: -9, 2: -9, 4: 8, 5: -8, 6: 9, 8: 11, 11: -14 }[k] || 0;
    g.fillStyle = '#1c1b19'; g.fillRect(x + ox - 5, y + oy - 5, 11, 11);
    g.fillStyle = k === active ? '#ffd60a' : stars ? '#ffd60a' : '#fffdf7'; g.fillRect(x + ox - 4, y + oy - 4, 9, 9);
    g.fillStyle = '#1c1b19'; g.font = '8px ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(k + 1), x + ox + .5, y + oy + .5);
  });
}
