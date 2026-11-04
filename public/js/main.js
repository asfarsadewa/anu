// The game: screens, turns and input. The simulation and the drawing live elsewhere.
import { World, DT, MONTH_SECONDS, STEP } from './sim/world.js';
import { CATALOG, WEATHER } from './sim/catalog.js';
import { LEVELS, levelById } from './sim/levels.js';
import { Scene } from './gfx/scene.js';
import { cardArt } from './gfx/buildings.js';
import { iconURL, bindIcons, drawWordmark } from './ui/icons.js';
import { drawMap } from './ui/map.js';
import * as A from './audio.js';
import { t, getLang, setLang, initialLang, subtitle } from './i18n.js';

const $ = id => document.getElementById(id);
const canvas = $('c'), scene = new Scene(canvas);
const SAVE = 'anu.save', PROGRESS = 'anu.progress', MUTE = 'anu.mute', LOOK = 'anu.look';
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }, del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } } };

const G = { screen: 'title', world: null, level: null, sel: null, speed: 1, placed: [], fcWorker: null, fcStamp: 0, fcOn: false, drag: null, seenBarks: new Set(), dissolveTo: 1, ended: false };
window.__game = G; G.scene = scene; G.audio = A;

// One plot's copy, in the current language
const lc = (L, field) => t(`levels.${L.id}.${field}`);
const weatherName = W => t('weather.' + (W.id || W));
const cardDesc = type => t('cards.' + type);
const cardName = type => t('names.' + type);
// A log entry can name a building by its type
const logLine = (key, params = {}) => t(key, params.type ? { ...params, name: cardName(params.type).toLowerCase() } : params);
// Static text in the page carries its key in a data attribute
function applyCopy() {
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('[data-t-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.tAria)));
  document.querySelectorAll('[data-t-alt]').forEach(el => { el.alt = t(el.dataset.tAlt); });
  document.querySelectorAll('#lang button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === getLang()));
  document.querySelectorAll('#look button').forEach(b => b.setAttribute('aria-pressed', (b.dataset.look === 'smooth') === !!scene.frame.smooth));
}

// Pixels or smooth. Only the player's own choice is saved
function applyLook(smooth, remember) {
  scene.frame.setSmooth(smooth); document.body.classList.toggle('smooth', smooth);
  if (remember) store.set(LOOK, smooth);
  applyCopy();
}

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
  scene.setInsets(180, 192);
  scene.setWorld(w);
  scene.dissolve = 1; G.dissolveTo = 1;
  drawWordmark($('wordmark'), scaleForWordmark());
}
const scaleForWordmark = () => Math.max(2, Math.min(5, Math.floor(Math.min(innerWidth, 520) / 90)));

/* ---------- the share card ---------- */
// node tools/card.mjs renders this page to public/og.png. It is a real Salatiga, drawn by the engine
function showCard() {
  document.body.classList.add('sharecard');
  $('start').hidden = true;
  const L = levelById('salatiga'), w = new World({ ...L, mist: false, prewet: 14 });
  const town = [['jalan', 5, 0], ['jalan', 4, 5], ['jalan', 4, 6], ['jalan', 4, 7], ['jalan', 5, 4], ['jalan', 6, 4], ['jalan', 7, 4], ['kampus', 6, 0], ['rusun', 4, 0], ['pasar', 2, 0], ['ruko', 3, 0], ['rumah', 1, 0], ['ruko', 0, 2], ['ruko', 0, 3], ['rumah', 0, 1], ['pasar', 5, 1], ['klenteng', 5, 2], ['masjid', 5, 3], ['gereja', 6, 3], ['ruko', 7, 3], ['ruko', 7, 2], ['rumah', 6, 2], ['ruko', 1, 5], ['sekolah', 0, 5], ['rumah', 5, 5], ['rumah', 6, 5], ['ruko', 7, 5], ['ruko', 3, 6], ['taman', 2, 6], ['rumah', 5, 6], ['bambu', 6, 6], ['rumah', 3, 7], ['taman', 5, 7], ['rumah', 1, 6], ['bambu', 0, 7]];
  for (const [type, x, y] of town) if (!w.buildingAt(x, y)) w.place(type, x, y, { instant: true, free: true, style: L.style });
  w.people = 110; w.assignResidents(); w.refreshPhysicsFields(); w.weather = WEATHER.cerah;
  G.world = w; G.level = L; G.screen = 'card';
  scene.shiftX = .19;
  scene.setInsets(0, 0);
  scene.setWorld(w);
  scene.dissolve = 0; G.dissolveTo = 0;
  drawWordmark($('wordmark'), 4);
}

/* ---------- the map ---------- */
function showMap() {
  G.screen = 'map';
  silence();
  A.playTheme();
  $('title').hidden = true; $('hud').hidden = true; $('tray').hidden = true; $('runbar').hidden = true;
  $('map').hidden = false;
  document.body.classList.remove('running');
  const prog = store.get(PROGRESS) || {}, list = $('levels'), save = store.get(SAVE);
  list.innerHTML = '';
  let open = true;
  LEVELS.forEach((L, k) => {
    if (k === 0 || L.part !== LEVELS[k - 1].part) { const h = document.createElement('li'); h.className = 'part'; h.textContent = t(L.part === 2 ? 'ui.part2' : 'ui.part1'); list.append(h); }
    const stars = prog[L.id] || 0, li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.disabled = !open;
    const cont = save && save.id === L.id ? t('ui.saved') : '';
    b.innerHTML = `<span class="n">${k + 1}</span><span class="t">${lc(L, 'title')}</span><span class="p">${cont}${t('ui.plotLine', { place: lc(L, 'place'), n: L.N })}</span><span class="s" aria-label="${t('ui.aStars', { n: stars })}">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
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
  return `<ul><li><b>${lc(L, 'goal')}</b></li>${(L.pledges || []).map(p => `<li class="star${met(p)}">${t('pledge.' + p.kind, p)}</li>`).join('')}</ul>`;
}
function introLevel(L) {
  const save = store.get(SAVE), resume = save && save.id === L.id;
  openSheet(`<h2>${lc(L, 'title')}</h2><p class="place">${t('ui.introLine', { place: lc(L, 'place'), months: L.months })}</p><p>${lc(L, 'brief')}</p>${goalHtml(L)}
    <div class="row">${resume ? `<button id="restart" type="button">${t('ui.startAgain')}</button><button id="go" class="primary" type="button">${t('ui.continue')}</button>` : `<button id="back" type="button">${t('ui.map')}</button><button id="go" class="primary" type="button">${t('ui.begin')}</button>`}</div>`, s => {
    s.querySelector('#go').addEventListener('click', () => { A.sfx('ui_tap'); closeSheet(); startLevel(L, resume ? save : null); });
    const r = s.querySelector('#restart'); if (r) r.addEventListener('click', () => { A.sfx('ui_tap'); store.del(SAVE); closeSheet(); startLevel(L); });
    const b = s.querySelector('#back'); if (b) b.addEventListener('click', () => { A.sfx('ui_tap'); closeSheet(); showMap(); });
  });
}
function startLevel(L, save) {
  G.screen = 'play'; G.level = L; G.placed = []; G.ended = false; G.speed = 1; G.fcOn = false; G.seenBarks.clear();
  selectCardOff(); P.active = false; silence();
  const w = new World(L);
  if (save) w.load(save);
  G.world = w;
  $('title').hidden = true; $('map').hidden = true; $('hud').hidden = false; $('tray').hidden = false; $('runbar').hidden = true;
  buildMonths(); buildCards(); refresh();
  scene.setInsets($('hud').offsetHeight, $('tray').offsetHeight);
  scene.setWorld(w);
  scene.dissolve = 1; G.dissolveTo = 0;
  A.prepareLevel(L); A.stopTheme(); A.stopMood(); if (L.music) A.playTrack(L.music); else A.playMood('plan'); ambience();
  bark(`l${LEVELS.indexOf(L) + 1}_intro`);
}

/* ---------- HUD ---------- */
function buildMonths() {
  const L = G.level, host = $('months');
  host.innerHTML = '';
  for (let m = 0; m < L.months; m++) {
    const d = document.createElement('div'), ev = (L.events || []).filter(e => e.month === m && e.kind !== 'warning');
    d.className = 'm' + (ev.length ? ' event' : ''); d.dataset.m = m; d.setAttribute('role', 'listitem');
    d.innerHTML = `<i>${m + 1}</i><img alt="${weatherName(L.weather[m])}" src="${iconURL(L.weather[m])}">`;
    d.addEventListener('click', () => { const e = ev.map(eventText).join(' '), w = weatherName(L.weather[m]); toast(e ? t('ui.monthEvent', { m: m + 1, w, e }) : t('ui.monthLine', { m: m + 1, w }), ev.length ? 'warn' : ''); });
    host.append(d);
  }
}
const eventText = e => (['quake', 'flood', 'eruption', 'wave'].includes(e.kind) ? t('event.' + e.kind) : '');
function buildCards() {
  const L = G.level, host = $('cards');
  host.innerHTML = '';
  for (const type of L.cards) {
    const cat = CATALOG[type], btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'card'; btn.dataset.type = type; btn.setAttribute('role', 'option');
    const c = document.createElement('canvas');
    paintCard(c, type, L.style === 'mix' ? 'joglo' : L.style);
    btn.append(c);
    btn.insertAdjacentHTML('beforeend', `<span class="cost" aria-label="${t('ui.aCost', { n: cat.cost })}">${cat.cost}</span><span class="nm">${cardName(type)}</span>`);
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
  if (G.sel) toast(cardDesc(G.sel));
}
function refresh() {
  const w = G.world, L = G.level;
  if (!L) return;
  $('s-people').querySelector('b').textContent = w.people; $('s-people').querySelector('small').textContent = '/' + w.capacity();
  $('s-rice').querySelector('b').textContent = w.rice; $('s-rice').querySelector('small').textContent = '/' + w.store();
  $('s-labour').querySelector('b').textContent = w.labour;
  $('goal-text').textContent = t('ui.goal') + lc(L, 'goal') + progressText(w, L);
  document.querySelectorAll('.m').forEach(d => {
    const m = +d.dataset.m;
    d.classList.toggle('now', m === w.month); d.classList.toggle('past', m < w.month);
  });
  const now = document.querySelector('.m.now');
  if (now) now.scrollIntoView({ inline: 'center', block: 'nearest' });
  document.querySelectorAll('.card').forEach(c => c.classList.toggle('poor', CATALOG[c.dataset.type].cost > w.labour));
  $('undo').disabled = !G.placed.length;
  $('forecast').classList.toggle('on', G.fcOn);
  $('next').textContent = t('ui.nextMonth', { m: w.month + 1, n: L.months });
}
function progressText(w, L) {
  const g = L.goal;
  if (g.kind === 'flow') return w.month ? t('ui.progressFlow', { t: w.transit.tripsLast, p: Math.round(w.transit.macetLast * 100) }) : '';
  if (g.kind === 'freight') return t('ui.progressNow', { a: w.transit.freight, b: g.n });
  if (g.kind === 'terraces') return t('ui.progressTerraces', { n: g.levels.length });
  if (g.kind === 'harvest') return w.afterEvent ? t('ui.progressNow', { a: w.harvestAfter, b: g.n }) : '';
  if (g.kind === 'kites') { const up = w.buildings.filter(b => b.type === 'lapangan' && b.kite >= g.height).length; return t('ui.progressNow', { a: up, b: g.n }); }
  return '';
}
function toast(text, kind = '') {
  const host = $('toasts'), d = document.createElement('div');
  d.className = 'toast ' + kind; d.textContent = text;
  host.append(d);
  while (host.children.length > 4) host.firstChild.remove();
  setTimeout(() => d.remove(), kind === 'log' ? 5200 : 3400);
}
let sayTimer = 0, sayLine = 0;
const URGENT_LINE = /_warning$|_win$|^level_lost$/; // danger and the end of a plot do not wait their turn
function silence() { sayLine++; A.cancelVoice(); clearTimeout(sayTimer); $('say').hidden = true; }
function bark(id) {
  if (G.seenBarks.has(id)) return;
  G.seenBarks.add(id);
  A.speak(id, (line, ended) => {
    $('say-text').textContent = subtitle(line); $('say').style.top = $('hud').offsetHeight + 'px'; $('say').hidden = false;
    clearTimeout(sayTimer);
    // the subtitle stays until the line has really ended, so it survives a hidden tab. A short line still gets time to read
    const mine = ++sayLine, shown = performance.now();
    ended.then(() => { if (mine === sayLine) sayTimer = setTimeout(() => { $('say').hidden = true; }, Math.max(400, 2600 - (performance.now() - shown))); });
  }, { urgent: URGENT_LINE.test(id) });
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
  $('run-label').textContent = t('ui.monthLine', { m: w.month + 1, w: weatherName(w.weather) });
  $('speed').setAttribute('aria-pressed', G.speed > 1);
  const danger = w.eventsNow().some(e => e.kind !== 'warning');
  if (!G.level.music) A.playMood(danger ? 'danger' : 'run');
  ambience();
  refresh();
}
function selectCardOff() {
  G.sel = null; document.querySelectorAll('.card').forEach(c => c.setAttribute('aria-selected', false));
  const o = scene.overlay; o.showGrid = false; o.tile = null; o.ghost = null; o.chips = null; o.isValid = null;
}
function monthEnded(log) {
  const w = G.world;
  document.body.classList.remove('running');
  (log || []).forEach(([key, params], k) => setTimeout(() => toast(logLine(key, params), /destroyed|Left|drowned|Lost|Failed/.test(key) ? 'bad' : 'log'), k * 180));
  $('runbar').hidden = true;
  if (!G.level.music) A.playMood('plan'); ambience();
  if (w.done) { endLevel(); return; }
  $('tray').hidden = false;
  store.set(SAVE, w.save());
  refresh();
  const nextEv = (G.level.events || []).find(e => e.month === w.month && e.kind !== 'warning');
  if (nextEv) toast(t('ui.thisMonth', { e: eventText(nextEv) }), 'warn');
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
    setTimeout(() => { if (G.world === w) showResult(true); }, 3200);
  } else { A.stopMood(); bark('level_lost'); setTimeout(() => { if (G.world === w) showResult(false); }, 900); }
}
function showResult(won) {
  const w = G.world, L = G.level, k = LEVELS.indexOf(L), next = LEVELS[k + 1];
  const s = won ? w.done.stars : 0;
  sheet.classList.toggle('low', won);
  openSheet(`<h2>${t(won ? 'ui.won' : 'ui.lost')}</h2><p class="place">${t('ui.resultLine', { title: lc(L, 'title'), m: w.month, n: L.months })}</p>
    ${won ? `<p class="big" aria-label="${t('ui.aStars', { n: s })}">${'★'.repeat(s)}${'☆'.repeat(3 - s)}</p>` : `<p>${failReason(w, L)}</p>`}
    <div class="stats"><div><b>${w.people}</b>${t('ui.statPeople')}</div><div><b>${w.rice}</b>${t('ui.statRice')}</div><div><b>${w.destroyed}</b>${t('ui.statLost')}</div></div>
    ${goalHtml(L, w)}
    <div class="row"><button id="again" type="button">${t('ui.playAgain')}</button>${won && next ? `<button id="next-l" class="primary" type="button">${t('ui.nextPlot')}</button>` : `<button id="to-map" class="primary" type="button">${t('ui.map')}</button>`}</div>`, sh => {
    sh.querySelector('#again').addEventListener('click', () => { A.sfx('ui_tap'); closeSheet(); startLevel(L); });
    const n = sh.querySelector('#next-l'); if (n) n.addEventListener('click', () => { A.sfx('ui_tap'); closeSheet(); introLevel(next); });
    const m = sh.querySelector('#to-map'); if (m) m.addEventListener('click', () => { A.sfx('ui_tap'); closeSheet(); showMap(); });
  });
}
function failReason(w, L) {
  const g = L.goal;
  if (g.kind === 'evac') return t('fail.evac', { a: w.evacSafe || 0, b: w.evacTotal || 0, min: g.min });
  if (g.kind === 'hall' && !w.buildings.some(b => b.type === 'balai' && b.done && !b.ruin)) return t('fail.noHall');
  if (g.kind === 'salatiga') return w.buildings.some(b => b.type === 'prasasti' && !b.ruin) ? t('fail.faiths', { n: w.people, g: g.n }) : t('fail.stone');
  if (g.kind === 'people' || g.kind === 'hall' || g.kind === 'noSlide' || g.kind === 'holdAfter') return t('fail.people', { n: w.people, g: g.n });
  return t('fail.time');
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
  if (err) { toast(t(err), 'bad'); A.sfx('ui_bad'); return; }
  if (cat.cost > w.labour) { toast(t('ui.needLabour', { c: cat.cost, l: w.labour }), 'bad'); A.sfx('ui_bad'); return; }
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
  const lines = [cardDesc(b.type)];
  if (b.ruin) lines.unshift(t('info.rubble'));
  else if (!b.done) lines.push(t('info.crew', { n: b.monthsLeft }));
  else if (cat.crop) {
    const d = w.avgDepth(b.x, b.y);
    lines.push(t('info.growth', { n: b.growth }), t(d < .01 ? 'info.waterLow' : d > .24 ? 'info.waterHigh' : 'info.waterGood'));
    if (b.fertile) lines.push(t('info.fertile'));
  } else if (w.level.roads && cat.road && !w.linked(b, w.computeRoads())) {
    lines.push(t('info.noRoad'));
  } else if (b.type === 'stasiun') {
    lines.push(t('info.station'));
  } else if (cat.market) {
    lines.push(t('info.market'));
  } else if (cat.home) {
    lines.push(t('info.residents', { n: b.residents }));
    if (b.soaked) lines.push(t('info.soaked'));
  } else if (b.type === 'lapangan') lines.push(t('info.kite', { h: b.kite.toFixed(1), w: w.tileWind(b.x, b.y) * 100 | 0 }));
  else if (b.type === 'kincir') lines.push(t(b.lift ? 'info.wheelLifts' : 'info.wheelIdle'));
  const label = t(b.ruin ? 'info.clearRubble' : G.placed.includes(b) ? 'ui.undo' : 'info.remove');
  const canAct = !w.running;
  openSheet(`<h2>${cardName(b.type)}</h2><p class="place">${t('info.tileLine', { x: b.x + 1, y: b.y + 1, h: w.tileHeight(b.x, b.y) })}</p>${lines.map(l => `<p>${l}</p>`).join('')}
    <div class="row"><button id="close" type="button">${t('ui.close')}</button>${canAct ? `<button id="act" type="button">${label}</button>` : ''}</div>`, s => {
    s.querySelector('#close').addEventListener('click', () => { A.sfx('ui_tap'); closeSheet(); });
    const act = s.querySelector('#act');
    if (act) act.addEventListener('click', () => {
      closeSheet();
      if (b.ruin) { if (!w.clearRubble(b)) toast(t('ui.needOneLabour'), 'bad'); } else if (G.placed.includes(b)) { G.placed = G.placed.filter(o => o !== b); w.remove(b, true); } else w.remove(b);
      A.sfx('dig'); refresh();
    });
  });
}
function tileInfo(x, y) {
  const w = G.world, soil = t('soil.' + ([, 'soil', 'sand', 'rock', 'rich'][w.soil[y * w.N + x]] || 'soil')), wet = w.avgDepth(x, y);
  const moist = w.moist[y * w.N + x];
  toast(t('info.tile', { soil, h: w.tileHeight(x, y) }) + (wet > .02 ? t('info.tileWet') : '') + (w.level.slides && moist > .7 ? t('info.tileSoaked') : ''));
}
function runForecast() {
  const w = G.world;
  if (w.running) return;
  if (G.fcOn) { closeForecast(); refresh(); return; }
  A.sfx('ui_tap');
  if (!G.fcWorker) {
    G.fcWorker = new Worker(typeof FORECAST_WORKER === 'string' ? FORECAST_WORKER : 'js/sim/forecast-worker.js', { type: 'module' });
    G.fcWorker.onmessage = e => {
      if (e.data.stamp !== G.fcStamp || !G.fcOn) return;
      scene.overlay.forecast = e.data;
      const a = e.data.alerts, lost = a.filter(x => x.kind === 'lost').length, dry = a.filter(x => x.kind === 'dry').length;
      toast(lost ? t('forecast.lost', { n: lost }) : dry ? t('forecast.dry', { n: dry }) : t('forecast.clear'), lost ? 'bad' : '');
      $('forecast').textContent = t('ui.forecast');
    };
  }
  G.fcOn = true; G.fcStamp++;
  $('forecast').textContent = t('ui.wait');
  const snap = w.snapshot(); snap.stamp = G.fcStamp;
  G.fcWorker.postMessage(snap);
  refresh();
}
function closeForecast() { G.fcOn = false; scene.overlay.forecast = null; G.fcStamp++; $('forecast').textContent = t('ui.forecast'); }

// The Start button runs one Turnstile check. The dev server has no /api, so the game starts at once there
let tsWidget = null;
function clearWidget() { if (tsWidget != null) { try { window.turnstile.remove(tsWidget); } catch { /* it is gone */ } tsWidget = null; } }
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
    const fail = () => { rej(new Error('turnstile')); return true; };
    tsWidget = window.turnstile.render('#ts', { sitekey: cfg.siteKey, action: cfg.action, language: getLang() === 'zh' ? 'zh-cn' : getLang(), appearance: 'interaction-only', callback: res, 'error-callback': fail, 'expired-callback': fail, 'timeout-callback': fail, 'unsupported-callback': fail, 'before-interactive-callback': () => { $('title-sub').textContent = t('ui.securityAsk'); } });
  });
  const r = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  return r.ok;
}
let starting = false;
$('start').addEventListener('click', async () => {
  if (starting) return;
  starting = true;
  A.unlockAudio(); A.sfx('ui_tap');
  const btn = $('start');
  btn.textContent = t('ui.wait'); btn.disabled = true;
  let ok = false;
  try { ok = await gate(); } catch { ok = false; }
  starting = false; btn.disabled = false; btn.textContent = t('ui.start');
  clearWidget();
  if (!ok) { $('title-sub').textContent = t('ui.securityFailed'); return; }
  A.refreshAudio(); A.playTheme(); showMap();
});
$('next').addEventListener('click', nextMonth);
$('undo').addEventListener('click', undo);
$('forecast').addEventListener('click', runForecast);
$('speed').addEventListener('click', () => { G.speed = G.speed > 1 ? 1 : 3; $('speed').setAttribute('aria-pressed', G.speed > 1); $('speed').textContent = t(G.speed > 1 ? 'ui.fast3' : 'ui.fast'); A.sfx('ui_tap'); });
$('goal').addEventListener('click', () => {
  A.sfx('ui_tap');
  openSheet(`<h2>${lc(G.level, 'title')}</h2><p class="place">${lc(G.level, 'place')}</p><p>${lc(G.level, 'brief')}</p>${goalHtml(G.level)}<div class="row"><button id="close" class="primary" type="button">${t('ui.close')}</button></div>`, s => s.querySelector('#close').addEventListener('click', closeSheet));
});
$('menu').addEventListener('click', () => {
  A.sfx('ui_tap');
  openSheet(`<h2>${t('ui.menu')}</h2><p class="place">${G.level ? lc(G.level, 'title') : ''}</p>
    <div class="row"><button id="close" type="button">${t('ui.close')}</button></div><div class="row"><button id="look-toggle" type="button">${t(scene.frame.smooth ? 'ui.usePixels' : 'ui.useSmooth')}</button></div><div class="row"><button id="restart" type="button">${t('ui.restartPlot')}</button></div><div class="row"><button id="to-map" type="button">${t('ui.map')}</button></div>`, s => {
    s.querySelector('#close').addEventListener('click', closeSheet);
    s.querySelector('#look-toggle').addEventListener('click', () => { A.sfx('ui_tap'); applyLook(!scene.frame.smooth, true); closeSheet(); });
    s.querySelector('#restart').addEventListener('click', () => { closeSheet(); store.del(SAVE); startLevel(G.level); });
    s.querySelector('#to-map').addEventListener('click', () => { closeSheet(); A.stopMood(); showMap(); });
  });
});
const muteBtn = $('mute');
function applyMute(v) { A.setMuted(v); store.set(MUTE, v); muteBtn.querySelector('img').src = iconURL(v ? 'soundoff' : 'sound'); muteBtn.setAttribute('aria-pressed', v); }
muteBtn.addEventListener('click', () => applyMute(!A.isMuted()));
const explain = (id, key) => $(id).addEventListener('click', () => toast(t(key)));
explain('s-people', 'ui.explainPeople');
explain('s-rice', 'ui.explainRice');
explain('s-labour', 'ui.explainLabour');
document.querySelectorAll('#lang button').forEach(b => b.addEventListener('click', () => { A.sfx('ui_tap'); setLang(b.dataset.lang, true); applyCopy(); }));
document.querySelectorAll('#look button').forEach(b => b.addEventListener('click', () => { A.sfx('ui_tap'); applyLook(b.dataset.look === 'smooth', true); }));
for (const kind of ['pointerdown', 'keydown']) addEventListener(kind, () => A.unlockAudio(), { capture: true, passive: true });

scene.sfx = id => A.sfx(id, { gain: /hammer|saw|lash|brick|tile|dig|thud/.test(id) ? .32 : .6, gap: /hammer|saw|lash|brick|tile|dig|thud/.test(id) ? .16 : .3 });
scene.cue = (kind, data) => {
  if (kind === 'monthEnd') { monthEnded(data); return; }
  const say = ['quake', 'eruption', 'flood', 'wave', 'hungry'].includes(kind) ? t('cue.' + kind) : '';
  if (say) { toast(say, 'warn'); $('run-label').textContent = say; }
  if (kind === 'warning:quake') bark('quake_warning');
  if (kind === 'warning:ash') bark('ash_warning');
  if (kind === 'warning:wave') bark('wave_warning');
  if (kind === 'flood') bark('flood_warning');
  if (kind === 'hungry') bark('hungry');
  if (kind === 'stall') toast(t('ui.stall'), 'warn');
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
  if (w.transit && w.running && G.level.goal.kind === 'flow' && !G.alertLabel) $('run-label').textContent = t('ui.trafficLine', { m: w.month + 1, t: w.transit.trips, p: Math.round((w.transit.macetNow || 0) * 100) });
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
// ?still always renders in English, so the share card does not follow the machine's language
setLang(params.has('still') ? 'en' : params.get('lang') || initialLang());
applyLook(!params.has('still') && (params.has('look') ? params.get('look') === 'smooth' : !!store.get(LOOK)));
if (params.has('level')) { showTitle(); G.startLevel(params.get('level')); } else showTitle();
// ?still shows the picture alone, for the share card and the icons
if (params.get('still') === 'icon') { $('title').hidden = true; }
if (params.get('still') === 'card') showCard();
requestAnimationFrame(loop);
// test hook: shows a crop of the game canvas, enlarged, over everything
G.crop = (x, y, w, h, s = 3) => {
  let c = document.getElementById('crop');
  if (!c) { c = document.createElement('canvas'); c.id = 'crop'; c.style.cssText = 'position:fixed;left:0;top:0;z-index:99;image-rendering:pixelated'; document.body.append(c); }
  if (w === 0) { c.remove(); return; }
  c.width = w; c.height = h; c.style.width = w * s + 'px'; c.style.height = h * s + 'px';
  c.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
};
