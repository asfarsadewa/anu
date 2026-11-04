// Masters the chosen Lyria take to public/audio/theme.mp3 and trims the win cue to public/audio/win.mp3.
// Usage: node tools/audio/master_music.mjs [themeTake]
// The default take is theme_a. Selection reasons are in tools/audio/PROMPTS.md.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { db, decode, ffmpeg, loudness, loudnessCurve, outDir, probe, silences, spectrum, srcDir } from "./lib.mjs";

const THEME_TAKE = process.argv[2] ?? "theme_a";
const dir = resolve(srcDir, "music");
const work = resolve(dir, "work");
mkdirSync(work, { recursive: true });
mkdirSync(outDir, { recursive: true });

const TARGET = { I: -18, TP: -2 };
const MONO = "pan=mono|c0=0.5*c0+0.5*c1";

// Finds the first and last sample above threshold, in seconds.
async function contentBounds(file, thresholdDb) {
  const rate = 44100;
  const x = await decode(file, { rate, channels: 1 });
  const win = Math.floor(0.02 * rate);
  const level = 10 ** (thresholdDb / 20);
  const loud = (a) => {
    let peak = 0;
    for (let i = a; i < Math.min(a + win, x.length); i++) peak = Math.max(peak, Math.abs(x[i]));
    return peak >= level;
  };
  let a = 0;
  while (a < x.length && !loud(a)) a += win;
  let b = x.length - win;
  while (b > a && !loud(b)) b -= win;
  return { start: a / rate, end: Math.min((b + win) / rate, x.length / rate) };
}

function lastJson(text) {
  return JSON.parse(text.slice(text.lastIndexOf("{"), text.lastIndexOf("}") + 1));
}

// Two-pass linear loudnorm. Writes a float WAV at 44.1 kHz.
async function normalise(input, pre, output) {
  const base = `${pre}loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=20`;
  const first = await ffmpeg(["-i", input, "-af", `${base}:print_format=json`, "-f", "null", "-"]);
  const m = lastJson(first.stderr);
  const filter = `${base}:linear=true:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:print_format=json,aresample=44100`;
  const second = await ffmpeg(["-y", "-i", input, "-af", filter, "-c:a", "pcm_f32le", output]);
  return lastJson(second.stderr).normalization_type;
}

async function encodeMp3(input, output, { kbps, mono, gainDb = 0, jointStereo = true }) {
  await ffmpeg([
    "-y", "-i", input, "-af", `volume=${gainDb.toFixed(2)}dB`, "-map_metadata", "-1", "-id3v2_version", "0",
    "-c:a", "libmp3lame", "-b:a", `${kbps}k`, "-ar", "44100", "-compression_level", "0",
    ...(mono ? [] : ["-joint_stereo", jointStereo ? "1" : "0"]),
    output,
  ]);
}

// Renders the last processing stage, then trims the gain so the mp3 lands on the targets.
async function finish(input, output, { kbps, mono, fade, pad = 0 }) {
  const stage = resolve(work, `stage_${kbps}_${mono ? "m" : "s"}.wav`);
  const parts = [];
  if (mono) parts.push(MONO);
  if (fade) parts.push(`afade=t=out:st=${fade.start.toFixed(3)}:d=${fade.duration}:curve=qsin`);
  await ffmpeg(["-y", "-i", input, ...(parts.length ? ["-af", parts.join(",")] : []), "-c:a", "pcm_f32le", stage]);
  let gainDb = 0;
  for (let pass = 0; pass < 3; pass++) {
    await encodeMp3(stage, output, { kbps, mono, gainDb });
    const m = await loudness(output, { pad });
    const step = Math.min(TARGET.I - m.lufs, TARGET.TP - m.tp);
    if (Math.abs(step) < 0.15) break;
    gainDb += step;
  }
  return { stage, gainDb: Number(gainDb.toFixed(2)) };
}

