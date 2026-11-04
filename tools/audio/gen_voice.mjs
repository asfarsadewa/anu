// Records Bu Lurah with the gemini-tts skill helper and encodes the lines to public/audio/voice.
// Usage:
//   node tools/audio/gen_voice.mjs audition         Records one test line per candidate voice.
//   node tools/audio/gen_voice.mjs [id ...]         Records missing lines, then encodes all or the named lines.
// Raw WAVs and receipts stay in .audio-src/voice. Existing raw takes are skipped.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { decode, ffmpeg, loudness, outDir, probe, srcDir } from "./lib.mjs";

const HELPER = resolve(homedir(), ".claude/skills/gemini-tts/scripts/gemini_tts.py");
const VOICE = "Sulafat";
const AUDITION = ["Sulafat", "Vindemiatrix", "Kore"];
const STYLE = "A clearly female voice: a warm, dry-humoured Javanese woman in her sixties, the village head. She speaks Bahasa Indonesia with a soft Javanese lilt. Brisk, lively conversational pace with very short pauses. A little teasing, like a kind aunt who has seen everything.";
const TARGET = { I: -18, TP: -2 };
const KBPS = 40;
const LIMIT = 5.85;
// The last line of the game keeps its natural pauses.
const KEEP_PAUSES = new Set(["l12_win"]);

const rawDir = resolve(srcDir, "voice");
const finalDir = resolve(outDir, "voice");
const lines = JSON.parse(readFileSync(resolve(finalDir, "lines.json"), "utf8"));

const WARNING = "Firm and urgent, an older woman giving orders. Not panicked, not shrill. No teasing. Quick pace.";
const SOLEMN = "Quiet and serious. No teasing. Keep moving, no long pauses.";
const DIRECTIONS = {
  l7_intro: SOLEMN,
  l7_win: "Relieved and brisk. No teasing. Each phrase runs into the next, no pauses. Alhamdulillah is quick and light.",
  l10_intro: SOLEMN,
  l10_win: "Quiet, moved, deep relief. No teasing. Keep moving, no long pauses.",
  l11_intro: "Dry and amused. A brief hesitation on the word anu, amused at herself.",
  l11_win: "Satisfied, then amused, a small laugh in her voice at the end.",
  l12_intro: "Delighted to be home, happy and warm, quick and lively. Teasing at the end. No long pauses.",
  l12_win: "Warm and tender, with a smile in her voice. Proud of her town. Anu is a playful question, Bukan is gentle, Ini Salatiga is full of love. Standard Indonesian pronunciation of the town name, every a is an open a: Sa-la-ti-ga.",
  train_late: "Dry and teasing, quick.",
  flood_warning: WARNING,
  quake_warning: WARNING,
  ash_warning: WARNING,
  wave_warning: "Very urgent, an older woman calling out orders, loud and steady. Not panicked, not shrill. No teasing. Quick pace.",
  hungry: "Dry and teasing, a raised eyebrow.",
  level_lost: "Gentle and kind, consoling.",
  first_build: "Mock surprise, pleased.",
  first_harvest: "Delighted, teasing a little.",
};

function direction(line) {
  if (DIRECTIONS[line.id]) return DIRECTIONS[line.id];
  return line.id.endsWith("_win") ? "Pleased and warm, teasing a little." : "Warm and conversational, a small smile in her voice.";
}

function checkScript() {
  const seen = new Set();
  for (const line of lines) {
    if (seen.has(line.id)) throw new Error(`Duplicate id ${line.id}`);
    seen.add(line.id);
    const words = line.id_text.trim().split(/\s+/).length;
    if (words > 12) throw new Error(`${line.id} has ${words} words. The limit is 12.`);
  }
}

function runHelper(manifestPath, outPath) {
  const result = spawnSync("python", [HELPER, "manifest", manifestPath, "--out-dir", outPath, "--retries", "2", "--sleep", "0.3"], { encoding: "utf8", windowsHide: true });
  process.stdout.write(result.stdout.split("\n").filter((l) => !l.startsWith("skip existing")).join("\n"));
  if (result.status !== 0) console.error(result.stderr);
  return result.status === 0;
}

function writeManifest(name, voice, chosen) {
  const manifest = {
    id: name,
    language: "id",
    style: STYLE,
    mode: "per_line",
    speakers: [{ name: "Bu Lurah", voice }],
    lines: chosen.map((l) => ({ speaker: "Bu Lurah", text: l.id_text, direction: direction(l), file: `${l.id}.wav` })),
  };
  const path = resolve(rawDir, `${name}.manifest.json`);
  writeFileSync(path, JSON.stringify(manifest, null, 2));
  return path;
}

// A failed attempt leaves a receipt with no audio. The helper refuses to continue over it.
// The brief allows one retry, so the script moves failed receipts aside once.
function clearFailedReceipts(dir, chosen) {
  let cleared = 0;
  for (const line of chosen) {
    const wav = resolve(dir, `${line.id}.wav`);
    const receipt = `${wav}.receipt.json`;
    if (!existsSync(wav) && existsSync(receipt)) {
      renameSync(receipt, `${receipt}.failed`);
      cleared++;
    }
  }
  return cleared;
}

