# Anu

Anu is a mobile-first town builder set in Indonesia. You build a small town on a limited grid, one month at a time. Water, mud, ash, wind and ground motion are real physics. All pixel art is code.

## Languages

The game runs in English, Bahasa Indonesia and Simplified Chinese. Choose the language on the title screen. A first visit follows the device language. `?lang=en`, `?lang=id` and `?lang=zh` set the language in the URL.

## Play

Requires [Node.js](https://nodejs.org/) 22 or later. The game needs no install.

```bash
node serve.mjs
```

Open http://127.0.0.1:5330/. A phone-size window shows the intended layout.

## How to play

1. Tap a card. Tap a tile, or drag to a tile.
2. Press Next month. The month runs for 10 seconds.
3. Read the months at the top. A red mark shows a danger.
4. Press Forecast to see where water goes this month.

Homes and shops must touch a road that reaches the gate. A pasar brings rice. People come only if the store holds 2 months of rice for them.

## Plots

| # | Plot | Place | Goal |
|---|---|---|---|
| 1 | Kampung Baru | Bandung | Reach 16 people |
| 2 | Kota Lama | Semarang | Hold 24 people while the sea rises |
| 3 | Ciliwung | Jakarta | Hold 30 people after two flood crests |
| 4 | Kampung Bajo | Wakatobi | Reach 30 people over a tidal flat |
| 5 | Layangan | Sanur | Hold 3 high kites and 12 people |
| 6 | Ubud | Bali | Harvest rice on 4 terraces |
| 7 | Lindu | Yogyakarta | Keep the balai and 40 people through a quake |
| 8 | Lereng | Tana Toraja | Hold 30 people with no slide on a home |
| 9 | Merapi | Magelang | Harvest 60 rice after an eruption |
| 10 | Pesisir | Banda Aceh | Bring every person to high ground before a wave |
| 11 | Nusantara | The archipelago | Reach 100 people |
| 12 | Salatiga | Central Java | Reach 120 people. Keep a masjid, a gereja, a klenteng and the Plumpungan stone. This plot closes Part 1 |
| 13 | Halte | Solo | Make 20 trips with macet at 20% or less |
| 14 | Stasiun Tugu | Yogyakarta | Make 16 trips with macet at 25% or less |
| 15 | Ambarawa | Central Java | Bring rice up the hill by train 7 times |
| 16 | Manggarai | Jakarta | Make 20 trips with macet at 25% or less after a flood |

## Files

| Path | Contents |
|---|---|
| `public/js/sim/` | The simulation: fluids, buildings, months, traffic, plots. It has no DOM |
| `public/js/gfx/` | The rasteriser, terrain, water, building art, particles |
| `public/js/gfx/toons.js` | The people: planted feet, spring hips, lean, secondary motion and behaviour |
| `public/js/ui/` | Icons and the map |
| `public/js/i18n.js` | The language switch and the `t()` lookup |
| `public/js/copy/` | All player copy, in `en.js`, `id.js` and `zh.js` |
| `public/js/audio.js` | The gamelan synth and sample playback |
| `public/audio/` | Generated music, effects and voice |
| `worker/` | The Cloudflare Worker: Turnstile check, session cookie, audio gate |
| `build.mjs` | Writes the minified site to `dist/` for deployment |
| `tools/card.mjs` | Renders the share card `public/og.png` from the game |
| `tools/autoplay.mjs` | Plays a good plan and a careless plan on every plot |
| `tools/smoke.mjs` | Runs every plot and checks the fluids |
| `tools/audio/` | Audio generation scripts and prompts |
| `DESIGN.md` | The design |

## Test

```bash
npm test
```

## Deploy

The game deploys as a Cloudflare Worker at https://anu.asfarlab.fun/. The Worker serves `public/`. Start runs one Turnstile check. The Worker then sets a signed cookie, and audio needs that cookie. Set the secrets `TURNSTILE_SECRET` and `SESSION_SECRET` with `wrangler secret put`.

```bash
npm install
```

```bash
npm run deploy
```

## Credits

Claude Code wrote the code and the art code. Lyria 3.5 made the music. ElevenLabs made the effects. Gemini TTS made the voice of Bu Lurah.