// Gain-matched signal-to-error ratio against the mono downmix.
async function codecSnr(referenceMono, encoded) {
  const rate = 44100;
  const a = await decode(referenceMono, { rate, channels: 1 });
  const b = await decode(encoded, { rate, channels: 1 });
  const from = 30 * rate;
  const len = 40 * rate;
  let ab = 0;
  let aa = 0;
  for (let i = from; i < from + len; i++) {
    ab += a[i] * b[i];
    aa += a[i] ** 2;
  }
  const g = ab / aa;
  let sig = 0;
  let err = 0;
  for (let i = from; i < from + len; i++) {
    sig += (g * a[i]) ** 2;
    err += (g * a[i] - b[i]) ** 2;
  }
  return Number(db(Math.sqrt(sig / err)).toFixed(1));
}

async function masterTheme(take) {
  const raw = resolve(dir, `${take}.mp3`);
  const bounds = await contentBounds(raw, -60);
  const wav = resolve(work, `${take}_norm.wav`);
  const pre = `atrim=start=${bounds.start.toFixed(3)}:end=${bounds.end.toFixed(3)},asetpts=PTS-STARTPTS,`;
  const mode = await normalise(raw, pre, wav);
  const length = bounds.end - bounds.start;
  const fade = { start: length - 3, duration: 3 };

  const candidates = {
    mono: { file: resolve(work, `${take}_mono64.mp3`), mono: true },
    joint: { file: resolve(work, `${take}_joint64.mp3`), mono: false },
  };
  const refMono = resolve(work, `${take}_refmono.wav`);
  await ffmpeg(["-y", "-i", wav, "-af", `${MONO},afade=t=out:st=${fade.start.toFixed(3)}:d=3:curve=qsin`, "-c:a", "pcm_f32le", refMono]);
  const compare = {};
  for (const [name, c] of Object.entries(candidates)) {
    const { gainDb } = await finish(wav, c.file, { kbps: 64, mono: c.mono, fade });
    c.gainDb = gainDb;
    compare[name] = { snrDb: await codecSnr(refMono, c.file), air: (await spectrum(c.file)).air_8k_16k, bytes: (await probe(c.file)).bytes, gainDb };
  }
  compare.source = { air: (await spectrum(refMono)).air_8k_16k };
  const pick = compare.mono.snrDb >= compare.joint.snrDb ? "mono" : "joint";
  const out = resolve(outDir, "theme.mp3");
  await finish(wav, out, { kbps: 64, mono: candidates[pick].mono, fade });
  return {
    take,
    bounds,
    loudnormMode: mode,
    compare,
    chosenEncoding: pick,
    final: { ...(await probe(out)), ...(await loudness(out)), silences: await silences(out, { noise: -50, min: 0.2 }), curve: await loudnessCurve(out, 10) },
  };
}

async function masterWin() {
  const raw = resolve(dir, "win.mp3");
  // Lyria returned 65 s for this prompt. The envelope places the last phrase at 57 s and the last gong decays near 64.5 s.
  const rate = 44100;
  const x = await decode(raw, { rate, channels: 1 });
  const win = Math.floor(0.005 * rate);
  const levelAt = (i) => {
    let s = 0;
    for (let k = i; k < i + win; k++) s += x[k] ** 2;
    return s / win;
  };
  let bestI = Math.floor(57.0 * rate);
  let bestRise = 0;
  for (let i = Math.floor(57.0 * rate); i < Math.floor(57.35 * rate); i += Math.floor(win / 2)) {
    const rise = levelAt(i + win) - levelAt(i);
    if (rise > bestRise) {
      bestRise = rise;
      bestI = i;
    }
  }
  const start = bestI / rate;
  const { end } = await contentBounds(raw, -60);
  const pre = `atrim=start=${start.toFixed(4)}:end=${end.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=0.008,`;
  const wav = resolve(work, "win_norm.wav");
  const mode = await normalise(raw, pre, wav);
  const length = end - start;
  const out = resolve(outDir, "win.mp3");
  const { gainDb } = await finish(wav, out, { kbps: 48, mono: true, fade: { start: length - 0.5, duration: 0.5 }, pad: 3 });
  return { start, end, loudnormMode: mode, gainDb, final: { ...(await probe(out)), ...(await loudness(out, { pad: 3 })) } };
}

const report = { theme: await masterTheme(THEME_TAKE), win: await masterWin() };
writeFileSync(resolve(dir, "master.json"), JSON.stringify(report, null, 2));
rmSync(work, { recursive: true, force: true });
console.log(JSON.stringify(report, null, 1));
