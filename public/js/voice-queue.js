// One narrator, one channel. A new line waits for the current one. An urgent line replaces it. A plot change cancels everything.
// play(id) gives { line, stop(), ended } or null. onDuck(true) lowers the music, and onDuck(false) restores it once she is silent.
export class VoiceQueue {
  constructor({ play, onDuck, maxWaiting = 2 }) { this.play = play; this.onDuck = onDuck; this.maxWaiting = maxWaiting; this.waiting = []; this.current = null; this.token = 0; this.busy = false; }
  say(id, onLine, { urgent = false } = {}) {
    if (urgent) { this.waiting = []; this.stopCurrent(); }
    this.waiting.push({ id, onLine });
    while (this.waiting.length > this.maxWaiting) this.waiting.shift();
    if (!this.busy) this.next();
  }
  cancel() {
    this.waiting = [];
    this.stopCurrent();
    this.busy = false;
    this.onDuck(false);
  }
  stopCurrent() {
    this.token++; // whatever is still loading or finishing now belongs to the past
    if (this.current) { try { this.current.stop(); } catch { /* it has ended */ } this.current = null; }
    this.busy = false;
  }
  async next() {
    const item = this.waiting.shift();
    if (!item) { this.busy = false; this.onDuck(false); return; }
    this.busy = true;
    const token = ++this.token;
    let h = null;
    try { h = await this.play(item.id); } catch { h = null; }
    if (token !== this.token) { if (h) { try { h.stop(); } catch { /* it has ended */ } } return; }
    if (!h) { this.next(); return; }
    this.current = h;
    this.onDuck(true);
    item.onLine && item.onLine(h.line, h.ended);
    await h.ended;
    if (token !== this.token) return;
    this.current = null;
    this.next();
  }
}

// One clip. A browser can lose the end event, and a context that never unlocks does not report one, so a timer backs it up.
// A hidden tab stops the audio clock while timers keep running, so the timer reads the clock. It waits while the clip is only paused.
// When it does give up, it stops the source first, so no clip can resume after the queue has moved on.
export function playClip({ ctx, buffer, dest, ms, isHidden = () => false, timer = setTimeout, clear = clearTimeout }) {
  let finish, source = null, guard = null, stalled = 0, over = false;
  const ended = new Promise(res => { finish = res; });
  const close = () => { over = true; clear(guard); finish(); };
  const stop = () => {
    if (over) return;
    if (source) { source.onended = null; try { source.stop(); } catch { /* it has ended */ } }
    close();
  };
  if (!buffer) { guard = timer(stop, ms + 900); return { ended, stop }; } // a subtitle with no sound still gets its time
  source = ctx.createBufferSource(); source.buffer = buffer; source.connect(dest); source.onended = close; source.start();
  const endAt = ctx.currentTime + buffer.duration;
  const check = () => {
    if (over) return;
    if (isHidden()) { stalled = 0; guard = timer(check, 1000); return; } // paused with the tab
    if (ctx.state !== 'running') { if (++stalled < 2) guard = timer(check, 900); else stop(); return; } // a short pause, or a context that will not run
    stalled = 0;
    const left = endAt - ctx.currentTime;
    if (left > .05) guard = timer(check, left * 1000 + 900); else stop(); // past its end with no event: the event was lost
  };
  guard = timer(check, ms + 900);
  return { ended, stop };
}
