# Audio prompts and provenance

Last updated 2026-11-04. Generated with ffmpeg 8.1.2 and Node 24. The scripts in this folder rebuild every file in `public/audio`. Raw takes stay in `.audio-src`. Nothing here runs at game time.

## How to rerun

| Step | Command | Result |
|---|---|---|
| Music takes | `node tools/audio/gen_music.mjs` | Raw takes and measurements in `.audio-src/music` |
| Music master | `node tools/audio/master_music.mjs [take]` | `theme.mp3`, `win.mp3` |
| Effects | `node tools/audio/gen_sfx.mjs [id ...]` | `sfx/<id>.mp3` |
| Voice | `node tools/audio/gen_voice.mjs [id ...]` | `voice/<id>.mp3` |
| Listening check | `node tools/audio/qa_listen.mjs music\|sfx\|voice` | JSON beside the raw takes |
| Loops | `node tools/audio/master_loops.mjs [out ...]` | `salatiga.mp3`, `play_*.mp3` |
| Salatiga check | `node tools/audio/qa_salatiga.mjs [--timeline]` | JSON in `.audio-src/music` |
| Manifest | `node tools/audio/build_manifest.mjs` | `manifest.json`, total size |

Each generator skips a raw take that exists. The win cue trim points in `master_music.mjs` apply to the current raw take. Set new points if you regenerate that take.

## Limits of the checks

No person listened to these files. A Gemini model (`gemini-3.8-flash`) gave the listening notes. Treat those notes as advice. The model can give opposite answers on the same file at full confidence.

**The gamelan is not verified.** A question that names gamelan produces high gamelan scores. An open question gave a different result. It ran 4 times on each of 12 raw and mastered music files, with no instrument named in the question. One of 48 passes named gamelan. Most passes named Hindustani or Chinese music, with bansuri, tabla, dizi or erhu. The model also named Irish and Shona music for one take, so these answers are not reliable either. The theme, `salatiga.mp3` and the gameplay beds may sound pan-Asian to a listener. Only a person can decide this.

Audition the theme, `salatiga.mp3`, the beds, the win cue and the voice before release.

