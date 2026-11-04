// Generates ElevenLabs sound effects for Anu and encodes them to public/audio/sfx.
// Usage: node tools/audio/gen_sfx.mjs [id ...]
// Existing raw takes in .audio-src/sfx are skipped. The script always rebuilds the encoded files.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { db, decode, ffmpeg, isMain, loudness, outDir, probe, redact, retryOnce, seamReport, srcDir, wavFromPcm16, writeWavFloat } from "./lib.mjs";

const RATE = 24000;
const KBPS = 32;
const TARGET_TP = -3;
const XFADE = 1;
const rawDir = resolve(srcDir, "sfx");
const finalDir = resolve(outDir, "sfx");

// d: requested seconds. cap: longest trimmed length. inf: prompt_influence.
// loop: final loop length in seconds. The request asks for one extra second, which the crossfade consumes.
// take: raw take number. A retake writes <id>.t<take>.wav and keeps the older raw file.
const FIRST_TAKES = [
  { id: "hammer", brief: "single hammer strike on a bamboo and timber frame, short, dry", d: 1.0, cap: 0.6, inf: 0.6,
    prompt: "One single hammer strike on a lashed bamboo and timber frame. Short, dry, close foley. One hit only, no reverb, no music." },
  { id: "saw", brief: "short hand saw stroke on wood, one stroke", d: 1.2, cap: 1.0, inf: 0.6,
    prompt: "One single stroke of a hand saw cutting into dry wood, one push only. Close, dry foley, no music." },
  { id: "lash", brief: "bamboo poles knocking together, rope tightening, short", d: 1.5, cap: 1.2, inf: 0.6,
    prompt: "Bamboo poles knocking together twice, then a rope pulled tight with a short creak. Short, dry, close foley, no music." },
  { id: "brick", brief: "a clay brick set on mortar with a trowel tap, short", d: 1.2, cap: 0.9, inf: 0.6,
    prompt: "A clay brick set down on wet mortar, then one small metal trowel tap. Short, close foley, no music." },
  { id: "thud", brief: "a heavy wooden beam dropped on soil, with a small dust whump", d: 1.2, cap: 1.0, inf: 0.6,
    prompt: "A heavy wooden beam dropped on soft soil, one deep thud with a small dust whump. Close foley, no reverb, no music." },
  { id: "tile", brief: "clay roof tiles clinking as they are stacked, short", d: 1.2, cap: 1.0, inf: 0.6,
    prompt: "Clay roof tiles clinking as a few are stacked together. Short, close foley, no music." },
  { id: "dig", brief: "a hoe chopping into wet soil, one stroke", d: 1.0, cap: 0.7, inf: 0.6,
    prompt: "One stroke of a hoe chopping into wet soil, a single wet chop. Close foley, no music." },
  { id: "splash", brief: "small water splash, short", d: 1.0, cap: 0.8, inf: 0.6,
    prompt: "A small water splash, one small stone dropped into a pond. Short, close, no music." },
  { id: "creak", brief: "a bamboo water wheel creaking, 1 to 2 seconds", d: 2.0, cap: 2.0, inf: 0.6,
    prompt: "A bamboo water wheel turning slowly, a wooden creak and groan with light dripping water. Outdoor foley, no music." },
  { id: "collapse", brief: "a small wooden house collapsing, timber and clay tiles falling, 2 seconds", d: 2.5, cap: 2.2, inf: 0.6,
    prompt: "A small wooden house collapsing: timber beams cracking, clay roof tiles falling and smashing, then debris settling. No music, no voices." },
  { id: "kentongan", brief: "a Javanese wooden slit drum struck in a fast warning rhythm, 2 seconds", d: 2.0, cap: 2.0, inf: 0.7,
    prompt: "A hollow wooden slit drum struck by a stick in a fast urgent alarm rhythm, solo hollow wooden knocks, an Indonesian village warning signal. No other instruments, no music, no voices." },
  { id: "rumble", brief: "deep earthquake ground rumble, 3 seconds", d: 3.0, cap: 3.0, inf: 0.6,
    prompt: "Deep earthquake ground rumble, low frequency, the earth shaking with faint rattling. No music, no voices." },
  { id: "thunder", brief: "distant tropical thunder clap, 3 seconds", d: 3.0, cap: 3.0, inf: 0.6,
    prompt: "Distant tropical thunder, one clap rolling away over open land. No rain, no music." },
  { id: "eruption", brief: "distant volcanic eruption boom with rolling low rumble, 4 seconds", d: 4.0, cap: 4.0, inf: 0.6,
    prompt: "Distant volcanic eruption, one huge low boom followed by a rolling low rumble that fades. No music, no voices." },
  { id: "ui_tap", brief: "soft wooden tick for a button press, very short", d: 0.5, cap: 0.12, inf: 0.8,
    prompt: "One soft wooden tick, a tiny dry tap on a small wooden block, very short, button press sound. One hit only, no reverb, no music." },
  { id: "ui_place", brief: "soft wooden knock with a small earthy thump for placing a piece, very short", d: 0.5, cap: 0.25, inf: 0.8,
    prompt: "One soft wooden knock with a small earthy thump, a small wooden piece placed on soil, very short. One hit only, no reverb, no music." },
  { id: "ui_bad", brief: "dull muted wood knock for an invalid action, very short", d: 0.5, cap: 0.25, inf: 0.8,
    prompt: "One dull muted wooden knock, flat and dead, low pitched, very short, error sound. One hit only, no reverb, no music." },
  { id: "harvest", brief: "rice stalks rustling with a soft cheerful chime, 1 second", d: 1.2, cap: 1.1, inf: 0.6,
    prompt: "Dry rice stalks rustling in a hand, with one soft cheerful small metal chime. Short, no music, no voices." },
  { id: "cheer", brief: "a few villagers giving a short happy cheer, distant, 2 seconds, no intelligible words", d: 2.0, cap: 2.2, inf: 0.6,
    prompt: "A few villagers, a small group, giving a short happy wordless cheer from a distance, hooray sounds outdoors, no intelligible words, no music." },
  { id: "pump", brief: "a small diesel water pump running, 2 seconds", d: 2.0, cap: 2.0, inf: 0.7,
    prompt: "A small diesel water pump running steadily, a chugging single-cylinder engine with water gurgling in a hose. Outdoor foley, no music, no voices." },
  { id: "moped", brief: "a small motorbike passing in the distance, 2 seconds", d: 2.0, cap: 2.0, inf: 0.7,
    prompt: "One small motorbike passing in the distance, the engine note rises and falls as it goes by. Outdoor, far away, no music, no voices." },
  { id: "horn", brief: "a small minibus horn, two short beeps, a little distant", d: 1.5, cap: 1.4, inf: 0.8,
    prompt: "A small minibus horn, two short beeps, beep beep, a little distant on a town street. No engine, no music, no voices." },
  { id: "bakso", brief: "a street vendor tapping a bowl with a spoon, ting ting ting, distant, no voice", d: 2.0, cap: 1.8, inf: 0.85,
    prompt: "A metal spoon tapping a ceramic soup bowl three times, ting ting ting, a street food seller heard from down the street. Distant, no voice, no music." },
  { id: "rooster", brief: "one rooster crow, distant", d: 2.5, cap: 2.5, inf: 0.8,
    prompt: "One single rooster crow far away in a village. Distant outdoor recording, one crow only, no music, no voices." },
  { id: "schoolbell", brief: "a hand-struck iron school bell, a few strikes, distant", d: 3.0, cap: 3.0, inf: 0.85,
    prompt: "A hanging piece of iron struck by hand as a school bell, four or five clanging strikes, heard from a distance across a schoolyard. No music, no voices." },
  { id: "bedug", brief: "a mosque drum (bedug) struck a few times, deep, distant, no voice", d: 3.5, cap: 3.5, inf: 0.85,
    prompt: "A very large deep wooden barrel drum struck slowly by a mallet, three deep booming strokes, heard from a distance in a quiet town. Solo drum only, no voice, no chanting, no singing, no music." },
  { id: "churchbell", brief: "a small church bell, a few strokes, distant", d: 3.5, cap: 3.5, inf: 0.85,
    prompt: "A small church bell struck slowly, three or four clear strokes, heard from a distance over a town. Solo bell, no choir, no voices, no music." },
  { id: "templegong", brief: "a small Chinese temple gong and a wooden fish, one soft phrase, distant", d: 3.5, cap: 3.5, inf: 0.85,
    prompt: "A small bronze temple gong struck softly once, with a hollow wooden block knocking a slow steady pattern, one soft phrase, heard from a distance. No chanting, no voices, no music." },
  { id: "boat", brief: "a small outboard fishing boat passing, 3 s", d: 3.0, cap: 3.0, inf: 0.8,
    prompt: "A small outboard motor fishing boat passing by on the water, the engine rises and falls, light water slap. Outdoor, no music, no voices." },
  { id: "gull", brief: "a sea bird call, distant", d: 1.5, cap: 1.5, inf: 0.8,
    prompt: "One sea bird calling twice, far away over a beach. Distant, no waves, no music, no voices." },
  { id: "tokek", brief: "a tokay gecko calling, 4 or 5 calls", d: 5.0, cap: 5.0, inf: 0.9,
    prompt: "A tokay gecko calling at night, a loud clear two-note to-kay call repeated five times with short gaps. Close, quiet background, no music, no voices." },
  { id: "dog", brief: "one dog barking twice, far away", d: 1.5, cap: 1.5, inf: 0.85,
    prompt: "One dog barking twice, woof woof, far away in a village at night. Distant, no music, no voices." },
  { id: "becak", brief: "a bicycle bell, two rings, distant", d: 1.2, cap: 1.2, inf: 0.85,
    prompt: "A small thumb-operated bicycle bell ringing twice, ring ring, a little distant on a street. No music, no voices." },
  { id: "train_horn", brief: "Indonesian diesel train horn, two long notes, distant", d: 3.5, cap: 3.5, inf: 0.8,
    prompt: "A diesel locomotive horn, two long loud notes, heard from a distance across a town. Horn only, no music, no voices." },
  { id: "crossing_bell", brief: "Indonesian level crossing bell, fast ting-ting-ting, 3 s", d: 3.0, cap: 3.0, inf: 0.85,
    prompt: "A railway level crossing warning bell ringing fast and steadily, ting ting ting ting ting, a small electric gong bell at a road crossing. Outdoor, no train, no music, no voices." },
  { id: "train_pass", brief: "a train passing over rail joints, 4 s", d: 4.0, cap: 4.0, inf: 0.8,
    prompt: "A passenger train passing by, steel wheels clacking over rail joints, clack-clack clack-clack, the rhythm passes and fades a little. Outdoor, no horn, no music, no voices." },
  { id: "steam_chuff", brief: "a steam locomotive chuffing slowly uphill, 4 s, loop-safe", loop: 4, inf: 0.85,
    prompt: "A heavy steam locomotive chuffing slowly uphill at a steady pace, regular deep chuff, chuff, chuff, chuff, hissing steam between beats. Seamless loop, no whistle, no music, no voices." },
  { id: "bus_hiss", brief: "a bus door air hiss and a soft engine, 1 s", d: 1.2, cap: 1.1, inf: 0.8,
    prompt: "A bus door opening with one short air brake hiss, a soft diesel engine idling behind it. Close foley, no music, no voices." },
  { id: "rain_loop", brief: "steady tropical rain on leaves and thatch", loop: 8, inf: 0.5,
    prompt: "Steady tropical rain falling on broad leaves and palm thatch, even intensity, seamless loop, no thunder, no music, no voices." },
  { id: "river_loop", brief: "small river flowing over stones", loop: 8, inf: 0.5,
    prompt: "A small river flowing steadily over stones, even babbling water, seamless loop, no music, no voices." },
  { id: "wind_loop", brief: "warm coastal wind through palm fronds", loop: 8, inf: 0.5,
    prompt: "Warm coastal wind blowing steadily through palm fronds, rustling leaves, even intensity, seamless loop, no music, no voices." },
  { id: "sea_loop", brief: "gentle waves on a shallow beach", loop: 8, inf: 0.5,
    prompt: "Gentle small waves lapping on a shallow sandy beach, calm and even, seamless loop, no gulls, no music, no voices." },
  { id: "village_loop", brief: "quiet Indonesian village daytime ambience, roosters far away, insects, no speech", loop: 10, inf: 0.5,
    prompt: "Quiet tropical village daytime ambience: roosters crowing far away, insects buzzing, a soft breeze. Seamless loop, no speech, no voices, no music, no vehicles." },
  { id: "traffic_loop", brief: "distant Indonesian town street, mopeds and a far horn, no speech", loop: 8, inf: 0.6,
    prompt: "Distant Indonesian town street ambience: small motorbikes and mopeds passing far away, one far car horn, soft city hum. Seamless loop, no speech, no voices, no music." },
  { id: "market_loop", brief: "Indonesian wet market, crowd murmur, crates, scales, no intelligible words", loop: 10, inf: 0.6,
    prompt: "Busy indoor wet market ambience: an indistinct low crowd murmur with no clear words, wooden crates set down, the clink of hanging metal scales, plastic bags rustling. Seamless loop, no intelligible speech, no music." },
  { id: "night_loop", brief: "tropical town at night, crickets, frogs, very far traffic", loop: 10, inf: 0.6,
    prompt: "Tropical town at night: crickets, frogs croaking, and a very faint far away traffic hum. Seamless loop, no speech, no voices, no music." },
  { id: "construction_loop", brief: "distant hammering, a hand saw, bamboo knocks", loop: 10, inf: 0.7,
    prompt: "Distant building site ambience with no machines: slow hand hammering, a hand saw cutting wood, hollow bamboo poles knocking. Far away, seamless loop, no speech, no voices, no music." },
  { id: "flood_loop", brief: "fast brown flood water rushing through streets", loop: 10, inf: 0.7,
    prompt: "Fast heavy flood water rushing through town streets, a powerful turbulent torrent with debris knocking. Seamless loop, no speech, no voices, no music." },
  { id: "kite_loop", brief: "the low drone of a large Balinese kite with a bamboo hummer (sendaren), in wind", loop: 10, inf: 0.8,
    prompt: "The low steady humming drone of a large kite with a bamboo hummer vibrating high in the wind, a woody buzzing moan that swells gently, soft wind behind it. Seamless loop, no speech, no voices, no music." },
  { id: "rainzinc_loop", brief: "heavy rain on zinc and tile roofs in a town, gutters running", loop: 10, inf: 0.7,
    prompt: "Heavy rain drumming on corrugated zinc and clay tile roofs in a town, gutters running and spilling water. Even intensity, seamless loop, no thunder, no speech, no voices, no music." },
  { id: "pump_run_loop", brief: "a small diesel water pump running steadily", loop: 10, inf: 0.7,
    prompt: "A small diesel water pump running steadily, a chugging single-cylinder engine at constant speed with water gurgling. Even and constant, seamless loop, no speech, no voices, no music." },
  { id: "jam_loop", brief: "a jammed Indonesian street, many idling mopeds, scattered horns, no speech", loop: 10, inf: 0.6,
    prompt: "A jammed Asian town street at a standstill: many small motorbikes idling together, scattered short horns from different distances, nobody moving. Seamless loop, no speech, no voices, no music." },
];

