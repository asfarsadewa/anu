// Runs every level for all its months with no player. Catches crashes and NaN in the fluids.
import { World } from '../public/js/sim/world.js';
import { LEVELS } from '../public/js/sim/levels.js';
for (const L of LEVELS) {
  const t0 = performance.now(), w = new World(L);
  let peak = 0, nan = false;
  for (let m = 0; m < L.months && !w.done; m++) {
    w.startMonth();
    while (!w.step()) {}
    for (let i = 0; i < w.w.length; i++) { const v = w.w[i]; if (!(v >= 0)) nan = true; if (v > peak) peak = v; }
  }
  const ms = (performance.now() - t0) / L.months;
  console.log(L.id.padEnd(10), `months ${w.month}`.padEnd(10), `peak ${peak.toFixed(2)}`.padEnd(11), `ms/month ${ms.toFixed(0)}`.padEnd(14), `people ${w.people} rice ${w.rice}`, nan ? 'NAN' : '', w.done ? JSON.stringify(w.done) : '');
}