## Main theme

Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/interactions`. Body: `{model: "lyria-3.5", input: <prompt>, response_format: {type: "audio"}}`. The API returned 44.1 kHz stereo mp3 at 192 kbps. The run used 4 Lyria calls and no retries: 3 theme takes and 1 win take.

### Prompts

- **theme_a**: Original instrumental main theme for a town-building game. A small Indonesian village wakes at sunrise and slowly grows into a town. Warm and hopeful. Javanese gamelan colours in a gentle slendro feel: gender metallophone, saron, suling bamboo flute, soft gong, kendang hand drum, over a gentle modern string pad. Duration about 100 seconds, with a clear arc. Opening: solo suling and soft gender over a very quiet pad, spacious, like first light. Then saron states a simple singable melody. Then kendang enters at a walking pulse and the strings swell. Then the full ensemble reaches a warm bright peak. Last phrase: the melody resolves on the home note and one soft gong rings out. Instrumental only. No vocals, no lyrics, no spoken words, no choir.
- **theme_b**: Original title music for a game about building a village in Indonesia. Balinese and Javanese gamelan timbres: shimmering interlocking gender and saron patterns, a breathy suling bamboo flute lead, kendang hand drum, soft gong marking long phrases, all floating on a warm modern string pad. Mood: hopeful, gentle, morning sun over rice terraces. Length about 110 seconds. Build in three clear stages. Stage one is sparse and hushed. Stage two adds the interlocking metallophones and a light drum pulse. Stage three is the widest and brightest, with strings carrying long rising lines under the flute. End with a calm resolved cadence and a soft gong. Instrumental only. No vocals, no lyrics, no spoken words, no choir.
- **theme_c**: Original melody-first instrumental theme, warm and hopeful, for a small Indonesian village that grows into a town. One memorable eight-bar melody, stated three times, each statement fuller than the last. First statement: suling bamboo flute alone with soft gender metallophone and a faint string pad, at sunrise. Second statement: saron plays the melody, gender decorates it, kendang hand drum adds a light steady groove, soft gong marks the phrase ends. Third statement: the whole gamelan with a full warm modern string section, gentle and generous, never aggressive. Finish on a quiet resolved cadence with one soft gong stroke ringing out. Duration about 100 seconds. Moderate tempo, clean mix. Instrumental only. No vocals, no lyrics, no spoken words, no choir.
- **salatiga_a**: Original instrumental score, about 150 seconds, for the final chapter of a game about a Javanese town. A cool highland dawn on the slope of a great volcano. The town wakes and grows. Central Javanese gamelan in slendro, clearly audible and prominent in the mix for the whole piece: gender metallophone, saron, soft bonang gong-chimes, one warm large gong. A lush modern string section and soft felt piano stay present and audible throughout, playing long warm lines under and around the gamelan. Lead: a suling bamboo flute with one memorable, tender theme. Arc: first the suling theme alone over gender, soft piano and hushed strings, cool and spacious. Then saron and bonang take up the same theme while the strings grow. Then kendang hand drum enters as the town gets busy, with a steady walking pulse. Then the whole ensemble reaches a proud, warm peak, with strings soaring and the gamelan ringing clearly on top. Then it settles back to the suling theme and one soft gong stroke. No fade out. Instrumental only. No vocals, no lyrics, no spoken words, no choir. No soprano, no humming.
- **salatiga_b**: Original orchestral-gamelan piece, tender and proud, about 140 seconds, instrumental. Picture cold clear morning air on a mountainside in Central Java, then a town below it coming to life. Equal partners in the mix: a Central Javanese gamelan in slendro tuning (gender, saron, soft bonang, warm gong, later kendang) and a lush contemporary string section with soft piano. The bronze metallophones must ring clearly in front at all times, and the strings must always be heard beneath them. A suling bamboo flute sings a simple, heart-tugging melody of eight bars that returns three times, each return bigger. Slow start, gentle growth, kendang joins at the midpoint with a light busy groove, the third return of the melody is the emotional summit, warm and full, with piano and strings swelling. A short calm coda ends on the same quiet chord that opened the piece, so the end can flow into the beginning. Instrumental only. No vocals, no lyrics, no spoken words, no choir. No soprano, no humming.
- **salatiga_c**: Original instrumental theme, about 150 seconds, a love letter to a small cool hill town in Central Java under a great volcano. Mood: tender, then busy and happy, then deeply proud. Instruments, all clearly audible: suling bamboo flute melody, gender and saron metallophones in slendro playing clear patterned figures, soft bonang, warm deep gong on long phrase ends, kendang hand drum from the middle onward, intimate soft piano, and a rich modern string section with warm cellos and violas. Section one, dawn: piano and gender, suling enters with the main melody, strings like mist. Section two, the town wakes: saron and bonang join, the melody passes to violins with the gamelan answering it. Section three, the busy day: kendang groove, faster gender patterns, moving cellos. Section four, the peak: full strings and full gamelan together play the melody broadly with pride and warmth. Section five: everything falls away to suling, piano and a gong, returning to the opening mood. Instrumental only. No vocals, no lyrics, no spoken words, no choir. No soprano, no humming.
- **play_plan**: Original instrumental background cue, about 80 seconds, for the thinking phase of a town-building game. A calm Indonesian town in the morning. A soft, slow gamelan pulse with gender metallophone, a sparse suling bamboo flute with long rests, and a gentle modern pad. Sparse and quiet, with plenty of open space so sound effects sit on top. Steady level from start to end, no build, no climax, no ending cadence, no drums fill. The last bars must flow back into the first bars. Instrumental only. No vocals, no lyrics, no spoken words, no choir.
- **play_run**: Original instrumental background cue, about 80 seconds, for the action phase of a town-building game. An Indonesian town busy and moving. A steady kendang hand drum pulse, saron and bonang interlocking in a clear repeating pattern, warm and forward with a little energy, a light modern pad underneath. Keep the texture open and uncluttered so sound effects sit on top, no high shrill parts. Steady level from start to end, no climax, no ending cadence. The last bars must flow back into the first bars. Instrumental only. No vocals, no lyrics, no spoken words, no choir.
- **play_danger**: Original instrumental background cue, about 70 seconds, for a natural disaster in a town-building game. Tense and urgent, never horror. Low deep gong strokes, gamelan in pelog tuning, a driving kendang hand drum, urgent low strings playing short repeated figures. Keep the mids open and uncluttered so sound effects sit on top, no shrieks, no stingers. Steady intensity from start to end, no ending cadence. The last bars must flow back into the first bars. Instrumental only. No vocals, no lyrics, no spoken words, no choir.
- **win**: A very short resolved victory flourish, 8 seconds long, on Javanese gamelan. A quick rising run on saron and gender metallophone, a short kendang hand drum pickup, then a final chord on the home note with one soft gong stroke that rings out and decays to silence. Warm and happy. Nothing plays after the gong. Instrumental only. No vocals, no lyrics, no spoken words, no choir.

### Raw measurements

Integrated loudness, range and true peak come from `ebur128`. Band values are decibels against the full-band mean level. Silence uses `silencedetect` at -50 dB.

| Take | Seconds | LUFS | LRA | True peak dBTP | Flat factor | Lead silence s | Tail silence s | 20-60 Hz | 60-250 Hz | 250-2k Hz | 2k-8k Hz | 8k-16k Hz | Side over mid dB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| theme_a | 102.01 | -11.4 | 6.2 | +0.2 | 0 | 0.0 | 2.4 | -12.5 | -5.9 | -2.0 | -12.2 | -28.4 | -9.5 |
| theme_b | 108.93 | -11.2 | 12.1 | +0.3 | 0 | 0.7 | 2.1 | -10.3 | -5.3 | -2.5 | -12.9 | -28.5 | -8.5 |
| theme_c | 106.53 | -11.7 | 6.0 | +0.2 | 0 | 0.6 | 1.2 | -10.6 | -4.7 | -2.7 | -13.7 | -29.0 | -6.3 |

Mean level in dBFS for each 10 s window, from 0 s:

| Take | 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 |
|---|---|---|---|---|---|---|---|---|---|---|
| theme_a | -12.2 | -14.5 | -14.9 | -12.3 | -11.5 | -12.4 | -9.8 | -9.8 | -9.6 | -13.1 |
| theme_b | -19.5 | -20.8 | -16.8 | -10.5 | -10.7 | -10.7 | -10.0 | -10.0 | -9.3 | -10.3 |

Listening check on the full raw takes. The vocal question ran 4 times for each take:

| Take | Voice flagged | Voice times | Instrument family | Notes |
|---|---|---|---|---|
| theme_a | 0 of 4 | none | gamelan or other | Gamelan score 9 from a question that names gamelan. Resolves on a gong. |
| theme_b | 4 of 4 | about 3 to 26 s | other | One check on a 14 s excerpt found no voice. |
| theme_c | 4 of 4 | about 89 to 98 s | western orchestra | Gamelan score 1 from the same question. A soprano line appears near the peak. |

### Selection

The chosen take is **theme_a**.

- The brief forbids vocals. theme_a is the only take with no voice flag.
- theme_c fails the gamelan brief. The listening check scored it 1 of 10.
- theme_a rises in clear stages: about -14.7 dB, then -12, then -9.7, then a release at 90 s.
- theme_b has the wider range (LRA 12.1 against 6.2). It stays 10 dB below its later level for the first 28 s. At -18 LUFS that opening sits near -27 LUFS, which is faint on a phone speaker.
- theme_a opens with a solo suling at full presence. A player on the title screen hears the identity in the first seconds.
- All three takes have no flat-topped peaks and a similar spectrum. These measures did not decide the choice.
- The listening check heard few sustained strings in theme_a. The pad is present but quiet.

To master another take, run `node tools/audio/master_music.mjs theme_b`.

### Master

1. Trim to the content above -60 dB: 0.04 s to 99.93 s.
2. Two-pass `loudnorm` with I=-18, TP=-2, LRA=20, `linear=true`. The result is linear.
3. Downmix with `pan=mono|c0=0.5*c0+0.5*c1`. Apply a 3 s fade out (`afade`, curve `qsin`).
4. Trim the gain to the targets on the encoded file.
5. Encode with `libmp3lame -b:a 64k -ar 44100 -compression_level 0`.

Encoding comparison at the same 799,554 bytes, gain-matched against the mono downmix:

| Encoding | Signal to error dB | 8k-16k Hz band dB |
|---|---|---|
| Mono 64 kbps | 23.6 | -28.8 |
| Joint stereo 64 kbps | 21.0 | -30.1 |
| Source | - | -28.8 |

The mono encode has less error and keeps the top band. The theme ships as mono.

Result: 99.89 s, 799,554 bytes, -18.0 LUFS, LRA 6.8, -2.5 dBTP. The last 0.73 s is below -50 dB, inside the fade. The listening check found no voice, no distortion and no abrupt change.

## Win cue

Lyria returned 65.70 s for the 8 s prompt. The last phrase starts near 57 s. The last gong decays to silence near 64.6 s. The cue uses that phrase only.

1. Cut from the strongest onset in 57.0 to 57.35 s: 57.227 s to 64.578 s. Add an 8 ms fade in.
2. Two-pass linear `loudnorm`, then a gain trim on the encoded file. `loudnorm` read this short clip about 3 LU too low. `ebur128` sets the final gain.
3. Downmix to mono. Apply a 0.5 s fade out. Encode at 48 kbps, 44.1 kHz.

Result: 7.35 s, 44,538 bytes, -18.3 LUFS, -2.1 dBTP.

**Open risk.** The listening check is split on this cue. It heard gamelan on the full 65 s take, with a score of 10. It heard a western orchestra on 6 of 9 passes on `win.mp3`. It heard the orchestra on 5 of 6 passes on the same cut at 128 kbps stereo. The low bit rate is not the cause. A person must audition this cue. The Lyria budget for this cue is spent.

## Salatiga score

The final level of Part 1 loops this track. The run used 3 Lyria calls and no retries.

### Prompts

- **salatiga_a**: Original instrumental score, about 150 seconds, for the final chapter of a game about a Javanese town. A cool highland dawn on the slope of a great volcano. The town wakes and grows. Central Javanese gamelan in slendro, clearly audible and prominent in the mix for the whole piece: gender metallophone, saron, soft bonang gong-chimes, one warm large gong. A lush modern string section and soft felt piano stay present and audible throughout, playing long warm lines under and around the gamelan. Lead: a suling bamboo flute with one memorable, tender theme. Arc: first the suling theme alone over gender, soft piano and hushed strings, cool and spacious. Then saron and bonang take up the same theme while the strings grow. Then kendang hand drum enters as the town gets busy, with a steady walking pulse. Then the whole ensemble reaches a proud, warm peak, with strings soaring and the gamelan ringing clearly on top. Then it settles back to the suling theme and one soft gong stroke. No fade out. Instrumental only. No vocals, no lyrics, no spoken words, no choir. No soprano, no humming.
- **salatiga_b**: Original orchestral-gamelan piece, tender and proud, about 140 seconds, instrumental. Picture cold clear morning air on a mountainside in Central Java, then a town below it coming to life. Equal partners in the mix: a Central Javanese gamelan in slendro tuning (gender, saron, soft bonang, warm gong, later kendang) and a lush contemporary string section with soft piano. The bronze metallophones must ring clearly in front at all times, and the strings must always be heard beneath them. A suling bamboo flute sings a simple, heart-tugging melody of eight bars that returns three times, each return bigger. Slow start, gentle growth, kendang joins at the midpoint with a light busy groove, the third return of the melody is the emotional summit, warm and full, with piano and strings swelling. A short calm coda ends on the same quiet chord that opened the piece, so the end can flow into the beginning. Instrumental only. No vocals, no lyrics, no spoken words, no choir. No soprano, no humming.
- **salatiga_c**: Original instrumental theme, about 150 seconds, a love letter to a small cool hill town in Central Java under a great volcano. Mood: tender, then busy and happy, then deeply proud. Instruments, all clearly audible: suling bamboo flute melody, gender and saron metallophones in slendro playing clear patterned figures, soft bonang, warm deep gong on long phrase ends, kendang hand drum from the middle onward, intimate soft piano, and a rich modern string section with warm cellos and violas. Section one, dawn: piano and gender, suling enters with the main melody, strings like mist. Section two, the town wakes: saron and bonang join, the melody passes to violins with the gamelan answering it. Section three, the busy day: kendang groove, faster gender patterns, moving cellos. Section four, the peak: full strings and full gamelan together play the melody broadly with pride and warmth. Section five: everything falls away to suling, piano and a gong, returning to the opening mood. Instrumental only. No vocals, no lyrics, no spoken words, no choir. No soprano, no humming.

### Raw measurements

| Take | Seconds | LUFS | LRA | True peak dBTP | Flat factor | 60-250 Hz | 250-2k Hz | 2k-8k Hz | 8k-16k Hz | Side over mid dB |
|---|---|---|---|---|---|---|---|---|---|---|
| salatiga_a | 147.54 | -11.6 | 9.2 | +0.2 | 0 | -4.6 | -2.7 | -13.4 | -28 | -8.4 |
| salatiga_b | 144.40 | -11.2 | 11 | +0.2 | 0 | -4.8 | -2.7 | -12.2 | -28.7 | -8.8 |
| salatiga_c | 147.10 | -11.3 | 7.7 | +0.2 | 0 | -5.2 | -2.2 | -12.4 | -28.5 | -6.1 |

All three takes rise 6 to 11 LU to a peak after 100 s. All three fall back to a quiet coda.

### Listening checks

Timeline check: 3 passes on each 20 s window. G counts passes that heard bronze metallophones. S counts passes that heard bowed strings. The question names both instrument families, so read it as a comparison between takes.

| Take | 2 s | 22 s | 42 s | 62 s | 82 s | 102 s | 122 s | G total | S total |
|---|---|---|---|---|---|---|---|---|---|
| salatiga_a | G0 S2 | G2 S3 | G1 S3 | G0 S1 | G1 S2 | G3 S0 | G3 S2 | 10 of 21 | 13 of 21 |
| salatiga_b | G2 S2 | G0 S3 | G2 S1 | G3 S1 | G0 S3 | G3 S2 | G3 S3 | 13 of 21 | 15 of 21 |
| salatiga_c | G0 S3 | G1 S3 | G1 S2 | G3 S3 | G0 S3 | G1 S3 | G1 S2 | 7 of 21 | 19 of 21 |

Voice check:

| Take | Whole-track flags | Narrow excerpt flags | Note |
|---|---|---|---|
| salatiga_a | 2 of 8 | 0 of 15 | Flags gave a span of 86 s, which is not a plausible vocal line. |
| salatiga_b | 5 of 8 | 5 of 15 | Flags cluster at 20 to 28 s and 36 to 48 s. |
| salatiga_c | 0 of 3 | 0 of 10 | Three whole-track passes only. |

### Selection

The chosen take is **salatiga_a**.

- salatiga_b has the best timeline balance and the widest range. The voice flags reject it, because the brief forbids vocals.
- salatiga_c has the most strings. Its gamelan drops out at the peak: excerpts at 100 to 130 s scored 0 of 10, twice. The brief asks to keep the gamelan audible.
- salatiga_a has clean narrow voice checks. Metallophones are heard at the peak, on all passes at 102 s and 122 s. A suling carries the melody in 12 of 15 narrow passes.
- salatiga_a has weaknesses. Strings drop out on the check at 102 s. Metallophones drop out at 2 s and 62 s. Piano is barely heard in any take.

To master another take, run `SALATIGA_TAKE=salatiga_c node tools/audio/master_loops.mjs salatiga`.

### Master

1. Trim to the content above -45 dB: 1.70 s to 145.66 s.
2. Two-pass `loudnorm` with I=-18, TP=-2, LRA=20, `linear=true`. The result is linear.
3. Make the loop with the method from `animal-herder/tools/generate_music.mjs`. The file starts 4 s into the take. The last 4 s blend the tail into the first 4 s.
4. Use `acrossfade` with curve `qsin`. The prior art used `tri`. The equal-power curve avoids a dip, because the two parts are not correlated.
5. Encode with `libmp3lame -b:a 96k -joint_stereo 1 -ar 44100 -compression_level 0`.

Result: 139.96 s, 1680195 bytes, -18 LUFS, LRA 9.6, -5.4 dBTP. The level is about -29.5 dB at the wrap point. The wrap point sits in the quiet coda. The music returns to the dawn section there.

Short-term loudness in LUFS, one value for each 10 s from 10 s: -23.1, -22.4, -23.4, -19.2, -18.4, -17.7, -17.7, -17.3, -15.8, -16, -15.4, -16.5, -27.2.

## Gameplay beds

One Lyria call for each bed, with no retries. The master uses the same loop method. It adds a mono downmix, I=-22 and 56 kbps. The takes are in `.audio-src/music`.

- **play_plan**: Original instrumental background cue, about 80 seconds, for the thinking phase of a town-building game. A calm Indonesian town in the morning. A soft, slow gamelan pulse with gender metallophone, a sparse suling bamboo flute with long rests, and a gentle modern pad. Sparse and quiet, with plenty of open space so sound effects sit on top. Steady level from start to end, no build, no climax, no ending cadence, no drums fill. The last bars must flow back into the first bars. Instrumental only. No vocals, no lyrics, no spoken words, no choir.
- **play_run**: Original instrumental background cue, about 80 seconds, for the action phase of a town-building game. An Indonesian town busy and moving. A steady kendang hand drum pulse, saron and bonang interlocking in a clear repeating pattern, warm and forward with a little energy, a light modern pad underneath. Keep the texture open and uncluttered so sound effects sit on top, no high shrill parts. Steady level from start to end, no climax, no ending cadence. The last bars must flow back into the first bars. Instrumental only. No vocals, no lyrics, no spoken words, no choir.
- **play_danger**: Original instrumental background cue, about 70 seconds, for a natural disaster in a town-building game. Tense and urgent, never horror. Low deep gong strokes, gamelan in pelog tuning, a driving kendang hand drum, urgent low strings playing short repeated figures. Keep the mids open and uncluttered so sound effects sit on top, no shrieks, no stingers. Steady intensity from start to end, no ending cadence. The last bars must flow back into the first bars. Instrumental only. No vocals, no lyrics, no spoken words, no choir.

| File | Seconds | Bytes | LUFS | LRA | dBTP | Seam |
|---|---|---|---|---|---|---|
| play_plan | 79.031 | 553690 | -22 | 3.7 | -6.2 | 0.61 |
| play_run | 75.662 | 530102 | -22 | 3.1 | -5.7 | 0.26 |
| play_danger | 63.633 | 445804 | -22 | 1.5 | -5.5 | 1.48 |

The listening check found no voice on 3 passes for each bed. The raw takes have little energy above 2 kHz (`play_plan` -23.5 dB, `play_run` -19.5 dB, `play_danger` -21.8 dB). This leaves room for effects. The check scored `play_danger` lowest for open space (3 to 4 of 10).

## Sound effects

Endpoint: `POST https://api.elevenlabs.io/v1/sound-generation?output_format=pcm_24000`. Body: `{text, model_id: "eleven_text_to_sound_v2", duration_seconds, prompt_influence, loop}`. `loop` is true for the `_loop` ids only.