// Retakes use a more literal prompt. The older raw take stays in .audio-src/sfx. PROMPTS.md records the reason.
const RETAKES = {
  jam_loop: { take: 2, inf: 0.8, prompt: "A constant dense wall of many small motorbike engines idling together in a traffic jam, always audible at a steady level, with a few short horns scattered far back in the mix. Field recording in the middle of a jammed Asian street. Seamless loop, no speech, no voices, no music." },
  schoolbell: { take: 2, inf: 0.9, prompt: "A length of old iron rail hanging from a rope, struck by a steel rod as a school bell: four slow dull iron clanks, clank, clank, clank, clank, heard from a distance across a yard. Not a brass bell, no shaking. No music, no voices." },
  // Foley edit: take 3 is the wooden fish. mix adds the gong of take 2. No single take held both.
  templegong: { take: 3, d: 3.5, inf: 0.9, mix: { file: "templegong.t2.wav", gainDb: -3, delay: 0, d: 3.5, inf: 0.9, prompt: "A hollow wooden temple block knocked slowly, tok, tok, tok, tok, tok, then one soft small bronze gong stroke that rings out, heard from a distance. Two instruments only. No chanting, no voices, no music." }, prompt: "A hollow wooden fish temple block knocked slowly and evenly, five dry hollow knocks, tok, tok, tok, tok, tok, heard from a distance. Wood only, no metal, no gong, no chanting, no voices, no music." },
  dog: { take: 2, inf: 0.9, prompt: "One dog barking twice, very far away across a valley at night, faint with a soft echo, woof, woof. Very distant and quiet, no music, no voices." },
  moped: { take: 2, inf: 0.85, prompt: "A small 110cc Asian underbone motorbike with a thin buzzing putt-putt engine, heard from far away, slowly riding past at low speed on a village road and fading. Quiet and distant, field recording, no music, no voices." },
  traffic_loop: { take: 3, inf: 0.45, prompt: "Distant city traffic ambience heard from several streets away, a constant soft wash of far scooters and light traffic, one faint horn, urban room tone. Seamless loop, no speech, no voices, no music." },
  lash: { take: 2, inf: 0.85, prompt: "Two hollow bamboo poles clacking together, clack clack, then a thick rope creaking as it is pulled tight. Wooden foley sounds only, no human voice." },
  brick: { take: 2, inf: 0.85, prompt: "A heavy clay brick pressed down onto wet mortar with a soft gritty thud, then one light tap of a steel trowel on the brick. Close foley, building site, no music." },
  tile: { take: 2, inf: 0.85, prompt: "Terracotta roof tiles stacked by hand, ceramic on ceramic, clink, clink, clink. Three or four clay clinks in a row. Close foley, no music." },
  kentongan: { take: 3, d: 3.0, cap: 2.1, inf: 0.95, prompt: "Hollow wooden slit drum alarm: a stick beats a hollow wooden tube very fast and without any pause, tok tok tok tok tok tok, sixteen knocks in three seconds, keeps knocking to the very end. Dry outdoor recording, solo wood percussion only." },
  // Foley edit: take 4 is the rustle. mix adds the chime from take 2 at a lower level.
  harvest: { take: 4, d: 1.5, inf: 0.9, mix: { file: "harvest.t2.wav", gainDb: -10, delay: 0.3, d: 1.2, inf: 0.85, prompt: "Soft swishing rustle of a dry rice bundle shaken by hand, then one gentle small bell ting at the end. Light and pleasant. Foley, no music, no voices." }, prompt: "Close rustling and swishing of dry straw and rice stalks gathered by hand, a papery crackling rustle. Foley only, no bells, no chimes, no music, no voices." },
  cheer: { take: 2, inf: 0.8, prompt: "A distant small crowd of four or five adult villagers, men and women, giving a short natural happy cheer outdoors, far away. Realistic field recording, wordless, no music." },
  // Foley edit: take 4 carries the gusts. loopLayer adds the steady frond rustle of take 3 so the quiet gaps do not go empty.
  wind_loop: { take: 4, inf: 0.7, loopLayer: { file: "wind_loop.t3.wav", gainDb: -6, loop: 8, inf: 0.9, prompt: "Soft low whooshing wind gusts slowly rising and falling, airy wind through tall palm trees, with dry leaf fronds fluttering and tapping. Warm seaside breeze field recording, seamless loop. No water, no rain, no music, no voices." }, prompt: "Wind blowing across an open tropical coast. Low moaning whoosh of air, gusts swell and fade every two seconds, palm fronds flap and rattle in the gusts. Seamless loop, no music, no voices." },
  sea_loop: { take: 2, inf: 0.8, prompt: "Continuous gentle lapping of small waves on a shallow sandy shore, water always audible, soft wash and fizz, calm tropical beach ambience, seamless loop, no gulls, no music, no voices." },
  village_loop: { take: 2, inf: 0.7, prompt: "Calm rural tropical village ambience at low level: soft insects, a light breeze in leaves, and one rooster crowing very faint and very far away. Seamless loop, no speech, no voices, no music, no vehicles." },
};

