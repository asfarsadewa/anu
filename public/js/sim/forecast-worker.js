// Runs the real simulation one month ahead, away from the frame loop. It returns where water reaches and what is at risk.
import { World, C, MONTH_SECONDS } from './world.js';
import { levelById } from './levels.js';
import { CATALOG } from './catalog.js';

onmessage = (e) => {
  const snap = e.data, level = levelById(snap.levelId), w = new World({ ...level, start: [] });
  w.restore(snap);
  const rubble = new Set(w.buildings.filter(b => b.ruin).map(b => b.id)); // what has already fallen cannot fall this month
  const N = w.N, depth = new Float32Array(N * N), steps = Math.floor(MONTH_SECONDS * 60);
  const before = w.heights.slice();
  w.startMonth();
  w.endMonth = () => { w.running = false; };
  for (let s = 0; s < steps && w.running; s++) {
    w.step();
    if (s % 6 === 0) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = w.idx(x + .5, y + .5), d = w.w[i] + w.m[i] * 2;
      if (d > depth[y * N + x]) depth[y * N + x] = d;
    }
  }
  const alerts = [];
  for (const b of w.buildings) {
    const cat = CATALOG[b.type];
    if (b.ruin) { if (!rubble.has(b.id)) alerts.push({ x: b.x, y: b.y, kind: 'lost' }); } else if (cat.crop && b.wet / MONTH_SECONDS < .5) alerts.push({ x: b.x, y: b.y, kind: 'dry' });
    else if (cat.crop && b.flooded > MONTH_SECONDS * .5) alerts.push({ x: b.x, y: b.y, kind: 'wet' });
    else if (b.soakedNow) alerts.push({ x: b.x, y: b.y, kind: 'wet' });
  }
  for (let i = 0; i < before.length; i++) if (w.heights[i] !== before[i]) alerts.push({ x: i % N, y: i / N | 0, kind: 'lost' });
  postMessage({ depth, alerts, month: snap.month, stamp: snap.stamp });
};