The API returned interleaved stereo for `pcm_24000`. The sample count and the channel correlation show this. The raw WAV files store 2 channels. Encoding downmixes them to mono.

"Req s" is the requested length. "Take" is the raw take that shipped. "Score" is the listening check against the brief, 0 to 10.

| id | Prompt that shipped | Req s | Influence | Take | Seconds | LUFS | dBTP | Score |
|---|---|---|---|---|---|---|---|---|
| hammer | One single hammer strike on a lashed bamboo and timber frame. Short, dry, close foley. One hit only, no reverb, no music. | 1 | 0.6 | 1 | 0.6 | -22.7 | -3.1 | 10 |
| saw | One single stroke of a hand saw cutting into dry wood, one push only. Close, dry foley, no music. | 1.2 | 0.6 | 1 | 1 | -20.3 | -2.8 | 10 |
| lash | Two hollow bamboo poles clacking together, clack clack, then a thick rope creaking as it is pulled tight. Wooden foley sounds only, no human voice. | 1.5 | 0.85 | 2 | 1.2 | -23 | -2.8 | 9 |
| brick | A heavy clay brick pressed down onto wet mortar with a soft gritty thud, then one light tap of a steel trowel on the brick. Close foley, building site, no music. | 1.2 | 0.85 | 2 | 0.82 | -27.3 | -3.2 | 8 |
| thud | A heavy wooden beam dropped on soft soil, one deep thud with a small dust whump. Close foley, no reverb, no music. | 1.2 | 0.6 | 1 | 0.356 | -23 | -2.9 | 9 |
| tile | Terracotta roof tiles stacked by hand, ceramic on ceramic, clink, clink, clink. Three or four clay clinks in a row. Close foley, no music. | 1.2 | 0.85 | 2 | 1 | -21.1 | -3.1 | 9 |
| dig | One stroke of a hoe chopping into wet soil, a single wet chop. Close foley, no music. | 1 | 0.6 | 1 | 0.253 | -23 | -2.7 | 8 |
| splash | A small water splash, one small stone dropped into a pond. Short, close, no music. | 1 | 0.6 | 1 | 0.8 | -23.4 | -3.1 | 10 |
| creak | A bamboo water wheel turning slowly, a wooden creak and groan with light dripping water. Outdoor foley, no music. | 2 | 0.6 | 1 | 1.82 | -26 | -3 | 10 |
| collapse | A small wooden house collapsing: timber beams cracking, clay roof tiles falling and smashing, then debris settling. No music, no voices. | 2.5 | 0.6 | 1 | 2.01 | -13.9 | -3.3 | 9 |
| kentongan | Hollow wooden slit drum alarm: a stick beats a hollow wooden tube very fast and without any pause, tok tok tok tok tok tok, sixteen knocks in three seconds, keeps knocking to the very end. Dry outdoor recording, solo wood percussion only. | 3 | 0.95 | 3 | 2.1 | -28.8 | -3.1 | 7 |
| rumble | Deep earthquake ground rumble, low frequency, the earth shaking with faint rattling. No music, no voices. | 3 | 0.6 | 1 | 2.98 | -19.6 | -3 | 10 |
| thunder | Distant tropical thunder, one clap rolling away over open land. No rain, no music. | 3 | 0.6 | 1 | 2.68 | -20.6 | -2.9 | 9 |
| eruption | Distant volcanic eruption, one huge low boom followed by a rolling low rumble that fades. No music, no voices. | 4 | 0.6 | 1 | 4 | -15.5 | -2.9 | 10 |
| ui_tap | One soft wooden tick, a tiny dry tap on a small wooden block, very short, button press sound. One hit only, no reverb, no music. | 0.5 | 0.8 | 1 | 0.12 | -23.4 | -3.2 | 10 |
| ui_place | One soft wooden knock with a small earthy thump, a small wooden piece placed on soil, very short. One hit only, no reverb, no music. | 0.5 | 0.8 | 1 | 0.194 | -28.2 | -3.1 | 10 |
| ui_bad | One dull muted wooden knock, flat and dead, low pitched, very short, error sound. One hit only, no reverb, no music. | 0.5 | 0.8 | 1 | 0.25 | -20.4 | -3 | 10 |
| harvest | Close rustling and swishing of dry straw and rice stalks gathered by hand, a papery crackling rustle. Foley only, no bells, no chimes, no music, no voices. | 1.5 | 0.9 | 4 | 1.1 | -25 | -3.1 | 6 |
| cheer | A distant small crowd of four or five adult villagers, men and women, giving a short natural happy cheer outdoors, far away. Realistic field recording, wordless, no music. | 2 | 0.8 | 2 | 1.713 | -14.5 | -2.9 | 8 |
| pump | A small diesel water pump running steadily, a chugging single-cylinder engine with water gurgling in a hose. Outdoor foley, no music, no voices. | 2 | 0.7 | 1 | 2 | -14.9 | -2.9 | 10 |
| moped | A small 110cc Asian underbone motorbike with a thin buzzing putt-putt engine, heard from far away, slowly riding past at low speed on a village road and fading. Quiet and distant, field recording, no music, no voices. | 2 | 0.85 | 2 | 2 | -18.3 | -3.1 | 8 |
| horn | A small minibus horn, two short beeps, beep beep, a little distant on a town street. No engine, no music, no voices. | 1.5 | 0.8 | 1 | 1.4 | -13 | -3.1 | 10 |
| bakso | A metal spoon tapping a ceramic soup bowl three times, ting ting ting, a street food seller heard from down the street. Distant, no voice, no music. | 2 | 0.85 | 1 | 1.8 | -23.2 | -3.1 | 8 |
| rooster | One single rooster crow far away in a village. Distant outdoor recording, one crow only, no music, no voices. | 2.5 | 0.8 | 1 | 2.019 | -11.9 | -2.8 | 8 |
| schoolbell | A length of old iron rail hanging from a rope, struck by a steel rod as a school bell: four slow dull iron clanks, clank, clank, clank, clank, heard from a distance across a yard. Not a brass bell, no shaking. No music, no voices. | 3 | 0.9 | 2 | 2.714 | -18.7 | -2.8 | 6 |
| bedug | A very large deep wooden barrel drum struck slowly by a mallet, three deep booming strokes, heard from a distance in a quiet town. Solo drum only, no voice, no chanting, no singing, no music. | 3.5 | 0.85 | 1 | 3.48 | -27.4 | -2.9 | 10 |
| churchbell | A small church bell struck slowly, three or four clear strokes, heard from a distance over a town. Solo bell, no choir, no voices, no music. | 3.5 | 0.85 | 1 | 3.48 | -15.4 | -3 | 9 |
| templegong | A hollow wooden fish temple block knocked slowly and evenly, five dry hollow knocks, tok, tok, tok, tok, tok, heard from a distance. Wood only, no metal, no gong, no chanting, no voices, no music. | 3.5 | 0.9 | 3 | 2.498 | -23.6 | -3.4 | 9 |
| boat | A small outboard motor fishing boat passing by on the water, the engine rises and falls, light water slap. Outdoor, no music, no voices. | 3 | 0.8 | 1 | 3 | -16.3 | -3.1 | 10 |
| gull | One sea bird calling twice, far away over a beach. Distant, no waves, no music, no voices. | 1.5 | 0.8 | 1 | 1.48 | -16.3 | -3 | 8 |
| tokek | A tokay gecko calling at night, a loud clear two-note to-kay call repeated five times with short gaps. Close, quiet background, no music, no voices. | 5 | 0.9 | 1 | 5 | -9.9 | -3.1 | 10 |
| dog | One dog barking twice, very far away across a valley at night, faint with a soft echo, woof, woof. Very distant and quiet, no music, no voices. | 1.5 | 0.9 | 2 | 1.48 | -20.6 | -2.9 | 6 |
| becak | A small thumb-operated bicycle bell ringing twice, ring ring, a little distant on a street. No music, no voices. | 1.2 | 0.85 | 1 | 1.2 | -17.7 | -2.9 | 8 |
| train_horn | A diesel locomotive horn, two long loud notes, heard from a distance across a town. Horn only, no music, no voices. | 3.5 | 0.8 | 1 | 3.48 | -11.8 | -2.8 | 9 |
| crossing_bell | A railway level crossing warning bell ringing fast and steadily, ting ting ting ting ting, a small electric gong bell at a road crossing. Outdoor, no train, no music, no voices. | 3 | 0.85 | 1 | 2.96 | -12.7 | -3.4 | 10 |
| train_pass | A passenger train passing by, steel wheels clacking over rail joints, clack-clack clack-clack, the rhythm passes and fades a little. Outdoor, no horn, no music, no voices. | 4 | 0.8 | 1 | 3.989 | -18.5 | -3.1 | 10 |
| steam_chuff | A heavy steam locomotive chuffing slowly uphill at a steady pace, regular deep chuff, chuff, chuff, chuff, hissing steam between beats. Seamless loop, no whistle, no music, no voices. | 5, loop | 0.85 | 1 | 4 | -15.3 | -3.2 | 9 |
| bus_hiss | A bus door opening with one short air brake hiss, a soft diesel engine idling behind it. Close foley, no music, no voices. | 1.2 | 0.8 | 1 | 1.1 | -19 | -2.5 | 9 |
| rain_loop | Steady tropical rain falling on broad leaves and palm thatch, even intensity, seamless loop, no thunder, no music, no voices. | 9, loop | 0.5 | 1 | 8 | -21.8 | -3 | 9 |
| river_loop | A small river flowing steadily over stones, even babbling water, seamless loop, no music, no voices. | 9, loop | 0.5 | 1 | 8 | -19 | -2.9 | 9 |
| wind_loop | Wind blowing across an open tropical coast. Low moaning whoosh of air, gusts swell and fade every two seconds, palm fronds flap and rattle in the gusts. Seamless loop, no music, no voices. | 9, loop | 0.7 | 4 | 8 | -23 | -3.1 | 7 |
| sea_loop | Continuous gentle lapping of small waves on a shallow sandy shore, water always audible, soft wash and fizz, calm tropical beach ambience, seamless loop, no gulls, no music, no voices. | 9, loop | 0.8 | 2 | 8 | -21.5 | -2.9 | 9 |
| village_loop | Calm rural tropical village ambience at low level: soft insects, a light breeze in leaves, and one rooster crowing very faint and very far away. Seamless loop, no speech, no voices, no music, no vehicles. | 11, loop | 0.7 | 2 | 10 | -16.4 | -3.1 | 10 |
| traffic_loop | Distant city traffic ambience heard from several streets away, a constant soft wash of far scooters and light traffic, one faint horn, urban room tone. Seamless loop, no speech, no voices, no music. | 9, loop | 0.45 | 3 | 8 | -17.6 | -2.9 | 7 |
| market_loop | Busy indoor wet market ambience: an indistinct low crowd murmur with no clear words, wooden crates set down, the clink of hanging metal scales, plastic bags rustling. Seamless loop, no intelligible speech, no music. | 11, loop | 0.6 | 1 | 10 | -24.9 | -2.9 | 9 |
| night_loop | Tropical town at night: crickets, frogs croaking, and a very faint far away traffic hum. Seamless loop, no speech, no voices, no music. | 11, loop | 0.6 | 1 | 10 | -15.7 | -3.1 | 9 |
| construction_loop | Distant building site ambience with no machines: slow hand hammering, a hand saw cutting wood, hollow bamboo poles knocking. Far away, seamless loop, no speech, no voices, no music. | 11, loop | 0.7 | 1 | 10 | -24 | -2.9 | 10 |
| flood_loop | Fast heavy flood water rushing through town streets, a powerful turbulent torrent with debris knocking. Seamless loop, no speech, no voices, no music. | 11, loop | 0.7 | 1 | 10 | -15.2 | -2.7 | 8 |
| kite_loop | The low steady humming drone of a large kite with a bamboo hummer vibrating high in the wind, a woody buzzing moan that swells gently, soft wind behind it. Seamless loop, no speech, no voices, no music. | 11, loop | 0.8 | 1 | 10 | -16 | -3.1 | 10 |
| rainzinc_loop | Heavy rain drumming on corrugated zinc and clay tile roofs in a town, gutters running and spilling water. Even intensity, seamless loop, no thunder, no speech, no voices, no music. | 11, loop | 0.7 | 1 | 10 | -18 | -2.6 | 7 |
| pump_run_loop | A small diesel water pump running steadily, a chugging single-cylinder engine at constant speed with water gurgling. Even and constant, seamless loop, no speech, no voices, no music. | 11, loop | 0.7 | 1 | 10 | -17.5 | -3.2 | 9 |
| jam_loop | A constant dense wall of many small motorbike engines idling together in a traffic jam, always audible at a steady level, with a few short horns scattered far back in the mix. Field recording in the middle of a jammed Asian street. Seamless loop, no speech, no voices, no music. | 11, loop | 0.8 | 2 | 10 | -18.7 | -2.8 | 5 |

