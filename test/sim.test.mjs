// What the external review found, held in place: resume, mud, forecast, undo, pasar rice and the plan checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/js/sim/world.js';
import { levelById, LEVELS } from '../public/js/sim/levels.js';
import { CATALOG } from '../public/js/sim/catalog.js';
import { PLANS, checkPlan } from '../tools/autoplay.mjs';

const placeAll = (w, plan, m) => { for (const [t, x, y] of plan[m] || []) if (!w.canPlace(t, x, y) && CATALOG[t].cost <= w.labour) w.place(t, x, y); };
const runMonth = w => { w.fx.length = 0; w.startMonth(); while (!w.step()) { /* the month runs */ } };
const upTo = (L, plan, months) => { const w = new World(L); for (let m = 0; m < months && !w.done; m++) { placeAll(w, plan, m); runMonth(w); } return w; };
const finish = (w, L, plan) => { for (let m = w.month; m < L.months && !w.done; m++) { placeAll(w, plan, m); runMonth(w); } return w; };
const resume = (w, L) => { const r = new World(L); r.load(JSON.parse(JSON.stringify(w.save()))); return r; };
const flowCells = w => { let n = 0; for (let i = 0; i < w.mx.length; i++) if (w.mx[i] || w.my[i]) n++; return n; };

function assertSameState(a, b, label) {
  for (const k of ['month', 'people', 'rice', 'labour', 'destroyed', 'lost', 'harvested', 'harvestAfter', 'peakPeople']) assert.equal(b[k], a[k], `${label}: ${k}`);
  assert.equal(!!(b.done && b.done.won), !!(a.done && a.done.won), `${label}: the result`);
  for (const k of ['w', 'm', 'ash', 'sat', 'qx', 'qy', 'mx', 'my', 'ground0', 'base', 'moist']) {
    const x = a[k], y = b[k];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) assert.fail(`${label}: ${k}[${i}] is ${y[i]}, the straight run has ${x[i]}`);
  }
}

test('a resumed game runs the same as the game that never stopped', () => {
  for (const [id, at] of [['subak', 12], ['subak', 13], ['ambarawa', 8], ['merapi', 8], ['lereng', 5], ['pesisir', 9], ['manggarai', 10], ['lindu', 9]]) {
    const L = levelById(id), plan = PLANS[id].good, a = upTo(L, plan, at);
    assert.ok(!a.done, `${id} ended before month ${at}`);
    const b = resume(a, L);
    assertSameState(a, b, `${id} at the load`);
    finish(a, L, plan); finish(b, L, plan);
    assertSameState(a, b, `${id} saved after month ${at}`);
  }
});
test('a save survives JSON with its collections and counters intact', () => {
  const L = levelById('subak'), w = upTo(L, PLANS.subak.good, 13), r = resume(w, L);
  assert.ok(r.ripeLevels instanceof Set);
  assert.deepEqual([...r.ripeLevels].sort(), [...w.ripeLevels].sort());
  const A = levelById('ambarawa'), t = upTo(A, PLANS.ambarawa.good, 8);
  assert.equal(resume(t, A).transit.freight, t.transit.freight);
  assert.ok(t.transit.freight > 0);
});
test('a save from before this change still loads', () => {
  const L = levelById('kampung'), w = upTo(L, PLANS.kampung.good, 2), s = JSON.parse(JSON.stringify(w.save()));
  for (const k of ['qx', 'qy', 'mx', 'my', 'sat', 'soil']) delete s.arrays[k];
  for (const k of ['ripeLevels', 'evacDist', 'transit', 'plume', 'quake', 'surge', 'waveEv', 'anyMud', 'peakPeople', 'evac', 'tide', 'wave']) delete s[k];
  const r = new World(L); r.load(s);
  assert.equal(r.month, w.month);
  finish(r, L, PLANS.kampung.good);
});

