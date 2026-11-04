// Traffic: real vehicles on the road tiles, buses between stops, trains with mass on rails.
// Vehicles queue behind each other and wait at full junctions. A train brakes for stations, slips in rain and closes crossings.
// Pure simulation, fixed step. Each month starts with empty roads and ends with a count of trips and a jam share.
import { CATALOG } from './catalog.js';

const DT = 1 / 60, STEP = .5;
const GAP = .78, LANE_CAP = 2, JUNCTION_CAP = 2, MOPED = 1.7, BUS = 1.5, TRUCK = 1.3;
const G = .9, BRAKE = 1.3, VMAX = 3.2;
export const RAIN_SLIP = .005;

// the rail line as a list of tile centres from its path corners
function expand(path) {
  const pts = [];
  for (let k = 0; k < path.length - 1; k++) {
    const [ax, ay] = path[k], [bx, by] = path[k + 1], n = Math.abs(bx - ax) + Math.abs(by - ay), dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
    for (let i = 0; i < n; i++) pts.push([ax + dx * i, ay + dy * i]);
  }
  pts.push(path[path.length - 1].slice());
  return pts;
}

export class Line {
  constructor(world, def, index) {
    this.world = world; this.def = def; this.index = index;
    this.tiles = expand(def.path); this.L = this.tiles.length - 1;
    this.z = this.tiles.map(([x, y]) => this.tileZ(x, y));
  }
  tileZ(x, y) { const N = this.world.N, cx = Math.max(0, Math.min(N - 1, x)), cy = Math.max(0, Math.min(N - 1, y)); return this.world.tileHeight(cx, cy) * STEP; }
  // s runs in tiles from the start of the line
  pos(s) {
    const k = Math.max(0, Math.min(this.L - 1, Math.floor(s))), f = s - k, a = this.tiles[k], b = this.tiles[k + 1];
    return { x: a[0] + .5 + (b[0] - a[0]) * f, y: a[1] + .5 + (b[1] - a[1]) * f, dx: b[0] - a[0], dy: b[1] - a[1] };
  }
  // the track rises smoothly from tile centre to tile centre
  zAt(s) {
    const c = Math.max(0, Math.min(this.L, s)), k = Math.max(0, Math.min(this.L - 1, Math.floor(c)));
    return this.z[k] + (this.z[k + 1] - this.z[k]) * (c - k);
  }
  grade(s) { return this.zAt(s + .2) - this.zAt(s - .2) > 0 || true ? (this.zAt(s + .2) - this.zAt(s - .2)) / .4 : 0; }
  tileAt(s) { const k = Math.max(0, Math.min(this.L, Math.round(s))); return this.tiles[k]; }
  indexOf(x, y) { return this.tiles.findIndex(t => t[0] === x && t[1] === y); }
}

export class Transit {
  constructor(world) {
    this.world = world; this.level = world.level;
    this.lines = (this.level.rail || []).map((d, i) => new Line(world, d, i));
    this.vehicles = []; this.trains = []; this.pending = []; this.closed = new Uint8Array(world.N * world.N); this.closedNow = [];
    this.trips = 0; this.tripsBest = 0; this.macet = 0; this.macetLast = 0; this.freight = 0; this.tripsLast = 0; this.failed = 0;
    this.waitingBus = new Map(); this.stationWait = new Map(); this.running = false;
    this.seed = 1; this.bell = false;
  }
  rnd() { let s = (this.seed = (this.seed * 1664525 + 1013904223) >>> 0); s ^= s >>> 15; return (s >>> 0) / 4294967296; }

