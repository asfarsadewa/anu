// The world: terrain, fluids, buildings, months. Pure simulation: no DOM, no drawing.
// Fluids are linear shallow-water equations on a staggered grid. Eight cells per tile. Fixed 60 Hz.
import { clamp, hash, fbm, smooth, lerp, rng } from '../core.js';
import { CATALOG, WEATHER } from './catalog.js';
import { Transit } from './transit.js';

export const C = 8, STEP = .5, DT = 1 / 60, MONTH_SECONDS = 10;
const GR = 576, MGR = 120; // gravity for water and mud, in grid units
const BUND = .08, PADDY = -.03, CANAL = -.09;
export const M = { GRASS: 0, SOIL: 1, SAND: 2, ROCK: 3, FERTILE: 4, BUND: 5, PADDY: 6, CANAL: 7, PATH: 8, LEVEE: 9, SEABED: 10, RUBBLE: 11, SABO: 12, FIELD: 13, RIVERBED: 14, ROAD: 15, PARK: 16, URBAN: 17, RAIL: 18, STEPS: 19 };

// What a month hands to the next one. The save and the forecast both use these lists, so a new field cannot reach only one of them
const CARRIED = ['month', 'time', 'people', 'rice', 'labour', 'nextId', 'lost', 'leftHungry', 'destroyed', 'harvested', 'harvestAfter', 'afterEvent', 'slides', 'slideHits', 'slideCool', 'peakPeople', 'quake', 'plume', 'surge', 'waveEv', 'evac', 'evacSafe', 'evacTotal', 'anyMud', 'tide', 'wave', 'kitesUp', 'roadTick', 'tickSlope', 'terrainChanged'];
const CARRIED_TRANSIT = ['trips', 'tripsBest', 'tripsLast', 'macet', 'macetLast', 'macetNow', 'freight', 'failed', 'seed'];

export class World {
  constructor(level) {
    this.level = level;
    const N = this.N = level.N;
    this.mb = 3; this.mf = 2; // margin tiles behind and in front of the grid
    const T = this.T = N + this.mb + this.mf, G = this.G = T * C, n = G * G;
    this.ground0 = new Float32Array(n); // terrain before buildings
    this.base = new Float32Array(n); // terrain with bunds, canals and levees
    this.gr = new Float32Array(n); // base + walls: what water sees
    this.mat0 = new Uint8Array(n); this.mat = new Uint8Array(n);
    this.w = new Float32Array(n); this.m = new Float32Array(n); this.ash = new Float32Array(n);
    this.qx = new Float32Array(n); this.qy = new Float32Array(n);
    this.mx = new Float32Array(n); this.my = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    this.k = new Float32Array(n); this.fric = new Float32Array(n); this.infil = new Float32Array(n);
    this.sat = new Float32Array(n).fill(level.moist || .15); // how full the soil is. A full cell soaks nothing, so streams survive
    this.mudstop = new Uint8Array(n);
    this.moist = new Float32Array(N * N).fill(level.moist || .2);
    this.tiles = new Int16Array(N * N).fill(-1);
    this.heights = new Int8Array(N * N);
    this.soil = new Uint8Array(N * N);
    this.buildings = []; this.nextId = 1;
    this.people = level.people || 0; this.rice = level.rice == null ? 6 : level.rice; this.labour = 0;
    this.month = 0; this.t = 0; this.time = 0; this.running = false;
    this.windBase = level.wind || [.5, -.2];
    this.gust = 0; this.lost = 0; this.leftHungry = 0; this.destroyed = 0; this.harvested = 0; this.harvestAfter = 0; this.peakPeople = 0;
    this.quake = null; this.plume = null; this.wave = 0; this.tide = 0;
    this.fx = []; this.log = []; this.evac = []; this.done = null; this.dirty = []; this.warned = false;
    this.sea = level.sea == null ? null : level.sea * STEP;
    this.rand = rng(level.seed || 7);
    this.buildTerrain();
    for (const b of level.start || []) this.place(b.type, b.x, b.y, { instant: true, free: true, style: b.style });
    this.assignResidents();
    this.recountLabour(true);
    if (this.sea != null) this.fillSea();
    this.settleWater(level.prewet || 0);
    this.peakPeople = this.people;
  }

