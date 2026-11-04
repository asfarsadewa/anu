// Generates the Lyria raw takes for the Anu theme and win cue, then measures them.
// Usage: node tools/audio/gen_music.mjs
// Existing raw takes are skipped. The script sends one request plus at most one retry per take.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { clipping, isMain, loudness, loudnessCurve, meanVolume, probe, redact, retryOnce, silences, spectrum, srcDir } from "./lib.mjs";

const dir = resolve(srcDir, "music");
const SUFFIX = " Instrumental only. No vocals, no lyrics, no spoken words, no choir.";

export const TAKES = [
  {
    name: "theme_a",
    prompt:
      "Original instrumental main theme for a town-building game. A small Indonesian village wakes at sunrise and slowly grows into a town. Warm and hopeful. Javanese gamelan colours in a gentle slendro feel: gender metallophone, saron, suling bamboo flute, soft gong, kendang hand drum, over a gentle modern string pad. Duration about 100 seconds, with a clear arc. Opening: solo suling and soft gender over a very quiet pad, spacious, like first light. Then saron states a simple singable melody. Then kendang enters at a walking pulse and the strings swell. Then the full ensemble reaches a warm bright peak. Last phrase: the melody resolves on the home note and one soft gong rings out." + SUFFIX,
  },
  {
    name: "theme_b",
    prompt:
      "Original title music for a game about building a village in Indonesia. Balinese and Javanese gamelan timbres: shimmering interlocking gender and saron patterns, a breathy suling bamboo flute lead, kendang hand drum, soft gong marking long phrases, all floating on a warm modern string pad. Mood: hopeful, gentle, morning sun over rice terraces. Length about 110 seconds. Build in three clear stages. Stage one is sparse and hushed. Stage two adds the interlocking metallophones and a light drum pulse. Stage three is the widest and brightest, with strings carrying long rising lines under the flute. End with a calm resolved cadence and a soft gong." + SUFFIX,
  },
  {
    name: "theme_c",
    prompt:
      "Original melody-first instrumental theme, warm and hopeful, for a small Indonesian village that grows into a town. One memorable eight-bar melody, stated three times, each statement fuller than the last. First statement: suling bamboo flute alone with soft gender metallophone and a faint string pad, at sunrise. Second statement: saron plays the melody, gender decorates it, kendang hand drum adds a light steady groove, soft gong marks the phrase ends. Third statement: the whole gamelan with a full warm modern string section, gentle and generous, never aggressive. Finish on a quiet resolved cadence with one soft gong stroke ringing out. Duration about 100 seconds. Moderate tempo, clean mix." + SUFFIX,
  },
  {
    name: "salatiga_a",
    prompt:
      "Original instrumental score, about 150 seconds, for the final chapter of a game about a Javanese town. A cool highland dawn on the slope of a great volcano. The town wakes and grows. Central Javanese gamelan in slendro, clearly audible and prominent in the mix for the whole piece: gender metallophone, saron, soft bonang gong-chimes, one warm large gong. A lush modern string section and soft felt piano stay present and audible throughout, playing long warm lines under and around the gamelan. Lead: a suling bamboo flute with one memorable, tender theme. Arc: first the suling theme alone over gender, soft piano and hushed strings, cool and spacious. Then saron and bonang take up the same theme while the strings grow. Then kendang hand drum enters as the town gets busy, with a steady walking pulse. Then the whole ensemble reaches a proud, warm peak, with strings soaring and the gamelan ringing clearly on top. Then it settles back to the suling theme and one soft gong stroke. No fade out." + SUFFIX + " No soprano, no humming.",
  },
  {
    name: "salatiga_b",
    prompt:
      "Original orchestral-gamelan piece, tender and proud, about 140 seconds, instrumental. Picture cold clear morning air on a mountainside in Central Java, then a town below it coming to life. Equal partners in the mix: a Central Javanese gamelan in slendro tuning (gender, saron, soft bonang, warm gong, later kendang) and a lush contemporary string section with soft piano. The bronze metallophones must ring clearly in front at all times, and the strings must always be heard beneath them. A suling bamboo flute sings a simple, heart-tugging melody of eight bars that returns three times, each return bigger. Slow start, gentle growth, kendang joins at the midpoint with a light busy groove, the third return of the melody is the emotional summit, warm and full, with piano and strings swelling. A short calm coda ends on the same quiet chord that opened the piece, so the end can flow into the beginning." + SUFFIX + " No soprano, no humming.",
  },
  {
    name: "salatiga_c",
    prompt:
      "Original instrumental theme, about 150 seconds, a love letter to a small cool hill town in Central Java under a great volcano. Mood: tender, then busy and happy, then deeply proud. Instruments, all clearly audible: suling bamboo flute melody, gender and saron metallophones in slendro playing clear patterned figures, soft bonang, warm deep gong on long phrase ends, kendang hand drum from the middle onward, intimate soft piano, and a rich modern string section with warm cellos and violas. Section one, dawn: piano and gender, suling enters with the main melody, strings like mist. Section two, the town wakes: saron and bonang join, the melody passes to violins with the gamelan answering it. Section three, the busy day: kendang groove, faster gender patterns, moving cellos. Section four, the peak: full strings and full gamelan together play the melody broadly with pride and warmth. Section five: everything falls away to suling, piano and a gong, returning to the opening mood." + SUFFIX + " No soprano, no humming.",
  },
  {
    name: "play_plan",
    prompt:
      "Original instrumental background cue, about 80 seconds, for the thinking phase of a town-building game. A calm Indonesian town in the morning. A soft, slow gamelan pulse with gender metallophone, a sparse suling bamboo flute with long rests, and a gentle modern pad. Sparse and quiet, with plenty of open space so sound effects sit on top. Steady level from start to end, no build, no climax, no ending cadence, no drums fill. The last bars must flow back into the first bars." + SUFFIX,
  },
  {
    name: "play_run",
    prompt:
      "Original instrumental background cue, about 80 seconds, for the action phase of a town-building game. An Indonesian town busy and moving. A steady kendang hand drum pulse, saron and bonang interlocking in a clear repeating pattern, warm and forward with a little energy, a light modern pad underneath. Keep the texture open and uncluttered so sound effects sit on top, no high shrill parts. Steady level from start to end, no climax, no ending cadence. The last bars must flow back into the first bars." + SUFFIX,
  },
  {
    name: "play_danger",
    prompt:
      "Original instrumental background cue, about 70 seconds, for a natural disaster in a town-building game. Tense and urgent, never horror. Low deep gong strokes, gamelan in pelog tuning, a driving kendang hand drum, urgent low strings playing short repeated figures. Keep the mids open and uncluttered so sound effects sit on top, no shrieks, no stingers. Steady intensity from start to end, no ending cadence. The last bars must flow back into the first bars." + SUFFIX,
  },
  {
    name: "win",
    prompt:
      "A very short resolved victory flourish, 8 seconds long, on Javanese gamelan. A quick rising run on saron and gender metallophone, a short kendang hand drum pickup, then a final chord on the home note with one soft gong stroke that rings out and decays to silence. Warm and happy. Nothing plays after the gong." + SUFFIX,
  },
];

