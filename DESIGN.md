# Anu: design

Anu is a mobile-first town builder set in Indonesia. The player builds a small town on a limited grid, one month at a time. Real physics runs between the turns. Water, mud, ash, wind and ground motion decide what survives.

"Anu" is the Indonesian filler word for a thing with no name yet. The town starts without a name.

## Pillars

1. **Physics is the rule book.** No rule says "this tile floods". Water flows down the terrain and reaches the tile, or it does not.
2. **One gesture.** Drag or tap a card onto a tile. Press Next month. The rest is watching and thinking.
3. **Each plot has a different goal mechanic.** A plot never only says "reach N people" unless the terrain makes that hard.
4. **Every building is a small show.** Bamboo scaffolding goes up, the building rises, the crew ties the flag on the ridge (munggah molo), the scaffolding comes down.
5. **A town, not a farm.** Roads, shops, flats, markets, schools and traffic carry the theme. Sawah is one tool among many.

## The loop

- **Plan.** The world is frozen. The player spends labour on cards. A placement is free to undo until the month starts. The Forecast button runs the real simulation ahead in a Web Worker. It shows where water goes and what is at risk.
- **Run.** The month plays for 10 seconds of physics. Scaffolds become buildings. Rain falls. Events happen. Traffic moves. The player can fast-forward.
- **Resolve.** Rice arrives, people eat, homes fill, labour refills. The engine records each result as one short sentence.

## Three numbers

- **Warga** (people). Homes hold them. They eat rice. They give labour.
- **Beras** (rice). A pasar brings it by road. Boats and mangrove bring it from the sea. Sawah grows it. People come only if the store holds 2 months of rice for them.
- **Tenaga** (labour). It refills each month. It does not carry over. Formula: 2 + people / 4 + bonuses.

The grid is the fourth constraint. The road network is the fifth. Terrain and water are the deep ones.

## Roads

Every plot with roads has a gate at its edge. A road tile counts if it links to the gate. Homes and shops must touch a counted road. Deep water on a road stops the trucks, so a flood can close a pasar. A road on a river is a bridge. People run faster on roads during an evacuation.

## Physics systems

| System | Model | Mechanic it drives |
|---|---|---|
| Water | Linear shallow-water equations on a staggered grid, 8 cells per tile. Soil saturates, so streams survive | Rain runoff, rob, floods, tides, waves, irrigation, wheel speed |
| Mud (lahar, landslide) | Second fluid with yield stress and heavy friction. It hardens into terrain | Volcano, slopes. Hardened mud changes later water routes and adds fertility |
| Ash | Plume advected by wind, per-cell deposit | Roof load limit. Rain turns ash into mud. Ash on sawah adds yield |
| Wind | Base vector, gusts, shadow from upwind obstacles | Kites, ash drift, rain slant, flags, trees |
| Ground motion | Travelling wave with soil amplification. Each building is a damped oscillator | Quake collapse depends on height, stiffness, resonance and soil. Water sloshes |
| Rigid bodies | Spheres and two-point sticks on the heightfield, with buoyancy and water drag | Debris, falling scaffold poles, boats |
| Verlet rope | Position-based | Hoist ropes, kite strings |

Physics runs at a fixed 60 Hz. It never depends on frame rate. The simulation is pure JavaScript with no DOM, so Node tests and the forecast worker run the same code.

## Cards

`public/js/sim/catalog.js` holds every number. Each plot offers a subset.

- **Roads and homes:** Jalan, Rumah, Rumah bata, Ruko, Rusun, Rumah laut.
- **Town services:** Pasar, Warung, Sekolah, Rumah ibadah, Taman, Balai.
- **Water works:** Tanggul, Saluran, Pompa, Sabo, Kincir.
- **Land and sea:** Sawah, Lumbung, Bambu, Bakau, Dermaga, Lapangan, Kentongan.

## Plots and goal mechanics

| # | Name | Place | Grid | Goal mechanic | Main physics |
|---|---|---|---|---|---|
| 1 | Kampung Baru | Bandung | 5 | Reach 16 people | Roads, the pasar, the 2-month rice rule |
| 2 | Kota Lama | Semarang | 6 | Hold 24 people at month 11 while the sea rises | Rob: a tide that grows each month, levee lines, pumps |
| 3 | Ciliwung | Jakarta | 6 | Hold 30 people after the second crest | River flood, cut roads, bridges, flats |
| 4 | Kampung Bajo | Wakatobi | 6 | Reach 30 people on a tidal flat | Tide, boats, stilt homes |
| 5 | Layangan | Sanur | 6 | Hold 3 kites at height 6 and 12 people | Wind shadow, rope |
| 6 | Ubud | Bali | 6 | Harvest on 4 terraces | One spring, canals, evaporation |
| 7 | Lindu | Yogyakarta | 7 | Keep the balai and 40 people through the quake | Oscillators, soil, debris |
| 8 | Lereng | Tana Toraja | 7 | Hold 30 people with no slide on a home | Soil saturation, landslide, roots |
| 9 | Merapi | Magelang | 7 | Harvest 60 rice after the eruption and hold 12 people | Lahar, ash, fertility |
| 10 | Pesisir | Banda Aceh | 8 | Bring every person to high ground | Wave run-up, mangrove, evacuation |
| 11 | Nusantara | The archipelago | 8 | Reach 100 people | Rob, quake, wave |
| 12 | Salatiga | Central Java | 8 | Reach 120 people and keep a masjid, a gereja, a klenteng and the Plumpungan stone | Quake, Merapi ash, slope slides, and the faith mechanic |

