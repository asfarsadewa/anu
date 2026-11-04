// Repeated listening check for the Salatiga takes. One pass is not reliable, so each question runs several times.
// Usage: node tools/audio/qa_salatiga.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { redact, srcDir } from "./lib.mjs";

const dir = resolve(srcDir, "music");
const tmp = resolve(dir, "qa_tmp");
mkdirSync(tmp, { recursive: true });
const URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent";

const WHOLE = `Listen to the whole track. Report JSON with these keys:
voice: true if any human singing, humming, sung ooh or aah, choir or speech occurs anywhere.
voice_times: list of [start, end] seconds.
gamelan_audible: 0 to 10, how clearly bronze gamelan metallophones and gongs are heard across the whole piece.
strings_audible: 0 to 10, how clearly a string section is heard across the whole piece.
piano_audible: 0 to 10.
flute_theme: 0 to 10, how memorable and tender the bamboo flute melody is.
arc: 0 to 10, how strong the emotional build to a warm, proud peak is.
peak_time: seconds at the peak.
gamelan_lost_times: list of [start, end] seconds where the gamelan disappears or the piece sounds like a plain western orchestra.
artifacts: list of times with audible glitches or abrupt edits.
ending: one sentence.`;

const EXCERPT = "Report JSON: gamelan_audible (0 to 10), strings_audible (0 to 10), voice (true if any human singing or humming), family (gamelan, western orchestra, mixed gamelan and strings, or other), description (one sentence).";

async function ask(file, question) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: "audio/mpeg", data: readFileSync(file).toString("base64") } }, { text: question }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(240_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return JSON.parse(data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "{}");
    } catch (error) {
      if (attempt === 2) return { error: redact(error) };
    }
  }
}

const TIMELINE_Q = 'Listen closely to this 20 second excerpt. Answer two separate questions. Report JSON: metallophones (true if bronze gamelan metallophones or gongs are clearly heard), bowed_strings (true if sustained bowed violins, violas or cellos are clearly heard, even under other instruments).';
const timeline = process.argv[2] === '--timeline';
const takes = process.argv.slice(timeline ? 3 : 2).length ? process.argv.slice(timeline ? 3 : 2) : ["salatiga_a", "salatiga_b", "salatiga_c"];
if (timeline) {
  const out = {};
  for (const take of takes) {
    const file = resolve(dir, `${take}.mp3`);
    out[take] = [];
    for (let ss = 2; ss < 135; ss += 20) {
      const cut = resolve(tmp, `${take}_${ss}.mp3`);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(ss), "-t", "20", "-i", file, "-c:a", "libmp3lame", "-b:a", "128k", cut]);
      const passes = await Promise.all([1, 2, 3].map(() => ask(cut, TIMELINE_Q)));
      out[take].push({ start: ss, metallophones: passes.filter((a) => a.metallophones === true).length, bowed_strings: passes.filter((a) => a.bowed_strings === true).length, passes: passes.length });
    }
    console.log(take, out[take].map((w) => `${w.start}s G${w.metallophones} S${w.bowed_strings}`).join(" | "));
  }
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(resolve(dir, "salatiga_timeline.json"), JSON.stringify(out, null, 2));
  process.exit(0);
}
const report = {};
for (const take of takes) {
  const file = resolve(dir, `${take}.mp3`);
  const whole = await Promise.all([1, 2, 3].map(() => ask(file, WHOLE)));
  const excerpts = {};
  for (const [label, ss, t] of [["dawn", 3, 30], ["middle", 60, 30], ["late", 100, 30]]) {
    const cut = resolve(tmp, `${take}_${label}.mp3`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(ss), "-t", String(t), "-i", file, "-c:a", "libmp3lame", "-b:a", "128k", cut]);
    excerpts[label] = await Promise.all([1, 2].map(() => ask(cut, EXCERPT)));
  }
  report[take] = { whole, excerpts };
}
rmSync(tmp, { recursive: true, force: true });
writeFileSync(resolve(dir, "salatiga_listening.json"), JSON.stringify(report, null, 2));
for (const [take, r] of Object.entries(report)) {
  console.log(`== ${take}`);
  for (const w of r.whole) console.log(JSON.stringify(w));
  for (const [label, list] of Object.entries(r.excerpts)) {
    for (const e of list) console.log(label, JSON.stringify(e));
  }
}