async function requestLyria(take, rawFile, receiptFile) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set.");
  const started = Date.now();
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ model: "lyria-3.5", input: take.prompt, response_format: { type: "audio" } }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`Lyria HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`);
  const data = await response.json();
  const blocks = (data.steps ?? []).flatMap((s) => s.content ?? []);
  const audio = blocks.find((b) => b.type === "audio" && b.data);
  if (!audio) throw new Error(`Lyria returned no audio block. Status ${data.status}.`);
  const buffer = Buffer.from(audio.data, "base64");
  if (buffer.length < 1024) throw new Error("Lyria audio block is too small.");
  writeFileSync(rawFile, buffer);
  writeFileSync(receiptFile, JSON.stringify({
    model: "lyria-3.5",
    prompt: take.prompt,
    interactionId: data.id,
    status: data.status,
    mime: audio.mime_type,
    seconds: (Date.now() - started) / 1000,
    text: blocks.filter((b) => b.type === "text").map((b) => b.text),
  }, null, 2));
}

export async function measure(file) {
  const info = await probe(file);
  const loud = await loudness(file);
  const curve = await loudnessCurve(file, 5);
  const gaps = await silences(file, { noise: -50, min: 0.2 });
  const lead = gaps[0] && gaps[0].start < 0.05 ? gaps[0].end ?? info.duration : 0;
  const lastGap = gaps[gaps.length - 1];
  const trail = lastGap && lastGap.end === null ? info.duration - lastGap.start : 0;
  const inner = gaps.filter((g) => g.start >= 0.05 && g.end !== null).map((g) => `${g.start.toFixed(1)}-${g.end.toFixed(1)}`);
  const mid = await meanVolume(file, "pan=mono|c0=0.5*c0+0.5*c1");
  const side = await meanVolume(file, "pan=mono|c0=0.5*c0-0.5*c1");
  return {
    ...info,
    ...loud,
    clip: await clipping(file),
    spectrum: await spectrum(file),
    leadSilence: Number(lead.toFixed(2)),
    trailSilence: Number(trail.toFixed(2)),
    innerGaps: inner,
    sideOverMidDb: Number((side - mid).toFixed(1)),
    curve,
  };
}

if (isMain(import.meta.url)) {
  mkdirSync(dir, { recursive: true });
  const results = {};
  await Promise.all(TAKES.map(async (take) => {
    const rawFile = resolve(dir, `${take.name}.mp3`);
    const receiptFile = resolve(dir, `${take.name}.json`);
    if (existsSync(rawFile)) {
      console.log(`Skip ${take.name}: the raw take exists.`);
    } else {
      try {
        await retryOnce(take.name, () => requestLyria(take, rawFile, receiptFile));
        console.log(`Generated ${take.name}.`);
      } catch (error) {
        console.error(`FAILED ${take.name}: ${redact(error)}`);
        process.exitCode = 1;
        return;
      }
    }
    results[take.name] = await measure(rawFile);
    const receipt = JSON.parse(readFileSync(receiptFile, "utf8"));
    if (receipt.text?.length) results[take.name].modelText = receipt.text;
  }));
  writeFileSync(resolve(dir, "measurements.json"), JSON.stringify(results, null, 2));
  for (const [name, m] of Object.entries(results)) {
    const { curve, ...rest } = m;
    console.log(name, JSON.stringify(rest));
    console.log("  curve", curve.map((c) => `${c.t}:${c.s}`).join(" "));
  }
}