Each plot has two pledges for extra stars, such as "Lose no building".

### Part 2: Traffic

Part 2 opens after Salatiga. The roads and rails are the puzzle.

| # | Name | Place | Grid | Goal mechanic | Main idea |
|---|---|---|---|---|---|
| 13 | Halte | Solo | 6 | 20 trips with macet at 20% or less | Bus stops take mopeds off one street |
| 14 | Stasiun Tugu | Yogyakarta | 7 | 16 trips with macet at 25% or less | Stations, crossings that jam, flyovers |
| 15 | Ambarawa | Central Java | 7 | Bring rice up the hill 7 times | A steam train, grades, wheel slip, rack rail |
| 16 | Manggarai | Jakarta | 8 | 20 trips with macet at 25% or less after a flood | Two rail lines, stations, water on the rail |

The traffic simulation is in `public/js/sim/transit.js`.

- **Vehicles.** Each worker makes a trip at rush hour. A vehicle queues behind the one ahead. A lane holds 2 vehicles per tile. A junction holds 2 in all. Macet is the share of vehicles that stand still.
- **Buses.** A bus runs for each stop, in a loop through all stops. It stops in the lane, so it can hold up the traffic behind it.
- **Trains.** A train has mass, power, adhesion and a braking distance. It cannot climb a grade that exceeds its grip. Rain reduces grip. Rack rail removes the limit. A train closes a level crossing from 2.4 tiles ahead until the last car passes. A flyover removes the crossing. Water on the rail stops the train.
- **Rice.** On these plots a truck must really reach the pasar. A jam can starve the town.

`node tools/autoplay.mjs` plays a good plan and a careless plan on every plot under the same rules as a player. Each good plan must win. Each careless plan must lose.

## The boss of Part 1: Salatiga

Salatiga is the hometown of the game's author. It closes Part 1, and it gets the most care.

- **Place.** The town stands on the slope of Merbabu. Merbabu and Telomoyo stand behind it as a painted backdrop. Morning mist drifts over the plot.
- **Landmarks.** Lapangan Pancasila is a fixed square with a flag and two banyans. The Plumpungan stone from the year 750 stands on the plot. It must survive. Trees line every road.
- **Mechanic.** Salatiga is known for its tolerance. The masjid, gereja and klenteng each give 2 labour, plus 2 more labour for each other faith within 2 tiles. The best layout puts them close together. A kampus adds 2 people to each home within 2 tiles.
- **Sound.** This plot has its own Lyria score. The score replaces the synth for the whole plot.

## Mobile-first architecture

- **Exact pixels.** The canvas fills the viewport. The game picks an integer device-pixel zoom that fits the plot width, then sizes its buffers to match. There is no letterbox and no blur.
- **Thumb zone.** Cards and the main button sit at the bottom. The drag ghost lifts above the finger.
- **Budget.** All art is code, baked into depth stamps on first use. Each frame restores the baked layer and draws only what moves. The loop runs at 30 fps. A placement rebakes only the screen columns over the changed tiles.
- **Interruption.** The game autosaves after each month. It pauses when the tab is hidden.
- **Payload.** No frameworks and no image assets. Audio loads after the first tap.

## Art direction

Dukun is the baseline. Anu must look better than Dukun.

Kept from the sibling repos: fixed 30-degree orthographic view, hue-shifted ramps, Bayer dither, depth-buffer edges, hard shadows to screen right.

Changed for a town builder:

- **The plot owns the screen.** The plot has full colour and sharp detail. It sits on a retaining wall.
- **The outer land is a pale wash.** It reaches both side edges of the canvas. It shows a town, a coast or a forest at low contrast. It fades to paper far from the plot. It must never compete with the plot.
- **Solitude has a place.** The title shows one small floating town on white paper. A plot opens by dithering outward from paper. A win dissolves the wash to paper, and the finished town stays as a floating diorama with a cross-section.
- **Life on the plot.** Mopeds, angkot and trucks drive on the left. Power poles carry sagging cables. Street lamps light at night.
- **Regional architecture.** Homes change by plot: joglo, kolonial, Bali, Bajo, Tongkonan, Aceh. Houses of worship follow the region: masjid, pura, gereja.
- **Weather and time.** Per-channel lookup tables grade morning, dusk, night and rain, including the page colour.

## Audio

- Main theme: Lyria 3.5, title screen only. Gamelan with a modern pad.
- Play music: synth sequencer in slendro and pelog with original melodies.
- Effects: ElevenLabs, encoded at low quality on purpose. Bu Lurah speaks Indonesian lines through Gemini TTS.
- Music ducks under speech. Music never masks a gameplay cue.

## Copy

All UI text and engine result lines follow the ASD-STE100 register. Bu Lurah's lines are in-fiction voice and are exempt.

The game has two languages: English and Bahasa Indonesia. Neither is a translation of the other. The Indonesian follows the same register and uses `kamu`. Building and plot names are the same in both. The voice of Bu Lurah is Indonesian in both. Only her subtitle changes.
