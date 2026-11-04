// Writes public/audio/manifest.json from the files in public/audio. Reports the total size.
// Usage: node tools/audio/build_manifest.mjs
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SFX } from "./gen_sfx.mjs";
import { loudness, outDir, probe } from "./lib.mjs";

const MUSIC = ["theme", "win", "salatiga", "play_plan", "play_run", "play_danger"];
const MUSIC_LOOPS = ["salatiga", "play_plan", "play_run", "play_danger"];
const loops = new Set([...SFX.filter((s) => s.loop).map((s) => s.id), ...MUSIC_LOOPS]);
const lines = JSON.parse(readFileSync(resolve(outDir, "voice", "lines.json"), "utf8"));

async function entry(kind, dir, name) {
  const file = resolve(outDir, dir, name);
  const id = name.replace(/\.mp3$/, "");
  const info = await probe(file);
  const { lufs } = await loudness(file, { pad: kind === "music" ? 0 : 3 });
  return {
    id,
    path: ["audio", dir, name].filter(Boolean).join("/"),
    kind,
    duration: Number(info.duration.toFixed(3)),
    loop: loops.has(id),
    bytes: info.bytes,
    lufs,
  };
}

const mp3s = (dir) => readdirSync(resolve(outDir, dir)).filter((n) => n.endsWith(".mp3")).sort();
const files = [];
for (const id of MUSIC) files.push(await entry("music", "", `${id}.mp3`));
const sfxOrder = new Map(SFX.map((s, i) => [`${s.id}.mp3`, i]));
for (const name of mp3s("sfx").sort((a, b) => sfxOrder.get(a) - sfxOrder.get(b))) files.push(await entry("sfx", "sfx", name));
const lineOrder = new Map(lines.map((l, i) => [`${l.id}.mp3`, i]));
for (const name of mp3s("voice").sort((a, b) => lineOrder.get(a) - lineOrder.get(b))) files.push(await entry("voice", "voice", name));

const missing = [
  ...SFX.filter((s) => !files.some((f) => f.kind === "sfx" && f.id === s.id)).map((s) => s.id),
  ...lines.filter((l) => !files.some((f) => f.kind === "voice" && f.id === l.id)).map((l) => l.id),
];
if (missing.length) {
  console.error(`Missing files: ${missing.join(", ")}`);
  process.exitCode = 1;
}

const manifest = {
  version: 1,
  voiceLines: "audio/voice/lines.json",
  files,
};
const manifestPath = resolve(outDir, "manifest.json");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
    const p = resolve(dir, e.name);
    return sum + (e.isDirectory() ? walk(p) : statSync(p).size);
  }, 0);
}
const total = walk(outDir);
const by = (kind) => files.filter((f) => f.kind === kind).reduce((s, f) => s + f.bytes, 0);
console.log(`Files: ${files.length}. Music ${by("music")} B, sfx ${by("sfx")} B, voice ${by("voice")} B.`);
console.log(`Total public/audio: ${total} B (${(total / 1048576).toFixed(2)} MiB). Limit: 12 MB.`);
const over = files.filter((f) => f.kind === "voice" && f.duration >= 6);
console.log(`Voice lines at or over 6 s: ${over.map((f) => f.id).join(", ") || "none"}.`);
