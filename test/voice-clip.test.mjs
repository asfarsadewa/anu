// The real queue and the real clip code, with a fake audio context and fake timers.
// When the tab is hidden the audio clock stops and JavaScript timers keep running. Two lines must never play at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceQueue, playClip } from '../public/js/voice-queue.js';

function bench() {
  const sources = [], timers = []; let now = 0, hidden = false;
  const ctx = {
    state: 'running', currentTime: 0,
    createBufferSource() {
      const s = { live: false, connect() {}, start() { s.live = true; }, stop() { s.live = false; s.stopped = true; }, onended: null, id: sources.length };
      sources.push(s); return s;
    },
  };
  const timer = (fn, ms) => { const t = { fn, at: now + ms, on: true }; timers.push(t); return t; }, clear = t => { if (t) t.on = false; };
  const tick = () => new Promise(r => setImmediate(r));
  const shown = [], ducks = [];
  const q = new VoiceQueue({
    onDuck: d => ducks.push(d),
    play: async id => ({ line: { id }, ms: 2000, ...playClip({ ctx, buffer: { duration: 2 }, dest: {}, ms: 2000, isHidden: () => hidden, timer, clear }) }),
  });
  return {
    q, ctx, sources, shown, ducks, tick,
    live: () => sources.filter(s => s.live).length,
    hide() { hidden = true; ctx.state = 'suspended'; },
    show() { hidden = false; ctx.state = 'running'; },
    // wall clock moves. The audio clock moves only while the context runs
    async pass(ms) {
      const end = now + ms;
      for (;;) {
        const next = timers.filter(t => t.on && t.at <= end).sort((a, b) => a.at - b.at)[0];
        const to = next ? next.at : end;
        if (ctx.state === 'running') ctx.currentTime += (to - now) / 1000;
        now = to;
        if (!next) break;
        next.on = false; next.fn(); await tick();
      }
      await tick();
    },
    async endClip(s) { s.live = false; const f = s.onended; if (f) f(); await tick(); await tick(); },
  };
}
const say = (b, id, opts) => b.q.say(id, l => b.shown.push(l.id), opts);

test('the fallback timer firing in a hidden tab does not start a second line', async () => {
  const b = bench();
  say(b, 'intro'); say(b, 'build'); await b.tick();
  assert.equal(b.live(), 1);
  await b.pass(500); b.hide();
  await b.pass(30000);
  assert.equal(b.live(), 1, 'only the intro holds a source');
  assert.deepEqual(b.shown, ['intro'], 'the build line still waits');
  assert.equal(b.sources.length, 1);
});
test('a plot change in a hidden tab silences the paused line', async () => {
  const b = bench();
  say(b, 'intro'); say(b, 'build'); await b.tick();
  await b.pass(500); b.hide(); await b.pass(30000);
  b.q.cancel(); await b.tick();
  assert.equal(b.live(), 0, 'nothing is left to resume');
  b.show(); await b.pass(5000);
  assert.equal(b.live(), 0);
  assert.deepEqual(b.shown, ['intro']);
  assert.equal(b.ducks.at(-1), false, 'the music comes back');
});
test('after the tab returns the line finishes, then the next line plays alone', async () => {
  const b = bench();
  say(b, 'intro'); say(b, 'build'); await b.tick();
  await b.pass(500); b.hide(); await b.pass(30000); b.show();
  await b.pass(800); // the intro still has audio left, and the fallback timer must wait for it
  assert.equal(b.live(), 1); assert.equal(b.sources[0].live, true, 'the intro plays on');
  assert.equal(b.sources[0].stopped, undefined);
  await b.endClip(b.sources[0]);
  assert.deepEqual(b.shown, ['intro', 'build']);
  assert.equal(b.live(), 1); assert.equal(b.sources[1].live, true);
});
test('a lost end event stops the source before the next line starts', async () => {
  const b = bench();
  say(b, 'a'); say(b, 'b'); await b.tick();
  b.sources[0].onended = null; // the browser never reports the end
  await b.pass(3000); await b.tick();
  assert.equal(b.sources[0].live, false, 'the old source is stopped');
  assert.deepEqual(b.shown, ['a', 'b']);
  assert.equal(b.live(), 1);
});
test('a context that stays suspended in a visible tab does not block the queue for ever', async () => {
  const b = bench();
  b.ctx.state = 'suspended'; // audio was never unlocked, or the system interrupted it
  say(b, 'a'); say(b, 'b'); await b.tick();
  await b.pass(6000);
  assert.deepEqual(b.shown, ['a', 'b']);
  assert.equal(b.sources[0].live, false, 'the first source does not wait to play over the next');
  assert.equal(b.live(), 1);
});
test('a brief suspension in a visible tab does not cut a line short', async () => {
  const b = bench();
  say(b, 'a'); say(b, 'b'); await b.tick();
  await b.pass(1000); b.ctx.state = 'suspended'; // the clock stops at one second
  await b.pass(1900); // the fallback timer fires during the pause
  b.ctx.state = 'running'; await b.pass(200);
  assert.equal(b.sources[0].live, true, 'the line plays on');
  assert.deepEqual(b.shown, ['a']);
});
test('a line with no sound keeps its subtitle time and then moves on', async () => {
  let now = 0; const timers = [], timer = (fn, ms) => { const t = { fn, at: now + ms, on: true }; timers.push(t); return t; }, clear = t => { if (t) t.on = false; };
  const c = playClip({ ctx: null, buffer: null, dest: null, ms: 3200, isHidden: () => false, timer, clear });
  let done = false; c.ended.then(() => { done = true; });
  await new Promise(r => setImmediate(r)); assert.equal(done, false);
  timers[0].fn(); await new Promise(r => setImmediate(r));
  assert.equal(done, true);
});
test('stopping a clip twice is safe, and clears its timer', async () => {
  const b = bench();
  say(b, 'a'); await b.tick();
  b.q.cancel(); b.q.cancel(); await b.tick();
  assert.equal(b.live(), 0);
  await b.pass(10000);
  assert.equal(b.sources.length, 1);
});
