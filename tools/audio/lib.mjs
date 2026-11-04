// Shared helpers for the Anu audio pipeline. No npm packages. Uses ffmpeg and ffprobe from PATH.
import { execFile as execFileCb } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const srcDir = resolve(root, ".audio-src");
export const outDir = resolve(root, "public", "audio");

const BIG = { maxBuffer: 1 << 30, windowsHide: true };

export function isMain(metaUrl) {
  return fileURLToPath(metaUrl) === resolve(process.argv[1] ?? "");
}

export function redact(message) {
  let text = message instanceof Error ? message.message : String(message);
  for (const name of ["GEMINI_API_KEY", "GOOGLE_API_KEY", "ELEVENLABS_API_KEY"]) {
    const key = process.env[name];
    if (key) text = text.split(key).join("[redacted]");
  }
  return text.replace(/[\r\n]+/g, " ").slice(0, 800);
}

export async function ffmpeg(args) {
  return execFile("ffmpeg", ["-hide_banner", "-nostats", ...args], { ...BIG, encoding: "utf8" });
}

export async function probe(file) {
  const { stdout } = await execFile(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=codec_name,channels,sample_rate,bit_rate:format=duration,bit_rate", "-of", "json", file],
    { ...BIG, encoding: "utf8" },
  );
  const data = JSON.parse(stdout);
  const s = data.streams?.[0] ?? {};
  return {
    duration: Number(data.format?.duration),
    codec: s.codec_name,
    channels: s.channels,
    sampleRate: Number(s.sample_rate),
    bitRate: Number(s.bit_rate ?? data.format?.bit_rate),
    bytes: statSync(file).size,
  };
}

// Integrated loudness, loudness range and true peak from the ebur128 filter.
// Short clips can pass pad seconds of silence: the gate removes silence from the integrated value.
export async function loudness(file, { pad = 0 } = {}) {
  const af = (pad ? `apad=pad_dur=${pad},` : "") + "ebur128=peak=true:framelog=quiet";
  const { stderr } = await ffmpeg(["-i", file, "-af", af, "-f", "null", "-"]);
  const tail = stderr.slice(stderr.lastIndexOf("Summary:"));
  const num = (re) => {
    const m = tail.match(re);
    return m ? Number(m[1]) : NaN;
  };
  return { lufs: num(/I:\s+(-?[\d.]+) LUFS/), lra: num(/LRA:\s+(-?[\d.]+) LU/), tp: num(/Peak:\s+(-?[\d.]+) dBFS/) };
}

// Short-term loudness curve, one value per window of `step` seconds.
export async function loudnessCurve(file, step = 5) {
  const { stderr } = await ffmpeg(["-v", "verbose", "-i", file, "-af", "ebur128=framelog=verbose", "-f", "null", "-"]);
  const buckets = new Map();
  for (const m of stderr.matchAll(/t:\s*([\d.]+)\s+TARGET:.*?S:\s*(-?[\d.]+|-inf)/g)) {
    const t = Number(m[1]);
    const s = m[2] === "-inf" ? -120 : Number(m[2]);
    const b = Math.floor(t / step);
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b).push(s);
  }
  return [...buckets.keys()].sort((a, b) => a - b).map((b) => {
    const v = buckets.get(b);
    return { t: b * step, s: Number((v.reduce((a, c) => a + c, 0) / v.length).toFixed(1)) };
  });
}

export async function silences(file, { noise = -50, min = 0.2 } = {}) {
  const { stderr } = await ffmpeg(["-i", file, "-af", `silencedetect=noise=${noise}dB:d=${min}`, "-f", "null", "-"]);
  const starts = [...stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end: (-?[\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((s, i) => ({ start: Math.max(0, s), end: ends[i] ?? null }));
}

export async function meanVolume(file, filter) {
  const af = (filter ? `${filter},` : "") + "volumedetect";
  const { stderr } = await ffmpeg(["-i", file, "-af", af, "-f", "null", "-"]);
  return Number(stderr.match(/mean_volume: (-?[\d.]+|-inf)/)?.[1] ?? NaN);
}

// Band energy relative to the full-band mean level. Used for the spectrum check.
export const BANDS = {
  sub_20_60: "highpass=f=20,lowpass=f=60",
  low_60_250: "highpass=f=60,lowpass=f=250",
  mid_250_2k: "highpass=f=250,lowpass=f=2000",
  pres_2k_8k: "highpass=f=2000,lowpass=f=8000",
  air_8k_16k: "highpass=f=8000,lowpass=f=16000",
};

export async function spectrum(file) {
  const full = await meanVolume(file);
  const out = { full };
  for (const [name, filter] of Object.entries(BANDS)) {
    const v = await meanVolume(file, filter);
    out[name] = Number((v - full).toFixed(1));
  }
  return out;
}

export async function clipping(file) {
  const { stderr } = await ffmpeg(["-i", file, "-af", "astats=metadata=0:measure_overall=Flat_factor+Peak_count+Peak_level:measure_perchannel=0", "-f", "null", "-"]);
  const pick = (name) => Number(stderr.match(new RegExp(`Overall[\\s\\S]*?${name}: (-?[\\d.]+)`))?.[1] ?? NaN);
  return { flatFactor: pick("Flat factor"), peakCount: pick("Peak count"), peakLevel: pick("Peak level dB") };
}

export async function decode(file, { rate = 24000, channels = 1 } = {}) {
  const { stdout } = await execFile(
    "ffmpeg",
    ["-v", "error", "-i", file, "-ac", String(channels), "-ar", String(rate), "-f", "f32le", "-"],
    { ...BIG, encoding: "buffer" },
  );
  return new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.length / 4)).slice();
}

export function wavFromPcm16(pcm, rate, channels = 1) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2 * channels, 28);
  header.writeUInt16LE(2 * channels, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function writeWavFloat(file, samples, rate) {
  mkdirSync(dirname(file), { recursive: true });
  const body = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    body.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  writeFileSync(file, wavFromPcm16(body, rate));
}

export function db(v) {
  return v > 0 ? 20 * Math.log10(v) : -120;
}

// Seam check for a loop. Compares the jump across the wrap point with the sample steps inside the file.
export function seamReport(x, rate) {
  const n = x.length;
  let sum = 0;
  for (let i = 1; i < n; i++) sum += (x[i] - x[i - 1]) ** 2;
  const rmsStep = Math.sqrt(sum / (n - 1));
  const jump = Math.abs(x[0] - x[n - 1]);
  const win = Math.floor(0.05 * rate);
  const rms = (from, to) => {
    let s = 0;
    for (let i = from; i < to; i++) s += x[i] ** 2;
    return Math.sqrt(s / (to - from));
  };
  return {
    samples: n,
    jumpOverStep: Number((jump / rmsStep).toFixed(2)),
    headDb: Number(db(rms(0, win)).toFixed(1)),
    tailDb: Number(db(rms(n - win, n)).toFixed(1)),
  };
}

export async function retryOnce(label, fn) {
  try {
    return await fn();
  } catch (error) {
    console.warn(`${label}: attempt 1 failed: ${redact(error)}. Retrying once.`);
    return fn();
  }
}
