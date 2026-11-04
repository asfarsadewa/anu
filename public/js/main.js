// The game: screens, turns and input. The simulation and the drawing live elsewhere.
import { World, DT, MONTH_SECONDS, STEP } from './sim/world.js';
import { CATALOG, WEATHER } from './sim/catalog.js';
import { LEVELS, levelById } from './sim/levels.js';
import { Scene } from './gfx/scene.js';
import { cardArt } from './gfx/buildings.js';
import { iconURL, bindIcons, drawWordmark } from './ui/icons.js';
import { drawMap } from './ui/map.js';
import * as A from './audio.js';

const $ = id => document.getElementById(id);
const canvas = $('c'), scene = new Scene(canvas);
const SAVE = 'anu.save', PROGRESS = 'anu.progress', MUTE = 'anu.mute';
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }, del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } } };

const G = { screen: 'title', world: null, level: null, sel: null, speed: 1, placed: [], fcWorker: null, fcStamp: 0, fcOn: false, drag: null, seenBarks: new Set(), dissolveTo: 1, ended: false };
window.__game = G; G.scene = scene;

const TITLE_LEVEL = {
  id: 'title', N: 5, biome: 'basin', style: 'joglo', urban: true, roads: true, seed: 3, title: 'Anu', map: ['22222', '22222', '22211', '22111', '21111'],
  gate: { x: 2, y: 4, side: 'y' }, months: 99, weather: ['cerah'], cards: [], people: 30, rice: 20, farLand: 102,
  goal: { kind: 'people', n: 999 }, wind: [.5, -.2],
  start: [{ type: 'jalan', x: 2, y: 4 }, { type: 'jalan', x: 2, y: 3 }, { type: 'jalan', x: 2, y: 2 }, { type: 'jalan', x: 1, y: 2 }, { type: 'jalan', x: 3, y: 2 }, { type: 'jalan', x: 0, y: 2 }, { type: 'jalan', x: 4, y: 2 },
    { type: 'rumah', x: 1, y: 3 }, { type: 'ruko', x: 3, y: 3 }, { type: 'pasar', x: 2, y: 1 }, { type: 'rumah', x: 1, y: 1 }, { type: 'ibadah', x: 3, y: 1 }, { type: 'rumah', x: 0, y: 1 }, { type: 'taman', x: 4, y: 3 }, { type: 'rumah', x: 1, y: 4 }, { type: 'ruko', x: 3, y: 4 }, { type: 'sekolah', x: 0, y: 3 }, { type: 'bambu', x: 4, y: 1 }, { type: 'bambu', x: 2, y: 0 }],
};

/* ---------- title ---------- */
function showTitle() {
  G.screen = 'title';
  for (const id of ['hud', 'tray', 'runbar', 'map']) $(id).hidden = true;
  $('title').hidden = false;
  document.body.classList.remove('running');
  const w = new World(TITLE_LEVEL);
  w.weather = WEATHER.cerah;
  G.world = w;
  scene.setInsets(180, 90);
  scene.setWorld(w);
  scene.dissolve = 1; G.dissolveTo = 1;
  drawWordmark($('wordmark'), scaleForWordmark());
}
const scaleForWordmark = () => Math.max(2, Math.min(5, Math.floor(Math.min(innerWidth, 520) / 90)));

