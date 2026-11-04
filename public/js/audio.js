// Audio: a small gamelan synth for play, sample playback for effects, ambience and the main theme.
// Melodies are original. The tuning is slendro and pelog, as cents above the tonic.
let ctx = null, master = null, musicBus = null, sfxBus = null, ambBus = null, voiceBus = null;
let muted = false, manifest = null;
const buffers = new Map(), loading = new Map();
const SLENDRO = [0, 240, 480, 720, 960], PELOG = [0, 120, 270, 540, 670, 800, 1040];
const BASE = 196; // tonic in hertz
const pitch = (scale, deg, oct = 0) => { const n = scale.length, k = ((deg % n) + n) % n, o = Math.floor(deg / n) + oct; return BASE * Math.pow(2, o + scale[k] / 1200); };

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC({ latencyHint: 'playback' });
  master = ctx.createGain(); master.gain.value = muted ? 0 : 1;
  const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
  for (const [name, v] of [['m', .9], ['s', .8], ['a', .6], ['v', 1]]) { const g = ctx.createGain(); g.gain.value = v; g.connect(master); if (name === 'm') musicBus = g; if (name === 's') sfxBus = g; if (name === 'a') ambBus = g; if (name === 'v') voiceBus = g; }
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });
  initEcho();
  refreshAudio();
}
// Call this after the Turnstile check. Audio is not available before it
export function refreshAudio() {
  if (!ctx || manifest) return;
  fetch('audio/manifest.json').then(r => (r.ok ? r.json() : null)).then(m => { if (!m) return; manifest = m; if (pendingTheme) playTheme(); if (pendingAmb) setAmbience(pendingAmb); preload(); if (trackName && !trackSrc) { const n = trackName; trackName = null; playTrack(n); } if (moodNow) { const m = moodNow; moodNow = null; playMood(m); } }).catch(() => {});
}
export function setMuted(v) { muted = v; if (master) master.gain.setTargetAtTime(v ? 0 : 1, ctx.currentTime, .05); }
export const isMuted = () => muted;

async function load(path) {
  if (buffers.has(path)) return buffers.get(path);
  if (loading.has(path)) return loading.get(path);
  const p = fetch(path).then(r => { if (!r.ok) throw new Error(path); return r.arrayBuffer(); }).then(b => ctx.decodeAudioData(b)).then(buf => { buffers.set(path, buf); return buf; }).catch(() => null);
  loading.set(path, p);
  return p;
}
const TOWN_IDS = ['horn', 'bakso', 'rooster', 'schoolbell', 'bedug', 'churchbell', 'templegong', 'boat', 'gull', 'tokek', 'dog', 'becak', 'train_horn', 'crossing_bell', 'train_pass', 'steam_chuff', 'bus_hiss'];
const SFX_IDS = [...TOWN_IDS, 'hammer', 'saw', 'lash', 'brick', 'thud', 'tile', 'dig', 'splash', 'creak', 'collapse', 'kentongan', 'rumble', 'thunder', 'eruption', 'ui_tap', 'ui_place', 'ui_bad', 'harvest', 'cheer', 'pump', 'moped'];
function preload() { for (const id of SFX_IDS) load(`audio/sfx/${id}.mp3`); }
const FALLBACK = new Set(['hammer', 'saw', 'lash', 'brick', 'thud', 'tile', 'dig']);
const lastPlay = new Map();
// plays an effect. The same effect cannot stack too fast, so a crowd of hammers does not clip
export function sfx(id, { gain = 1, gap = .07, rate = 0 } = {}) {
  if (!ctx) return;
  const now = ctx.currentTime;
  if (now - (lastPlay.get(id) || -9) < gap) return;
  lastPlay.set(id, now);
  const path = `audio/sfx/${id}.mp3`, buf = buffers.get(path);
  if (!buf) { load(path); if (id.startsWith('ui') || FALLBACK.has(id)) synthFallback(id); return; }
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buf; s.playbackRate.value = 1 + (rate || (Math.random() - .5) * .12); g.gain.value = gain;
  s.connect(g).connect(sfxBus); s.start();
}
function synthFallback(id) {
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'triangle'; o.frequency.setValueAtTime(id.startsWith('ui') ? 520 : 150, t); o.frequency.exponentialRampToValueAtTime(70, t + .08);
  g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.001, t + .09);
  o.connect(g).connect(sfxBus); o.start(t); o.stop(t + .1);
}

