// Sends generated audio to a Gemini model for a listening check. The output is advice, never ground truth.
// Usage: node tools/audio/qa_listen.mjs <music|sfx|voice|file ...>
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { outDir, redact, srcDir } from "./lib.mjs";

const MODEL = "gemini-3.8-flash";
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MIME = { ".mp3": "audio/mpeg", ".wav": "audio/wav" };

async function ask(file, question, schema) {
  const body = {
    contents: [{ parts: [
      { inline_data: { mime_type: MIME[extname(file)], data: readFileSync(file).toString("base64") } },
      { text: question },
    ] }],
    generationConfig: { responseMimeType: "application/json", ...(schema ? { responseSchema: schema } : {}) },
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      return JSON.parse(text);
    } catch (error) {
      if (attempt === 2) return { error: redact(error) };
    }
  }
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

const MUSIC_Q = `Listen to the whole track. Report JSON with these keys:
vocals: true if any singing, humming, choir or spoken words occur. vocal_times: list of times if so.
instruments: the instruments you hear.
gamelan_character: 0 to 10, how clearly the track has Javanese or Balinese gamelan timbres (metallophones, gong, bamboo flute, hand drum).
arc: one sentence on how the piece develops over time, with time stamps.
abrupt_changes: list of time stamps where the music changes in a jarring way or the mix glitches.
mood: 3 words.
artifacts: audible distortion, warble or digital artefacts, with time stamps.
ending: one sentence on how the piece ends and whether it feels resolved.
melody_memorable: 0 to 10.`;

const SFX_Q = `Listen to this short sound effect. Report JSON with these keys:
description: one literal sentence describing what you hear.
event_count: number of separate impacts or events.
speech: true if any intelligible speech occurs.
music: true if any music occurs.
matches_brief: 0 to 10 for how well it matches this brief: `;

const VOICE_SCHEMA = {
  type: "OBJECT",
  properties: {
    transcript: { type: "STRING" },
    speaker_gender: { type: "STRING", enum: ["female", "male", "unclear"] },
    speaker: { type: "STRING" },
    apparent_age: { type: "STRING" },
    warmth: { type: "INTEGER" },
    extra_or_missing_words: { type: "STRING" },
  },
};
const VOICE_Q = "Transcribe the Indonesian speech exactly. Report JSON: transcript, speaker_gender, speaker (one short phrase on the voice), apparent_age, warmth (0 to 10), extra_or_missing_words (compare with this script line, write none if identical): ";

const mode = process.argv[2];
if (mode === "music") {
  const dir = resolve(srcDir, "music");
  const files = ["theme_a", "theme_b", "theme_c", "win"].map((n) => resolve(dir, `${n}.mp3`));
  const results = await pool(files, 2, async (f) => ({ file: basename(f), ...(await ask(f, MUSIC_Q)) }));
  writeFileSync(resolve(dir, "listening.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} else if (mode === "sfx") {
  const { SFX } = await import("./gen_sfx.mjs");
  const only = process.argv.slice(3);
  const list = SFX.filter((s) => !only.length || only.includes(s.id));
  const results = await pool(list, 4, async (s) => ({
    id: s.id,
    ...(await ask(resolve(outDir, "sfx", `${s.id}.mp3`), SFX_Q + s.brief)),
  }));
  const path = resolve(srcDir, "sfx", "listening.json");
  const old = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
  const merged = [...old.filter((o) => !results.some((r) => r.id === o.id)), ...results];
  writeFileSync(path, JSON.stringify(merged, null, 2));
  console.log(JSON.stringify(results, null, 1));
} else if (mode === "voice") {
  const lines = JSON.parse(readFileSync(resolve(outDir, "voice", "lines.json"), "utf8"));
  const only = process.argv.slice(3);
  const list = lines.filter((l) => !only.length || only.includes(l.id));
  const results = await pool(list, 4, async (l) => ({
    id: l.id,
    script: l.id_text,
    ...(await ask(resolve(outDir, "voice", `${l.id}.mp3`), VOICE_Q + l.id_text, VOICE_SCHEMA)),
  }));
  writeFileSync(resolve(srcDir, "voice", "listening.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 1));
} else {
  const files = process.argv.slice(2).filter((f) => existsSync(f));
  if (!files.length) throw new Error(`No input. Files in source: ${readdirSync(srcDir).join(", ")}`);
  const results = await pool(files, 4, async (f) => ({ file: f.split(/[\\/]/).slice(-2).join("/"), ...(await ask(f, VOICE_Q + "(no script)", VOICE_SCHEMA)) }));
  console.log(JSON.stringify(results, null, 1));
}