  /* ---------- the road graph ---------- */
  rebuild() {
    const w = this.world, N = w.N;
    this.reach = w.computeRoads();
    this.neigh = Array.from({ length: N * N }, () => []);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!this.reach[y * N + x]) continue;
      for (const [a, c] of [[x + 1, y], [x, y + 1], [x - 1, y], [x, y - 1]]) if (a >= 0 && c >= 0 && a < N && c < N && this.reach[c * N + a] && Math.abs(w.tileHeight(a, c) - w.tileHeight(x, y)) <= 1) this.neigh[y * N + x].push(c * N + a);
    }
    this.junction = this.neigh.map(n => n.length >= 3);
    this.paths = new Map();
  }
  path(from, to) {
    const key = from * 4096 + to;
    if (this.paths.has(key)) return this.paths.get(key);
    const prev = new Int16Array(this.neigh.length).fill(-1), q = [from];
    prev[from] = from;
    for (let h = 0; h < q.length; h++) { const c = q[h]; if (c === to) break; for (const n of this.neigh[c]) if (prev[n] < 0) { prev[n] = c; q.push(n); } }
    let out = null;
    if (prev[to] >= 0) { out = []; for (let c = to; c !== from; c = prev[c]) out.push(c); out.push(from); out.reverse(); }
    this.paths.set(key, out);
    return out;
  }
  nearRoad(x, y, foot = 1) { // the road tile a building opens onto
    const N = this.world.N;
    for (let a = 0; a < foot; a++) for (const [px, py] of [[x + a, y + foot], [x + foot, y + a], [x + a, y - 1], [x - 1, y + a]]) if (px >= 0 && py >= 0 && px < N && py < N && this.reach[py * N + px]) return py * N + px;
    return -1;
  }

  /* ---------- a month ---------- */
  startMonth() {
    const w = this.world, N = w.N;
    this.rebuild();
    this.seed = (this.level.seed || 1) * 7 + w.month * 131 + 11;
    this.vehicles = []; this.trains = []; this.pending = []; this.trips = 0; this.failed = 0; this.moving = 0; this.samples = 0; this.stillTotal = 0; this.closed.fill(0); this.bell = false;
    this.waitingBus = new Map(); this.stationWait = new Map(); this.cargoThisMonth = 0;
    this.running = true;
    const live = w.buildings.filter(b => b.done && !b.ruin);
    this.stops = live.filter(b => b.type === 'halte').map(b => ({ b, road: this.nearRoad(b.x, b.y), x: b.x, y: b.y, waiting: new Map() })).filter(s => s.road >= 0);
    this.stations = [];
    for (const b of live) if (b.type === 'stasiun') for (const line of this.lines) {
      let best = -1, bd = 9;
      for (let k = 0; k < line.tiles.length; k++) { const [tx, ty] = line.tiles[k], d = Math.hypot(tx - b.x - .5, ty - b.y - .5); if (d < bd) { bd = d; best = k; } }
      if (bd <= 2.6) this.stations.push({ b, line, s: best, x: b.x + .5, y: b.y + .5, waiting: [] });
    }
    // jobs and trips
    const jobs = [];
    for (const b of live) {
      const n = { kantor: 10, ruko: 3, pasar: 4, kampus: 10, sekolah: 4 }[b.type] || 0;
      if (n) { const foot = CATALOG[b.type].foot || 1, road = this.nearRoad(b.x, b.y, foot); for (let k = 0; k < n; k++) jobs.push({ b, road, x: b.x, y: b.y }); }
    }
    const homes = live.filter(b => CATALOG[b.type].home && b.residents > 0), off = this.level.offPlot || 0;
    const g = this.level.gate, gateRoad = g ? g.y * N + g.x : -1;
    this.trippers = [];
    for (const h of homes) {
      const workers = Math.ceil(h.residents / 2), foot = CATALOG[h.type].foot || 1, road = this.nearRoad(h.x, h.y, foot);
      for (let k = 0; k < workers; k++) {
        const t = .2 + this.rnd() * 3.4, toCity = this.rnd() < off || !jobs.length;
        const job = toCity ? null : jobs[Math.floor(this.rnd() * jobs.length)];
        this.trippers.push({ t, h, road, job, toCity });
      }
    }
    this.trippers.sort((a, b) => a.t - b.t);
    // a bus for each pair of stops
    if (this.stops.length >= 2) for (let k = 0; k < this.stops.length; k++) this.spawnBus(k);
    // pasar trucks must reach the market for rice to arrive
    if (this.level.trucks) for (const b of live) if (CATALOG[b.type].market && CATALOG[b.type].road) {
      const road = this.nearRoad(b.x, b.y), p = road >= 0 && gateRoad >= 0 ? this.path(gateRoad, road) : null;
      b.delivered = false;
      if (p) this.pending.push({ t: .1 + this.rnd() * .9, make: () => this.addVehicle(p, 2, () => { b.delivered = true; }) });
    }
    this.nextTrain = this.lines.map((l, i) => (l.def.first == null ? .4 + i * 1.5 : l.def.first));
    this.dirNext = this.lines.map(() => 1);
  }
  addVehicle(path, kind, done) {
    if (!path || path.length < 2) { if (done) done(); return null; }
    const v = { path, i: 0, f: 0, kind, done, still: 0, speed: kind === 0 ? MOPED * (.85 + this.rnd() * .3) : kind === 1 ? BUS : TRUCK, x: 0, y: 0, col: Math.floor(this.rnd() * 1000), dwell: 0 };
    this.vehicles.push(v);
    return v;
  }
  spawnBus(k) {
    const stops = this.stops, s = stops[k % stops.length], next = stops[(k + 1) % stops.length];
    const v = this.addVehicle(this.path(s.road, next.road) || [s.road, s.road], 1, null);
    if (!v) return;
    v.line = (k + 1) % stops.length; v.people = new Map(); v.isBus = true;
  }
  // a commuter picks the way: train, bus or moped. Walking counts as a delay
  startTrip(tr) {
    const w = this.world, h = tr.h;
    const nearStation = (x, y, r) => { let best = null, bd = r + .01; for (const st of this.stations) { const d = Math.max(Math.abs(st.x - x - .5), Math.abs(st.y - y - .5)); if (d < bd) { bd = d; best = st; } } return best; };
    const nearStop = (x, y, r) => { let best = null, bd = r + .01; for (const st of this.stops) { const d = Math.max(Math.abs(st.x - x), Math.abs(st.y - y)); if (d < bd) { bd = d; best = st; } } return best; };
    const st0 = nearStation(h.x, h.y, 3);
    if (st0) {
      if (tr.toCity) { st0.waiting.push({ to: null }); return; }
      const st1 = tr.job && nearStation(tr.job.x, tr.job.y, 3);
      if (st1 && st1 !== st0) { st0.waiting.push({ to: st1 }); return; }
    }
    const b0 = nearStop(h.x, h.y, 2);
    if (b0 && tr.job) {
      const b1 = nearStop(tr.job.x, tr.job.y, 2);
      if (b1 && b1 !== b0) { b0.waiting.set(b1, (b0.waiting.get(b1) || 0) + 1); return; }
    }
    // otherwise by moped
    const N = w.N, g = this.level.gate, to = tr.toCity ? (g ? g.y * N + g.x : -1) : tr.job.road;
    if (tr.road < 0 || to < 0) { this.failed++; return; }
    if (tr.road === to) { this.trips++; return; }
    const p = this.path(tr.road, to);
    if (!p) { this.failed++; return; }
    this.addVehicle(p, 0, () => { this.trips++; });
  }

  /* ---------- the step ---------- */
  step(t) {
    if (!this.running) return;
    while (this.trippers.length && this.trippers[0].t <= t) this.startTrip(this.trippers.shift());
    for (let k = this.pending.length - 1; k >= 0; k--) if (this.pending[k].t <= t) { this.pending[k].make(); this.pending.splice(k, 1); }
    this.stepTrains(t);
    this.stepVehicles();
  }
  stepVehicles() {
    const w = this.world, N = w.N, vs = this.vehicles, n = N * N;
    const laneCount = new Map(), tileCount = new Int16Array(n), edges = new Map();
    for (const v of vs) {
      const a = v.path[v.i], b = v.path[v.i + 1], cur = v.f < .5 ? a : b;
      tileCount[cur]++;
      const key = a * 4096 + b;
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push(v);
      const lane = cur * 4096 + b; laneCount.set(lane, (laneCount.get(lane) || 0) + 1);
    }
    let still = 0;
    for (let k = vs.length - 1; k >= 0; k--) {
      const v = vs[k];
      if (v.dwell > 0) { v.dwell -= DT; still++; continue; }
      const a = v.path[v.i], b = v.path[v.i + 1];
      if (b == null) { this.arrive(v, k); continue; }
      const deep = w.tileDepth(b % N, Math.floor(b / N)) > .13 && !(w.buildingAt(b % N, Math.floor(b / N)) || {}).bridge;
      const wet = w.weather && w.weather.rain > .005 ? .85 : 1;
      let want = v.f + v.speed * wet * (deep ? .3 : 1) * DT;
      // the head of the queue waits for room in the next tile, and at a closed crossing
      if (v.f < .5 && want >= .5) {
        const lane = b * 4096 + (v.path[v.i + 2] == null ? b : v.path[v.i + 2]), cap = this.junction[b] ? JUNCTION_CAP : LANE_CAP;
        if (this.closed[b] || (laneCount.get(lane) || 0) >= cap || (this.junction[b] && tileCount[b] >= JUNCTION_CAP)) want = .49;
      }
      for (const o of edges.get(a * 4096 + b)) if (o !== v && o.f > v.f && want > o.f - GAP) want = o.f - GAP;
      if (want <= v.f + 1e-4) { still++; v.still += DT; } else { v.f = want; v.still = 0; }
      if (v.f >= 1) {
        v.f -= 1; v.i++;
        if (v.path[v.i + 1] == null) { this.arrive(v, k); continue; }
      }
    }
    this.samples++; this.stillTotal += vs.length ? still / vs.length : 0;
    this.macetNow = vs.length ? still / vs.length : 0;
  }
  arrive(v, k) {
    if (v.isBus) { this.busStop(v); return; }
    if (v.done) v.done();
    this.vehicles.splice(k, 1);
  }
  busStop(v) {
    const stop = this.stops[v.line];
    if (!stop) { this.vehicles.splice(this.vehicles.indexOf(v), 1); return; }
    // people get off, then people get on
    const off = v.people.get(stop) || 0;
    if (off) { this.trips += off; v.people.delete(stop); v.total = (v.total || 0) - off; }
    let room = 22 - (v.total || 0);
    for (const [to, count] of stop.waiting) {
      if (room <= 0) break;
      const on = Math.min(room, count);
      v.people.set(to, (v.people.get(to) || 0) + on); stop.waiting.set(to, count - on); room -= on; v.total = (v.total || 0) + on;
    }
    const nextIdx = (v.line + 1) % this.stops.length, next = this.stops[nextIdx], p = this.path(stop.road, next.road);
    v.line = nextIdx; v.path = p && p.length > 1 ? p : [stop.road, stop.road]; v.i = 0; v.f = 0; v.dwell = .55;
    this.busFx = true;
  }

  /* ---------- trains ---------- */
  stepTrains(t) {
    const w = this.world, N = w.N, rainy = w.weather && w.weather.rain > RAIN_SLIP;
    this.closed.fill(0);
    this.lines.forEach((line, i) => {
      const def = line.def;
      if (t >= this.nextTrain[i] && t < 9.4) {
        const dir = def.oneWay ? 1 : this.dirNext[i];
        this.dirNext[i] = -this.dirNext[i];
        this.trains.push({ line, s: dir > 0 ? 0 : line.L, v: def.entry || 2, dir, cars: def.cars || 4, kind: def.kind || 'ka', mass: def.mass || 1, stop: -1, dwell: 0, slip: false, people: [], cargo: def.freight ? 1 : 0, stalled: 0, passed: new Set(), id: this.seed });
        this.seed = (this.seed * 3 + 7) >>> 0;
        this.nextTrain[i] = t + (def.headway || 6);
        w.fx.push({ kind: 'trainIn' });
      }
    });
    for (let k = this.trains.length - 1; k >= 0; k--) {
      const tr = this.trains[k], line = tr.line, d = tr.dir;
      if (tr.dwell > 0) { tr.dwell -= DT; if (tr.dwell <= 0) tr.stop = -1; }
      else {
        // the next station ahead, or water on the line
        let target = null;
        for (const st of this.stations) if (st.line === line && !tr.passed.has(st) && (st.s - tr.s) * d + tr.cars * .5 > -.02) { const gap = (st.s - tr.s) * d + tr.cars * .5; if (target == null || gap < target.gap) target = { gap, st }; }
        let blockGap = 1e9;
        for (let q = 1; q < 4; q++) { const ts = Math.round(tr.s) + d * q; if (ts < 0 || ts > line.L) break; const [tx, ty] = line.tiles[ts]; if (tx >= 0 && ty >= 0 && tx < N && ty < N && w.tileDepth(tx, ty) > .14) { blockGap = Math.abs(ts - tr.s) - .6; break; } }
        const stopGap = Math.min(target ? target.gap : 1e9, blockGap);
        const tile = line.tileAt(tr.s), rack = this.isRack(tile), slope = line.grade(tr.s) * d;
        const adhesion = (rack ? 2.5 : rainy ? .24 : .36) / tr.mass, power = (def2(line).power || 1.25) / tr.mass;
        const pull = Math.min(power / Math.max(tr.v, .35), adhesion);
        tr.slip = !rack && power / Math.max(tr.v, .35) > adhesion && tr.v < 1.4;
        const brakeNow = stopGap < tr.v * tr.v / (2 * BRAKE) + .08;
        let a = -G * slope - .03 * tr.v * tr.v;
        if (brakeNow) a -= BRAKE; else if (tr.v < (def2(line).vmax || VMAX)) a += pull;
        tr.v += a * DT;
        if (brakeNow && tr.v < 0) tr.v = 0;
        tr.s += tr.v * d * DT;
        // it stands at the station: people change, cargo lands
        if (target && target.gap < .1 && tr.v < .25) { tr.v = 0; tr.dwell = 1.1; tr.passed.add(target.st); this.atStation(tr, target.st); }
        // no pull left on the slope: it stalls and may roll back
        if (Math.abs(tr.v) < .03 && !brakeNow) tr.stalled += DT; else tr.stalled = Math.max(0, tr.stalled - DT);
        if (tr.stalled > 1.2 && !tr.stallNote) { tr.stallNote = true; this.stalls = (this.stalls || 0) + 1; w.fx.push({ kind: 'trainStall' }); }
      }
      // crossings close ahead of the train and stay closed until the last car passes
      const front = tr.s + d * 2.4, back = tr.s - d * (tr.cars * 1.05 + .4);
      const lo = Math.min(front, back), hi = Math.max(front, back);
      for (let q = Math.max(0, Math.ceil(lo)); q <= Math.min(line.L, Math.floor(hi)); q++) {
        const [tx, ty] = line.tiles[q];
        if (tx >= 0 && ty >= 0 && tx < N && ty < N) {
          const b = w.buildingAt(tx, ty);
          if (b && b.type === 'jalan') { this.closed[ty * N + tx] = 1; if (!tr.bellOn) { tr.bellOn = true; w.fx.push({ kind: 'crossing' }); } }
        }
      }
      const gone = d > 0 ? tr.s - tr.cars * 1.05 > line.L : tr.s + tr.cars * 1.05 < 0, back2 = d > 0 ? tr.s < -.5 : tr.s > line.L + .5;
      if (gone || back2) {
        if (gone) { for (const p of tr.people) { if (p.to == null) this.trips++; } }
        this.trains.splice(k, 1);
      }
    }
  }
  isRack(tile) { const b = this.world.buildingAt(tile[0], tile[1]); return b && b.type === 'gigi' && b.done; }
  atStation(tr, st) {
    const w = this.world;
    // those bound for here get off
    const stay = [];
    for (const p of tr.people) { if (p.to === st) this.trips++; else stay.push(p); }
    tr.people = stay;
    let room = (tr.line.def.seats || 60) - tr.people.length;
    while (room > 0 && st.waiting.length) { tr.people.push(st.waiting.shift()); room--; }
    if (tr.cargo && (st.b.ground >= (tr.line.def.deliverAt || 0))) { tr.cargo = 0; this.freight++; this.cargoThisMonth++; w.rice += tr.line.def.freight; w.fx.push({ kind: 'cargo', x: st.x, y: st.y }); }
    w.fx.push({ kind: 'trainStop', x: st.x, y: st.y });
  }
  endMonth(log) {
    if (!this.running) return;
    this.running = false;
    const rate = this.samples ? this.stillTotal / this.samples : 0;
    this.macetLast = rate; this.tripsLast = this.trips;
    this.tripsBest = Math.max(this.tripsBest, this.trips);
    const w = this.world;
    if (this.trips || this.trippersAny()) log.push(['log.trips', { n: this.trips, p: Math.round(rate * 100) }]);
    if (this.cargoThisMonth) log.push(['log.train', { n: this.cargoThisMonth * (this.lines[0].def.freight || 0) }]);
    if (this.stalls) { log.push(['log.stalled']); this.stalls = 0; }
    if (this.level.trucks) for (const b of w.buildings) if (CATALOG[b.type].market && CATALOG[b.type].road && b.done && !b.ruin && b.delivered === false) { b.noTruck = true; log.push(['log.truck']); }
  }
  trippersAny() { return this.world.people > 0; }
  // where a vehicle is now
  place(v) {
    const N = this.world.N, a = v.path[v.i], b = v.path[v.i + 1] == null ? a : v.path[v.i + 1];
    const ax = a % N, ay = Math.floor(a / N), bx = b % N, by = Math.floor(b / N), dx = bx - ax, dy = by - ay;
    return { x: ax + .5 + dx * v.f, y: ay + .5 + dy * v.f, dx, dy };
  }
}
const def2 = line => line.def;