/* ---------- ambience ---------- */
const ambLayers = new Map(); let pendingAmb = null;
export async function setAmbience(levels) { // { rain: 0..1, river: 0..1, wind:, sea:, village: }
  pendingAmb = levels;
  if (!ctx || !manifest) return;
  for (const [name, v] of Object.entries(levels)) {
    let L = ambLayers.get(name);
    if (!L) {
      if (v <= 0) continue;
      L = { g: ctx.createGain(), s: null }; L.g.gain.value = 0; L.g.connect(ambBus); ambLayers.set(name, L);
      load(`audio/sfx/${name}_loop.mp3`).then(buf => { if (!buf) return; L.s = ctx.createBufferSource(); L.s.buffer = buf; L.s.loop = true; L.s.connect(L.g); L.s.start(); });
    }
    L.g.gain.setTargetAtTime(v, ctx.currentTime, .9);
  }
}

/* ---------- main theme ---------- */
let themeSrc = null, themeGain = null, pendingTheme = false;
export async function playTheme() {
  pendingTheme = true;
  if (!ctx || !manifest) return;
  stopSong();
  if (themeSrc) return;
  const buf = await load('audio/theme.mp3');
  if (!buf || !pendingTheme) return;
  themeGain = ctx.createGain(); themeGain.gain.value = 0; themeGain.gain.linearRampToValueAtTime(.9, ctx.currentTime + 1.5); themeGain.connect(musicBus);
  themeSrc = ctx.createBufferSource(); themeSrc.buffer = buf; themeSrc.loop = true; themeSrc.connect(themeGain); themeSrc.start();
}
// a level's own recorded score, in place of the synth
let trackName = null, trackSrc = null, trackGain = null;
export async function playTrack(name) {
  stopSong(); stopTheme();
  if (trackName === name) return;
  stopTrack();
  trackName = name;
  if (!ctx || !manifest) return;
  const buf = await load(`audio/${name}.mp3`);
  if (!buf || trackName !== name) return;
  trackGain = ctx.createGain(); trackGain.gain.value = 0; trackGain.gain.linearRampToValueAtTime(.95, ctx.currentTime + 2.5); trackGain.connect(musicBus);
  trackSrc = ctx.createBufferSource(); trackSrc.buffer = buf; trackSrc.loop = true; trackSrc.connect(trackGain); trackSrc.start();
}
// gameplay music by mood. It uses the recorded bed if the game has one, and the synth if it does not
let moodNow = null;
export function playMood(mood) {
  if (moodNow === mood) return;
  moodNow = mood;
  if (!ctx || !manifest) return;
  const id = 'play_' + mood;
  if (manifest.files && manifest.files.some(f => f.id === id)) playTrack(id); else playSong(mood);
}
export function stopMood() { moodNow = null; stopTrack(); stopSong(); }
export function stopTrack() {
  trackName = null;
  if (!trackSrc) return;
  const s = trackSrc, g = trackGain; trackSrc = null;
  g.gain.setTargetAtTime(0, ctx.currentTime, .6);
  setTimeout(() => { try { s.stop(); } catch { /* stopped */ } }, 3000);
}
export function stopTheme() {
  pendingTheme = false;
  if (!themeSrc) return;
  const s = themeSrc, g = themeGain; themeSrc = null;
  g.gain.setTargetAtTime(0, ctx.currentTime, .4);
  setTimeout(() => { try { s.stop(); } catch { /* stopped */ } }, 2000);
}
export async function playCue(name) {
  if (!ctx) return;
  const buf = await load(`audio/${name}.mp3`);
  if (!buf) return;
  const s = ctx.createBufferSource(); s.buffer = buf; s.connect(musicBus); s.start();
}

/* ---------- voice ---------- */
let voiceLines = null;
export async function loadLines() { if (voiceLines) return voiceLines; try { const r = await fetch('audio/voice/lines.json'); if (r.ok) voiceLines = await r.json(); } catch { /* it can retry */ } return voiceLines || []; }
export async function speak(id, onLine) {
  const lines = await loadLines(), line = lines.find(l => l.id === id);
  if (!line) return;
  onLine && onLine(line);
  if (!ctx) return;
  const buf = await load(`audio/voice/${id}.mp3`);
  if (!buf) return;
  duck(.35);
  const s = ctx.createBufferSource(); s.buffer = buf; s.connect(voiceBus); s.start();
  s.onended = () => duck(1);
  return buf.duration;
}
function duck(v) { if (musicBus) musicBus.gain.setTargetAtTime(.9 * v, ctx.currentTime, .15); if (ambBus) ambBus.gain.setTargetAtTime(.6 * (v < 1 ? .6 : 1), ctx.currentTime, .15); }