export const SFX = FIRST_TAKES.map((s) => (RETAKES[s.id] ? { ...s, ...RETAKES[s.id], firstPrompt: s.prompt } : s));

function rawPath(s) {
  return resolve(rawDir, s.take ? `${s.id}.t${s.take}.wav` : `${s.id}.wav`);
}

async function requestSfx(s, file) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set.");
  const body = {
    text: s.prompt,
    model_id: "eleven_text_to_sound_v2",
    duration_seconds: s.loop ? s.loop + XFADE : s.d,
    prompt_influence: s.inf,
    loop: Boolean(s.loop),
  };
  const res = await fetch(`https://api.elevenlabs.io/v1/sound-generation?output_format=pcm_24000`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const pcm = Buffer.from(await res.arrayBuffer());
  if (pcm.length < 1000) throw new Error("ElevenLabs returned too little audio.");
  // The endpoint returns interleaved stereo for pcm_24000, as the sample count and channel correlation show.
  writeFileSync(file, wavFromPcm16(pcm, RATE, 2));
  writeFileSync(`${file}.json`, JSON.stringify({ endpoint: "POST /v1/sound-generation?output_format=pcm_24000", request: body, bytes: pcm.length }, null, 2));
}

function trimOneShot(x, s) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const headLevel = peak * 10 ** (-40 / 20);
  const tailLevel = peak * 10 ** (-50 / 20);
  const win = Math.floor(0.01 * RATE);
  let start = 0;
  while (start < x.length && Math.abs(x[start]) < headLevel) start++;
  start = Math.max(0, start - Math.floor(0.003 * RATE));
  let end = x.length;
  for (let b = x.length - win; b > start; b -= win) {
    let p = 0;
    for (let i = b; i < b + win; i++) p = Math.max(p, Math.abs(x[i]));
    if (p >= tailLevel) {
      end = Math.min(x.length, b + win + Math.floor(0.02 * RATE));
      break;
    }
  }
  const capped = end - start > s.cap * RATE;
  if (capped) end = start + Math.floor(s.cap * RATE);
  const out = x.slice(start, end);
  const fadeIn = Math.min(Math.floor(0.001 * RATE), out.length);
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn;
  const fadeLen = Math.floor((capped ? Math.max(0.02, 0.2 * s.cap) : 0.01) * RATE);
  for (let i = 0; i < fadeLen && i < out.length; i++) {
    const g = i / fadeLen;
    out[out.length - 1 - i] *= g * g;
  }
  return { out, capped, rawPeakDb: Number(db(peak).toFixed(1)) };
}

