// One narrator, one channel. A new line waits for the current one. An urgent line replaces it. A plot change cancels everything.
// play(id) gives { line, ms, stop(), ended } or null. onDuck(true) lowers the music, and onDuck(false) restores it once she is silent.
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
    item.onLine && item.onLine(h.line, h.ms);
    await h.ended;
    if (token !== this.token) return;
    this.current = null;
    this.next();
  }
}
