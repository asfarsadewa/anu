# Anu: notes for Claude

A mobile-first Indonesian town builder. Physics runs between monthly turns. DESIGN.md holds the design. README.md holds the file map.

## Direction from the user
- This is a city builder. Rice terraces are fine for some plots. They must not be the whole game. Keep expanding the town theme: roads, shops, flats, services, traffic.
- Dukun is the visual reference to beat. It is not a level guide.
- The outer land must not steal focus. Keep it a pale wash that fades to paper. It must fill the canvas width. White paper solitude is welcome where it means something.
- Every building needs a scaffolding and erection animation. Physics has first-class attention. Visual fidelity is high priority.
- Salatiga is the user's hometown. It is the boss of Part 1. After it, Part 2 has traffic goals: stations, bus stops, jams. The user left the rest of Part 2 to our creativity. Salatiga needs top visuals and its own score. Treat its landmarks with care: Lapangan Pancasila, the Plumpungan stone, Merbabu, Telomoyo.
- All pixel art must be code. Audio may be generated and low quality, but the main theme must be polished.

## Run and preview
- `node serve.mjs` serves `public/` on http://127.0.0.1:5330/. `.claude/launch.json` has an `anu` config. `?level=<id>` opens a plot. `?still=icon` and `?still=card` show the picture alone.
- `window.__game` exposes the game. `G.paused = true` stops the loop, then step with `world.step()` and `scene.stepPhysics()`, then `scene.render(dt)`. `G.crop(x, y, w, h, s)` shows an enlarged crop. The browser pane can show a stale frame, so wait before a screenshot and do not trust real-time timers when the pane is throttled.

## Roads and steps
- `writeTile` in `sim/world.js` shapes a road where the ground changes by one step. Two roads share the climb. A road running straight at empty ground climbs to meet it. A building that opens onto the road gets stone steps. A wall beside a road stays a wall. `test/roads.test.mjs` sweeps every one-step edge on every plot.

## State that lasts
- `CARRIED` and `CARRIED_TRANSIT` in `sim/world.js` list what passes from one month to the next. The save and the forecast both use them. Add new lasting state there. `test/sim.test.mjs` checks that a resumed game matches a game that never stopped, and that the forecast matches the real month.

## Tests
- `npm test` runs the unit tests, `tools/smoke.mjs` and `tools/autoplay.mjs`. It fails if a good plan does not win, a good plan has a rejected placement, a careless plan wins, or a fluid value is not finite. Merapi and other plots with a spare margin may need retuning after any fluid change.
- Plans obey the same limits as a player. Place a road before the building that needs it.

## Architecture rules
- `public/js/sim/` has no DOM and no drawing. The forecast worker and Node import it. Keep it fixed-step at 60 Hz.
- The renderer draws per-pixel with a depth buffer. Static things bake into `bPix` and `bZ`. Each frame restores them and draws what moves. Use `frame.blit` for stamps.
- A building is a timeline of parts in `gfx/buildings.js`. Scaffold parts carry `scaffold: true`. `P.sticks` become falling poles when the crew strikes the scaffold. Add a `cardArt` maker for a card with no visible building.
- A new soil or tile material needs an entry in `M`, in `SOAK` and in `topColor`.

## Traffic
- `sim/transit.js` runs real vehicles and trains. Its state resets each month. Tune congestion there. `GAP`, `LANE_CAP` and the rush-hour spread move macet the most.

## Deploy
- Cloudflare Worker with static assets at https://anu.asfarlab.fun/: `npm run deploy`. `build.mjs` bundles and minifies the JS and CSS into `dist/` with hashed names. `serve.mjs` still runs the plain source from `public/`. Deploying publishes the site. Get the user's go-ahead first.
- `worker/` gates audio behind one Turnstile check, using the widget of the werewolf repo. Its hostname list must include anu.asfarlab.fun. Never print secrets. Set them with `wrangler secret put` on stdin. `serve.mjs` has no /api, so local play skips the check.
- Check with `npx wrangler deploy --dry-run`.

## The people
- `gfx/toons.js` draws and moves the people. It is presentation only. The sim owns only the evacuation walkers' positions. Feet plant on the ground and swing to the next spot. A spring carries the hips. The spine leans with acceleration, wind and `world.groundAccel`. Keep their proportions chunky, so they read at phone zoom.

## The smooth display
- `gfx/smooth.js` is an optional WebGL display: one pass melts dither, and one redraws edges in the xBR manner. It is all code and adds no assets. `pickScale` holds its fill budget. Scale2x in `gfx/frame.js` is the path for a device with no WebGL. Pixels stays the default.

## Copy
- All UI text, goals, card text, result lines and the README follow the ASD-STE100 register in the user's global instructions. A sentence must be a full sentence. Scan before a commit.
- The game ships in English, Bahasa Indonesia and Simplified Chinese. All player copy lives in `public/js/copy/`: `en.js`, `id.js` and `zh.js`. All are first class. Write each as native copy, not as a literal translation. Indonesian terms: people = warga, labour = tenaga, rice = beras, tile = petak, plot = lahan, goal = target. Address the player as `kamu`. Chinese terms: people = 居民, labour = 人力 (点), rice = 大米 (袋), tile = 格, plot = 地块, goal = 目标, macet = 拥堵. Address the player as `你`. The Chinese localises building and plot names. Only the name Anu stays in Latin script.
- `public/js/sim/` holds no copy. `canPlace` returns a key. `log` entries are `[key, params]`. `main.js` calls `t()`. `test/copy.test.mjs` checks that all files hold the same keys and placeholders.
- Bu Lurah's lines are in-fiction voice and are exempt. Script and subtitles live in `public/audio/voice/lines.json`.
- Place names and Indonesian building names are proper nouns.

## Audio
- `voice-queue.js` gives Bu Lurah one channel. Lines wait their turn, warnings and end lines replace what is playing, and a plot change silences her.
- Long music streams from a pool of audio elements made during the first tap, which phones require. Effects and loops are decoded, and `prepareLevel` frees what the last plot used. `G.audio.audioStats()` shows what is in memory.
- `tools/audio/` regenerates assets. Raw takes live in `.audio-src/`, which git ignores. `PROMPTS.md` logs every prompt. No person has listened to the audio yet. `tools/audio/PROMPTS.md` lists what needs a human ear.