### Post-processing

One-shots:

1. Trim the head at -40 dB of the take peak. Keep 3 ms.
2. Trim the tail at -50 dB of the take peak. Keep 20 ms.
3. Cap the length where the config sets a cap. Fade the end.
4. Set the gain so the encoded file peaks at about -3 dBTP.
5. Encode with `libmp3lame -b:a 32k -ar 24000 -ac 1 -compression_level 0`.

Peak normalising gives different loudness per effect. The manifest lists LUFS so the game can set its own mix gains. `kentongan`, `ui_place` and `brick` are quiet by loudness. `cheer`, `collapse` and `moped` are loud.

Loops:

1. Request the final length plus 1 s, with `loop: true`.
2. Keep N samples. Blend the first 1 s with the 1 s that follows sample N, using an equal-power curve. The last output sample then flows into the first.
3. Set the gain and encode as above. The loops skip the trim steps.

### Loop verification

The seam value is the jump across the wrap point divided by the RMS sample step of the file. A click would show as a value far above 1. Each sample count is exact after an ffmpeg decode.

| id | Samples | Raw seam | Final seam | Per-second spread dB |
|---|---|---|---|---|
| steam_chuff | 96000 | 0.03 | 0.27 | 0.3 |
| rain_loop | 192000 | 0.92 | 0.46 | 0.4 |
| river_loop | 192000 | 0.35 | 0.3 | 0.9 |
| wind_loop | 192000 | 0.31 | 0.77 | 16.9 |
| sea_loop | 192000 | 0.25 | 0.27 | 17.6 |
| village_loop | 240000 | 0.43 | 1.48 | 2.2 |
| traffic_loop | 192000 | 1.8 | 1.64 | 1.7 |
| market_loop | 240000 | 0.51 | 0.2 | 11.6 |
| night_loop | 240000 | 0.01 | 0.51 | 1.5 |
| construction_loop | 240000 | 0.85 | 0.79 | 28.1 |
| flood_loop | 240000 | 1.16 | 0.45 | 0.4 |
| kite_loop | 240000 | 0.53 | 3.07 | 1.6 |
| rainzinc_loop | 240000 | 0.66 | 1.44 | 1.2 |
| pump_run_loop | 240000 | 1.2 | 0.11 | 1.7 |
| jam_loop | 240000 | 0.1 | 0.18 | 5.7 |

