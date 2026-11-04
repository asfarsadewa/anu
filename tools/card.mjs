// Renders the share card and the icons from the game itself: node tools/card.mjs
// It needs the dev server on port 5330 (node serve.mjs) and Edge or Chrome.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const browser = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!browser) throw new Error('This tool needs Chrome or Edge.');
const shots = process.argv[2] === 'card' ? [['og', 1200, 630, 'card']] : [['og', 1200, 630, 'card'], ['icon-192', 192, 192, 'icon'], ['icon-512', 512, 512, 'icon']];
for (const [name, w, h, still] of shots) {
  const r = spawnSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${w},${h}`, '--virtual-time-budget=12000', `--screenshot=${resolve('public', name + '.png')}`, `http://127.0.0.1:5330/?still=${still}`], { encoding: 'utf8' });
  console.log(name, r.status === 0 ? 'done' : 'failed');
}
