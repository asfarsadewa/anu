// Writes the deployable site to dist/: node build.mjs
// JS and CSS are minified into one file each, with a content hash in the name, so a browser can keep them for a year.
// The dev server does not use this. It serves public/ as plain source.
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const out = 'dist';
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
// everything but the source that the bundle replaces
await cp('public', out, { recursive: true, filter: src => !/^public[\\/]js([\\/]|$)/.test(src) && !/anu\.css$/.test(src) });

const bundle = async (entry, define = {}) => {
  const r = await build({ entryPoints: [entry], bundle: true, minify: true, format: 'esm', target: 'es2021', outdir: `${out}/assets`, entryNames: '[name]-[hash]', metafile: true, define, logLevel: 'warning' });
  return Object.keys(r.metafile.outputs).find(p => !p.endsWith('.map')).replace(`${out}/`, '');
};
const worker = await bundle('public/js/sim/forecast-worker.js');
const main = await bundle('public/js/main.js', { FORECAST_WORKER: JSON.stringify(worker) });
const css = await bundle('public/anu.css');

let html = await readFile('public/index.html', 'utf8');
if (!html.includes('src="js/main.js"') || !html.includes('href="anu.css"')) throw new Error('index.html no longer names its entry files');
html = html.replace('src="js/main.js"', `src="${main}"`).replace('href="anu.css"', `href="${css}"`);
await writeFile(`${out}/index.html`, html);

for (const f of [main, worker, css, 'index.html']) {
  const data = await readFile(`${out}/${f}`);
  console.log(basename(f).padEnd(34), `${(data.length / 1024).toFixed(1)} KB raw`.padEnd(14), `${(gzipSync(data).length / 1024).toFixed(1)} KB gzip`.padEnd(14), `${(brotliCompressSync(data).length / 1024).toFixed(1)} KB brotli`);
}