Chromium 156 `decodeAudioData` returned the exact length for all 19 looping files, including the music. Those files had no silent head. Safari was not tested.

`sea_loop`, `wind_loop` and `construction_loop` have a wide spread by design. `steam_chuff` is a loop-safe effect, so the manifest marks it as a loop. `kite_loop` has the largest seam value. Its smooth drone has very small sample steps, so its absolute jump is small (0.016).

### Retakes and foley edits

Each retake uses a more literal prompt. Older raw takes and their requests stay in `.audio-src/sfx` as `<id>.wav.json`.

| id | Rejected prompt | Reason |
|---|---|---|
| lash (take 1) | Bamboo poles knocking together twice, then a rope pulled tight with a short creak. Short, dry, close foley, no music. | Score 0. It sounded like a vocal groan. |
| brick (take 1) | A clay brick set down on wet mortar, then one small metal trowel tap. Short, close foley, no music. | Score 2. It sounded like a metal click. |
| tile (take 1) | Clay roof tiles clinking as a few are stacked together. Short, close foley, no music. | Score 6. One clink only. |
| kentongan (take 1) | A hollow wooden slit drum struck by a stick in a fast urgent alarm rhythm, solo hollow wooden knocks, an Indonesian village warning signal. No other instruments, no music, no voices. | Trim left 0.3 s. Score 3. |
| harvest (take 1) | Dry rice stalks rustling in a hand, with one soft cheerful small metal chime. Short, no music, no voices. | Score 0. It sounded like a metal squeak. |
| cheer (take 1) | A few villagers, a small group, giving a short happy wordless cheer from a distance, hooray sounds outdoors, no intelligible words, no music. | Score 8, but the voices sounded like cartoons. |
| moped (take 1) | One small motorbike passing in the distance, the engine note rises and falls as it goes by. Outdoor, far away, no music, no voices. | Score 4. It sounded like a race car. |
| schoolbell (take 1) | A hanging piece of iron struck by hand as a school bell, four or five clanging strikes, heard from a distance across a schoolyard. No music, no voices. | Score 4. It sounded like a brass hand bell. |
| templegong (take 1) | A small bronze temple gong struck softly once, with a hollow wooden block knocking a slow steady pattern, one soft phrase, heard from a distance. No chanting, no voices, no music. | Score 4. One gong stroke only. |
| dog (take 1) | One dog barking twice, woof woof, far away in a village at night. Distant, no music, no voices. | Score 6. It sounded close. Take 2 scores the same but is quieter. |
| wind_loop (take 1) | Warm coastal wind blowing steadily through palm fronds, rustling leaves, even intensity, seamless loop, no music, no voices. | Score 1. It sounded like water spray. |
| sea_loop (take 1) | Gentle small waves lapping on a shallow sandy beach, calm and even, seamless loop, no gulls, no music, no voices. | Score 9. Take 2 keeps water audible for longer. |
| village_loop (take 1) | Quiet tropical village daytime ambience: roosters crowing far away, insects buzzing, a soft breeze. Seamless loop, no speech, no voices, no music, no vehicles. | Score 5. The rooster sounded close. |
| traffic_loop (take 1) | Distant Indonesian town street ambience: small motorbikes and mopeds passing far away, one far car horn, soft city hum. Seamless loop, no speech, no voices, no music. | Score 4. One close vehicle dominated it. Spread 10.4 dB. |
| jam_loop (take 1) | A jammed Asian town street at a standstill: many small motorbikes idling together, scattered short horns from different distances, nobody moving. Seamless loop, no speech, no voices, no music. | Horns dominated. The engines sat at -36 dB for 5 s. |
| kentongan (take 2) | Fast repeated hollow wooden knocks, tok tok tok tok tok tok tok tok, a stick beating a hollow bamboo tube drum, about six knocks per second without stopping for two seconds. Dry outdoor recording, solo wood percussion only. | The knocks stopped at 1.1 s. |
| harvest (take 3) | Close rustling and swishing of dry rice stalks and straw being gathered by hand, a clear papery rustle for one second, with one very quiet small chime in the background. Foley, no music, no voices. | Score 5. It sounded like bells. The listening check flagged music. |
| wind_loop (take 2) | Gentle warm wind moving through palm trees, soft rustling and swaying of dry palm fronds, slow natural gusts, outdoor tropical coast ambience, seamless loop, no music, no voices. | Score 2. It sounded like water spray. |
| traffic_loop (take 2) | Far away background hum of a small Asian town street heard from a rooftop: many thin buzzing motorbikes blending together at low level, no single vehicle close, one faint car horn far away. Even, steady ambience, seamless loop, no speech, no voices, no music. | Score 1. One engine revs close. Spread 28.1 dB. |