// Equal-power wrap crossfade. Output length is N. The last output sample x[N - 1] flows into x[N], which starts the fade.
function wrapLoop(x, targetLen) {
  const xfade = Math.floor(XFADE * RATE);
  const n = Math.min(targetLen, x.length - xfade);
  const out = x.slice(0, n);
  for (let i = 0; i < xfade; i++) {
    const t = (i + 0.5) / xfade;
    out[i] = x[i] * Math.sin((t * Math.PI) / 2) + x[n + i] * Math.cos((t * Math.PI) / 2);
  }
  return out;
}

async function encode(wav, out, gainDb) {
  await ffmpeg([
    "-y", "-i", wav, "-af", `volume=${gainDb.toFixed(2)}dB`, "-map_metadata", "-1", "-id3v2_version", "0",
    "-c:a", "libmp3lame", "-b:a", `${KBPS}k`, "-ar", String(RATE), "-ac", "1", "-compression_level", "0", out,
  ]);
}

// Adds a second raw take on top of a trimmed one-shot. The layer is normalised to the base peak first.
async function mixLayer(base, mix) {
  const layer = await decode(resolve(rawDir, mix.file), { rate: RATE, channels: 1 });
  let basePeak = 0;
  let layerPeak = 0;
  for (const v of base) basePeak = Math.max(basePeak, Math.abs(v));
  for (const v of layer) layerPeak = Math.max(layerPeak, Math.abs(v));
  const gain = (basePeak / layerPeak) * 10 ** (mix.gainDb / 20);
  const delay = Math.floor(mix.delay * RATE);
  const out = base.slice();
  for (let i = delay; i < out.length && i - delay < layer.length; i++) {
    const fade = Math.min(1, (out.length - i) / (0.1 * RATE));
    out[i] += layer[i - delay] * gain * fade;
  }
  return out;
}