  /* ---------- terrain ---------- */
  tileHeight(x, y) { return this.heights[y * this.N + x]; }
  idx(wx, wy) { // world position to cell
    const cx = Math.floor((wx + this.mb) * C), cy = Math.floor((wy + this.mb) * C);
    return cx < 0 || cy < 0 || cx >= this.G || cy >= this.G ? -1 : cy * this.G + cx;
  }
  cellX(cx) { return cx / C - this.mb; }
  buildTerrain() {
    const { level, N, G } = this;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      this.heights[y * N + x] = parseInt(level.map[y][x], 36);
      this.soil[y * N + x] = level.soil ? ' .srf'.indexOf(level.soil[y][x]) : 1;
    }
    const seaFloor = this.sea;
    for (let cy = 0; cy < G; cy++) for (let cx = 0; cx < G; cx++) {
      const i = cy * G + cx, x = (cx + .5) / C - this.mb, y = (cy + .5) / C - this.mb;
      const [h, mat] = terrainAt(this, x, y);
      // small bumps in the ground, so a thin flow finds its own rivulets
      const bump = this.sea != null && h < this.sea ? 0 : (fbm(x * 2.6 + 3, y * 2.6 + 8, 2) - .5) * .022;
      this.ground0[i] = h + bump; this.mat0[i] = mat;
      if (seaFloor != null && h < seaFloor) this.mat0[i] = M.SEABED;
    }
    // edits from the level, such as a riverbed cut through the land
    for (const r of level.river ? [level.river] : []) this.carveRiver(r);
    this.railTile = new Uint8Array(N * N); this.railAxis = new Map();
    if (level.rail || level.transit) { this.transit = new Transit(this); this.carveRails(); }
    this.base.set(this.ground0); this.mat.set(this.mat0);
    this.refreshPhysicsFields();
    if (level.river) for (let i = 0; i < G * G; i++) if (this.mat0[i] === M.RIVERBED) this.w[i] = .12;
  }
  carveRails() {
    const { N } = this;
    for (const line of this.transit.lines) line.tiles.forEach(([tx, ty], k) => {
      const nx = line.tiles[Math.min(line.L, k + 1)], px = line.tiles[Math.max(0, k - 1)], dx = Math.sign(nx[0] - px[0]), dy = Math.sign(nx[1] - px[1]);
      if (tx >= 0 && ty >= 0 && tx < N && ty < N) this.railTile[ty * N + tx] = 1;
      const key = (ty + 50) * 1000 + tx + 50, axis = this.railAxis.get(key) || { x: false, y: false };
      if (dx) axis.x = true; if (dy) axis.y = true;
      this.railAxis.set(key, axis);
      this.forCells(tx, ty, 1, (i, fx, fy) => {
        if (this.mat0[i] === M.RIVERBED) return; // the rail crosses a river on a bridge
        this.ground0[i] = line.zAt(k + (fx - .5) * dx + (fy - .5) * dy) - .005; this.mat0[i] = M.RAIL;
      });
    });
  }
  carveRiver(r) {
    const { G } = this;
    for (let cy = 0; cy < G; cy++) for (let cx = 0; cx < G; cx++) {
      const x = (cx + .5) / C - this.mb, y = (cy + .5) / C - this.mb;
      const d = distToPath(r.path, x, y);
      if (d < r.width) {
        const i = cy * G + cx, cut = smooth(r.width, r.width * .4, d) * (r.depth || .35);
        this.ground0[i] -= cut;
        if (d < r.width * .85) this.mat0[i] = M.RIVERBED;
      }
    }
  }
  refreshPhysicsFields() {
    const { G, base, gr, mat, infil, fric, mudstop } = this;
    const SOAK = [.0065, .0055, .014, .0005, .006, .0012, .0004, .0003, .001, 0, 0, .001, 0, .0055, 0, .0002, .022, .004, .002, .0002];
    for (let i = 0; i < G * G; i++) {
      gr[i] = base[i]; infil[i] = mat[i] < SOAK.length ? SOAK[mat[i]] : .006; fric[i] = mat[i] === 100 ? 2 : 0; mudstop[i] = 0;
    }
    for (const b of this.buildings) {
      if (b.ruin) continue;
      const cat = CATALOG[b.type], foot = cat.foot || 1;
      this.forCells(b.x, b.y, foot, (i, fx, fy) => {
        const inner = fx >= .15 && fx <= .85 && fy >= .15 && fy <= .85;
        if (cat.wall && inner && b.done) gr[i] += cat.wall;
        if (b.type === 'bambu') { infil[i] = .02; fric[i] = 3; }
        if (b.type === 'bakau') { infil[i] = 0; fric[i] = 9; }
        if (cat.crop) fric[i] = 2.2;
        if (cat.mudstop) mudstop[i] = 1;
      });
    }
  }
  forCells(tx, ty, foot, fn) {
    const { G, mb } = this, S = foot * C;
    for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) {
      const cx = (tx + mb) * C + a, cy = (ty + mb) * C + b;
      if (cx >= 0 && cy >= 0 && cx < G && cy < G) fn(cy * G + cx, (a + .5) / S, (b + .5) / S, a, b);
    }
  }
  buildingAt(x, y) { if (x < 0 || y < 0 || x >= this.N || y >= this.N) return null; const k = this.tiles[y * this.N + x]; return k < 0 ? null : this.buildings.find(b => b.id === k) || null; }
  // rewrite the tile's cells from what stands on it. Sawah and canals change shape with their neighbours
  writeTile(tx, ty) {
    const { N, base, mat, ground0, mat0 } = this, b = this.buildingAt(tx, ty);
    this.forCells(tx, ty, 1, (i) => { base[i] = ground0[i]; mat[i] = mat0[i]; });
    if (!b) return;
    const t = b.type, h = this.heights[ty * N + tx];
    const near = (dx, dy) => this.buildingAt(tx + dx, ty + dy);
    const lower = (dx, dy) => { const ax = tx + dx, ay = ty + dy; return ax >= 0 && ay >= 0 && ax < N && ay < N && this.heights[ay * N + ax] < h; };
    const linked = (dx, dy) => { const o = near(dx, dy); return (o && (o.type === 'saluran' || o.type === 'sawah' || o.type === 'kincir')) || this.springNear(tx + dx, ty + dy); };
    // a canal runs to what it links to. If nothing lower is linked, it spills to any lower side
    const dirs = [[0, -1], [0, 1], [1, 0], [-1, 0]], outlet = dirs.some(([p, q]) => linked(p, q) && lower(p, q));
    const joins = (dx, dy) => linked(dx, dy) || (!outlet && lower(dx, dy));
    if (t === 'sawah') {
      const canalAt = (dx, dy) => { const o = near(dx, dy); return o && (o.type === 'saluran' || o.type === 'kincir'); };
      this.forCells(tx, ty, 1, (i, fx, fy, a, c) => {
        const rim = a === 0 || c === 0 || a === C - 1 || c === C - 1;
        let d = rim ? BUND : PADDY;
        if (rim) {
          const mid = (v) => v === 3 || v === 4;
          if ((c === 0 && mid(a) && canalAt(0, -1)) || (c === C - 1 && mid(a) && canalAt(0, 1)) || (a === 0 && mid(c) && canalAt(-1, 0)) || (a === C - 1 && mid(c) && canalAt(1, 0))) d = .004;
        }
        base[i] = ground0[i] + d; mat[i] = rim && d === BUND ? M.BUND : M.PADDY;
      });
    } else if (t === 'saluran' || t === 'kincir') {
      const n = joins(0, -1), s = joins(0, 1), e = joins(1, 0), w = joins(-1, 0);
      this.forCells(tx, ty, 1, (i, fx, fy, a, c) => {
        const inx = a >= 2 && a <= 5, iny = c >= 2 && c <= 5;
        const ch = (inx && iny) || (inx && ((c < 2 && n) || (c > 5 && s))) || (iny && ((a < 2 && w) || (a > 5 && e)));
        if (ch) { base[i] = ground0[i] + CANAL; mat[i] = M.CANAL; } else mat[i] = M.SOIL;
      });
    } else if (t === 'tanggul') {
      this.forCells(tx, ty, 1, (i) => { base[i] = ground0[i] + .34; mat[i] = M.LEVEE; });
    } else if (t === 'lapangan' || t === 'alun') {
      this.forCells(tx, ty, 1, (i) => { mat[i] = M.FIELD; });
    } else if (t === 'jalan') {
      if (!b.bridge && !this.railTile[ty * N + tx]) {
        // What a road does at each side, where the ground is one step up or down:
        // a road there shares the climb. Each tile takes half, from its centre to the shared edge.
        // Empty ground straight ahead gets the whole climb, so the road meets the ground at the edge.
        // A building that opens onto this road gets stone steps in the wall. A wall beside the road stays a wall.
        const isRoad = (dx, dy) => { const o = near(dx, dy); return !!o && !!CATALOG[o.type].isRoad && !o.ruin && !o.bridge; };
        const fromGate = (dx, dy) => { const g = this.level.gate; return !!g && g.x === tx && g.y === ty && !(tx + dx >= 0 && ty + dy >= 0 && tx + dx < N && ty + dy < N); };
        const side = (dx, dy) => {
          const ax = tx + dx, ay = ty + dy;
          if (ax < 0 || ay < 0 || ax >= N || ay >= N || this.railTile[ay * N + ax]) return null;
          const d = this.heights[ay * N + ax] - h;
          if (Math.abs(d) !== 1) return null;
          const o = near(dx, dy);
          if (isRoad(dx, dy)) return { kind: 'share', d };
          if (o && !o.ruin) return CATALOG[o.type].road && !CATALOG[o.type].isRoad ? { kind: 'steps', d } : null;
          if (o && o.ruin) return null;
          return isRoad(-dx, -dy) || fromGate(-dx, -dy) ? { kind: 'meet', d } : null;
        };
        const sides = [[1, 0, side(1, 0)], [-1, 0, side(-1, 0)], [0, 1, side(0, 1)], [0, -1, side(0, -1)]], half = .36;
        this.forCells(tx, ty, 1, (i, fx, fy) => {
          let z = h * STEP - .006, m = M.ROAD;
          for (const [dx, dy, sd] of sides) {
            if (!sd) continue;
            const along = (fx - .5) * dx + (fy - .5) * dy, across = Math.abs((fx - .5) * dy + (fy - .5) * dx);
            if (sd.kind === 'steps') { // three treads, the highest at the wall
              const tread = Math.floor((.5 - along) * C);
              if (across < .19 && tread >= 0 && tread < 3) { z += sd.d * STEP * (3 - tread) / 4; m = M.STEPS; }
              continue;
            }
            if (across >= half) continue;
            if (sd.kind === 'share') { if (along > 0) z += sd.d * STEP * along; continue; }
            // the whole climb: over the full tile if the road runs straight through it, or from the centre at a junction
            const start = isRoad(dy, dx) || isRoad(-dy, -dx) || sides.some(q => q[2] && q[2].kind === 'share') ? 0 : -.5;
            if (along > start) z += sd.d * STEP * Math.min(1, (along + .5 / C - start) / (.5 - start));
          }
          mat[i] = m; base[i] = z;
        });
      }
    } else if (t === 'taman') {
      this.forCells(tx, ty, 1, (i) => { mat[i] = M.PARK; });
    } else if (t === 'sabo') {
      this.forCells(tx, ty, 1, (i) => { mat[i] = M.SOIL; });
    }
    if (b.ruin) this.forCells(tx, ty, 1, (i) => { mat[i] = M.RUBBLE; base[i] = ground0[i]; });
  }
  springNear(x, y) { return (this.level.springs || []).some(s => Math.floor(s.x) === x && Math.floor(s.y) === y); }

  /* ---------- placing ---------- */
  canPlace(type, x, y) {
    const { N } = this, cat = CATALOG[type], foot = cat.foot || 1;
    if (x < 0 || y < 0 || x + foot > N || y + foot > N) return 'place.outside';
    for (let a = 0; a < foot; a++) for (let b = 0; b < foot; b++) {
      const o = this.buildingAt(x + a, y + b);
      if (o && !((cat.needs === o.type || (type === 'layang' && o.type === 'jalan')) && !o.ruin)) return o.ruin ? 'place.rubble' : 'place.occupied';
      if (foot > 1 && this.tileHeight(x + a, y + b) !== this.tileHeight(x, y)) return 'place.level';
    }
    if (cat.needs && !this.buildingAt(x, y)) return 'place.canal';
    for (let a = 0; a < foot; a++) for (let c = 0; c < foot; c++) if (this.railTile[(y + c) * N + x + a] && !(type === 'jalan' || cat.onRail)) return 'place.rail';
    if (cat.onRail && !this.railTile[y * N + x]) return 'place.onRail';
    if (cat.nearRail) { let near = false; for (let a = -1; a <= foot; a++) for (let c = -1; c <= foot; c++) { const p = x + a, q = y + c; if ((a < 0 || c < 0 || a >= foot || c >= foot) && p >= 0 && q >= 0 && p < N && q < N && this.railTile[q * N + p]) near = true; } if (!near) return 'place.nearRail'; }
    if (this.level.roads && cat.road && !this.touchesRoad(x, y, foot)) return 'place.road';
    if (cat.isRoad && this.level.roads && !this.touchesRoad(x, y, 1) && !(this.level.gate && this.level.gate.x === x && this.level.gate.y === y)) return 'place.roadJoin';
    if (this.springNear(x, y)) return 'place.spring';
    const deep = this.tileDepth(x, y);
    if (this.sea != null) {
      const under = this.tileHeight(x, y) * STEP < this.sea;
      if (cat.place === 'shallow' && !under) return 'place.shallow';
      if (cat.place === 'shallow' && this.sea - this.tileHeight(x, y) * STEP > .35) return 'place.deep';
      if (cat.place !== 'shallow' && cat.place !== 'shore' && under) return 'place.deep';
      if (cat.place === 'shore') {
        if (under) return 'place.shoreLand';
        const shore = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([p, q]) => x + p >= 0 && y + q >= 0 && x + p < N && y + q < N && this.tileHeight(x + p, y + q) * STEP < this.sea);
        if (!shore) return 'place.shoreNext';
      }
    } else if (cat.place === 'shallow' || cat.place === 'shore') return 'place.noSea';
    if ((this.level.river && this.onRiver(x, y)) && !['tanggul', 'saluran', 'sabo', 'jalan'].includes(type)) return 'place.river';
    if (type !== 'tanggul' && type !== 'sabo' && type !== 'jalan' && !cat.place && deep > .3 && !cat.needs) return 'place.deep';
    return null;
  }
  onRiver(x, y) { const i = this.idx(x + .5, y + .5); return i >= 0 && this.mat0[i] === M.RIVERBED; }
  tileDepth(x, y) { const i = this.idx(x + .5, y + .5); return i < 0 ? 0 : this.w[i]; }
  place(type, x, y, opts = {}) {
    const cat = CATALOG[type], foot = cat.foot || 1;
    if (!opts.free) { if (this.labour < cat.cost) return null; this.labour -= cat.cost; }
    let old = null;
    if (cat.needs || type === 'layang') { old = this.buildingAt(x, y); if (old) this.buildings = this.buildings.filter(b => b !== old); }
    const b = { id: this.nextId++, type, x, y, bridge: type === 'jalan' && !!this.level.river && this.onRiver(x, y), ground: this.tileHeight(x, y) * STEP, done: !!opts.instant, prog: opts.instant ? 1 : 0, age: opts.instant ? 99 : 0, months: cat.months || 1, monthsLeft: opts.instant ? 0 : cat.months || 1,
      style: opts.style || this.level.style || 'joglo', variant: hash(x * 7 + 3, y * 11) > .5 ? 1 : 0, growth: opts.instant && cat.crop ? 1 : 0, wet: 0, flooded: 0, soaked: 0, drift: 0, driftV: 0, ashLoad: 0, angle: 0, kite: 0, replaced: !!old, prev: old || undefined, bornMonth: this.month, residents: 0, tilt: 0 };
    if (cat.nearRail || cat.onRail) b.facing = this.railFacing(x, y, foot);
    this.buildings.push(b);
    for (let a = 0; a < foot; a++) for (let c = 0; c < foot; c++) this.tiles[(y + c) * this.N + x + a] = b.id;
    this.touch(x, y, foot);
    if (cat.home && opts.instant) { b.residents = cat.home; }
    this.fx.push({ kind: 'placed', b });
    return b;
  }
  // which way the rail runs past a tile: x or y, and on which side
  railFacing(x, y, foot) {
    const { N } = this, tile = (p, q) => p >= 0 && q >= 0 && p < N && q < N && this.railTile[q * N + p];
    if (tile(x, y)) { const a = this.railAxis.get((y + 50) * 1000 + x + 50); return a && a.y && !a.x ? 'y+' : 'x+'; }
    for (let a = 0; a < foot; a++) { if (tile(x + a, y + foot)) return 'x+'; if (tile(x + a, y - 1)) return 'x-'; if (tile(x + foot, y + a)) return 'y+'; if (tile(x - 1, y + a)) return 'y-'; }
    return 'x+';
  }
  // tell the world that terrain under a building changed
  touch(x, y, foot = 1) {
    for (let p = -1; p <= foot; p++) for (let q = -1; q <= foot; q++) {
      const ax = x + p, ay = y + q;
      if (ax >= 0 && ay >= 0 && ax < this.N && ay < this.N) this.writeTile(ax, ay);
    }
    this.refreshPhysicsFields();
    this.dirty.push([x - 1, y - 1, x + foot + 1, y + foot + 1]);
  }
  remove(b, refund = false) {
    const cat = CATALOG[b.type], foot = cat.foot || 1;
    this.buildings = this.buildings.filter(o => o !== b);
    for (let a = 0; a < foot; a++) for (let c = 0; c < foot; c++) this.tiles[(b.y + c) * this.N + b.x + a] = -1;
    if (refund) this.labour += cat.cost;
    if (cat.home) this.people = Math.min(this.people, this.capacity());
    this.fx.push({ kind: 'removed', b });
    // undoing an upgrade brings back what it replaced, as it was. Only the upgrade is refunded
    if (refund && b.prev) {
      const p = b.prev, pf = CATALOG[p.type].foot || 1;
      this.buildings.push(p);
      for (let a = 0; a < pf; a++) for (let c = 0; c < pf; c++) this.tiles[(p.y + c) * this.N + p.x + a] = p.id;
      this.fx.push({ kind: 'placed', b: p });
    }
    this.touch(b.x, b.y, foot);
  }
  undoable(b) { return !b.done && b.bornMonth === this.month && !this.running && !b.replaced; }

  /* ---------- rules ---------- */
  // the roads that reach the gate. maxDepth: water deeper than this cuts a road
  computeRoads(maxDepth = 9) {
    const { N } = this, g = this.level.gate, reach = new Uint8Array(N * N);
    if (!g) return reach;
    const start = this.buildingAt(g.x, g.y);
    if (!start || !CATALOG[start.type].isRoad || start.ruin) return reach;
    const q = [[g.x, g.y]]; reach[g.y * N + g.x] = 1;
    while (q.length) {
      const [x, y] = q.pop();
      for (const [a, c] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (a < 0 || c < 0 || a >= N || c >= N || reach[c * N + a]) continue;
        const o = this.buildingAt(a, c);
        if (!o || !CATALOG[o.type].isRoad || o.ruin) continue;
        if (Math.abs(this.tileHeight(a, c) - this.tileHeight(x, y)) > 1) continue;
        if (maxDepth < 9 && !o.bridge && this.tileDepth(a, c) > maxDepth) continue;
        reach[c * N + a] = 1; q.push([a, c]);
      }
    }
    return reach;
  }
  touchesRoad(x, y, foot = 1, reach = this.computeRoads()) {
    const { N } = this;
    for (let a = 0; a < foot; a++) for (const [px, py] of [[x + a, y - 1], [x + a, y + foot], [x - 1, y + a], [x + foot, y + a]]) {
      // a building opens onto a road only if the ground between them is at most one step
      if (px >= 0 && py >= 0 && px < N && py < N && reach[py * N + px] && Math.abs(this.heights[py * N + px] - this.heights[Math.min(N - 1, Math.max(0, y)) * N + Math.min(N - 1, Math.max(0, x))]) <= 1) return true;
    }
    return false;
  }
  linked(b, reach) { return !this.level.roads || !CATALOG[b.type].road || this.touchesRoad(b.x, b.y, CATALOG[b.type].foot || 1, reach); }
  homeSize(b, schools, parks) {
    let n = CATALOG[b.type].home;
    for (const s of schools) if (Math.max(Math.abs(s.x - b.x), Math.abs(s.y - b.y)) <= 2) n += 1;
    for (const p of parks) if (Math.abs(p.x - b.x) + Math.abs(p.y - b.y) === 1) n += 1;
    for (const k of this.buildings) if (k.type === 'kampus' && k.done && !k.ruin && Math.max(Math.abs(k.x + .5 - b.x), Math.abs(k.y + .5 - b.y)) <= 2.5) n += 2;
    return n;
  }
  capacity() {
    const live = this.buildings.filter(b => b.done && !b.ruin), reach = this.computeRoads();
    const schools = live.filter(b => b.type === 'sekolah'), parks = live.filter(b => b.type === 'taman');
    let n = 0;
    for (const b of live) if (CATALOG[b.type].home && !b.soaked && this.linked(b, reach)) n += this.homeSize(b, schools, parks);
    return n;
  }
  store() { let n = 16; for (const b of this.buildings) if (b.done && !b.ruin && CATALOG[b.type].store) n += CATALOG[b.type].store; return n; }
  neighbours(b) {
    const foot = CATALOG[b.type].foot || 1, out = new Set();
    for (let a = 0; a < foot; a++) for (const [px, py] of [[b.x + a, b.y - 1], [b.x + a, b.y + foot], [b.x - 1, b.y + a], [b.x + foot, b.y + a]]) {
      const o = this.buildingAt(px, py);
      if (o && !o.ruin) out.add(o);
    }
    return [...out];
  }
  bonusOf(b) { // labour a building gives
    const cat = CATALOG[b.type];
    if (!b.done || b.ruin || b.soaked) return 0;
    let n = cat.labour || 0;
    if (b.type === 'warung') n += Math.min(4, this.neighbours(b).filter(o => o.done && CATALOG[o.type].home).length);
    if (cat.faith) for (const o of this.buildings) if (CATALOG[o.type].faith && o.type !== b.type && o.done && !o.ruin && Math.max(Math.abs(o.x - b.x), Math.abs(o.y - b.y)) <= 2) { n += 2; }
    return n;
  }
  labourPerMonth() {
    let n = 2 + Math.floor(this.people / 4);
    for (const b of this.buildings) n += this.bonusOf(b);
    return n;
  }
  recountLabour(fill) { const n = this.labourPerMonth(); if (fill) this.labour = n + (this.level.bonusLabour || 0); return n; }
  // what placing this card here would change: the numbers the ghost shows
  preview(type, x, y) {
    const cat = CATALOG[type], out = [];
    if (cat.home) out.push(['people', cat.home]);
    if (cat.labour) out.push(['labour', cat.labour]);
    if (cat.store) out.push(['rice', cat.store]);
    const foot = cat.foot || 1, around = [];
    for (let a = 0; a < foot; a++) for (const [px, py] of [[x + a, y - 1], [x + a, y + foot], [x - 1, y + a], [x + foot, y + a]]) { const o = this.buildingAt(px, py); if (o && !o.ruin && !around.includes(o)) around.push(o); }
    if (type === 'warung') { const n = Math.min(4, around.filter(o => CATALOG[o.type].home).length); if (n) out.push(['labour', n]); }
    if (cat.home) { const n = around.filter(o => o.type === 'warung').length; if (n) out.push(['labour', n]); }
    if (type === 'sekolah') { let n = 0; for (const o of this.buildings) if (CATALOG[o.type].home && !o.ruin && Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= 2) n++; if (n) out.push(['people', n]); }
    if (type === 'taman') { const n = around.filter(o => CATALOG[o.type].home).length; if (n) out.push(['people', n]); }
    if (cat.market) out.push(['rice', cat.market]);
    if (type === 'lumbung') { const n = around.filter(o => o.type === 'sawah').length * 2; if (n) out.push(['yield', n]); }
    if (type === 'sawah' && around.some(o => o.type === 'lumbung')) out.push(['yield', 2]);
    return out;
  }
  sawahYield(b) {
    let y = 6;
    if (this.neighbours(b).some(o => o.type === 'lumbung' && o.done)) y += 2;
    if (b.fertile) y += 4;
    return y;
  }

  /* ---------- months ---------- */
  weatherNow() { const m = this.level.weather[Math.min(this.month, this.level.weather.length - 1)]; return WEATHER[m]; }
  eventsNow() { return (this.level.events || []).filter(e => e.month === this.month); }
  startMonth() {
    this.running = true; this.t = 0; this.weather = this.weatherNow();
    this.pending = this.eventsNow().map(e => ({ ...e, fired: false }));
    this.warned = false;
    for (const b of this.buildings) { b.wet = 0; b.flooded = 0; b.soakedNow = false; delete b.prev; }
    if (this.transit) this.transit.startMonth();
    this.log = [];
    this.fx.push({ kind: 'month', month: this.month });
  }
  // one fixed step. Returns true when the month ends
  step() {
    if (!this.running) return false;
    this.time += DT; this.t += DT;
    const W = this.weather;
    this.gust = Math.sin(this.time * .7) * .5 + Math.sin(this.time * 1.9 + 1) * .3 + (fbm(this.time * .4, 3, 2) - .5);
    this.fireEvents();
    this.applyQuakeToWater();
    this.tick(W);
    this.stepBuildings();
    if (this.transit) this.transit.step(this.t);
    if (this.t >= MONTH_SECONDS) { this.endMonth(); return true; }
    return false;
  }
  fireEvents() {
    for (const e of this.pending) {
      if (e.fired || this.t < e.at) continue;
      e.fired = true;
      if (e.kind === 'quake') {
        this.quake = { x: e.x, y: e.y, amp: e.amp, f: e.f || 2.2, t0: this.time, dur: e.dur || 6 };
        this.fx.push({ kind: 'quake' });
      } else if (e.kind === 'flood') {
        this.surge = { until: this.time + (e.dur || 6), rate: e.rate };
        this.fx.push({ kind: 'crest' });
      } else if (e.kind === 'eruption') {
        this.plume = { x: e.x, y: e.y, until: this.time + (e.dur || 12), rate: e.ash || .03, lahar: e.lahar || 0, lx: e.lx, ly: e.ly, ldur: e.ldur || 5 };
        this.fx.push({ kind: 'eruption', e });
      } else if (e.kind === 'wave') {
        this.waveEv = { t0: this.time, amp: e.amp, dur: e.dur || 5, rise: e.rise || 1.5 };
        this.fx.push({ kind: 'wave' });
      } else if (e.kind === 'warning') {
        this.fx.push({ kind: 'warning', hazard: e.hazard });
        this.warn();
      }
    }
  }
  warn() {
    if (this.warned) return;
    this.warned = true;
    const towers = this.buildings.filter(b => b.type === 'kentongan' && b.done && !b.ruin);
    this.fx.push({ kind: 'kentongan', on: towers.length > 0 });
    for (const b of this.buildings) {
      if (!CATALOG[b.type].home || !b.done || b.ruin) continue;
      b.warned = towers.some(k => Math.max(Math.abs(k.x - b.x), Math.abs(k.y - b.y)) <= 3);
    }
    if (this.level.goal.kind === 'evac') this.startEvac();
  }
  // Walkers for the evacuation level. Warned homes leave now. Others leave when the water is close
  startEvac() {
    if (this.evac.length) return;
    const { N } = this;
    // distance to high ground over the tile lattice
    const safe = this.level.goal.safe, dist = new Int16Array(N * N).fill(-1), queue = [];
    for (let i = 0; i < N * N; i++) if (this.heights[i] >= safe && this.heights[i] * STEP >= (this.sea || 0)) { dist[i] = 0; queue.push(i); }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], x = i % N, y = i / N | 0;
      for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const j = b * N + a;
        if (dist[j] >= 0 || this.heights[j] * STEP < (this.sea || 0)) continue;
        dist[j] = dist[i] + 1; queue.push(j);
      }
    }
    this.evacDist = dist;
    let k = 0;
    for (const b of this.buildings) {
      const cat = CATALOG[b.type];
      if (!cat.home || !b.done || b.ruin) continue;
      for (let p = 0; p < b.residents; p++, k++) {
        this.evac.push({ x: b.x + .3 + hash(k, 1) * .4, y: b.y + .3 + hash(k, 2) * .4, delay: (b.warned ? 0 : 4.5) + hash(k, 3) * .8, tx: b.x, ty: b.y, safe: false, lost: false, speed: 1 + hash(k, 4) * .35, home: b.id, a: 0 });
      }
    }
  }
  stepEvac() {
    const { N, evacDist: dist } = this;
    for (const e of this.evac) {
      if (e.safe || e.lost) continue;
      if (e.delay > 0) { e.delay -= DT; continue; }
      const i = this.idx(e.x, e.y), depth = i < 0 ? 0 : this.w[i], speed = Math.hypot(this.vx[i], this.vy[i]);
      if (depth * speed * speed + depth > .35) { e.lost = true; this.lost++; this.people = Math.max(0, this.people - 1); this.fx.push({ kind: 'lostOne', x: e.x, y: e.y }); continue; }
      const tx = clamp(Math.floor(e.x), 0, N - 1), ty = clamp(Math.floor(e.y), 0, N - 1);
      const d0 = dist[ty * N + tx];
      if (d0 === 0) { e.safe = true; continue; }
      let best = null, bd = 1e4;
      for (const [a, b] of [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]]) {
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const d = dist[b * N + a];
        if (d >= 0 && d < bd) { bd = d; best = [a, b]; }
      }
      if (!best) continue;
      const onRoad = this.level.roads && this.buildingAt(tx, ty) && this.buildingAt(tx, ty).type === 'jalan';
      const gx = best[0] + .5, gy = best[1] + .5, dx = gx - e.x, dy = gy - e.y, L = Math.hypot(dx, dy) || 1, s = e.speed * DT * (depth > .05 ? .55 : onRoad ? 1.5 : 1);
      e.x += dx / L * s; e.y += dy / L * s; e.a += s * 9;
    }
  }
  applyQuakeToWater() {
    const q = this.quake;
    if (!q) return;
    if (this.time - q.t0 > q.dur + 2) { this.quake = null; return; }
    const { G, qx, qy, w } = this;
    for (let cy = 1; cy < G - 1; cy += 1) for (let cx = 1; cx < G - 1; cx += 1) {
      const i = cy * G + cx;
      if (w[i] < .004) continue;
      const a = this.groundAccel(this.cellX(cx), this.cellX(cy));
      qx[i] += DT * a * w[i] * 3; qy[i] += DT * a * .6 * w[i] * 3;
    }
  }
  // ground acceleration at a point: a wave travelling out from the epicentre
  groundAccel(x, y, soilK = 1) {
    const q = this.quake;
    if (!q) return 0;
    const r = Math.hypot(x - q.x, y - q.y), t = this.time - q.t0 - r / 7;
    if (t < 0 || t > q.dur) return 0;
    const env = smooth(0, .8, t) * smooth(q.dur, q.dur * .45, t);
    return q.amp * env * soilK * (Math.sin(6.283 * q.f * t) + .5 * Math.sin(6.283 * q.f * 1.7 * t + 1));
  }
  // the fluids
  tick(W) {
    const { G, w, m, gr, qx, qy, mx, my, k, fric, infil, vx, vy, ash, mudstop, sat, mat } = this, dt = DT;
    const rain = W.rain;
    // sources
    const f = W.spring;
    for (const s of this.level.springs || []) {
      const c = this.idx(s.x, s.y);
      if (c >= 0) { w[c] += s.rate * f * dt * .25; w[c + 1] += s.rate * f * dt * .25; w[c + G] += s.rate * f * dt * .25; w[c + G + 1] += s.rate * f * dt * .25; }
    }
    const riv = this.level.river;
    if (riv) {
      let rate = riv.flow * f;
      if (this.surge && this.time < this.surge.until) rate += this.surge.rate;
      const a = riv.path[0], c = this.idx(a[0], a[1]), S = 6;
      for (let p = -S; p <= S; p++) for (let q = -S; q <= S; q++) { const j = c + q * G + p; if (j >= 0 && j < G * G) w[j] += rate * dt / ((2 * S + 1) * (2 * S + 1)); }
    }
    if (this.plume && this.plume.lahar && this.time - (this.plume.until - 12) < this.plume.ldur) {
      const c = this.idx(this.plume.lx, this.plume.ly);
      for (let p = -3; p <= 3; p++) for (let q = -3; q <= 3; q++) m[c + q * G + p] += this.plume.lahar * dt / 49;
      this.anyMud = true;
    }
    if (this.plume) this.fallAsh();
    // rain, evaporation, soaking
    for (let i = 0; i < G * G; i++) {
      let d = w[i] + rain * dt;
      if (d > 0) {
        const open = mat[i] === 6 || mat[i] === 7 || d > .05; // standing water loses the most to the sun. A thin sheet shades itself under the grass
        const soak = infil[i] * (1 - sat[i]) * dt;
        d -= W.evap * (open ? 1 : .3) * dt + soak;
        sat[i] += soak / .09; if (sat[i] > 1) sat[i] = 1;
        w[i] = d < 0 ? 0 : d;
      } else if (sat[i] > 0) sat[i] -= .0016 * dt;
      if (ash[i] > 0 && rain > 0) { // rain turns ash into mud
        const a = Math.min(ash[i], rain * dt * .6); ash[i] -= a; m[i] += a * .12; this.anyMud = true;
      }
    }
    // mud
    if (this.anyMud !== false) this.tickMud();
    // water: the surface sits on ground and mud
    for (let cy = 0; cy < G; cy++) {
      const row = cy * G;
      for (let cx = 0; cx < G - 1; cx++) {
        const i = row + cx, j = i + 1, wi = w[i], wj = w[j];
        if (wi < 1e-4 && wj < 1e-4) { qx[i] = 0; continue; }
        let dh = gr[i] + m[i] + wi - gr[j] - m[j] - wj;
        const up = dh >= 0 ? wi : wj;
        if (up < .0012) { qx[i] = 0; continue; }
        const lim = up * 1.4; if (dh > lim) dh = lim; else if (dh < -lim) dh = -lim;
        qx[i] = (qx[i] + dt * GR * up * dh) / (1 + dt * (.32 + fric[i] + .012 / (up + .008)));
      }
    }
    for (let cy = 0; cy < G - 1; cy++) {
      const row = cy * G;
      for (let cx = 0; cx < G; cx++) {
        const i = row + cx, j = i + G, wi = w[i], wj = w[j];
        if (wi < 1e-4 && wj < 1e-4) { qy[i] = 0; continue; }
        let dh = gr[i] + m[i] + wi - gr[j] - m[j] - wj;
        const up = dh >= 0 ? wi : wj;
        if (up < .0012) { qy[i] = 0; continue; }
        const lim = up * 1.4; if (dh > lim) dh = lim; else if (dh < -lim) dh = -lim;
        qy[i] = (qy[i] + dt * GR * up * dh) / (1 + dt * (.32 + fric[i] + .012 / (up + .008)));
      }
    }
    // no cell may lose more than it holds
    for (let i = 0; i < G * G; i++) {
      const out = (qx[i] > 0 ? qx[i] : 0) + (qy[i] > 0 ? qy[i] : 0) + (i > 0 && qx[i - 1] < 0 ? -qx[i - 1] : 0) + (i >= G && qy[i - G] < 0 ? -qy[i - G] : 0);
      k[i] = out * dt > w[i] && out > 0 ? w[i] / (out * dt) : 1;
    }
    for (let i = 0; i < G * G; i++) {
      if (qx[i] > 0) qx[i] *= k[i]; else if (qx[i] < 0 && i + 1 < G * G) qx[i] *= k[i + 1];
      if (qy[i] > 0) qy[i] *= k[i]; else if (qy[i] < 0 && i + G < G * G) qy[i] *= k[i + G];
    }
    for (let cy = 0; cy < G; cy++) for (let cx = 0; cx < G; cx++) {
      const i = cy * G + cx;
      const inX = cx > 0 ? qx[i - 1] : 0, inY = cy > 0 ? qy[i - G] : 0;
      const n = w[i] + dt * (inX - (cx < G - 1 ? qx[i] : 0) + inY - (cy < G - 1 ? qy[i] : 0));
      w[i] = n < 0 ? 0 : n;
      const d = n + .02;
      vx[i] = (inX + qx[i]) * .5 / d; vy[i] = (inY + qy[i]) * .5 / d;
    }
    this.boundaries();
  }
  tickMud() {
    const { G, m, gr, mx, my, mudstop, w } = this, dt = DT;
    let any = false;
    const flow = (i, j, q, arr) => {
      const mi = m[i], mj = m[j];
      if (mi < 1e-4 && mj < 1e-4) { arr[q] = 0; return; }
      any = true;
      let dh = gr[i] + mi - gr[j] - mj;
      if (mudstop[j] && dh > 0) { arr[q] = 0; return; }
      if (mudstop[i] && dh < 0) { arr[q] = 0; return; }
      const up = dh >= 0 ? mi : mj;
      const yieldH = .012;
      if (Math.abs(dh) < yieldH) { arr[q] *= .6; return; }
      dh -= Math.sign(dh) * yieldH;
      if (dh > up) dh = up; else if (dh < -up) dh = -up;
      arr[q] = (arr[q] + dt * MGR * up * dh) / (1 + dt * (2.2 + .08 / (up + .02)));
    };
    for (let cy = 0; cy < G; cy++) for (let cx = 0; cx < G - 1; cx++) { const i = cy * G + cx; flow(i, i + 1, i, mx); }
    for (let cy = 0; cy < G - 1; cy++) for (let cx = 0; cx < G; cx++) { const i = cy * G + cx; flow(i, i + G, i, my); }
    this.anyMud = any;
    if (!any) return;
    const n = G * G;
    for (let i = 0; i < n; i++) {
      const out = (mx[i] > 0 ? mx[i] : 0) + (my[i] > 0 ? my[i] : 0) + (i > 0 && mx[i - 1] < 0 ? -mx[i - 1] : 0) + (i >= G && my[i - G] < 0 ? -my[i - G] : 0);
      this.k[i] = out * dt > m[i] && out > 0 ? m[i] / (out * dt) : 1;
    }
    for (let i = 0; i < n; i++) {
      if (mx[i] > 0) mx[i] *= this.k[i]; else if (mx[i] < 0 && i + 1 < n) mx[i] *= this.k[i + 1];
      if (my[i] > 0) my[i] *= this.k[i]; else if (my[i] < 0 && i + G < n) my[i] *= this.k[i + G];
    }
    for (let cy = 0; cy < G; cy++) for (let cx = 0; cx < G; cx++) {
      const i = cy * G + cx, inX = cx > 0 ? mx[i - 1] : 0, inY = cy > 0 ? my[i - G] : 0;
      const v = m[i] + dt * (inX - (cx < G - 1 ? mx[i] : 0) + inY - (cy < G - 1 ? my[i] : 0));
      m[i] = v < 0 ? 0 : v;
    }
  }
  windAt() {
    const W = this.weather || WEATHER.cerah, g = 1 + this.gust * .5;
    return [this.windBase[0] * W.wind * g, this.windBase[1] * W.wind * g];
  }
  fallAsh() {
    const p = this.plume, { G, ash } = this;
    if (this.time > p.until) { this.plume = null; return; }
    const [wx, wy] = this.windAt(), L = Math.hypot(wx, wy) || 1, ux = wx / L, uy = wy / L;
    for (let cy = 0; cy < G; cy += 2) for (let cx = 0; cx < G; cx += 2) {
      const x = this.cellX(cx) - p.x, y = this.cellX(cy) - p.y, s = x * ux + y * uy, n = -x * uy + y * ux;
      if (s < 0) continue;
      const sig = 1.5 + s * .22, r = p.rate * Math.exp(-n * n / (2 * sig * sig)) * DT;
      const i = cy * G + cx;
      ash[i] += r; ash[i + 1] += r; ash[i + G] += r; ash[i + G + 1] += r;
    }
  }
  boundaries() {
    const { G, w, m, gr, qx, qy } = this;
    const edge = (i) => {
      const seaLevel = this.seaLevelNow(i);
      if (seaLevel != null && gr[i] < seaLevel) {
        const eta = gr[i] + w[i]; w[i] = Math.max(0, w[i] + (seaLevel - eta) * .35);
      } else { w[i] *= .82; m[i] *= .9; }
    };
    for (let k = 0; k < G; k++) { edge(k); edge(G * G - 1 - k); edge(k * G); edge(k * G + G - 1); }
  }
  seaLevelNow(i) {
    if (this.sea == null) return null;
    let s = this.sea + this.tideNow();
    const e = this.waveEv;
    if (e) {
      const t = this.time - e.t0;
      if (t > e.dur + e.rise) { this.waveEv = null; } else {
        const G = this.G, cx = i % G, cy = i / G | 0, front = cx + cy; // the wave comes from the viewer side
        if (front > G) s += e.amp * smooth(0, e.rise, t) * smooth(e.dur + e.rise, e.dur, t);
      }
    }
    return s;
  }
  tideNow() {
    const l = this.level;
    return (l.tide ? l.tide * Math.sin(this.time * 6.283 / (l.tidePeriod || 20)) : 0) + (l.tideGrow || 0) * this.month;
  }
  fillSea() {
    const { G, w, gr } = this;
    for (let i = 0; i < G * G; i++) if (gr[i] < this.sea) w[i] = this.sea - gr[i];
  }
  settleWater(seconds) {
    if (!seconds) return;
    this.weather = WEATHER.cerah;
    for (let k = 0; k < seconds * 60; k++) { this.time += DT; this.tick({ ...WEATHER.cerah, evap: 0 }); }
  }

  /* ---------- buildings during a month ---------- */
  stepBuildings() {
    const { N } = this;
    for (const b of this.buildings) {
      if (b.ruin) continue;
      const cat = CATALOG[b.type];
      if (!b.done) {
        const speed = 1 / (MONTH_SECONDS * b.months) * 1.0;
        b.prog = Math.min(1, b.prog + speed * DT);
      }
      const foot = cat.foot || 1, cx = b.x + foot / 2, cy = b.y + foot / 2;
      const s = this.sampleWater(cx, cy);
      if (cat.crop) {
        if (!b.done && b.prog < .4) continue;
        const d = this.avgDepth(b.x, b.y);
        b.depth = d;
        if (d >= .01 && d <= .24) b.wet += DT; else if (d > .24) b.flooded += DT;
        if (this.anyAsh(b)) b.fertile = true;
        continue;
      }
      if (b.type === 'kincir') { this.stepKincir(b, s); continue; }
      if (cat.pump && b.done) this.stepPump(b, cat);
      if (b.type === 'lapangan') { this.stepKite(b); continue; }
      // flood: hydrostatic load plus drag
      // a building takes a short spike. A load that lasts breaks it
      const under = cat.place === 'shallow' ? this.seaFloorDepth(b) : 0, standing = Math.max(0, s.depth - under);
      const force = standing + s.mud * 2 + standing * s.speed * s.speed * .3;
      const limit = cat.place === 'shore' ? cat.str * 1.5 : cat.str;
      if (limit < 9 && force > limit) b.stress = (b.stress || 0) + DT; else if (b.stress) b.stress = Math.max(0, b.stress - DT * .5);
      if (b.stress > (cat.wall ? 1 : .7)) { this.destroy(b, s.mud > .08 ? 'mud' : 'water'); continue; }
      if (s.depth + s.mud > cat.floor && cat.floor < 9) b.soakedNow = true;
      // quake
      if (this.quake && cat.freq) {
        const soil = this.soil[b.y * N + b.x], soilK = (soil === 2 ? 1.5 : soil === 3 ? .7 : 1) * (this.moist[b.y * N + b.x] > .75 ? 1.3 : 1);
        const a = this.groundAccel(cx, cy, soilK), om = 6.283 * cat.freq;
        // damped oscillator driven by the ground
        const scale = b.done ? 1 : 1.6;
        b.driftV += DT * (-a * scale - 2 * cat.zeta * om * b.driftV - om * om * b.drift);
        b.drift += DT * b.driftV;
        if (Math.abs(b.drift) > cat.drift) { this.destroy(b, 'quake'); continue; }
      } else { b.driftV *= .96; b.drift *= .96; }
      // ash
      if (cat.ash < 9) {
        const i = this.idx(cx, cy);
        const load = i >= 0 ? this.ash[i] : 0;
        b.ashLoad = load;
        if (load > cat.ash) { this.destroy(b, 'ash'); continue; }
      }
    }
    if (this.quake || this.plume) this.pushDead();
    this.stepSlopes();
    if (this.evac.length) this.stepEvac();
    if (this.level.roads && ((this.roadTick = (this.roadTick || 0) + 1) % 30) === 0) { // trucks need a dry road to the gate
      const dry = this.computeRoads(.13);
      for (const b of this.buildings) if (CATALOG[b.type].market && CATALOG[b.type].road && b.done && !b.ruin) { b.openTicks = (b.openTicks || 0) + (this.touchesRoad(b.x, b.y, 1, dry) ? 1 : 0); b.allTicks = (b.allTicks || 0) + 1; }
    }
    // the level's warning fires from the first danger if no event scheduled it
  }
  anyAsh(b) { const i = this.idx(b.x + .5, b.y + .5); return i >= 0 && this.ash[i] > .03; }
  seaFloorDepth(b) { return this.sea != null ? Math.max(0, this.sea - b.ground) : 0; }
  pushDead() {}
  sampleWater(x, y) {
    let depth = 0, speed = 0, mud = 0;
    for (const [a, b] of [[0, 0], [-.3, -.3], [.3, -.3], [-.3, .3], [.3, .3]]) {
      const i = this.idx(x + a, y + b);
      if (i < 0) continue;
      depth = Math.max(depth, this.w[i]); mud = Math.max(mud, this.m[i]);
      const s = Math.hypot(this.vx[i], this.vy[i]); if (s > speed) speed = s;
    }
    return { depth, speed: speed / C, mud };
  }
  avgDepth(tx, ty) {
    let s = 0, n = 0;
    this.forCells(tx, ty, 1, (i, fx, fy, a, c) => { if (a > 1 && a < 6 && c > 1 && c < 6) { s += this.w[i]; n++; } });
    return s / n;
  }
  // a pump lifts water out of its 3 x 3 tiles and sends it away
  stepPump(b, cat) {
    let budget = cat.pump * DT; const { w } = this;
    b.pumping = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      this.forCells(b.x + dx, b.y + dy, 1, (i) => {
        if (budget <= 0 || w[i] < .004 || this.mat[i] === M.RIVERBED) return;
        const take = Math.min(w[i] - .002, Math.min(budget, .012 * DT * 60 * .3));
        if (take > 0) { w[i] -= take; budget -= take; b.pumping = true; }
      });
    }
  }
  stepKincir(b, s) {
    b.angle += s.speed * DT * 8;
    // the wheel carries water to the highest tile next to it
    const N = this.N, h = this.tileHeight(b.x, b.y);
    let target = null, best = h;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const ax = b.x + dx, ay = b.y + dy;
      if (ax < 0 || ay < 0 || ax >= N || ay >= N) continue;
      const th = this.tileHeight(ax, ay);
      if (th > best) { best = th; target = [ax, ay]; }
    }
    b.lift = target;
    if (!target) return;
    const flow = Math.min(.9, s.speed * Math.max(s.depth, .02) * 22);
    if (flow <= 0.002) return;
    const from = this.idx(b.x + .5, b.y + .5), amount = Math.min(this.w[from], flow * DT);
    this.w[from] -= amount;
    const to = this.idx(target[0] + .5, target[1] + .5);
    if (to >= 0) this.w[to] += amount;
    b.pumped = (b.pumped || 0) + amount;
  }
  // the wind this tile really gets: base wind, less whatever stands upwind
  tileWind(x, y) {
    const [wx, wy] = this.windBase, L = Math.hypot(wx, wy) || 1, ux = wx / L, uy = wy / L;
    let f = 1;
    const h0 = this.tileHeight(x, y);
    for (let d = 1; d <= 6; d++) {
      const ax = Math.round(x - ux * d), ay = Math.round(y - uy * d);
      if (ax < 0 || ay < 0 || ax >= this.N || ay >= this.N) continue;
      const o = this.buildingAt(ax, ay), fall = 1 - (d - 1) * .12;
      if (o && o.done && !o.ruin) { const cat = CATALOG[o.type]; f *= 1 - clamp(cat.wind * (1 - (cat.porous || 0)) * .55, 0, .85) * fall; }
      const dh = (this.tileHeight(ax, ay) - h0) * STEP;
      if (dh > 0) f *= 1 - clamp(dh * .5, 0, .7) * fall;
    }
    return f * L;
  }
  stepKite(b) {
    const wind = this.tileWind(b.x, b.y) * (1 + this.gust * .35) * this.weather.wind;
    const target = clamp(wind * wind * 16, 0, 11);
    b.kite += (target - b.kite) * DT * .5;
  }
  stepSlopes() {
    if ((this.tickSlope = (this.tickSlope || 0) + 1) % 30) return;
    const { N } = this, W = this.weather;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = y * N + x, b = this.buildingAt(x, y);
      // soil moisture follows rain and drains slowly
      const rooted = b && b.type === 'bambu';
      if (b && (b.type === 'jalan' || b.type === 'tanggul' || b.type === 'alun' || CATALOG[b.type].wall)) continue; // paved and walled tiles do not slide
      this.moist[t] = clamp(this.moist[t] + (W.rain * 1.1 * (this.level.soak || 1) - W.evap * .3 - .0006) * (rooted ? .4 : 1), 0, 1);
      if (!this.level.slides || this.moist[t] < .85 || this.time < (this.slideCool || 0)) continue;
      let drop = 0, dx = 0, dy = 0;
      for (const [a, c] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const ax = x + a, ay = y + c;
        if (ax < 0 || ay < 0 || ax >= N || ay >= N) continue;
        const d = this.heights[t] - this.heights[ay * N + ax];
        if (d > drop) { drop = d; dx = a; dy = c; }
      }
      if (drop < 1 || (drop < 2 && this.moist[t] < .98)) continue; // a cliff fails first. A gentle step needs full soil
      // roots on this tile or on the tile next to it hold the slope
      const held = rooted || [[1, 0], [0, 1], [-1, 0], [0, -1]].some(([a, c]) => { const o = this.buildingAt(x + a, y + c); return o && o.type === 'bambu' && o.done; });
      if (held) continue;
      this.slide(x, y);
      this.slideCool = this.time + 2.5;
    }
  }
  slide(x, y) {
    const N = this.N;
    this.heights[y * N + x] -= 1;
    this.forCells(x, y, 1, (i) => { this.ground0[i] -= STEP; this.mat0[i] = M.SOIL; this.m[i] += STEP * .55; });
    this.anyMud = true;
    for (const [a, c] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const ax = x + a, ay = y + c; if (ax >= 0 && ay >= 0 && ax < N && ay < N) this.moist[ay * N + ax] = .3; }
    const b = this.buildingAt(x, y);
    if (b) this.destroy(b, 'landslide');
    this.touch(x, y);
    this.slides = (this.slides || 0) + 1;
    this.fx.push({ kind: 'slide', x, y });
    this.log.push(['log.slopeFailed']);
  }
  destroy(b, why) {
    if (b.ruin) return;
    b.ruin = true; this.destroyed++;
    const cat = CATALOG[b.type];
    if (cat.home && b.residents) {
      const safe = b.warned ? b.residents : 0, gone = b.residents - safe;
      if (!this.evac.length && gone) { this.lost += gone; }
      if (!this.evac.length) this.people = Math.max(0, this.people - gone);
      b.residents = 0;
    }
    if (cat.home && (why === 'landslide' || why === 'mud')) this.slideHits = (this.slideHits || 0) + 1;
    this.log.push(['log.destroyed.' + why, { type: b.type }]);
    this.touch(b.x, b.y, cat.foot || 1);
    this.fx.push({ kind: 'collapse', b, why });
  }
  clearRubble(b) { // costs 1 labour
    if (!b.ruin || this.labour < 1) return false;
    this.labour -= 1;
    this.remove(b);
    return true;
  }

  /* ---------- end of month ---------- */
  endMonth() {
    this.running = false;
    const log = this.log;
    if (this.transit) this.transit.endMonth(log);
    // buildings finish
    for (const b of this.buildings) {
      if (b.ruin) continue;
      if (!b.done) { b.monthsLeft--; if (b.monthsLeft <= 0) { b.done = true; b.prog = 1; this.fx.push({ kind: 'finished', b }); } }
      b.soaked = b.soakedNow ? 1 : 0;
      b.warned = false;
      b.age++;
    }
    // mud hardens into fertile ground. Ash also makes the ground fertile
    this.hardenMud();
    this.refreshPhysicsFields();
    // sawah
    let grown = 0;
    if (!this.ripeLevels) this.ripeLevels = new Set();
    for (const b of this.buildings) {
      if (b.type !== 'sawah' || b.ruin || !b.done) continue;
      const frac = b.wet / MONTH_SECONDS;
      if (b.flooded > MONTH_SECONDS * .5) { if (b.growth > 0) log.push(['log.drowned']); b.growth = 0; continue; }
      if (frac >= .5) b.growth++;
      b.dryNote = frac < .5;
      if (b.growth >= 3 && this.people > 0) {
        const y = this.sawahYield(b);
        grown += y; b.growth = 0; b.fertile = false;
        this.ripeLevels.add(this.tileHeight(b.x, b.y));
        this.fx.push({ kind: 'harvest', b, y });
      }
    }
    if (grown) {
      this.rice += grown;
      this.harvested += grown;
      if (this.afterEvent) this.harvestAfter += grown;
      log.push(['log.sawah', { n: grown }]);
    }
    // food from the sea
    let food = 0, market = 0;
    for (const b of this.buildings) {
      if (!b.done || b.ruin) continue;
      if (b.type === 'bakau') food += CATALOG.bakau.food;
      if (b.type === 'dermaga' && this.boatFloats(b)) food += CATALOG.dermaga.food;
      if (CATALOG[b.type].market) {
        if (this.level.trucks && CATALOG[b.type].road && b.delivered !== true) { /* no truck reached it this month */ } else if (!b.allTicks || b.openTicks / b.allTicks >= .5) market += CATALOG[b.type].market; else log.push(['log.roadCut']);
        b.openTicks = 0; b.allTicks = 0;
      }
    }
    if (market) { this.rice += market; log.push(['log.pasar', { n: market }]); }
    if (food) { this.rice += food; log.push(['log.sea', { n: food }]); }
    // people eat
    const eat = Math.ceil(this.people / 4);
    if (eat > this.rice) {
      const short = eat - this.rice, gone = Math.min(this.people, short * 4);
      this.people -= gone; this.leftHungry += gone; this.rice = 0;
      if (gone) log.push(['log.hungryLeft', { n: gone }]);
      this.fx.push({ kind: 'hungry' });
    } else this.rice -= eat;
    const storeCap = this.store();
    if (this.rice > storeCap) { log.push(['log.storeLost', { n: this.rice - storeCap }]); this.rice = storeCap; }
    // homes fill if rice remains
    const cap = this.capacity();
    if (this.people > cap) { const out = this.people - cap; this.people = cap; log.push(['log.dryLeft', { n: out }]); }
    // people come only if the store holds rice for them for 2 months
    if (this.people < cap) {
      const canFeed = Math.floor(this.rice / 2) * 4, add = Math.max(0, Math.min(cap - this.people, canFeed - this.people));
      this.people += add;
      if (add) log.push(['log.came', { n: add }]);
      else if (cap > this.people) log.push(['log.waiting']);
    }
    this.assignResidents();
    this.peakPeople = Math.max(this.peakPeople, this.people);
    for (const e of this.level.events || []) if (e.month === this.month && e.kind !== 'warning') this.afterEvent = true;
    this.month++;
    this.recountLabour(true);
    this.dirtyAll = true;
    this.checkGoal();
    this.fx.push({ kind: 'monthEnd', log: log.slice() });
    if (!log.length) log.push(['log.nothing']);
  }
  boatFloats(b) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = this.idx(b.x + .5 + dx, b.y + .5 + dy);
      if (i >= 0 && this.w[i] > .08) return true;
    }
    return false;
  }
  assignResidents() {
    let left = this.people;
    const reach = this.computeRoads(), live = this.buildings.filter(o => o.done && !o.ruin), schools = live.filter(o => o.type === 'sekolah'), parks = live.filter(o => o.type === 'taman');
    for (const b of this.buildings) {
      const cat = CATALOG[b.type];
      if (!cat.home || !b.done || b.ruin) continue;
      const size = b.soaked || !this.linked(b, reach) ? 0 : this.homeSize(b, schools, parks);
      b.residents = Math.min(left, size); left -= b.residents;
    }
  }
  hardenMud() {
    const { G, m, ash, ground0, base, mat0, mat } = this;
    let hardened = false;
    for (let i = 0; i < G * G; i++) {
      if (m[i] > .006) {
        const h = m[i] * .85;
        ground0[i] += h; base[i] += h; m[i] = 0; this.mx[i] = 0; this.my[i] = 0;
        if (h > .02) { mat0[i] = M.FERTILE; if (mat[i] === M.GRASS || mat[i] === M.SOIL) mat[i] = M.FERTILE; hardened = true; }
      } else m[i] = 0;
      if (ash[i] > .02) { mat0[i] = M.FERTILE; if (mat[i] === M.GRASS || mat[i] === M.SOIL) mat[i] = M.FERTILE; ash[i] *= .5; hardened = true; } else ash[i] = 0;
    }
    if (hardened) this.terrainChanged = true;
  }
  checkGoal() {
    const g = this.level.goal, L = this.level, last = this.month >= L.months;
    const homes = this.buildings.filter(b => CATALOG[b.type].home && b.done && !b.ruin);
    let won = false;
    if (g.kind === 'people') won = this.people >= g.n;
    if (g.kind === 'terraces') won = g.levels.every(k => this.ripeLevels && this.ripeLevels.has(k));
    if (g.kind === 'salatiga') {
      const has = t => this.buildings.some(b => b.type === t && b.done && !b.ruin);
      won = this.people >= g.n && has('masjid') && has('gereja') && has('klenteng') && has('prasasti');
      if (!has('prasasti')) { this.done = { won: false }; return; }
    }
    if (g.kind === 'flow') { const t = this.transit; won = this.month >= (g.after || 0) && t.tripsLast >= g.trips && t.macetLast <= g.macet; }
    if (g.kind === 'freight') won = this.transit.freight >= g.n && this.people >= (g.people || 0);
    if (g.kind === 'holdAt') won = this.month >= g.month && this.people >= g.n;
    if (g.kind === 'holdAfter') won = this.afterEvent && this.people >= g.n && this.month > g.after;
    if (g.kind === 'kites') { const flying = this.buildings.filter(b => b.type === 'lapangan' && b.kite >= g.height).length; won = this.month >= g.after && flying >= g.n && this.people >= (g.people || 0); this.kitesUp = flying; }
    if (g.kind === 'hall') won = this.afterEvent && this.people >= g.n && this.buildings.some(b => b.type === 'balai' && b.done && !b.ruin);
    if (g.kind === 'noSlide') { won = this.month >= (g.after || 0) && this.people >= g.n && !this.slideHits; if (this.slideHits) { this.done = { won: false }; return; } }
    if (g.kind === 'harvest') won = this.afterEvent && this.harvestAfter >= g.n && this.people >= (g.people || 0);
    if (g.kind === 'evac') {
      if (this.afterEvent) { const total = this.evac.length, safe = this.evac.filter(e => e.safe).length; this.evacSafe = safe; this.evacTotal = total; won = total >= g.min && safe >= total; }
    }
    if (won) { this.done = { won: true, stars: this.stars() }; return; }
    if (last || (g.kind === 'evac' && this.afterEvent)) this.done = { won: false };
  }
  stars() {
    let s = 1;
    for (const p of this.level.pledges || []) if (this.pledgeMet(p)) s++;
    return s;
  }
  pledgeMet(p) {
    if (p.kind === 'noLoss') return this.destroyed === 0;
    if (p.kind === 'noHunger') return this.leftHungry === 0;
    if (p.kind === 'by') return this.month <= p.month;
    if (p.kind === 'tiles') return this.buildings.length <= p.n;
    if (p.kind === 'noLost') return this.lost === 0;
    if (p.kind === 'people') return this.people >= p.n;
    return false;
  }

  /* ---------- snapshot for the forecast worker ---------- */
  snapshot() {
    const { base, gr, ground0, mat, mat0, w, m, ash, qx, qy, mx, my, moist, tiles, heights, soil, infil, fric, mudstop, sat } = this;
    return {
      levelId: this.level.id,
      arrays: { base, gr, ground0, mat, mat0, w, m, ash, qx, qy, mx, my, moist, tiles, heights, soil, infil, fric, mudstop, sat },
      buildings: this.buildings.map(b => ({ ...b })),
      carried: this.carried(),
    };
  }
  restore(s) {
    for (const k in s.arrays) this[k].set(s.arrays[k]);
    this.buildings = s.buildings;
    this.uncarry(s.carried);
    this.refreshPhysicsFields();
  }
  // What lasts from one month to the next, besides the big arrays: what the goal has counted, what is still happening, and what the traffic has done
  carried() {
    const c = { ripeLevels: [...(this.ripeLevels || [])], evacDist: this.evacDist ? Array.from(this.evacDist) : null };
    for (const k of CARRIED) c[k] = this[k];
    if (this.transit) { c.transit = {}; for (const k of CARRIED_TRANSIT) c.transit[k] = this.transit[k]; }
    return c;
  }
  uncarry(c) {
    for (const k of CARRIED) if (c[k] !== undefined) this[k] = c[k];
    if (c.ripeLevels) this.ripeLevels = new Set(c.ripeLevels);
    if (c.evacDist) this.evacDist = Int16Array.from(c.evacDist);
    if (c.transit && this.transit) for (const k of CARRIED_TRANSIT) if (c.transit[k] !== undefined) this.transit[k] = c.transit[k];
  }
  // Save and load: everything needed to resume after the month ends. A save from an older game has fewer fields, and the rest keep their starting values
  save() {
    const toB64 = a => { let s = ''; const u = new Uint8Array(a.buffer); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
    const { ground0, base, mat0, mat, w, m, ash, qx, qy, mx, my, sat, moist, tiles, heights, soil } = this, arrays = {};
    for (const [k, v] of Object.entries({ ground0, base, mat0, mat, w, m, ash, qx, qy, mx, my, sat, moist, tiles, heights, soil })) arrays[k] = toB64(v);
    return { id: this.level.id, arrays, buildings: this.buildings, ...this.carried() };
  }
  load(s) {
    const un = (b64, arr) => { const b = atob(b64), u = new Uint8Array(arr.buffer); for (let i = 0; i < u.length; i++) u[i] = b.charCodeAt(i); };
    for (const k in s.arrays) un(s.arrays[k], this[k]);
    this.buildings = s.buildings;
    this.uncarry(s);
    this.refreshPhysicsFields();
    this.dirtyAll = true;
  }
}