/* ---------- the map ---------- */
function showMap() {
  G.screen = 'map';
  A.playTheme();
  $('title').hidden = true; $('hud').hidden = true; $('tray').hidden = true; $('runbar').hidden = true;
  $('map').hidden = false;
  document.body.classList.remove('running');
  const prog = store.get(PROGRESS) || {}, list = $('levels'), save = store.get(SAVE);
  list.innerHTML = '';
  let open = true;
  LEVELS.forEach((L, k) => {
    if (k === 0 || L.part !== LEVELS[k - 1].part) { const h = document.createElement('li'); h.className = 'part'; h.textContent = L.part === 2 ? 'Part 2: Traffic' : 'Part 1: Town'; list.append(h); }
    const stars = prog[L.id] || 0, li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.disabled = !open;
    const cont = save && save.id === L.id ? 'Saved game. ' : '';
    b.innerHTML = `<span class="n">${k + 1}</span><span class="t">${L.title}</span><span class="p">${cont}${L.place}. ${L.N} x ${L.N} tiles.</span><span class="s" aria-label="${stars} stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
    b.addEventListener('click', () => { A.sfx('ui_tap'); $('map').hidden = true; introLevel(L); });
    b.addEventListener('pointerenter', () => drawMap($('map-c'), LEVELS, prog, k));
    li.append(b); list.append(li);
    if (!stars) open = false;
  });
  drawMap($('map-c'), LEVELS, prog, -1);
}

/* ---------- sheets ---------- */
const sheet = $('sheet');
function openSheet(html, wire) {
  sheet.innerHTML = `<div class="sh">${html}</div>`;
  wire && wire(sheet);
  if (!sheet.open) sheet.showModal();
}
const closeSheet = () => { if (sheet.open) sheet.close(); sheet.classList.remove('low'); };
sheet.addEventListener('cancel', e => e.preventDefault());

function goalHtml(L, w) {
  const met = p => (w && w.done && w.done.won && w.pledgeMet(p) ? ' met' : '');
  return `<ul><li><b>${L.goalText}</b></li>${(L.pledges || []).map(p => `<li class="star${met(p)}">${p.text}</li>`).join('')}</ul>`;
}
function introLevel(L) {
  const save = store.get(SAVE), resume = save && save.id === L.id;
  openSheet(`<h2>${L.title}</h2><p class="place">${L.place}. ${L.months} months.</p><p>${L.brief}</p>${goalHtml(L)}
    <div class="row">${resume ? '<button id="restart" type="button">Start again</button><button id="go" class="primary" type="button">Continue</button>' : '<button id="back" type="button">Map</button><button id="go" class="primary" type="button">Start</button>'}</div>`, s => {
    s.querySelector('#go').addEventListener('click', () => { A.sfx('ui_tap'); closeSheet(); startLevel(L, resume ? save : null); });
    const r = s.querySelector('#restart'); if (r) r.addEventListener('click', () => { A.sfx('ui_tap'); store.del(SAVE); closeSheet(); startLevel(L); });
    const b = s.querySelector('#back'); if (b) b.addEventListener('click', () => { A.sfx('ui_tap'); closeSheet(); showMap(); });
  });
}
function startLevel(L, save) {
  G.screen = 'play'; G.level = L; G.sel = null; G.placed = []; G.ended = false; G.speed = 1; G.fcOn = false; G.seenBarks.clear();
  const w = new World(L);
  if (save) w.load(save);
  G.world = w;
  $('title').hidden = true; $('map').hidden = true; $('hud').hidden = false; $('tray').hidden = false; $('runbar').hidden = true;
  buildMonths(); buildCards(); refresh();
  scene.setInsets($('hud').offsetHeight, $('tray').offsetHeight);
  scene.setWorld(w);
  scene.dissolve = 1; G.dissolveTo = 0;
  A.stopTheme(); A.stopMood(); if (L.music) A.playTrack(L.music); else A.playMood('plan'); ambience();
  bark(`l${LEVELS.indexOf(L) + 1}_intro`);
}

/* ---------- HUD ---------- */
function buildMonths() {
  const L = G.level, host = $('months');
  host.innerHTML = '';
  for (let m = 0; m < L.months; m++) {
    const d = document.createElement('div'), ev = (L.events || []).filter(e => e.month === m && e.kind !== 'warning');
    d.className = 'm' + (ev.length ? ' event' : ''); d.dataset.m = m; d.setAttribute('role', 'listitem');
    d.innerHTML = `<i>${m + 1}</i><img alt="${WEATHER[L.weather[m]].name}" src="${iconURL(L.weather[m])}">`;
    d.addEventListener('click', () => { const w = WEATHER[L.weather[m]], t = ev.map(eventText).join(' '); toast(`Month ${m + 1}: ${w.name}. ${t}`, ev.length ? 'warn' : ''); });
    host.append(d);
  }
}
const eventText = e => ({ quake: 'A quake comes.', flood: 'The river rises.', eruption: 'The volcano erupts.', wave: 'A wave comes.' }[e.kind] || '');
function buildCards() {
  const L = G.level, host = $('cards');
  host.innerHTML = '';
  for (const type of L.cards) {
    const cat = CATALOG[type], btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'card'; btn.dataset.type = type; btn.setAttribute('role', 'option');
    const c = document.createElement('canvas');
    paintCard(c, type, L.style === 'mix' ? 'joglo' : L.style);
    btn.append(c);
    btn.insertAdjacentHTML('beforeend', `<span class="cost" aria-label="Costs ${cat.cost} labour">${cat.cost}</span><span class="nm">${cat.name}</span>`);
    btn.addEventListener('click', () => selectCard(type));
    host.append(btn);
  }
}
function paintCard(c, type, style) {
  const st = cardArt(type, style), g = c.getContext('2d');
  c.width = Math.max(1, st.w); c.height = Math.max(1, st.h);
  const img = g.createImageData(c.width, c.height);
  new Uint32Array(img.data.buffer).set(st.pix);
  g.putImageData(img, 0, 0);
  const dpr = devicePixelRatio || 1, s = Math.max(1 / dpr, Math.min(2, Math.floor(Math.min(70 / st.w, 54 / st.h) * dpr) / dpr));
  c.style.width = st.w * s + 'px'; c.style.height = st.h * s + 'px';
}
function selectCard(type) {
  G.sel = G.sel === type ? null : type;
  A.sfx('ui_tap');
  document.querySelectorAll('.card').forEach(c => c.setAttribute('aria-selected', c.dataset.type === G.sel));
  const o = scene.overlay;
  o.showGrid = !!G.sel; o.tile = null; o.ghost = null;
  o.isValid = G.sel ? (x, y) => !G.world.canPlace(G.sel, x, y) : null;
  if (G.sel) toast(CATALOG[G.sel].desc);
}
function refresh() {
  const w = G.world, L = G.level;
  if (!L) return;
  $('s-people').querySelector('b').textContent = w.people; $('s-people').querySelector('small').textContent = '/' + w.capacity();
  $('s-rice').querySelector('b').textContent = w.rice; $('s-rice').querySelector('small').textContent = '/' + w.store();
  $('s-labour').querySelector('b').textContent = w.labour;
  $('goal-text').textContent = 'Goal: ' + L.goalText + progressText(w, L);
  document.querySelectorAll('.m').forEach(d => {
    const m = +d.dataset.m;
    d.classList.toggle('now', m === w.month); d.classList.toggle('past', m < w.month);
  });
  const now = document.querySelector('.m.now');
  if (now) now.scrollIntoView({ inline: 'center', block: 'nearest' });
  document.querySelectorAll('.card').forEach(c => c.classList.toggle('poor', CATALOG[c.dataset.type].cost > w.labour));
  $('undo').disabled = !G.placed.length;
  $('forecast').classList.toggle('on', G.fcOn);
  $('next').textContent = `Next month (${w.month + 1}/${L.months})`;
}
function progressText(w, L) {
  const g = L.goal;
  if (g.kind === 'flow') return w.month ? ` Last month: ${w.transit.tripsLast} trips, macet ${Math.round(w.transit.macetLast * 100)}%.` : '';
  if (g.kind === 'freight') return ` Now ${w.transit.freight}/${g.n}.`;
  if (g.kind === 'terraces') return ` Sawah on ${g.levels.length} terraces.`;
  if (g.kind === 'harvest') return w.afterEvent ? ` Now ${w.harvestAfter}/${g.n}.` : '';
  if (g.kind === 'kites') { const up = w.buildings.filter(b => b.type === 'lapangan' && b.kite >= g.height).length; return ` Now ${up}/${g.n}.`; }
  return '';
}
function toast(text, kind = '') {
  const host = $('toasts'), d = document.createElement('div');
  d.className = 'toast ' + kind; d.textContent = text;
  host.append(d);
  while (host.children.length > 4) host.firstChild.remove();
  setTimeout(() => d.remove(), kind === 'log' ? 5200 : 3400);
}
let sayTimer = 0;
function bark(id) {
  if (G.seenBarks.has(id)) return;
  G.seenBarks.add(id);
  A.speak(id, line => {
    $('say-text').textContent = line.en_text; $('say').hidden = false;
    clearTimeout(sayTimer); sayTimer = setTimeout(() => { $('say').hidden = true; }, 4600);
  });
}
// The soundscape follows the town: what stands on the plot, the hour, the weather and the water
function ambience() {
  const w = G.world, L = G.level || {}, running = w.running, W = running ? w.weather : w.weatherNow();
  const live = w.buildings.filter(b => b.done && !b.ruin), count = t => live.filter(b => b.type === t).length;
  const night = scene.grade.night || 0, day = 1 - night, urban = L.urban ? 1 : .35;
  const roads = count('jalan'), markets = count('pasar'), wet = running ? W.rain : 0;
  const building = running ? w.buildings.filter(b => !b.done && !b.ruin).length : 0;
  // sample the water: fast deep flow is a flood you can hear
  let fast = 0;
  if (running) for (let k = 0; k < 160; k++) { const i = (k * 61 + (w.t * 60 | 0) * 7) % w.w.length; if (w.w[i] > .08 && Math.hypot(w.vx[i], w.vy[i]) > 5) fast++; }
  const flying = live.filter(b => b.type === 'lapangan' && b.kite > 2).length;
  A.setAmbience({
    rain: clamp01(wet * 60) * (L.urban ? .5 : 1), rainzinc: clamp01(wet * 70) * (L.urban ? .9 : .25),
    river: L.river ? .5 : (L.springs && L.springs.length) ? .25 : 0, flood: clamp01(fast / 30) * .9,
    sea: w.sea != null ? .55 : 0, wind: .12 + (running ? Math.abs(w.gust) * .25 : 0) + (L.slides ? .06 : 0),
    village: (.35 - urban * .12) * (.4 + day * .6), traffic: L.roads ? clamp01(.08 + roads * .015 + w.people * .004) * urban * (.35 + day * .65) * (wet > .01 ? .6 : 1) : 0,
    jam: w.transit && running ? clamp01((w.transit.macetNow || 0) * 1.3) * clamp01(w.transit.vehicles.length / 10) : 0,
    market: clamp01(markets * .22) * (.05 + day * .95) * (wet > .012 ? .5 : 1), night: night * .75, construction: clamp01(building * .1) * .5 * (.2 + day * .8),
    kite: clamp01(flying * .25), pump_run: live.some(b => b.pumping) && running ? .45 : 0,
  });
}
// single town sounds, placed at random or at the right hour
const lastCall = new Map();
function maybe(id, chance, minGap, gain = .4) {
  const now = performance.now() / 1000;
  if (now - (lastCall.get(id) || -99) < minGap || Math.random() > chance) return;
  lastCall.set(id, now);
  A.sfx(id, { gain, gap: 1 });
}
function townSounds() {
  const w = G.world, L = G.level || {};
  if (!w || G.screen !== 'play' || G.ended) return;
  const live = w.buildings.filter(b => b.done && !b.ruin), has = t => live.some(b => b.type === t);
  const night = scene.grade.night || 0, u = w.running ? w.t / MONTH_SECONDS : .1, day = night < .25;
  if (L.roads && day && has('jalan')) { maybe('moped', .05, 5, .3); maybe('horn', .02, 12, .22); maybe('becak', .012, 18, .22); }
  if (day && live.filter(b => CATALOG[b.type].home).length > 2) maybe('bakso', .012, 25, .25);
  if (w.running && u < .14) maybe('rooster', .12, 30, .26);
  if (w.running && day && u > .2 && u < .4 && (has('sekolah') || has('kampus'))) maybe('schoolbell', .05, 40, .24);
  if (w.running && u > .68 && u < .8) { if (has('masjid') || has('ibadah')) maybe('bedug', .1, 45, .26); if (has('klenteng')) maybe('templegong', .06, 50, .2); }
  if (w.running && day && u > .1 && u < .3 && has('gereja')) maybe('churchbell', .05, 45, .2);
  if (has('dermaga')) maybe('boat', .012, 22, .24);
  if (w.sea != null) maybe('gull', .02, 16, .2);
  if (night > .5) { maybe('tokek', .05, 25, .24); maybe('dog', .02, 25, .16); }
  for (const b of live) if (b.type === 'kincir' && w.running) maybe('creak', .03, 8, .22);
}
const clamp01 = v => Math.max(0, Math.min(1, v));

/* ---------- turns ---------- */
function nextMonth() {
  const w = G.world;
  if (w.running || w.done) return;
  closeForecast();
  selectCardOff();
  A.sfx('ui_tap');
  w.startMonth();
  G.placed = [];
  document.body.classList.add('running');
  $('tray').hidden = true; $('runbar').hidden = false;
  $('run-label').textContent = `Month ${w.month + 1}: ${w.weather.name}.`;
  $('speed').setAttribute('aria-pressed', G.speed > 1);
  const danger = w.eventsNow().some(e => e.kind !== 'warning');
  if (!G.level.music) A.playMood(danger ? 'danger' : 'run');
  ambience();
  refresh();
}
function selectCardOff() {
  G.sel = null; document.querySelectorAll('.card').forEach(c => c.setAttribute('aria-selected', false));
  const o = scene.overlay; o.showGrid = false; o.tile = null; o.ghost = null;
}
function monthEnded(log) {
  const w = G.world;
  document.body.classList.remove('running');
  (log || []).forEach((line, k) => setTimeout(() => toast(line, /destroy|left|drown|lost|failed/.test(line) ? 'bad' : 'log'), k * 180));
  $('runbar').hidden = true;
  if (!G.level.music) A.playMood('plan'); ambience();
  if (w.done) { endLevel(); return; }
  $('tray').hidden = false;
  store.set(SAVE, w.save());
  refresh();
  const nextEv = (G.level.events || []).find(e => e.month === w.month && e.kind !== 'warning');
  if (nextEv) toast(`This month: ${eventText(nextEv)}`, 'warn');
  if (w.harvested && !G.firstHarvest) { G.firstHarvest = true; bark('first_harvest'); }
}
function endLevel() {
  const w = G.world, L = G.level, d = w.done;
  G.ended = true;
  store.del(SAVE);
  $('runbar').hidden = true; $('tray').hidden = true; $('hud').hidden = true;
  if (d.won) {
    const prog = store.get(PROGRESS) || {};
    prog[L.id] = Math.max(prog[L.id] || 0, d.stars); store.set(PROGRESS, prog);
    G.dissolveTo = 1; scene.setInsets(40, 40);
    if (!L.music) { A.stopMood(); A.playCue('win'); } A.sfx('cheer');
    bark(`l${LEVELS.indexOf(L) + 1}_win`);
    setTimeout(() => showResult(true), 3200);
  } else { A.stopMood(); bark('level_lost'); setTimeout(() => showResult(false), 900); }
}
function showResult(won) {
  const w = G.world, L = G.level, k = LEVELS.indexOf(L), next = LEVELS[k + 1];
  const s = won ? w.done.stars : 0;
  sheet.classList.toggle('low', won);
  openSheet(`<h2>${won ? 'You met the goal.' : 'You did not meet the goal.'}</h2><p class="place">${L.title}. Month ${w.month} of ${L.months}.</p>
    ${won ? `<p class="big" aria-label="${s} stars">${'★'.repeat(s)}${'☆'.repeat(3 - s)}</p>` : `<p>${failReason(w, L)}</p>`}
    <div class="stats"><div><b>${w.people}</b>People</div><div><b>${w.rice}</b>Rice</div><div><b>${w.destroyed}</b>Lost</div></div>
    ${goalHtml(L, w)}
    <div class="row"><button id="again" type="button">Play again</button>${won && next ? '<button id="next-l" class="primary" type="button">Next plot</button>' : '<button id="to-map" class="primary" type="button">Map</button>'}</div>`, sh => {
    sh.querySelector('#again').addEventListener('click', () => { A.sfx('ui_tap'); closeSheet(); startLevel(L); });
    const n = sh.querySelector('#next-l'); if (n) n.addEventListener('click', () => { A.sfx('ui_tap'); closeSheet(); introLevel(next); });
    const m = sh.querySelector('#to-map'); if (m) m.addEventListener('click', () => { A.sfx('ui_tap'); closeSheet(); showMap(); });
  });
}
function failReason(w, L) {
  const g = L.goal;
  if (g.kind === 'evac') return `${w.evacSafe || 0} of ${w.evacTotal || 0} people reached high ground. The goal needs all of them and at least ${g.min}.`;
  if (g.kind === 'hall' && !w.buildings.some(b => b.type === 'balai' && b.done && !b.ruin)) return 'No balai stands.';
  if (g.kind === 'salatiga') return w.buildings.some(b => b.type === 'prasasti' && !b.ruin) ? `You have ${w.people} people. The goal needs ${g.n}, and all three houses of faith.` : 'The Plumpungan stone fell.';
  if (g.kind === 'people' || g.kind === 'hall' || g.kind === 'noSlide' || g.kind === 'holdAfter') return `You have ${w.people} people. The goal needs ${g.n}.`;
  return 'You ran out of months.';
}

/* ---------- input ---------- */
const P = { active: false, id: 0, x0: 0, y0: 0, moved: false, t0: 0 };
function tileAt(x, y) { return scene.screenToTile(x, y); }
canvas.addEventListener('pointerdown', e => {
  A.unlockAudio();
  if (G.screen !== 'play' || G.world.running) return;
  P.active = true; P.id = e.pointerId; P.x0 = e.clientX; P.y0 = e.clientY; P.moved = false; P.t0 = performance.now();
  canvas.setPointerCapture(e.pointerId);
  if (G.sel) showGhost(e.clientX, e.clientY, 0);
});
canvas.addEventListener('pointermove', e => {
  if (!P.active || e.pointerId !== P.id) return;
  if (Math.hypot(e.clientX - P.x0, e.clientY - P.y0) > 9) P.moved = true;
  if (G.sel) showGhost(e.clientX, e.clientY, P.moved ? 54 : 0);
});
canvas.addEventListener('pointerup', e => {
  if (!P.active || e.pointerId !== P.id) return;
  P.active = false;
  const lift = P.moved ? 54 : 0, tile = tileAt(e.clientX, e.clientY - lift);
  const o = scene.overlay;
  if (G.sel) {
    o.tile = null; o.ghost = null; o.chips = null;
    if (tile) tryPlace(G.sel, tile[0], tile[1]);
  } else if (tile && !P.moved) {
    const b = G.world.buildingAt(tile[0], tile[1]);
    if (b) showInfo(b); else tileInfo(tile[0], tile[1]);
  }
});
canvas.addEventListener('pointercancel', () => { P.active = false; const o = scene.overlay; o.tile = null; o.ghost = null; o.chips = null; });
function showGhost(cx, cy, lift) {
  const w = G.world, t = tileAt(cx, cy - lift), o = scene.overlay;
  if (!t) { o.tile = null; o.ghost = null; o.chips = null; return; }
  const type = G.sel, cat = CATALOG[type], err = w.canPlace(type, t[0], t[1]);
  o.tile = t; o.foot = cat.foot || 1; o.valid = !err && cat.cost <= w.labour;
  o.ghost = err ? null : { type, x: t[0], y: t[1] };
  const p = w.preview(type, t[0], t[1]), n = p.reduce((s, a) => s + (a[0] === 'people' ? a[1] : 0), 0);
  o.chips = null;
}
function tryPlace(type, x, y) {
  const w = G.world, cat = CATALOG[type], err = w.canPlace(type, x, y);
  if (err) { toast(err, 'bad'); A.sfx('ui_bad'); return; }
  if (cat.cost > w.labour) { toast(`This needs ${cat.cost} labour. You have ${w.labour}.`, 'bad'); A.sfx('ui_bad'); return; }
  const b = w.place(type, x, y);
  if (!b) return;
  G.placed.push(b);
  A.sfx('ui_place');
  const p = w.preview(type, x, y).filter(a => a[0] === 'labour' && a[1] > 0).reduce((s, a) => s + a[1], 0);
  if (!G.firstBuild) { G.firstBuild = true; bark('first_build'); }
  closeForecast();
  refresh();
  if (w.labour < cat.cost) selectCardOff();
}
function undo() {
  const b = G.placed.pop();
  if (!b) return;
  G.world.remove(b, true);
  A.sfx('ui_tap');
  closeForecast();
  refresh();
}
function showInfo(b) {
  const w = G.world, cat = CATALOG[b.type];
  const lines = [cat.desc];
  if (b.ruin) lines.unshift('This is rubble. It blocks the tile.');
  else if (!b.done) lines.push(`The crew finishes this in ${b.monthsLeft} month${b.monthsLeft > 1 ? 's' : ''}.`);
  else if (cat.crop) {
    const d = w.avgDepth(b.x, b.y);
    lines.push(`Growth: ${b.growth} of 3 months.`, d < .01 ? 'The water is too low.' : d > .24 ? 'The water is too high.' : 'The water depth is good.');
    if (b.fertile) lines.push('Ash made this soil rich. The next harvest gives 4 more rice.');
  } else if (w.level.roads && cat.road && !w.linked(b, w.computeRoads())) {
    lines.push('No road reaches this building. It does not work.');
  } else if (b.type === 'stasiun') {
    lines.push('Trains stop here. People within 3 tiles ride.');
  } else if (cat.market) {
    lines.push('Rice each month: 4. Water on the road stops the trucks.');
  } else if (cat.home) {
    lines.push(`People: ${b.residents}.`);
    if (b.soaked) lines.push('Water soaked this home. It holds no people this month.');
  } else if (b.type === 'lapangan') lines.push(`Kite height: ${b.kite.toFixed(1)}. Wind here: ${(w.tileWind(b.x, b.y) * 100 | 0)}%.`);
  else if (b.type === 'kincir') lines.push(b.lift ? 'The wheel lifts water to the higher tile.' : 'No higher tile is next to the wheel.');
  const label = b.ruin ? 'Clear rubble (1 labour)' : G.placed.includes(b) ? 'Undo' : 'Remove';
  const canAct = !w.running;
  openSheet(`<h2>${cat.name}</h2><p class="place">Tile ${b.x + 1}, ${b.y + 1}. Height ${w.tileHeight(b.x, b.y)}.</p>${lines.map(l => `<p>${l}</p>`).join('')}
    <div class="row"><button id="close" type="button">Close</button>${canAct ? `<button id="act" type="button">${label}</button>` : ''}</div>`, s => {
    s.querySelector('#close').addEventListener('click', () => { A.sfx('ui_tap'); closeSheet(); });
    const act = s.querySelector('#act');
    if (act) act.addEventListener('click', () => {
      closeSheet();
      if (b.ruin) { if (!w.clearRubble(b)) toast('This needs 1 labour.', 'bad'); } else if (G.placed.includes(b)) { G.placed = G.placed.filter(o => o !== b); w.remove(b, true); } else w.remove(b);
      A.sfx('dig'); refresh();
    });
  });
}
function tileInfo(x, y) {
  const w = G.world, soil = [, 'Soil', 'Sand', 'Rock', 'Rich soil'][w.soil[y * w.N + x]] || 'Soil', wet = w.avgDepth(x, y);
  const moist = w.moist[y * w.N + x];
  toast(`This tile is ${soil.toLowerCase()}. Its height is ${w.tileHeight(x, y)}.${wet > .02 ? ' Water is on this tile.' : ''}${w.level.slides && moist > .7 ? ' The soil is nearly full of water.' : ''}`);
}
function runForecast() {
  const w = G.world;
  if (w.running) return;
  if (G.fcOn) { closeForecast(); refresh(); return; }
  A.sfx('ui_tap');
  if (!G.fcWorker) {
    G.fcWorker = new Worker('js/sim/forecast-worker.js', { type: 'module' });
    G.fcWorker.onmessage = e => {
      if (e.data.stamp !== G.fcStamp || !G.fcOn) return;
      scene.overlay.forecast = e.data;
      const a = e.data.alerts, lost = a.filter(x => x.kind === 'lost').length, dry = a.filter(x => x.kind === 'dry').length;
      toast(lost ? `${lost} building${lost > 1 ? 's' : ''} may fall this month.` : dry ? `${dry} sawah may dry out this month.` : 'The blue tiles show where water goes this month.', lost ? 'bad' : '');
      $('forecast').textContent = 'Forecast';
    };
  }
  G.fcOn = true; G.fcStamp++;
  $('forecast').textContent = 'Wait';
  const snap = w.snapshot(); snap.stamp = G.fcStamp;
  G.fcWorker.postMessage(snap);
  refresh();
}
function closeForecast() { G.fcOn = false; scene.overlay.forecast = null; G.fcStamp++; $('forecast').textContent = 'Forecast'; }

// The Start button runs one Turnstile check. The dev server has no /api, so the game starts at once there
async function gate() {
  let cfg;
  try { const r = await fetch('/api/config'); if (!r.ok) return true; cfg = await r.json(); } catch { return true; }
  const seen = await fetch('/api/session').then(r => r.json()).catch(() => ({ ok: false }));
  if (seen.ok) return true;
  await new Promise((res, rej) => {
    if (window.turnstile) { res(); return; }
    const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.onload = res; s.onerror = rej; document.head.append(s);
  });
  const token = await new Promise((res, rej) => {
    window.turnstile.render('#ts', { sitekey: cfg.siteKey, action: cfg.action, appearance: 'interaction-only', callback: res, 'error-callback': () => rej(new Error('turnstile')), 'expired-callback': () => rej(new Error('expired')) });
  });
  const r = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  return r.ok;
}
let starting = false;
$('start').addEventListener('click', async () => {
  if (starting) return;
  starting = true;
  A.unlockAudio(); A.sfx('ui_tap');
  const btn = $('start'), label = btn.textContent;
  btn.textContent = 'Wait'; btn.disabled = true;
  let ok = false;
  try { ok = await gate(); } catch { ok = false; }
  starting = false; btn.disabled = false; btn.textContent = label;
  if (!ok) { $('title-sub').textContent = 'The security check failed. Tap to try again.'; try { window.turnstile && window.turnstile.remove('#ts'); } catch { /* no widget */ } return; }
  A.refreshAudio(); A.playTheme(); showMap();
});
$('next').addEventListener('click', nextMonth);
$('undo').addEventListener('click', undo);
$('forecast').addEventListener('click', runForecast);
$('speed').addEventListener('click', () => { G.speed = G.speed > 1 ? 1 : 3; $('speed').setAttribute('aria-pressed', G.speed > 1); $('speed').textContent = G.speed > 1 ? 'Fast x3' : 'Fast'; A.sfx('ui_tap'); });
$('goal').addEventListener('click', () => {
  A.sfx('ui_tap');
  openSheet(`<h2>${G.level.title}</h2><p class="place">${G.level.place}</p><p>${G.level.brief}</p>${goalHtml(G.level)}<div class="row"><button id="close" class="primary" type="button">Close</button></div>`, s => s.querySelector('#close').addEventListener('click', closeSheet));
});
$('menu').addEventListener('click', () => {
  A.sfx('ui_tap');
  openSheet(`<h2>Menu</h2><p class="place">${G.level ? G.level.title : ''}</p>
    <div class="row"><button id="close" type="button">Close</button></div><div class="row"><button id="restart" type="button">Start this plot again</button></div><div class="row"><button id="to-map" type="button">Map</button></div>`, s => {
    s.querySelector('#close').addEventListener('click', closeSheet);
    s.querySelector('#restart').addEventListener('click', () => { closeSheet(); store.del(SAVE); startLevel(G.level); });
    s.querySelector('#to-map').addEventListener('click', () => { closeSheet(); A.stopMood(); showMap(); });
  });
});
const muteBtn = $('mute');
function applyMute(v) { A.setMuted(v); store.set(MUTE, v); muteBtn.querySelector('img').src = iconURL(v ? 'soundoff' : 'sound'); muteBtn.setAttribute('aria-pressed', v); }
muteBtn.addEventListener('click', () => applyMute(!A.isMuted()));
const explain = (id, text) => $(id).addEventListener('click', () => toast(text));
explain('s-people', 'Homes hold people. People give labour.');
explain('s-rice', 'Every 4 people eat 1 rice each month. People come only if the store holds rice for 2 months.');
explain('s-labour', 'Labour pays for cards. It refills each month. It does not carry over.');
for (const kind of ['pointerdown', 'keydown']) addEventListener(kind, () => A.unlockAudio(), { capture: true, passive: true });

scene.sfx = id => A.sfx(id, { gain: /hammer|saw|lash|brick|tile|dig|thud/.test(id) ? .32 : .6, gap: /hammer|saw|lash|brick|tile|dig|thud/.test(id) ? .16 : .3 });
scene.cue = (kind, data) => {
  if (kind === 'monthEnd') { monthEnded(data); return; }
  const say = { quake: 'The ground shakes.', eruption: 'The volcano erupts.', flood: 'The river rises.', wave: 'The wave is coming.', hungry: 'The town is hungry.' }[kind];
  if (say) { toast(say, 'warn'); $('run-label').textContent = say; }
  if (kind === 'warning:quake') bark('quake_warning');
  if (kind === 'warning:ash') bark('ash_warning');
  if (kind === 'warning:wave') bark('wave_warning');
  if (kind === 'flood') bark('flood_warning');
  if (kind === 'hungry') bark('hungry');
  if (kind === 'stall') toast('The train cannot climb this tile.', 'warn');
};

/* ---------- the loop ---------- */
let last = performance.now(), acc = 0, stepAcc = 0, soundClock = 0;
const FRAME = 1 / 30;
function loop(now) {
  requestAnimationFrame(loop);
  if (document.hidden || G.paused) { last = now; return; }
  let dt = (now - last) / 1000; last = now;
  if (dt > .25) dt = .25;
  acc += dt;
  if (acc < FRAME - .002) return;
  const fdt = Math.min(acc, .1); acc = 0;
  tick(fdt);
}
function tick(dt) {
  const w = G.world;
  if (!w) return;
  if (!scene.frame.W) { scene.layout(true); if (!scene.frame.W) return; }
  const k = dt / (1 / 60);
  stepAcc += w.running ? k * G.speed : k;
  while (stepAcc >= 1) {
    stepAcc -= 1;
    if (w.running) w.step();
    scene.stepPhysics();
  }
  if (scene.dissolve !== G.dissolveTo) {
    const d = dt / 1.5;
    scene.dissolve = G.dissolveTo > scene.dissolve ? Math.min(G.dissolveTo, scene.dissolve + d) : Math.max(G.dissolveTo, scene.dissolve - d);
  }
  scene.render(dt);
  if (w.transit && w.running && G.level.goal.kind === 'flow' && !G.alertLabel) $('run-label').textContent = `Month ${w.month + 1}. Trips ${w.transit.trips}. Macet ${Math.round((w.transit.macetNow || 0) * 100)}%.`;
  if (w.transit && w.running && (w.transit.macetNow || 0) > .6 && w.transit.vehicles.length > 8) bark('train_late');
  soundClock += dt;
  if (soundClock > .7) { soundClock = 0; if (G.screen === 'play') { ambience(); townSounds(); } }
}
addEventListener('resize', () => {
  if (!G.world) return;
  if (G.screen === 'play' && !G.ended) scene.setInsets($('hud').offsetHeight, $('tray').offsetHeight);
  scene.layout();
  if (G.screen === 'title') drawWordmark($('wordmark'), scaleForWordmark());
});
G.step = (seconds = 1, draw = true) => { // test hook: drives the game without the frame loop
  for (let s = 0; s < seconds * 60; s++) { if (G.world.running) G.world.step(); scene.stepPhysics(); }
  if (draw) scene.render(seconds);
};
G.tryPlace = tryPlace; G.nextMonth = nextMonth; G.startLevel = (id) => { closeSheet(); store.del(SAVE); startLevel(levelById(id)); }; G.LEVELS = LEVELS;

bindIcons();
$('say-face').src = iconURL('face');
applyMute(!!store.get(MUTE));
const params = new URLSearchParams(location.search);
if (params.has('level')) { showTitle(); G.startLevel(params.get('level')); } else showTitle();
// ?still shows the picture alone, for the share card and the icons
if (params.has('still')) { document.getElementById('title').hidden = params.get('still') !== 'card'; document.getElementById('start').hidden = true; document.getElementById('title-sub').hidden = params.get('still') !== 'card'; }
requestAnimationFrame(loop);
// test hook: shows a crop of the game canvas, enlarged, over everything
G.crop = (x, y, w, h, s = 3) => {
  let c = document.getElementById('crop');
  if (!c) { c = document.createElement('canvas'); c.id = 'crop'; c.style.cssText = 'position:fixed;left:0;top:0;z-index:99;image-rendering:pixelated'; document.body.append(c); }
  if (w === 0) { c.remove(); return; }
  c.width = w; c.height = h; c.style.width = w * s + 'px'; c.style.height = h * s + 'px';
  c.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
};
