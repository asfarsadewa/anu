// Bu Lurah speaks one line at a time, and the music comes back only when she is silent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceQueue } from '../public/js/voice-queue.js';

function rig() {
  const started = [], stopped = [], ducks = [], ends = new Map();
  const q = new VoiceQueue({
    onDuck: d => ducks.push(d),
    play: async id => {
      if (id === 'missing') return null;
      started.push(id);
      let end; const ended = new Promise(r => { end = r; }); ends.set(id, end);
      return { line: { id }, ms: 1000, ended, stop() { stopped.push(id); end(); } };
    },
  });
  return { q, started, stopped, ducks, ends, tick: () => new Promise(r => setTimeout(r, 0)) };
}
test('a second line waits for the first', async () => {
  const r = rig(), shown = [];
  r.q.say('intro', l => shown.push(l.id)); r.q.say('build', l => shown.push(l.id)); await r.tick();
  assert.deepEqual(r.started, ['intro']); assert.deepEqual(shown, ['intro']);
  r.ends.get('intro')(); await r.tick(); await r.tick();
  assert.deepEqual(r.started, ['intro', 'build']); assert.deepEqual(shown, ['intro', 'build']);
});
test('the music comes back only after the last line', async () => {
  const r = rig();
  r.q.say('a'); r.q.say('b'); await r.tick();
  r.ends.get('a')(); await r.tick(); await r.tick();
  assert.equal(r.ducks.includes(false), false, 'still speaking');
  r.ends.get('b')(); await r.tick(); await r.tick();
  assert.equal(r.ducks.at(-1), false);
  assert.equal(r.q.busy, false);
});
test('an urgent line replaces what is playing and what is waiting', async () => {
  const r = rig();
  r.q.say('a'); r.q.say('b'); await r.tick();
  r.q.say('quake', null, { urgent: true }); await r.tick(); await r.tick();
  assert.deepEqual(r.stopped, ['a']); assert.deepEqual(r.started, ['a', 'quake']);
  r.ends.get('quake')(); await r.tick(); await r.tick();
  assert.deepEqual(r.started, ['a', 'quake'], 'b was dropped');
});
test('a plot change silences her and restores the music', async () => {
  const r = rig();
  r.q.say('a'); r.q.say('b'); await r.tick();
  r.q.cancel(); await r.tick();
  assert.deepEqual(r.stopped, ['a']); assert.equal(r.ducks.at(-1), false); assert.equal(r.q.busy, false);
  r.q.say('c'); await r.tick();
  assert.deepEqual(r.started, ['a', 'c']);
});
test('a line cancelled while it loads never plays', async () => {
  let release; const stopped = [], started = [];
  const q = new VoiceQueue({ onDuck() {}, play: () => new Promise(res => { release = () => res({ line: {}, ms: 1, ended: new Promise(() => {}), stop() { stopped.push(1); } }); }) });
  q.say('slow', () => started.push(1)); q.cancel(); release();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(started.length, 0); assert.equal(stopped.length, 1);
});
test('a line with no audio does not block the next', async () => {
  const r = rig();
  r.q.say('missing'); r.q.say('real'); await r.tick(); await r.tick();
  assert.deepEqual(r.started, ['real']);
});
test('only the newest lines wait', async () => {
  const r = rig();
  for (const id of ['a', 'b', 'c', 'd', 'e']) r.q.say(id);
  await r.tick();
  assert.deepEqual(r.q.waiting.map(w => w.id), ['d', 'e']);
});
