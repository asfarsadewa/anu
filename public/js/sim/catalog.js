// The cards. Numbers here are the whole building balance. Card text lives in copy/.
// floor: height of the floor over the ground. Water under it does not soak the building.
// str: the load the building can take (depth, plus depth x speed squared).
// freq, zeta, drift: its oscillator in a quake (Hz, damping, the drift it can take).
// ash: the ash load its roof can take. wall: height it adds to the ground for water. wind: height it shows to the wind.
// road: true means it must touch a road that reaches the gate, on plots that have roads.
export const CATALOG = {
  jalan: { name: 'Jalan', cost: 1, isRoad: true, floor: 9, str: 9, freq: 0, zeta: 1, drift: 9, ash: 9, wall: 0, wind: 0 },
  rumah: { name: 'Rumah', cost: 2, home: 4, road: true, floor: .32, str: .5, freq: 1.5, zeta: .12, drift: .3, ash: .22, wall: 0, wind: .9 },
  ruko: { name: 'Ruko', cost: 4, home: 6, labour: 1, road: true, floor: .05, str: 1.4, freq: 4.2, zeta: .06, drift: .08, ash: .12, wall: 1.1, wind: 1.1 },
  bata: { name: 'Rumah bata', cost: 4, home: 7, road: true, floor: .06, str: 1.8, freq: 5.5, zeta: .05, drift: .05, ash: .1, wall: 1.1, wind: 1 },
  rusun: { name: 'Rusun', cost: 9, home: 20, months: 2, road: true, floor: .3, str: 2.2, freq: 3.4, zeta: .04, drift: .1, ash: .3, wall: 1.6, wind: 2.2 },
  pasar: { name: 'Pasar', cost: 4, market: 4, store: 16, road: true, floor: .05, str: 1, freq: 2.6, zeta: .1, drift: .16, ash: .14, wall: 0, wind: .8 },
  warung: { name: 'Warung', cost: 3, road: true, floor: .05, str: 1, freq: 3.2, zeta: .08, drift: .12, ash: .14, wall: .8, wind: .8 },
  sekolah: { name: 'Sekolah', cost: 5, road: true, floor: .05, str: 1.4, freq: 3.6, zeta: .07, drift: .1, ash: .14, wall: .9, wind: 1 },
  ibadah: { name: 'Rumah ibadah', cost: 6, labour: 3, road: true, floor: .06, str: 1.6, freq: 2.4, zeta: .1, drift: .16, ash: .2, wall: .9, wind: 1.2 },
  masjid: { name: 'Masjid', cost: 5, labour: 2, faith: true, road: true, floor: .06, str: 1.6, freq: 2.4, zeta: .1, drift: .16, ash: .2, wall: .9, wind: 1.2 },
  gereja: { name: 'Gereja', cost: 5, labour: 2, faith: true, road: true, floor: .06, str: 1.6, freq: 2.4, zeta: .1, drift: .16, ash: .2, wall: .9, wind: 1.2 },
  klenteng: { name: 'Klenteng', cost: 5, labour: 2, faith: true, road: true, floor: .06, str: 1.6, freq: 2.4, zeta: .1, drift: .16, ash: .2, wall: .9, wind: 1.2 },
  kampus: { name: 'Kampus', cost: 9, foot: 2, months: 2, labour: 3, road: true, floor: .06, str: 1.8, freq: 3, zeta: .08, drift: .12, ash: .24, wall: 1, wind: 1.3 },
  alun: { name: 'Lapangan Pancasila', cost: 0, foot: 2, floor: 9, str: 9, freq: 0, zeta: 1, drift: 9, ash: 9, wall: 0, wind: .3 },
  prasasti: { name: 'Prasasti Plumpungan', cost: 0, floor: .3, str: .8, freq: 2, zeta: .15, drift: .22, ash: .4, wall: 0, wind: .3 },
  halte: { name: 'Halte', cost: 2, road: true, floor: .05, str: .8, freq: 3, zeta: .1, drift: .2, ash: .3, wall: 0, wind: .3 },
  stasiun: { name: 'Stasiun', cost: 8, foot: 2, months: 2, nearRail: true, labour: 1, market: 4, floor: .12, str: 2, freq: 2.6, zeta: .1, drift: .16, ash: .3, wall: .8, wind: 1 },
  kantor: { name: 'Kantor', cost: 6, road: true, labour: 2, floor: .06, str: 2, freq: 3.4, zeta: .05, drift: .1, ash: .3, wall: 1.4, wind: 1.8 },
  layang: { name: 'Jalan layang', cost: 5, isRoad: true, onRail: true, floor: 9, str: 3, freq: 2, zeta: .15, drift: .3, ash: 9, wall: 0, wind: .2 },
  gigi: { name: 'Rel gigi', cost: 2, onRail: true, floor: 9, str: 9, freq: 0, zeta: 1, drift: 9, ash: 9, wall: 0, wind: 0 },
  taman: { name: 'Taman', cost: 1, floor: 9, str: 9, freq: 0, zeta: 1, drift: 9, ash: 9, wall: 0, wind: .5, porous: .7 },
  pompa: { name: 'Pompa', cost: 3, pump: 2.2, floor: .1, str: 1.5, freq: 3, zeta: .1, drift: .2, ash: 9, wall: 0, wind: .4 },
  tanggul: { name: 'Tanggul', cost: 1, floor: 9, str: 2.4, freq: 0, zeta: 1, drift: 9, ash: 9, wall: 0, wind: .2 },
  saluran: { name: 'Saluran', cost: 1, floor: 9, str: 9, freq: 0, zeta: 1, drift: 9, ash: 9, wall: 0, wind: 0 },
  sawah: { name: 'Sawah', cost: 1, crop: true, floor: 9, str: 9, freq: 0, zeta: 1, drift: 9, ash: 9, wall: 0, wind: 0 },
  bambu: { name: 'Bambu', cost: 1, labour: 1, floor: 9, str: 1.2, freq: 0, zeta: 1, drift: 9, ash: 9, wall: 0, wind: 1.3, porous: .5 },
  lumbung: { name: 'Lumbung', cost: 3, store: 20, floor: .4, str: .7, freq: 1.8, zeta: .12, drift: .24, ash: .2, wall: 0, wind: .9 },
  kincir: { name: 'Kincir', cost: 3, floor: 9, str: 1.2, freq: 0, zeta: 1, drift: 9, ash: 9, wall: 0, wind: .6, needs: 'saluran' },
  kentongan: { name: 'Kentongan', cost: 2, floor: .3, str: .9, freq: 2, zeta: .1, drift: .28, ash: .2, wall: 0, wind: .9 },
  balai: { name: 'Balai', cost: 8, foot: 2, months: 2, labour: 3, road: true, floor: .12, str: 2, freq: 1.2, zeta: .2, drift: .3, ash: .3, wall: 0, wind: 1.1 },
  bakau: { name: 'Bakau', cost: 1, food: 1, place: 'shallow', floor: 9, str: 3, freq: 0, zeta: 1, drift: 9, ash: 9, wall: 0, wind: .8, porous: .6 },
  dermaga: { name: 'Dermaga', cost: 2, food: 2, place: 'shore', floor: .3, str: .8, freq: 2, zeta: .1, drift: .3, ash: 9, wall: 0, wind: .2 },
  panggung: { name: 'Rumah laut', cost: 3, home: 5, place: 'shallow', floor: .55, str: .6, freq: 1.5, zeta: .12, drift: .3, ash: .22, wall: 0, wind: .9 },
  sabo: { name: 'Sabo', cost: 2, floor: 9, str: 5, freq: 0, zeta: 1, drift: 9, ash: 9, wall: 0, wind: .3, mudstop: true },
  lapangan: { name: 'Lapangan', cost: 1, kite: true, floor: 9, str: 9, freq: 0, zeta: 1, drift: 9, ash: 9, wall: 0, wind: 0 },
};
export const WEATHER = {
  cerah: { id: 'cerah', rain: 0, evap: .003, spring: 1, wind: 1 },
  berawan: { id: 'berawan', rain: 0, evap: .0015, spring: 1, wind: 1.15 },
  gerimis: { id: 'gerimis', rain: .002, evap: .001, spring: 1.1, wind: 1 },
  hujan: { id: 'hujan', rain: .006, evap: 0, spring: 1.3, wind: 1.3 },
  lebat: { id: 'lebat', rain: .016, evap: 0, spring: 1.6, wind: 1.7 },
};
