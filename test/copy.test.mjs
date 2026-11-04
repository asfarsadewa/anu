// Both languages must hold the same keys and the same placeholders. Every key the sim emits must exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import en from '../public/js/copy/en.js';
import id from '../public/js/copy/id.js';
import { CATALOG, WEATHER } from '../public/js/sim/catalog.js';
import { LEVELS } from '../public/js/sim/levels.js';

const flat = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, pre + k + '.') : [[pre + k, v]]));
const EN = new Map(flat(en)), ID = new Map(flat(id));
const render = v => (typeof v === 'function' ? [v({ n: 1 }), v({ n: 2 })].join(' ') : v);
const holes = v => [...new Set(typeof v === 'function' ? [] : (v.match(/\{\w+\}/g) || []))].sort();
const sentences = s => s.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
const words = s => s.replace(/\{\w+\}/g, 'x').split(/\s+/).filter(Boolean).length;

test('both languages hold the same keys', () => {
  assert.deepEqual([...EN.keys()].filter(k => !ID.has(k)), []);
  assert.deepEqual([...ID.keys()].filter(k => !EN.has(k)), []);
});
test('both languages use the same placeholders', () => {
  for (const [k, v] of EN) assert.deepEqual(holes(ID.get(k)), holes(v), k);
});
test('no Indonesian line is a copy of the English', () => {
  const same = [...EN].filter(([k, v]) => typeof v === 'string' && v === ID.get(k) && v.split(' ').length > 2).map(([k]) => k);
  assert.deepEqual(same, []);
});
test('every card and plot has copy', () => {
  for (const k of Object.keys(CATALOG)) assert.equal(typeof en.cards[k], 'string', k);
  for (const k of Object.keys(WEATHER)) assert.equal(typeof en.weather[k], 'string', k);
  for (const L of LEVELS) for (const f of ['place', 'goal', 'brief']) assert.equal(typeof en.levels[L.id][f], 'string', L.id + f);
  for (const L of LEVELS) for (const p of L.pledges) assert.ok(en.pledge[p.kind], p.kind);
});
test('every key the sim and the game use exists', () => {
  const src = ['public/js/sim/world.js', 'public/js/sim/transit.js', 'public/js/main.js'].map(f => readFileSync(f, 'utf8')).join('\n');
  const keys = [...src.matchAll(/'((?:ui|fail|info|forecast|place|log)\.[\w.]+)'/g)].map(m => m[1]).filter(k => !k.endsWith('.'));
  assert.ok(keys.length > 60);
  for (const k of keys) assert.ok(EN.has(k), k);
});
test('every sentence has 20 words or fewer', () => {
  for (const [k, v] of [...EN, ...ID]) for (const s of sentences(render(v))) assert.ok(words(s) <= 20, `${k}: ${s}`);
});
test('the English avoids the banned forms', () => {
  for (const [k, v] of EN) assert.doesNotMatch(render(v), /\bunless\b|rather than|instead of|\b\w+n't\b/i, k);
});
test('the Indonesian avoids slang and the formal pronoun', () => {
  for (const [k, v] of ID) assert.doesNotMatch(render(v), /\b(gak|nggak|enggak|aja|udah|Anda)\b/, k);
});
