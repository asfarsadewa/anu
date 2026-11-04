// Masters Lyria takes into 4 s crossfade loops: the Salatiga score and the gameplay beds.
// Usage: node tools/audio/master_loops.mjs [out ...]
// Method from animal-herder/tools/generate_music.mjs: the file starts after the head.
// The last 4 s blend the tail into that head, so the end flows into the first sample.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { db, decode, ffmpeg, loudness, loudnessCurve, outDir, probe, srcDir } from "./lib.mjs";

const dir = resolve(srcDir, "music");
const work = resolve(dir, "loop_work");
const CROSSFADE = 4;

const JOBS = [
  { out: "salatiga", take: process.env.SALATIGA_TAKE ?? "salatiga_a", kbps: 96, mono: false, I: -18, tp: -2, endDb: -45 },
  { out: "play_plan", take: "play_plan", kbps: 56, mono: true, I: -22, tp: -2, endDb: -45 },
  { out: "play_run", take: "play_run", kbps: 56, mono: true, I: -22, tp: -2, endDb: -45 },
  { out: "play_danger", take: "play_danger", kbps: 56, mono: true, I: -22, tp: -2, endDb: -45 },
];

function lastJson(text) {
  return JSON.parse(text.slice(text.lastIndexOf("{"), text.lastIndexOf("}") + 1));
}

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

// Largest jump across the wrap against the sample steps inside the file, per channel.
function seam(x, channels) {
  const frames = Math.floor(x.length / channels);
  const out = [];
  for (let c = 0; c < channels; c++) {
    const steps = [];
    for (let i = 1; i < frames; i++) steps.push(Math.abs(x[i * channels + c] - x[(i - 1) * channels + c]));
    const jump = Math.abs(x[c] - x[(frames - 1) * channels + c]);
    const rms = Math.sqrt(steps.reduce((s, v) => s + v * v, 0) / steps.length);
    const larger = steps.filter((v) => v > jump).length / steps.length;
    out.push({ jumpOverStep: Number((jump / rms).toFixed(2)), stepsLargerThanSeamPct: Number((larger * 100).toFixed(1)) });
  }
  return { frames, channels: out };
}

async function master(job) {
  const raw = resolve(dir, `${job.take}.mp3`);
  const bounds = await contentBounds(raw, job.endDb);
  const length = bounds.end - bounds.start;
  if (length < CROSSFADE * 3) throw new Error(`${job.take} is too short.`);

  const pre = `atrim=start=${bounds.start.toFixed(3)}:end=${bounds.end.toFixed(3)},asetpts=PTS-STARTPTS${job.mono ? ",pan=mono|c0=0.5*c0+0.5*c1" : ""},`;
  const base = `${pre}loudnorm=I=${job.I}:TP=${job.tp}:LRA=20`;
  const first = await ffmpeg(["-i", raw, "-af", `${base}:print_format=json`, "-f", "null", "-"]);
  const m = lastJson(first.stderr);
  const normFilter = `${base}:linear=true:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:print_format=json,aresample=44100`;
  const norm = resolve(work, `${job.out}_norm.wav`);
  const second = await ffmpeg(["-y", "-i", raw, "-af", normFilter, "-c:a", "pcm_f32le", norm]);
  const mode = lastJson(second.stderr).normalization_type;

  const info = await probe(norm);
  const tailStart = info.duration - CROSSFADE;
  const looped = resolve(work, `${job.out}_loop.wav`);
  await ffmpeg([
    "-y", "-i", norm, "-filter_complex", [
      "[0:a]asplit=3[body][tail][head]",
      `[body]atrim=start=${CROSSFADE}:end=${tailStart.toFixed(6)},asetpts=PTS-STARTPTS[main]`,
      `[tail]atrim=start=${tailStart.toFixed(6)},asetpts=PTS-STARTPTS[end]`,
      `[head]atrim=duration=${CROSSFADE},asetpts=PTS-STARTPTS[start]`,
      `[end][start]acrossfade=d=${CROSSFADE}:curve1=qsin:curve2=qsin[blend]`,
      "[main][blend]concat=n=2:v=0:a=1[loop]",
    ].join(";"), "-map", "[loop]", "-c:a", "pcm_f32le", looped,
  ]);

  const out = resolve(outDir, `${job.out}.mp3`);
  let gainDb = 0;
  for (let pass = 0; pass < 4; pass++) {
    await ffmpeg([
      "-y", "-i", looped, "-af", `volume=${gainDb.toFixed(2)}dB`, "-map_metadata", "-1", "-id3v2_version", "0",
      "-c:a", "libmp3lame", "-b:a", `${job.kbps}k`, "-ar", "44100", "-compression_level", "0",
      ...(job.mono ? ["-ac", "1"] : ["-ac", "2", "-joint_stereo", "1"]), out,
    ]);
    const l = await loudness(out);
    const step = Math.min(job.I - l.lufs, job.tp - l.tp);
    if (Math.abs(step) < 0.15) break;
    gainDb += step;
  }

  const channels = job.mono ? 1 : 2;
  const decoded = await decode(out, { rate: 44100, channels });
  const final = await probe(out);
  const expected = (await probe(looped)).duration;
  return {
    out: job.out,
    take: job.take,
    bounds,
    loudnormMode: mode,
    gainDb: Number(gainDb.toFixed(2)),
    seconds: Number(final.duration.toFixed(3)),
    expectedSeconds: Number(expected.toFixed(3)),
    bytes: final.bytes,
    channels: final.channels,
    ...(await loudness(out)),
    seam: seam(decoded, channels),
    edges: edgeLevels(decoded, channels),
    curve: await loudnessCurve(out, 10),
  };
}

function edgeLevels(x, channels) {
  const win = 4410 * channels;
  const rms = (a, b) => {
    let s = 0;
    for (let i = a; i < b; i++) s += x[i] ** 2;
    return Number(db(Math.sqrt(s / (b - a))).toFixed(1));
  };
  return { headDb: rms(0, win), tailDb: rms(x.length - win, x.length) };
}

mkdirSync(work, { recursive: true });
mkdirSync(outDir, { recursive: true });
const only = process.argv.slice(2);
const results = [];
for (const job of JOBS.filter((j) => !only.length || only.includes(j.out))) {
  try {
    const r = await master(job);
    results.push(r);
    const { curve, ...rest } = r;
    console.log(JSON.stringify(rest));
    console.log("  curve", curve.map((c) => `${c.t}:${c.s}`).join(" "));
  } catch (error) {
    console.error(`Failed ${job.out}: ${error.message.slice(0, 300)}`);
    process.exitCode = 1;
  }
}
writeFileSync(resolve(dir, only.length ? "loops_partial.json" : "loops.json"), JSON.stringify(results, null, 2));
rmSync(work, { recursive: true, force: true });
