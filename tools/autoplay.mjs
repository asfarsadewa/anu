// Plays each level with a fixed plan under the same rules a player has: labour limits and placement checks.
// node tools/autoplay.mjs [levelId] [-v]. A plan proves the goal can be met. The naive plans prove that careless play fails.
import { World, MONTH_SECONDS } from '../public/js/sim/world.js';
import { LEVELS, levelById } from '../public/js/sim/levels.js';
import { CATALOG } from '../public/js/sim/catalog.js';

const R = (x, y) => ['rumah', x, y], S = (x, y) => ['sawah', x, y], C = (x, y) => ['saluran', x, y], B = (x, y) => ['bambu', x, y];
const T = (x, y) => ['tanggul', x, y], W = (x, y) => ['warung', x, y], L = (x, y) => ['lumbung', x, y], K = (x, y) => ['kentongan', x, y];
const list = (t, ...p) => p.map(([x, y]) => [t, x, y]);

const J = (x, y) => ['jalan', x, y], M = (x, y) => ['pasar', x, y], U = (x, y) => ['ruko', x, y], F = (x, y) => ['rusun', x, y], P = (x, y) => ['pompa', x, y], A = (x, y) => ['taman', x, y], Z = (x, y) => ['sekolah', x, y];
const H = (x, y) => ['halte', x, y], Q = (x, y) => ['kantor', x, y], ST = (x, y) => ['stasiun', x, y], LY = (x, y) => ['layang', x, y], GG = (x, y) => ['gigi', x, y];
export const PLANS = {
  solo: {
    good: { 0: [H(1, 3), H(3, 1), J(4, 3), J(4, 4), M(5, 4)], 1: [J(3, 4), J(2, 4), R(3, 5), R(2, 5)], 2: [J(1, 4), M(0, 4), R(1, 5), R(4, 5)], 3: [] },
    naive: { 0: [J(4, 3), J(4, 4), M(5, 4), J(3, 4)], 1: [J(2, 4), R(3, 5), R(2, 5), R(1, 3)], 2: [J(1, 4), M(0, 4), R(1, 5), R(4, 5)], 3: [R(3, 1)] },
  },
  tugu: {
    good: { 0: [ST(0, 1), M(4, 2)], 1: [R(3, 6), R(4, 6), R(5, 6), M(2, 2)], 2: [ST(5, 1), R(6, 6)], 3: [LY(3, 3), R(5, 4), R(6, 4)], 4: [] },
    naive: { 0: [R(3, 6), R(4, 6), R(5, 6), M(4, 2)], 1: [R(6, 6), R(5, 4), R(6, 4), M(2, 2)], 2: [Q(5, 1 + 1)], 3: [] },
  },
  ambarawa: {
    good: { 0: [ST(0, 1)], 1: [GG(4, 3), GG(3, 3), GG(2, 3)], 2: [GG(1, 3), R(0, 6)], 3: [R(1, 6)] },
    naive: { 0: [ST(4, 1)], 1: [R(0, 6)], 2: [R(1, 6)], 3: [ST(0, 1)] },
  },
  manggarai: {
    good: { 0: [ST(0, 0), LY(5, 4)], 1: [ST(6, 0), LY(3, 2)], 2: [J(3, 0)], 3: [F(4, 5)], 5: [F(2, 1)], 7: [F(2, 0)], 9: [F(4, 0)], 10: [T(4, 6), T(3, 6), T(2, 6), T(1, 6), T(0, 6)], 11: [] },
    naive: { 0: [F(4, 5)], 2: [F(2, 1)], 4: [F(2, 0)], 6: [J(3, 0), F(4, 0)], 8: [] },
  },
  salatiga: {
    good: { 0: [M(5, 1), R(1, 5)], 1: [R(5, 2), M(2, 0)], 2: [R(0, 3), R(0, 2), R(3, 0)], 3: [['masjid', 5, 3]], 4: [['gereja', 5, 4], J(4, 5)], 5: [['klenteng', 5, 5], B(0, 1)], 6: [J(4, 6), M(3, 6), B(6, 2)], 7: [M(5, 6), J(4, 7), B(7, 1)], 9: [F(4, 0)], 10: [F(0, 5)], 11: [J(5, 7), J(6, 7), J(6, 6), J(6, 5), J(6, 4), M(6, 3)], 12: [F(7, 4)], 13: [M(1, 0)], 15: [F(7, 5)], 16: [F(7, 6)], 17: [M(3, 7)], 18: [M(7, 3)] },
    naive: { 0: [M(5, 1), R(1, 5)], 1: [R(5, 2), R(5, 3)], 2: [R(0, 3), R(0, 2)], 3: [R(3, 0), R(2, 0)], 4: [F(4, 5)], 7: [F(1, 5 + 1)], 8: [] },
  },
  kampung: {
    good: { 0: [J(2, 2), M(1, 2)], 1: [R(3, 3), R(3, 2)], 2: [J(2, 1), R(1, 1)], 3: [R(3, 1)], 4: [R(1, 4)] },
    naive: { 0: [R(3, 3), R(3, 4)], 1: [R(1, 4), J(2, 2)], 2: [R(3, 2), R(1, 2)], 3: [J(2, 1), R(1, 1), R(3, 1)] },
  },
  rob: {
    good: { 0: [J(2, 2), M(0, 1)], 1: [R(1, 3), R(2, 3)], 2: [J(3, 2), R(2, 1)], 3: [R(3, 1), T(4, 3), T(4, 2)], 4: [T(4, 1), T(4, 0), T(4, 4)], 5: [T(3, 4), T(2, 4), T(1, 4), T(0, 4)], 6: [R(0, 3), R(3, 3)], 7: [P(2, 0)], 8: [] },
    naive: { 0: [M(0, 1), J(1, 3)], 1: [R(0, 3), R(2, 3)], 2: [J(1, 4), R(0, 4)], 3: [R(2, 4), J(1, 5)], 4: [R(0, 5), R(2, 5)], 5: [U(2, 1)] },
  },
  ciliwung: {
    good: { 0: [J(3, 1), M(0, 0)], 1: [R(3, 0), J(4, 1), R(4, 0)], 2: [J(5, 1), M(5, 0)], 3: [T(2, 2), T(1, 2)], 4: [F(4, 2)], 6: [R(5, 2)] },
    naive: { 0: [M(0, 0), J(0, 2)], 1: [J(0, 3), R(1, 3)], 2: [J(0, 4), R(1, 4), R(1, 2)], 3: [J(0, 5), R(1, 5)], 4: [F(2, 4)] },
  },
  bajo: {
    good: { 0: [['bakau', 4, 3], ['dermaga', 2, 1]], 1: [['bakau', 3, 2], ['bakau', 2, 5], ['panggung', 2, 3]], 2: [['panggung', 3, 1], ['bakau', 5, 1], ['dermaga', 1, 2]], 3: [['panggung', 4, 1], ['bakau', 5, 2], ['bakau', 1, 5]], 4: [['panggung', 3, 4], R(0, 1)], 5: [['panggung', 2, 4], R(1, 1)], 6: [['panggung', 1, 4], R(0, 0)], 7: [R(1, 0), R(2, 0)] },
    naive: { 0: [R(0, 0), R(1, 0)], 1: [R(2, 0), R(0, 1)], 2: [R(1, 1), R(0, 2)], 3: [R(3, 0), R(1, 2)] },
  },
  layangan: {
    good: { 0: [['lapangan', 4, 0], M(0, 2)], 1: [J(2, 3), R(1, 4), ['lapangan', 4, 5]], 2: [['lapangan', 4, 3], R(2, 2)], 3: [R(2, 4)], 4: [], 5: [] },
    naive: { 0: [J(2, 3), J(3, 3), M(0, 2)], 1: [R(3, 2), R(3, 4)], 2: [['lapangan', 0, 0], ['lapangan', 0, 5], ['lapangan', 1, 5]], 3: [J(4, 3), R(4, 2)], 4: [R(4, 4)], 5: [R(2, 2)] },
  },
  subak: {
    good: { 0: [C(0, 0), C(1, 0), S(1, 1)], 1: [C(2, 1), S(2, 2), R(0, 4)], 2: [C(3, 2), S(3, 3), C(4, 3)], 3: [S(4, 4), R(1, 4)] },
    naive: { 0: [S(4, 4), S(3, 3)], 1: [S(5, 3), S(2, 3)], 2: [S(3, 4), S(1, 2)] },
  },
  lindu: {
    good: { 0: [J(3, 3), M(2, 5)], 1: [R(4, 4), R(4, 3), J(3, 2)], 2: [R(2, 3), R(4, 2), J(3, 1)], 3: [M(2, 2), R(4, 1), R(4, 5)], 4: [J(4, 6), J(5, 6), J(5, 5), J(5, 4), R(6, 5)], 5: [J(2, 6), R(6, 4), J(5, 3), R(6, 3)], 6: [['balai', 0, 5]], 7: [M(2, 1), J(5, 2), R(6, 2)], 8: [R(3, 0)] },
    naive: { 0: [M(2, 5), J(3, 3)], 1: [['bata', 4, 5]], 2: [['bata', 4, 4], J(3, 2)], 3: [['rusun', 4, 3]], 4: [M(4, 2)], 5: [J(2, 3), ['balai', 0, 4], J(1, 3)], 7: [['rusun', 2, 2]], 8: [U(2, 6)] },
  },
  lereng: {
    good: { 0: [M(3, 6), B(1, 4)], 1: [J(2, 4), R(3, 5), B(3, 4)], 2: [J(2, 3), R(1, 3), R(3, 3)], 3: [J(2, 2), B(1, 2), B(3, 2), B(0, 3), B(4, 3), M(1, 6)], 4: [J(2, 1), R(1, 1), R(3, 1), B(0, 1), B(4, 1)], 5: [B(0, 0), B(4, 0), J(2, 0), R(1, 0), R(3, 0), B(0, 5), B(4, 5)], 6: [B(5, 2), B(5, 4), B(2 + 3, 0)] },
    naive: { 0: [M(3, 5), J(3, 6), R(4, 6)], 1: [J(2, 4), R(3, 4), R(1, 4)], 2: [J(2, 3), R(3, 3), R(1, 3)], 3: [J(2, 2), R(3, 2), R(1, 2)], 4: [J(2, 1), R(3, 1), R(1, 1)], 5: [M(4, 5)] },
  },
  merapi: {
    good: { 0: [J(4, 4), M(4, 3)], 1: [J(3, 4), S(5, 3), R(3, 5), R(4, 5)], 2: [S(3, 3), S(2, 3), K(2, 4)], 3: [['sabo', 0, 2], ['sabo', 0, 3], ['sabo', 0, 4], S(5, 2)], 4: [['sabo', 0, 1], ['sabo', 1, 1], S(4, 2)], 5: [S(3, 2), S(2, 2), L(5, 1)], 6: [S(4, 1), S(3, 1)] },
    naive: { 0: [M(4, 4), J(4, 3), J(3, 3)], 1: [J(2, 3), R(2, 2), S(3, 2)], 2: [J(1, 3), R(1, 2), S(3, 4)], 3: [J(0, 3), R(0, 2), R(1, 4)], 4: [R(0, 4), S(2, 4)] },
  },
  pesisir: {
    good: { 0: [J(2, 2), M(2, 4)], 1: [J(2, 1), R(1, 2), K(3, 2)], 2: [R(3, 1), R(1, 1), J(2, 0)], 3: [J(0, 2), R(1, 0)], 4: [R(0, 1), R(3, 0), M(4, 3)], 5: [K(1, 4)], 6: [R(0, 4)], 7: [] },
    naive: { 0: [M(2, 4), R(4, 4)], 1: [R(2, 5), R(4, 3), J(3, 6)], 2: [R(2, 6), R(4, 6)], 3: [M(2, 2), J(4, 7)], 4: [R(5, 6)], 5: [J(5, 7), R(6, 7)] },
  },
  nusantara: {
    good: { 0: [J(3, 4), J(3, 3), M(3, 5)], 1: [J(3, 2), R(4, 3), R(4, 2)], 2: [M(2, 5), J(3, 1), R(2, 1), R(4, 1)], 3: [J(3, 0), R(2, 0), R(4, 0), J(0, 3)], 4: [J(0, 2), J(0, 1), R(1, 2), R(1, 1), M(1, 5)], 5: [J(0, 0), R(1, 0), K(0, 5), J(4, 4)], 6: [J(5, 4), J(6, 4), J(5, 3), J(5, 2), J(7, 4)], 7: [F(6, 3)], 8: [J(5, 1), J(5, 0), M(4, 5)], 10: [F(6, 2)], 11: [F(6, 1)], 12: [F(6, 0)], 14: [M(5, 5)], 15: [M(6, 5)], 16: [M(7, 5)] },
    naive: { 0: [M(0, 3), R(1, 5)], 1: [R(2, 5), J(3, 4), R(3, 5)], 2: [J(3, 5), R(4, 5), R(2, 6)], 3: [J(3, 6), R(4, 6), R(2, 7)] },
  },
};