Three effects are foley edits of generated takes. No other source is in them.

- `templegong`: take 3 is the wooden fish. The gong of take 2 sits on top at -3 dB. Take 2 alone gave only a gong.
- `harvest`: take 4 is the rustle. The chime from take 2 sits on top at -10 dB, 0.3 s in.
- `wind_loop`: take 4 carries the gusts. The frond rustle of take 3 sits under it at -6 dB against the take 4 RMS. Take 4 alone has silent gaps between gusts. Takes 1 to 3 alone sound like spray.

## Voice

Method: the `gemini-tts` skill helper, `scripts/gemini_tts.py manifest`. Model: `gemini-3.8-flash-tts`. Language: `id`. Voice: **Sulafat**, one prebuilt voice for all lines. Receipts sit beside the raw WAV files in `.audio-src/voice`.

Style for every line:

> A clearly female voice: a warm, dry-humoured Javanese woman in her sixties, the village head. She speaks Bahasa Indonesia with a soft Javanese lilt. Brisk, lively conversational pace with very short pauses. A little teasing, like a kind aunt who has seen everything.

### Casting

Gacrux had the first full recording. The listening check heard a male voice on 17 of 28 lines. Its median pitch was near 150 Hz. Those takes stay in `.audio-src/voice/gacrux_takes` and `take1`. Sulafat, Vindemiatrix and Kore then had an audition on 3 lines each. Sulafat was the only voice heard as female on all scored lines. Its pitch stayed near 190 Hz.