function distToPath(path, x, y) {
  let best = 1e9;
  for (let k = 0; k < path.length - 1; k++) {
    const [ax, ay] = path[k], [bx, by] = path[k + 1], dx = bx - ax, dy = by - ay;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1), d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
    if (d < best) best = d;
  }
  return best;
}

// Height and material anywhere. The grid uses tile heights. Past the grid the land drifts to the level's far biome
export function terrainAt(world, x, y) {
  const { level, N } = world;
  const cx = clamp(Math.floor(x), 0, N - 1), cy = clamp(Math.floor(y), 0, N - 1);
  const tileH = world.heights[cy * N + cx] * STEP;
  const ox = x < 0 ? -x : x > N ? x - N : 0, oy = y < 0 ? -y : y > N ? y - N : 0, d = Math.hypot(ox, oy);
  const s = world.soil[cy * N + cx];
  let mat = s === 2 ? M.SAND : s === 3 ? M.ROCK : s === 4 ? M.FERTILE : level.urban ? M.URBAN : M.GRASS;
  if (d <= 0) return [tileH, mat];
  const [far, farMat] = farAt(world, x, y);
  // the plot is a pad: a stone wall drops from its front edges, and a low bank rises behind it. Water runs in from behind and falls off the front
  const edge = x > N || y > N ? tileH - (level.urban ? .22 : .34) : tileH + (level.urban ? .1 : .14);
  const b = smooth(.5, 2.6, d);
  if (level.urban && far < edge && d > .5) return [lerp(edge, far, b), b > .5 ? farMat : mat];
  return [lerp(edge, far, b), b > .5 ? farMat : mat];
}