test('the eruption wakes the mud solver and mud flows', () => {
  const L = levelById('merapi'), w = upTo(L, PLANS.merapi.good, 7);
  assert.equal(w.anyMud, false, 'the solver sleeps before the eruption');
  placeAll(w, PLANS.merapi.good, 7); w.fx.length = 0; w.startMonth();
  let peak = 0; for (let k = 0; k < 480; k++) { w.step(); peak = Math.max(peak, flowCells(w)); }
  assert.ok(peak > 1000, `flow cells ${peak}`);
});
test('a landslide wakes the mud solver', () => {
  const L = levelById('lereng'), w = new World(L); w.anyMud = false;
  w.slide(3, 3);
  assert.equal(w.anyMud, true);
  w.startMonth(); let peak = 0; for (let k = 0; k < 120; k++) { w.step(); peak = Math.max(peak, flowCells(w)); }
  assert.ok(peak > 0);
});
test('a sabo dam holds mud back', () => {
  // the same pile of mud on the same slope, with and without a line of dams below it
  const L = levelById('merapi'), past = (dam) => {
    const w = new World(L), N = w.N;
    if (dam) for (let x = 0; x < N; x++) if (!w.canPlace('sabo', x, 3)) w.place('sabo', x, 3, { free: true, instant: true });
    w.refreshPhysicsFields();
    let mud = 0; const pile = w.idx(2.5, 2.5);
    for (let a = -8; a <= 8; a++) for (let b = -8; b <= 8; b++) w.m[pile + b * w.G + a] = .3;
    w.anyMud = true; w.startMonth();
    for (let k = 0; k < 300; k++) w.step();
    for (let y = 4.05; y < N; y += .125) for (let x = .05; x < N; x += .125) mud += w.m[w.idx(x, y)];
    return mud;
  };
  const open = past(false), held = past(true);
  assert.ok(open > .5, `mud below the line with no dam: ${open}`);
  assert.ok(held < open * .5, `with the dam ${held}, with no dam ${open}`);
});

/* the forecast is the real worker code */
const posted = []; globalThis.postMessage = d => posted.push(d); globalThis.onmessage = null;
await import('../public/js/sim/forecast-worker.js');
const worker = globalThis.onmessage;
const forecast = w => { posted.length = 0; worker({ data: structuredClone({ ...w.snapshot(), stamp: 1 }) }); return posted[0]; };
const warned = f => new Set(f.alerts.filter(a => a.kind === 'lost').map(a => a.x + ',' + a.y));

test('the forecast warns about a building under construction', () => {
  const L = levelById('lindu'), w = new World(L);
  for (let m = 0; m < 9; m++) { for (const [t, x, y] of PLANS.lindu.good[m] || []) { if (m === 8 && t === 'rumah') continue; if (!w.canPlace(t, x, y) && CATALOG[t].cost <= w.labour) w.place(t, x, y); } runMonth(w); }
  const r = w.place('ruko', 3, 0); assert.ok(r);
  assert.ok(warned(forecast(w)).has('3,0'), 'no warning for the new ruko');
  runMonth(w);
  assert.ok(r.ruin, 'the new ruko fell in the real month');
});
test('the forecast sees an eruption that is still going', () => {
  const L = levelById('merapi'), w = upTo(L, PLANS.merapi.good, 8);
  assert.ok(w.plume, 'the plume lasts into this month');
  const said = warned(forecast(w)); placeAll(w, PLANS.merapi.good, 8);
  assert.ok(said.size >= 0);
  const f = forecast(w), before = new Set(w.buildings.filter(b => b.ruin).map(b => b.id)); runMonth(w);
  const fell = w.buildings.filter(b => b.ruin && !before.has(b.id)).map(b => b.x + ',' + b.y);
  assert.ok(fell.length > 0);
  assert.deepEqual([...warned(f)].sort(), fell.sort());
});
test('the forecast matches the real month, and rubble raises no warning', () => {
  for (const id of ['lindu', 'merapi', 'lereng', 'nusantara', 'pesisir', 'rob', 'tugu']) {
    const L = levelById(id), plan = PLANS[id].good, w = new World(L);
    for (let m = 0; m < L.months && !w.done; m++) {
      placeAll(w, plan, m);
      const said = warned(forecast(w)), before = new Set(w.buildings.filter(b => b.ruin).map(b => b.id)), hBefore = w.heights.slice();
      runMonth(w);
      const fell = new Set(w.buildings.filter(b => b.ruin && !before.has(b.id)).map(b => b.x + ',' + b.y));
      for (let i = 0; i < hBefore.length; i++) if (w.heights[i] !== hBefore[i]) fell.add(i % w.N + ',' + (i / w.N | 0)); // a slope that fails is a warning too, even with nothing on it
      assert.deepEqual([...said].sort(), [...fell].sort(), `${id} month ${m}`);
    }
  }
});