### Script

`public/audio/voice/lines.json` holds the script. Bu Lurah is an in-fiction voice. `id_text` and `en_text` are exempt from the copy register. The `when` field follows the register.

The level list changed after the first recording. The script now has 11 levels. Lines keep their take if the text still fits the place:

| Level now | Take from | Note |
|---|---|---|
| l12 to l16, `train_late` | New recording | Salatiga and the Part 2 traffic levels. |
| l4_intro, l5_intro, l5_win | Same id | Unchanged. |
| l6 | Old l2 | Subak lines fit Ubud. |
| l7 | Old l6 | Lindu. |
| l8 | Old l7 | Lereng. |
| l9 | Old l8 | Merapi. |
| l10 | Old l9 | Pesisir. |
| l1, l2, l3, l4_win, l11 | New recording | New text. |

The final line of Part 1, `l12_win`, has 3 alternate takes in `.audio-src/voice/l12_win_alts`. The first take read as "Solotigo" on 5 of 5 passes. That is the Javanese form of the town name. The brief spells "Salatiga", so the direction now asks for open a sounds. Take alt1 read as "Salatiga" on 5 of 5 passes. This line keeps its natural pauses.

Only l6 and l9 mention sawah. Superseded takes stay in `.audio-src/voice/superseded_v1` and `superseded_v2`. Retakes with shorter text stay in `sulafat_long_takes`.

### Encode

The note in `microgame/CLAUDE.md` sets the targets: trimmed, -18 LUFS, TP -2, mono, 40 kbps. This pipeline changes the method in three ways.

- A gain step and `alimiter` replace single-pass `loudnorm`. Single-pass `loudnorm` misreads clips this short.
- Pauses longer than 0.3 s drop to 0.3 s. The model pauses at length, and this kept lines under the limit.
- Lines above 5.85 s get `atempo` of at most 1.08. Longer lines got a new take with shorter text.

Filters: `silenceremove` on both ends at -50 dB, then the pause cap, then `libmp3lame -b:a 40k -ac 1 -ar 24000`.