// The biome's land, kept below the plot in front of it, so water falls away from the plot and the view stays open
export function farAt(world, x, y) {
  const r = farTerrain(world.level, x, y), N = world.N;
  if (r[1] === 100 && world.level.farLand) { r[1] = world.level.farLand; r[0] = .5 + (r[0] - .5) * .22; } // town land is flat
  if (x <= N && y <= N) return r;
  const cx = clamp(Math.floor(x), 0, N - 1), cy = clamp(Math.floor(y), 0, N - 1);
  const d = Math.hypot(Math.max(0, x - N), Math.max(0, y - N));
  const lid = world.heights[cy * N + cx] * STEP - .42 + Math.max(0, d - 3) * .3;
  if (r[0] > lid) r[0] = Math.max(world.sea != null ? world.sea - .1 : -.2, lid);
  return r;
}
// The land past the plot. Each biome returns height and material
export function farTerrain(level, x, y) {
  const N = level.N, cx = N / 2, cy = N / 2, back = -(x + y - N) / 2, side = (x - y) / 2;
  const n = fbm(x * .12 + 40, y * .12 + 11, 4), fine = fbm(x * .5, y * .5, 2);
  const sea = level.sea != null ? level.sea * STEP : null;
  switch (level.biome) {
    case 'coast': {
      // land behind the plot, sea in front of it
      const shore = back + (n - .5) * 8 + (level.shoreShift || 0);
      const h = shore > 0 ? sea + .15 + smooth(0, 14, shore) * 3.6 + (fine - .5) * .5 * smooth(0, 3, shore) : sea - .35 - smooth(0, -8, shore) * .3;
      return [h, shore > 2 ? 100 : shore > 0 ? M.SAND : M.SEABED];
    }
    case 'volcano': {
      const dist = Math.hypot(x - level.cone[0], y - level.cone[1]);
      const cone = Math.max(0, level.coneH * Math.pow(Math.max(0, 1 - dist / level.coneR), 1.5));
      const crater = dist < 1.8 ? -(1.8 - dist) * .6 : 0;
      const h = .6 + cone + crater + (n - .5) * 1.2 * (1 + dist * .02);
      const rock = cone > level.coneH * .42;
      return [h, rock ? M.ROCK : cone > 1 ? 100 : fine > .55 ? 101 : 100];
    }
    case 'river': {
      const rd = riverDistance(level, x, y);
      const h = .55 + smooth(.5, 9, rd) * (.7 + n * 1.2) + (fine - .5) * .5 * smooth(1, 4, rd);
      if (rd < 1.2) return [.28, M.RIVERBED];
      return [h, 100];
    }
    case 'slope': {
      const h = 1.5 + Math.max(0, back) * .32 + (n - .5) * 2.5 + (fine - .5) * .5;
      return [Math.max(.2, h), n > .46 ? 100 : 101];
    }
    case 'salatiga': { // the town on the slope: far land climbs gently to the mountains behind it
      const h = .6 + Math.max(0, back) * .05 + (n - .5) * .4 + (fine - .5) * .08;
      return [Math.max(.2, h), 102];
    }
    case 'basin': { // a town on a plain with far volcanoes behind it
      const peak = Math.max(0, back - 16) * .55 * (.6 + n * .8);
      const h = .55 + (n - .5) * .5 + (fine - .5) * .1 + peak;
      return [Math.max(.15, h), peak > 1.4 ? 100 : 102];
    }
    case 'bali': {
      const r = .8 + Math.max(0, back) * .28 + (n - .5) * 2;
      return [Math.max(.2, r), fine > .42 && n < .62 ? 101 : 100];
    }
    default: { // java hills
      const r = .7 + Math.max(0, back) * .18 + (n - .5) * 2.2 + (fine - .5) * .5;
      return [Math.max(.1, r), n < .47 ? 101 : 100];
    }
  }
}
function riverDistance(level, x, y) {
  const r = level.river;
  let d = distToPath(r.path, x, y);
  const a = r.path[0], z = r.path[r.path.length - 1], p = r.path[1], q = r.path[r.path.length - 2];
  // the river continues straight past both ends of its path
  d = Math.min(d, distToPath([[a[0], a[1]], [a[0] + (a[0] - p[0]) * 40, a[1] + (a[1] - p[1]) * 40]], x, y));
  d = Math.min(d, distToPath([[z[0], z[1]], [z[0] + (z[0] - q[0]) * 40, z[1] + (z[1] - q[1]) * 40]], x, y));
  return d;
}