/* ---------- the gamelan synth ---------- */
let echoIn = null;
function initEcho() {
  echoIn = ctx.createGain();
  const d = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
  d.delayTime.value = .36; fb.gain.value = .32; lp.type = 'lowpass'; lp.frequency.value = 2400;
  echoIn.connect(d).connect(lp).connect(fb).connect(d); lp.connect(musicBus);
}
function env(g, t, a, peak, decay) { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(.0002, t + a + decay); }
function metal(t, hz, peak, decay, partials, out) {
  const g = ctx.createGain(); env(g, t, .004, peak, decay); g.connect(out); g.connect(echoIn);
  for (const [m, a, beat] of partials) {
    const o = ctx.createOscillator(), p = ctx.createGain();
    o.frequency.value = hz * m + (beat || 0); p.gain.value = a; o.connect(p).connect(g); o.start(t); o.stop(t + decay + .1);
  }
}
const INST = {
  // saron: a bright metal bar with inharmonic partials and paired-tuning beats
  saron: (t, hz, v, out) => metal(t, hz, v, .9, [[1, 1, 0], [1, .5, 2.4], [2.76, .25, 0], [5.4, .08, 0]], out),
  // gender: soft and long
  gender: (t, hz, v, out) => metal(t, hz * 2, v * .6, 1.8, [[1, 1, 0], [1, .6, 1.2], [3.01, .06, 0]], out),
  // bonang: a small kettle gong
  bonang: (t, hz, v, out) => metal(t, hz * 2, v * .6, .35, [[1, 1, 0], [2.02, .3, 0], [3.1, .12, 0]], out),
  kenong: (t, hz, v, out) => metal(t, hz, v * .7, 1.4, [[1, 1, 0], [1, .8, 1.6], [2, .2, 0]], out),
  // gong ageng: very low with a slow beat
  gong: (t, hz, v, out) => metal(t, hz * .25, v, 5, [[1, 1, 0], [1, .9, .9], [2.01, .35, .6], [3.03, .08, 0]], out),
  // suling: a bamboo flute. It glides into the note and gains vibrato
  suling: (t, hz, v, out, len) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), lf = ctx.createOscillator(), d = ctx.createGain(), h = ctx.createOscillator(), hg = ctx.createGain();
    o.frequency.setValueAtTime(hz * 1.96, t); o.frequency.exponentialRampToValueAtTime(hz * 2, t + .08);
    h.frequency.value = hz * 4; hg.gain.value = .12; h.connect(hg).connect(g);
    lf.frequency.value = 5.2; d.gain.setValueAtTime(0, t); d.gain.linearRampToValueAtTime(hz * .03, t + Math.min(len, .7)); lf.connect(d).connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .06); g.gain.setValueAtTime(v, t + Math.max(.07, len - .1)); g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(g); g.connect(out); g.connect(echoIn);
    for (const x of [o, lf, h]) { x.start(t); x.stop(t + len + .05); }
  },
  // kendang: a hand drum. Low and high strokes
  kendang: (t, hz, v, out) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(hz * 1.4, t); o.frequency.exponentialRampToValueAtTime(hz, t + .05);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0005, t + .16);
    o.connect(g).connect(out); o.start(t); o.stop(t + .18);
  },
  // a soft pad for the wet months
  pad: (t, hz, v, out, len) => {
    const f = ctx.createBiquadFilter(), g = ctx.createGain(), end = t + len + 1;
    f.type = 'lowpass'; f.frequency.value = 800;
    for (const det of [-6, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.detune.value = det; o.connect(f); o.start(t); o.stop(end); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 1); g.gain.setValueAtTime(v, t + len); g.gain.linearRampToValueAtTime(0, end);
    f.connect(g).connect(out);
  },
};
// A song is a colotomic cycle: gong at the end, kenong on the strong beats, a balungan melody, and elaboration
// parts: [{ inst, gain, oct, scale, steps: string of degrees, per beat count }]
function line(s) { return s.trim().split(/\s+/).map(x => (x === '.' ? null : Number(x))); }
export const SONGS = {
  plan: { bpm: 54, beats: 32, scale: SLENDRO, parts: [
    { inst: 'gong', gain: .3, at: [31], deg: 0 },
    { inst: 'kenong', gain: .14, at: [7, 15, 23], deg: [1, 2, 1] },
    { inst: 'saron', gain: .13, every: 1, oct: 0, seq: line('0 2 1 2 3 2 1 0  2 3 4 3 2 1 2 1  3 4 3 2 1 2 3 2  1 2 1 0 4 3 2 0') },
    { inst: 'gender', gain: .1, every: 2, oct: -1, seq: line('0 . 2 . 3 . 1 .  2 . 4 . 2 . 1 .') },
    { inst: 'suling', gain: .05, every: 4, oct: 0, len: 3.3, seq: line('. 4 . 3 . 2 . .') },
  ] },
  run: { bpm: 82, beats: 32, scale: SLENDRO, parts: [
    { inst: 'gong', gain: .3, at: [31], deg: 0 },
    { inst: 'kenong', gain: .16, at: [3, 7, 11, 15, 19, 23, 27], deg: [2, 1, 3, 2, 1, 2, 4] },
    { inst: 'saron', gain: .12, every: 1, oct: 0, seq: line('2 3 2 1 3 4 3 2  4 3 2 1 2 3 2 0  1 2 3 2 1 0 1 2  3 2 3 4 3 2 1 0') },
    { inst: 'bonang', gain: .1, every: .5, oct: 0, seq: line('2 . 3 2 . 3 2 3  4 . 3 4 . 3 4 3  0 . 1 0 . 1 0 1  2 . 3 2 . 3 2 0') },
    { inst: 'kendang', gain: .17, hz: 110, every: 1, seq: line('1 . 1 1 . 1 . 1') },
    { inst: 'kendang', gain: .1, hz: 240, every: .5, seq: line('. . 1 . . 1 . 1 . . 1 . 1 . . .') },
  ] },
  danger: { bpm: 100, beats: 16, scale: PELOG, parts: [
    { inst: 'gong', gain: .34, at: [15], deg: 0 },
    { inst: 'kenong', gain: .18, at: [3, 7, 11], deg: [1, 2, 1] },
    { inst: 'saron', gain: .14, every: 1, oct: 0, seq: line('0 1 2 1 0 1 4 3  4 3 1 2 1 0 1 0') },
    { inst: 'bonang', gain: .11, every: .5, oct: 0, seq: line('0 1 0 1 2 1 2 1  4 3 4 3 1 0 1 0') },
    { inst: 'kendang', gain: .2, hz: 110, every: .5, seq: line('1 . . 1 . 1 . . 1 . 1 . 1 . 1 1') },
  ] },
};
let song = null, songGain = null, songAt = 0, songBeat = 0, songTimer = null, songName = null;
export function playSong(name) {
  if (songName === name) return;
  songName = name;
  if (!ctx) return;
  const old = songGain;
  if (old) { old.gain.setTargetAtTime(0, ctx.currentTime, .5); setTimeout(() => old.disconnect(), 3000); }
  song = SONGS[name]; songGain = ctx.createGain(); songGain.gain.value = 0; songGain.gain.setTargetAtTime(1, ctx.currentTime, .6); songGain.connect(musicBus);
  songAt = ctx.currentTime + .1; songBeat = 0;
  if (!songTimer) songTimer = setInterval(tickSong, 120);
}
export function stopSong() { songName = null; if (songGain) { songGain.gain.setTargetAtTime(0, ctx.currentTime, .4); } song = null; }
function tickSong() {
  if (!song || !ctx || ctx.state !== 'running') return;
  const beat = 60 / song.bpm;
  while (songAt < ctx.currentTime + .6) {
    const b = songBeat % song.beats;
    for (const p of song.parts) playPart(p, b, songAt, beat);
    songBeat += .5; songAt += beat / 2;
  }
}
function playPart(p, b, t, beat) {
  const scale = song.scale;
  if (p.at) { const k = p.at.indexOf(b); if (k >= 0) INST[p.inst](t, pitch(scale, Array.isArray(p.deg) ? p.deg[k] : p.deg), p.gain, songGain); return; }
  const every = p.every || 1;
  if (b % every !== 0) return;
  const idx = (b / every) % p.seq.length, deg = p.seq[idx];
  if (deg == null) return;
  const hz = p.hz || pitch(scale, deg, p.oct || 0);
  INST[p.inst](t, hz, p.gain * (.85 + Math.random() * .2), songGain, (p.len || every) * beat);
}
