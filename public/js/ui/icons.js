// Small pixel icons drawn from character maps. Palette letters are listed below. Everything is code.
const PAL = { k: '#1c1b19', w: '#fffdf7', y: '#ffd60a', o: '#e0922e', g: '#d9c27a', G: '#a98e46', r: '#c9402f', b: '#3f88c9', B: '#8cc0ea', s: '#c9925f', S: '#8d6242', e: '#6d6a68', E: '#a7a4a0', n: '#4f9a54', N: '#7fc06a', t: '#b48a5c', u: '#7b5a40', p: '#5a4a78' };
const MAPS = {
  person: ['.....kk.....', '....kssk....', '....kssk....', '.....kk.....', '...kkkkkk...', '..krrrrrrk..', '..krkrrkrk..', '..kkkrrkkk..', '....krrk....', '....kuuk....', '....kuuk....', '....kkkk....'],
  rice: ['......g.....', '.....gGg....', '...g.gGg.g..', '..gGg.G.gGg.', '..gGg.G.gGg.', '...G..G..G..', '...G..G..G..', '....G.G.G...', '.....GGG....', '......G.....', '......G.....', '.....kkk....'],
  labour: ['..kkkkk.....', '.kuuuuuk....', '.kuueeeek...', '.kkkkeeek...', '.....kuuk...', '......kuuk..', '.......kuuk.', '........kuuk', '.........kuk', '..........kk', '............', '............'],
  sound: ['............', '.....k......', '....kk...k..', '.kkkkk....k.', '.kkkkk..k.k.', '.kkkkk..k.k.', '.kkkkk..k.k.', '.kkkkk....k.', '....kk...k..', '.....k......', '............', '............'],
  soundoff: ['............', '.....k......', '....kk......', '.kkkkk.r...r', '.kkkkk..r.r.', '.kkkkk...r..', '.kkkkk..r.r.', '.kkkkk.r...r', '....kk......', '.....k......', '............', '............'],
  cerah: ['.....y......', '.y...y...y..', '..y.....y...', '....yyy.....', '...yyyyy....', 'yy.yyyyy.yy.', '...yyyyy....', '....yyy.....', '..y.....y...', '.y...y...y..', '.....y......', '............'],
  berawan: ['............', '....y.......', '..y.y.y.....', '...yyy......', '.yyyy.EEE...', '...EEEwwwE..', '..EwwwwwwwE.', '.EwwwwwwwwE.', '.EEEEEEEEEE.', '............', '............', '............'],
  gerimis: ['............', '....EEE.....', '..EEwwwEE...', '.EwwwwwwwE..', '.EEEEEEEEE..', '............', '...b....b...', '.......b....', '..b.........', '......b.....', '............', '............'],
  hujan: ['............', '....eee.....', '..eeEEEee...', '.eEEEEEEEe..', '.eeeeeeeee..', '............', '..b..b..b...', '.b..b..b....', '...b..b..b..', '..b..b..b...', '............', '............'],
  lebat: ['....eee.....', '..eeeeeee...', '.eeeeeeeee..', '.ekkkkkkke..', '.....yy.....', '.b..yy..b...', 'b..yyyy.b...', '.b...yy..b..', 'b...yy..b...', '.b..y..b....', '............', '............'],
  face: [
    '............', '...kkkkkk...', '..kkpkkpkk..', '.kkkkkkkkkk.', '.kkssssssk..', '.kksksskssk.', '.kkssssssk..', '..kssrrssk..', '...kssssk...', '..oorrrroo..', '.oorrooroo..', 'oorrrrrrrroo'],
};
const urls = new Map();
export function iconURL(name, size = 12) {
  if (urls.has(name)) return urls.get(name);
  const rows = MAPS[name], c = document.createElement('canvas');
  c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') { g.fillStyle = PAL[ch]; g.fillRect(x, y, 1, 1); } }));
  const url = c.toDataURL();
  urls.set(name, url);
  return url;
}
export function bindIcons(root = document) { root.querySelectorAll('img[data-icon]').forEach(i => { i.src = iconURL(i.dataset.icon); }); }

// the wordmark: the letters of the name as pixel blocks with a shaded edge
const LETTERS = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
};
export function drawWordmark(canvas, scale = 3) {
  const word = 'ANU', w = word.length * 6 - 1, h = 7, g = canvas.getContext('2d'), S = 4;
  canvas.width = (w * S + 4); canvas.height = (h * S + 5);
  g.clearRect(0, 0, canvas.width, canvas.height);
  [...word].forEach((ch, k) => LETTERS[ch].forEach((row, y) => [...row].forEach((cell, x) => {
    if (cell !== '#') return;
    const px = (k * 6 + x) * S, py = y * S;
    g.fillStyle = '#c0653a'; g.fillRect(px + 1, py + 1, S, S);
    g.fillStyle = '#1c1b19'; g.fillRect(px, py, S, S);
  })));
  canvas.style.width = canvas.width * scale + 'px'; canvas.style.height = canvas.height * scale + 'px';
}