async function build(s) {
  const x = await decode(rawPath(s), { rate: RATE, channels: 1 });
  const stage = resolve(rawDir, "work", `${s.id}.wav`);
  const report = { id: s.id, rawSeconds: Number((x.length / RATE).toFixed(3)) };
  let processed;
  if (s.loop) {
    report.rawSeam = seamReport(x, RATE);
    processed = wrapLoop(x, Math.floor(s.loop * RATE));
    if (s.loopLayer) {
      const other = wrapLoop(await decode(resolve(rawDir, s.loopLayer.file), { rate: RATE, channels: 1 }), Math.floor(s.loop * RATE));
      const rms = (a) => Math.sqrt(a.reduce((sum, v) => sum + v * v, 0) / a.length);
      const gain = (rms(processed) / rms(other)) * 10 ** (s.loopLayer.gainDb / 20);
      for (let i = 0; i < processed.length; i++) processed[i] += other[i] * gain;
    }
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    report.rawPeakDb = Number(db(peak).toFixed(1));
  } else {
    const t = trimOneShot(x, s);
    processed = t.out;
    if (s.mix) processed = await mixLayer(processed, s.mix);
    report.capped = t.capped;
    report.rawPeakDb = t.rawPeakDb;
  }
  writeWavFloat(stage, processed, RATE);
  const out = resolve(finalDir, `${s.id}.mp3`);
  // Low-rate mp3 overshoot varies with gain, so the search keeps the closest pass and encodes it last.
  let gainDb = 0;
  let best = { gain: 0, miss: Infinity };
  for (let pass = 0; pass < 6; pass++) {
    await encode(stage, out, gainDb);
    const { tp } = await loudness(out, { pad: 3 });
    const step = TARGET_TP - tp;
    if (Math.abs(step) < best.miss) best = { gain: gainDb, miss: Math.abs(step) };
    if (Math.abs(step) < 0.2) break;
    gainDb += step * 0.8;
  }
  gainDb = best.gain;
  await encode(stage, out, gainDb);
  const info = await probe(out);
  const loud = await loudness(out, { pad: 3 });
  Object.assign(report, { seconds: Number(info.duration.toFixed(3)), bytes: info.bytes, gainDb: Number(gainDb.toFixed(2)), lufs: loud.lufs, tp: loud.tp });
  if (s.loop) {
    const decoded = await decode(out, { rate: RATE, channels: 1 });
    report.seam = seamReport(decoded, RATE);
    report.expectedSamples = processed.length;
    // Per-second loudness spread inside the loop.
    const levels = [];
    for (let a = 0; a + RATE <= decoded.length; a += RATE) {
      let e = 0;
      for (let i = a; i < a + RATE; i++) e += decoded[i] ** 2;
      levels.push(db(Math.sqrt(e / RATE)));
    }
    report.secondsSpreadDb = Number((Math.max(...levels) - Math.min(...levels)).toFixed(1));
  }
  return report;
}