test('undo brings back the canal under a waterwheel', () => {
  const L = levelById('subak'), w = new World(L); w.labour = 20;
  const spot = (() => { for (let y = 0; y < w.N; y++) for (let x = 0; x < w.N; x++) if (!w.canPlace('saluran', x, y)) return [x, y]; })();
  const c = w.place('saluran', ...spot), wet = w.base[w.idx(spot[0] + .5, spot[1] + .5)], paid = w.labour;
  const k = w.place('kincir', ...spot); assert.ok(k);
  w.remove(k, true);
  assert.equal(w.buildingAt(...spot), c, 'the same canal stands');
  assert.equal(w.labour, paid, 'only the upgrade comes back');
  assert.equal(w.base[w.idx(spot[0] + .5, spot[1] + .5)], wet);
  w.remove(c, true);
  assert.equal(w.buildingAt(...spot), null);
  assert.equal(w.labour, 20);
});
test('undo brings back the road under a flyover', () => {
  const L = levelById('tugu'), w = new World(L); w.labour = 20;
  const count = () => w.computeRoads().reduce((s, v) => s + v, 0), before = count(), road = w.buildingAt(3, 3), paid = w.labour;
  assert.equal(road.type, 'jalan');
  const f = w.place('layang', 3, 3); assert.ok(f);
  w.remove(f, true);
  assert.equal(w.buildingAt(3, 3), road);
  assert.equal(count(), before);
  assert.equal(w.labour, paid);
});
test('demolishing an upgrade in a later month leaves nothing behind', () => {
  const L = levelById('subak'), w = new World(L); w.labour = 20;
  const spot = (() => { for (let y = 0; y < w.N; y++) for (let x = 0; x < w.N; x++) if (!w.canPlace('saluran', x, y)) return [x, y]; })();
  w.place('saluran', ...spot); const k = w.place('kincir', ...spot);
  runMonth(w);
  assert.equal(k.prev, undefined);
  w.remove(k);
  assert.equal(w.buildingAt(...spot), null);
});

test('a new pasar earns rice only after its first truck', () => {
  const L = levelById('solo'), w = new World(L); w.labour = 40;
  for (const [t, x, y] of [['jalan', 4, 3], ['jalan', 4, 4], ['pasar', 5, 4]]) { assert.equal(w.canPlace(t, x, y), null); w.place(t, x, y); }
  runMonth(w);
  const first = w.log.filter(e => e[0] === 'log.pasar').map(e => e[1].n);
  assert.deepEqual(first, [4], 'only the old pasar had a truck');
  runMonth(w);
  const second = w.log.filter(e => e[0] === 'log.pasar').map(e => e[1].n);
  assert.deepEqual(second, [8], 'both have trucks now');
});

test('the plan check fails a good plan that cannot win', () => {
  const L = levelById('kampung'), r = checkPlan({ ...L, goal: { kind: 'people', n: 9999 } }, 'good', PLANS.kampung.good);
  assert.ok(r.problems.includes('the good plan did not win'));
});
test('the plan check fails a good plan with a rejected placement', () => {
  const L = levelById('kampung'), plan = { ...PLANS.kampung.good, 0: [...(PLANS.kampung.good[0] || []), ['rumah', 99, 99]] };
  assert.ok(checkPlan(L, 'good', plan).problems.some(p => p.startsWith('rejected')));
});
test('the plan check fails a careless plan that wins', () => {
  const L = levelById('kampung'), r = checkPlan(L, 'naive', PLANS.kampung.good);
  assert.ok(r.problems.includes('the careless plan won'));
});
test('every plot has plans', () => { for (const L of LEVELS) assert.ok(PLANS[L.id] && PLANS[L.id].good && PLANS[L.id].naive, L.id); });