export function play(L, plan, { verbose = false } = {}) {
  const w = new World(L), notes = [];
  for (let m = 0; m < L.months && !w.done; m++) {
    for (const [t, x, y] of plan[m] || []) {
      const err = w.canPlace(t, x, y);
      if (err) { notes.push(`m${m} ${t}@${x},${y}: ${err}`); continue; }
      if (CATALOG[t].cost > w.labour) { notes.push(`m${m} ${t}@${x},${y}: no labour (${w.labour})`); continue; }
      w.place(t, x, y);
    }
    w.fx.length = 0;
    w.startMonth();
    while (!w.step()) { /* run the month */ }
    if (verbose) {
      const paddies = w.buildings.filter(b => b.type === 'sawah' && b.done).map(b => `${b.growth}${b.depth > .17 ? 'H' : b.depth < .01 ? 'D' : ''}`).join('');
      console.log(`  m${m + 1} ${L.weather[m].padEnd(7)} people ${String(w.people).padStart(3)}/${String(w.capacity()).padEnd(3)} rice ${String(w.rice).padStart(3)} labour ${String(w.labour).padStart(2)} lost ${w.destroyed} paddy[${paddies}] ${w.log.slice(0, 3).join(' | ')}`);
    }
    w.fx.length = 0;
    if (verbose && process.argv.includes('-d')) { for (let y = 0; y < w.N; y++) { let r = '     '; for (let x = 0; x < w.N; x++) { const i = w.idx(x + .5, y + .5); r += w.w[i].toFixed(2).slice(1) + (w.m[i] > .01 ? 'm' : ' '); } console.log(r); } }
  }
  return { w, notes };
}

