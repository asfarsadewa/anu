// A road must never stop dead at a step. This sweeps every one-step edge on every plot that has roads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, M, STEP, C } from '../public/js/sim/world.js';
import { LEVELS } from '../public/js/sim/levels.js';

const STREETS = LEVELS.filter(L => L.roads);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const MAX_RISE = STEP / 2 + .01; // the largest jump one cell may make on a ramp. A wall is a whole step

// every place where a road on A can look at B, one step away, with C behind it in line
function edges(L) {
  const w = new World(L), N = w.N, out = [];
  const free = (x, y) => x >= 0 && y >= 0 && x < N && y < N && !w.buildingAt(x, y) && !w.railTile[y * N + x] && !(L.river && w.onRiver(x, y)) && !(w.sea != null && w.tileHeight(x, y) * STEP < w.sea + .05);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (const [dx, dy] of DIRS) {
    const bx = x + dx, by = y + dy, cx = x - dx, cy = y - dy;
    if (!free(x, y) || !free(bx, by) || !free(cx, cy)) continue;
    const h = w.heights[y * N + x];
    if (Math.abs(w.heights[by * N + bx] - h) !== 1 || Math.abs(w.heights[cy * N + cx] - h) > 1) continue;
    out.push({ x, y, dx, dy, bx, by, cx, cy });
  }
  return out;
}
// the heights along the middle of the road, from the centre of A to the centre of B
function profile(w, e) {
  const z = [], n = C;
  for (let k = 0; k <= n; k++) { const u = (k + .5) / n; z.push(w.base[w.idx(e.x + .5 + e.dx * u, e.y + .5 + e.dy * u)]); }
  return z;
}
const worstJump = z => z.slice(1).reduce((m, v, k) => Math.max(m, Math.abs(v - z[k])), 0);
const put = (w, ...list) => { for (const [t, x, y] of list) w.place(t, x, y, { free: true, instant: true }); };
const SWEEP = STREETS.flatMap(L => edges(L).map(e => ({ L, e })));

test('the sweep reaches edges on the plots with steps', () => {
  assert.ok(SWEEP.length > 100, `only ${SWEEP.length} edges`);
  assert.ok(SWEEP.some(c => c.L.id === 'kampung'));
});
test('Kampung Baru: the road at the wall climbs to the ground above it', () => {
  const L = LEVELS.find(l => l.id === 'kampung'), w = new World(L);
  put(w, ['jalan', 2, 2]); // the start road comes up from the gate through (2, 3)
  const near = w.base[w.idx(2.5, 2.03)], far = w.base[w.idx(2.5, 1.9)];
  assert.ok(Math.abs(near - far) < .08, `road ${near} meets ground ${far}`);
  assert.ok(w.base[w.idx(2.5, 2.97)] < w.base[w.idx(2.5, 2.5)] + .01 && w.base[w.idx(2.5, 2.5)] < near);
});
test('a road running straight at a step has no wall in it, on any plot', () => {
  for (const { L, e } of SWEEP) {
    const w = new World(L); put(w, ['jalan', e.cx, e.cy], ['jalan', e.x, e.y]);
    const jump = worstJump(profile(w, e));
    assert.ok(jump <= MAX_RISE, `${L.id} (${e.x},${e.y}) to (${e.bx},${e.by}): jump ${jump.toFixed(2)}`);
  }
});
test('two roads across a step share the climb, on any plot', () => {
  for (const { L, e } of SWEEP) {
    const w = new World(L); put(w, ['jalan', e.x, e.y], ['jalan', e.bx, e.by]);
    const jump = worstJump(profile(w, e));
    assert.ok(jump <= MAX_RISE, `${L.id} (${e.x},${e.y}) to (${e.bx},${e.by}): jump ${jump.toFixed(2)}`);
  }
});
test('a home across a step from a road gets stone steps, on any plot', () => {
  for (const { L, e } of SWEEP) {
    const w = new World(L); put(w, ['jalan', e.x, e.y], ['rumah', e.bx, e.by]);
    const jump = worstJump(profile(w, e)), edge = w.mat[w.idx(e.x + .5 + e.dx * .47, e.y + .5 + e.dy * .47)];
    assert.equal(edge, M.STEPS, `${L.id} (${e.x},${e.y})`);
    assert.ok(jump <= MAX_RISE, `${L.id} (${e.x},${e.y}) to the home: jump ${jump.toFixed(2)}`);
  }
});
test('a road beside a wall stays flat', () => {
  for (const { L, e } of SWEEP) {
    const w = new World(L); put(w, ['jalan', e.x, e.y]); // nothing behind it in line, so it does not point at the step
    const h = w.heights[e.y * w.N + e.x] * STEP, here = w.base[w.idx(e.x + .5 + e.dx * .45, e.y + .5 + e.dy * .45)];
    assert.ok(Math.abs(here - h) < .02 || L.gate && L.gate.x === e.x && L.gate.y === e.y, `${L.id} (${e.x},${e.y}): ${here} against ${h}`);
  }
});
test('a removed road leaves the ground as it was', () => {
  const { L, e } = SWEEP[0], w = new World(L), before = profile(w, e);
  const a = w.place('jalan', e.cx, e.cy, { free: true, instant: true }), b = w.place('jalan', e.x, e.y, { free: true, instant: true });
  w.remove(b); w.remove(a);
  assert.deepEqual(profile(w, e), before);
});