async function encode(line) {
  const raw = resolve(rawDir, `${line.id}.wav`);
  const out = resolve(finalDir, `${line.id}.mp3`);
  const trim = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03:detection=peak,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06:detection=peak,areverse";
  const stage = resolve(rawDir, "work", `${line.id}.wav`);
  mkdirSync(resolve(rawDir, "work"), { recursive: true });
  // Pauses longer than 0.3 s drop to 0.3 s. The take keeps its words and its delivery.
  const pauses = "silenceremove=stop_periods=-1:stop_duration=0.3:stop_threshold=-45dB:detection=rms";
  await ffmpeg(["-y", "-i", raw, "-af", `${trim},${KEEP_PAUSES.has(line.id) ? "" : `${pauses},`}afade=t=in:d=0.005`, "-ac", "1", "-c:a", "pcm_f32le", stage]);
  // A small tempo change fits lines that run just over the limit. Anything above 8% needs a new take.
  const stageSeconds = (await probe(stage)).duration;
  const tempo = stageSeconds > LIMIT ? stageSeconds / LIMIT : 1;
  if (tempo > 1.08) console.warn(`${line.id}: ${stageSeconds.toFixed(2)} s needs a new take.`);
  const fit = tempo > 1 && tempo <= 1.08 ? `atempo=${tempo.toFixed(4)},` : "";
  // Gain to the loudnorm loudness target, with a limiter for the true peak target. Single-pass loudnorm misreads clips this short.
  let gainDb = 0;
  let limit = 0.72;
  for (let pass = 0; pass < 6; pass++) {
    await ffmpeg(["-y", "-i", stage, "-af", `${fit}volume=${gainDb.toFixed(2)}dB,alimiter=limit=${limit.toFixed(3)}:attack=3:release=60:level=false:latency=true`, "-map_metadata", "-1", "-id3v2_version", "0", "-c:a", "libmp3lame", "-b:a", `${KBPS}k`, "-ac", "1", "-ar", "24000", "-compression_level", "0", out]);
    const m = await loudness(out, { pad: 3 });
    // Low-rate mp3 can overshoot the limiter. A lower ceiling corrects it.
    if (m.tp > TARGET.TP + 0.2) limit *= 10 ** ((TARGET.TP - 0.2 - m.tp) / 20);
    const step = TARGET.I - m.lufs;
    if (Math.abs(step) < 0.2 && m.tp <= TARGET.TP + 0.2) break;
    gainDb += step;
  }
  const info = await probe(out);
  const m = await loudness(out, { pad: 3 });
  return { id: line.id, medianF0: await medianF0(out), tempo: Number(tempo.toFixed(3)), seconds: Number(info.duration.toFixed(3)), bytes: info.bytes, lufs: m.lufs, tp: m.tp, gainDb: Number(gainDb.toFixed(2)), words: line.id_text.trim().split(/\s+/).length };
}

// Median fundamental frequency from a plain autocorrelation pitch track. Used only for the audition note.
async function medianF0(file) {
  const rate = 16000;
  const x = await decode(file, { rate, channels: 1 });
  const win = 640;
  const f0 = [];
  for (let a = 0; a + win * 2 < x.length; a += 320) {
    let e = 0;
    for (let i = a; i < a + win; i++) e += x[i] ** 2;
    if (e / win < 1e-4) continue;
    let best = 0;
    let bestLag = 0;
    for (let lag = 53; lag <= 200; lag++) {
      let c = 0;
      for (let i = a; i < a + win; i++) c += x[i] * x[i + lag];
      if (c > best) {
        best = c;
        bestLag = lag;
      }
    }
    if (bestLag && best / e > 0.5) f0.push(rate / bestLag);
  }
  f0.sort((p, q) => p - q);
  return Math.round(f0[Math.floor(f0.length / 2)] ?? 0);
}

async function audition() {
  const dir = resolve(rawDir, "audition");
  mkdirSync(dir, { recursive: true });
  const sample = lines.filter((l) => ["l1_intro", "hungry", "quake_warning"].includes(l.id));
  for (const voice of AUDITION) {
    const sub = resolve(dir, voice);
    mkdirSync(sub, { recursive: true });
    const ok = runHelper(writeManifest(`audition_${voice}`, voice, sample), sub);
    if (!ok) continue;
    for (const line of sample) {
      const file = resolve(sub, `${line.id}.wav`);
      console.log(voice, line.id, "seconds", (await probe(file)).duration.toFixed(2), "medianF0", await medianF0(file));
    }
  }
}

checkScript();
mkdirSync(rawDir, { recursive: true });
mkdirSync(finalDir, { recursive: true });
if (process.argv[2] === "audition") {
  await audition();
} else {
  const only = process.argv.slice(2);
  const chosen = lines.filter((l) => !only.length || only.includes(l.id));
  const manifest = writeManifest("bu_lurah", VOICE, lines);
  let ok = runHelper(manifest, rawDir);
  if (!ok && clearFailedReceipts(rawDir, lines) > 0) {
    console.warn("A line failed. Retrying once.");
    ok = runHelper(manifest, rawDir);
  }
  const reports = [];
  const missing = [];
  for (const line of chosen) {
    if (existsSync(resolve(rawDir, `${line.id}.wav`))) reports.push(await encode(line));
    else missing.push(line.id);
  }
  rmSync(resolve(rawDir, "work"), { recursive: true, force: true });
  // Encoded lines that left the script must not stay in the public folder.
  const known = new Set(lines.map((l) => `${l.id}.mp3`));
  for (const name of readdirSync(finalDir)) {
    if (name.endsWith(".mp3") && !known.has(name)) {
      rmSync(resolve(finalDir, name));
      console.log(`Deleted ${name}.`);
    }
  }
  writeFileSync(resolve(rawDir, only.length ? "report_partial.json" : "report.json"), JSON.stringify({ voice: VOICE, reports, missing }, null, 2));
  for (const r of reports) console.log(JSON.stringify(r));
  console.log(`Longest line: ${Math.max(...reports.map((r) => r.seconds))} s. Missing: ${missing.join(", ") || "none"}.`);
  if (missing.length) process.exitCode = 1;
}