// What a plan must do. A good plan wins and places everything it asks for. A careless plan loses
export function checkPlan(L, kind, plan = PLANS[L.id][kind]) {
  const { w, notes } = play(L, plan), won = !!(w.done && w.done.won), problems = [];
  if (kind === 'good' && !won) problems.push('the good plan did not win');
  if (kind === 'naive' && won) problems.push('the careless plan won');
  if (kind === 'good') for (const n of notes) problems.push('rejected: ' + n);
  return { w, won, notes, problems };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('autoplay.mjs')) {
  const only = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : null, verbose = process.argv.includes('-v');
  let failures = 0;
  for (const L of only ? [levelById(only)] : LEVELS) {
    if (!PLANS[L.id]) { console.error(`${L.id}: this plot has no plans`); failures++; continue; }
    for (const kind of ['good', 'naive']) {
      if (verbose) { console.log(`${L.id} ${kind}`); play(L, PLANS[L.id][kind], { verbose }); }
      const { w, notes, problems } = checkPlan(L, kind);
      const pledges = (L.pledges || []).map(p => (w.pledgeMet(p) ? 'Y' : 'n')).join('');
      console.log(`${L.id.padEnd(10)} ${kind.padEnd(6)} ${w.done && w.done.won ? 'WIN ' + w.done.stars + '*' : 'lose  '} month ${String(w.month).padStart(2)}/${L.months} people ${w.people} peak ${w.peakPeople} rice ${w.rice} harvested ${w.harvested} after ${w.harvestAfter} lost ${w.lost} destroyed ${w.destroyed} slides ${w.slides || 0} pledges ${pledges}${L.goal.kind === 'evac' ? ` evac ${w.evacSafe}/${w.evacTotal}` : ''}`);
      if (notes.length && verbose) console.log('   notes:', notes.join('; '));
      for (const p of problems) { console.error(`FAILED ${L.id} ${kind}: ${p}`); failures++; }
    }
  }
  if (failures) { console.error(`FAILED: ${failures} problems in the plans.`); process.exitCode = 1; }
}