if (isMain(import.meta.url)) {
  mkdirSync(resolve(rawDir, "work"), { recursive: true });
  mkdirSync(finalDir, { recursive: true });
  const only = process.argv.slice(2);
  const list = SFX.filter((s) => !only.length || only.includes(s.id));
  const failures = [];
  const reports = [];
  let next = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < list.length) {
      const s = list[next++];
      const file = rawPath(s);
      if (!existsSync(file) || (s.mix && !existsSync(resolve(rawDir, s.mix.file))) || (s.loopLayer && !existsSync(resolve(rawDir, s.loopLayer.file)))) {
        try {
          if (!existsSync(file)) await retryOnce(s.id, () => requestSfx(s, file));
          const layer = s.mix ?? s.loopLayer;
          if (layer && !existsSync(resolve(rawDir, layer.file))) await retryOnce(layer.file, () => requestSfx(layer, resolve(rawDir, layer.file)));
          console.log(`Generated ${s.id}.`);
        } catch (error) {
          failures.push({ id: s.id, error: redact(error) });
          console.error(`FAILED ${s.id}: ${redact(error)}`);
          continue;
        }
      }
      reports.push(await build(s));
    }
  }));
  rmSync(resolve(rawDir, "work"), { recursive: true, force: true });
  const order = new Map(SFX.map((s, i) => [s.id, i]));
  reports.sort((a, b) => order.get(a.id) - order.get(b.id));
  const path = resolve(rawDir, only.length ? "report_partial.json" : "report.json");
  writeFileSync(path, JSON.stringify({ reports, failures }, null, 2));
  for (const r of reports) console.log(JSON.stringify(r));
  if (failures.length) {
    console.log("FAILURES", JSON.stringify(failures));
    process.exitCode = 1;
  }
}