| id | Direction | Seconds | Tempo | LUFS | dBTP | Median F0 Hz |
|---|---|---|---|---|---|---|
| l1_intro | Warm and conversational, a small smile in her voice. | 5.678 | 1 | -18.1 | -2.8 | 198 |
| l1_win | Pleased and warm, teasing a little. | 4.358 | 1 | -17.9 | -3.5 | 188 |
| l2_intro | Warm and conversational, a small smile in her voice. | 4.975 | 1 | -18.1 | -1.8 | 167 |
| l2_win | Pleased and warm, teasing a little. | 4.216 | 1 | -17.8 | -2.7 | 198 |
| l3_intro | Warm and conversational, a small smile in her voice. | 5.18 | 1 | -17.8 | -4 | 184 |
| l3_win | Pleased and warm, teasing a little. | 4.381 | 1 | -18 | -3 | 182 |
| l4_intro | Warm and conversational, a small smile in her voice. | 5.624 | 1 | -17.8 | -2.9 | 184 |
| l4_win | Pleased and warm, teasing a little. | 5.458 | 1 | -18 | -4.5 | 200 |
| l5_intro | Warm and conversational, a small smile in her voice. | 5.244 | 1 | -17.9 | -5 | 195 |
| l5_win | Pleased and warm, teasing a little. | 5.349 | 1 | -18 | -2.7 | 203 |
| l6_intro | Warm and conversational, a small smile in her voice. | 5.313 | 1 | -18 | -2.5 | 195 |
| l6_win | Pleased and warm, teasing a little. | 5.186 | 1 | -18.2 | -3.3 | 182 |
| l7_intro | Quiet and serious. No teasing. Keep moving, no long pauses. | 5.178 | 1 | -17.8 | -3.1 | 168 |
| l7_win | Relieved and brisk. No teasing. Each phrase runs into the next, no pauses. Alhamdulillah is quick and light. | 5.853 | 1.053 | -18.1 | -2.7 | 178 |
| l8_intro | Warm and conversational, a small smile in her voice. | 5.861 | 1.043 | -17.8 | -2.4 | 205 |
| l8_win | Pleased and warm, teasing a little. | 5.25 | 1 | -17.9 | -3.1 | 172 |
| l9_intro | Warm and conversational, a small smile in her voice. | 5.868 | 1.049 | -17.8 | -3.2 | 178 |
| l9_win | Pleased and warm, teasing a little. | 4.222 | 1 | -17.9 | -2.3 | 176 |
| l10_intro | Quiet and serious. No teasing. Keep moving, no long pauses. | 5.044 | 1 | -18.1 | -2.8 | 172 |
| l10_win | Quiet, moved, deep relief. No teasing. Keep moving, no long pauses. | 5.66 | 1 | -18 | -2.3 | 188 |
| l11_intro | Dry and amused. A brief hesitation on the word anu, amused at herself. | 5.195 | 1 | -18 | -3 | 200 |
| l11_win | Satisfied, then amused, a small laugh in her voice at the end. | 5.862 | 1.07 | -17.8 | -3.1 | 190 |
| l12_intro | Delighted to be home, happy and warm, quick and lively. Teasing at the end. No long pauses. | 5.306 | 1 | -18 | -3.4 | 193 |
| l12_win | Warm and tender, with a smile in her voice. Proud of her town. Anu is a playful question, Bukan is gentle, Ini Salatiga is full of love. Standard Indonesian pronunciation of the town name, every a is an open a: Sa-la-ti-ga. | 4.386 | 1 | -18.2 | -3.1 | 184 |
| l13_intro | Warm and conversational, a small smile in her voice. | 5.858 | 1.01 | -17.9 | -3.1 | 205 |
| l13_win | Pleased and warm, teasing a little. | 5.847 | 1.003 | -17.8 | -2.3 | 225 |
| l14_intro | Warm and conversational, a small smile in her voice. | 4.72 | 1 | -18.1 | -3 | 225 |
| l14_win | Pleased and warm, teasing a little. | 5.495 | 1 | -18 | -4 | 203 |
| l15_intro | Warm and conversational, a small smile in her voice. | 5.218 | 1 | -17.8 | -4.9 | 193 |
| l15_win | Pleased and warm, teasing a little. | 5.138 | 1 | -18 | -3.2 | 190 |
| l16_intro | Warm and conversational, a small smile in her voice. | 4.808 | 1 | -18 | -2.6 | 188 |
| l16_win | Pleased and warm, teasing a little. | 5.504 | 1 | -18 | -3.8 | 184 |
| first_build | Mock surprise, pleased. | 5.066 | 1 | -17.9 | -2.8 | 184 |
| first_harvest | Delighted, teasing a little. | 5.686 | 1 | -17.9 | -2.5 | 211 |
| flood_warning | Firm and urgent, an older woman giving orders. Not panicked, not shrill. No teasing. Quick pace. | 3.443 | 1 | -17.8 | -2.7 | 184 |
| quake_warning | Firm and urgent, an older woman giving orders. Not panicked, not shrill. No teasing. Quick pace. | 3.498 | 1 | -18 | -2.2 | 225 |
| ash_warning | Firm and urgent, an older woman giving orders. Not panicked, not shrill. No teasing. Quick pace. | 3.777 | 1 | -17.9 | -3.3 | 225 |
| wave_warning | Very urgent, an older woman calling out orders, loud and steady. Not panicked, not shrill. No teasing. Quick pace. | 2.769 | 1 | -17.9 | -3.7 | 239 |
| hungry | Dry and teasing, a raised eyebrow. | 4.237 | 1 | -17.9 | -3.4 | 188 |
| level_lost | Gentle and kind, consoling. | 4.11 | 1 | -17.9 | -2.9 | 203 |
| train_late | Dry and teasing, quick. | 4.375 | 1 | -18 | -2 | 180 |

All 41 lines are under 6 s. All lines have 12 words or fewer. A transcript check matched the script on all lines, apart from punctuation and numerals. It heard `l7_intro` and `hungry` as male on the last pass. Perceived age varies between lines.

## Needs a human ear

1. Gamelan identity: `theme.mp3`, `salatiga.mp3` and the three beds. The open question rarely named gamelan.
2. `win.mp3`: the check often heard an orchestra on this cut.
3. `salatiga.mp3`: strings and piano may be too faint. The wrap point sits in the quiet coda.
4. `l12_win`: check the town name and the warmth of the delivery.
5. Voice age and gender: `l7_intro` and `hungry` were heard as male once.
6. Weakest effects by score: `jam_loop` (5), `harvest` (6), `schoolbell` (6), `dog` (6).

## Size

`public/audio` has 99 audio files, 5933443 bytes of audio, plus `manifest.json` and `lines.json`. The limit is 12 MB.
