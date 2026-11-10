# Round 1 — design proposal (opus-medium)

**Summary.** Keep Three.js and the `WorldView` API, but stop lighting the world with Three's forward point lights. Add a **tile light field**: a small GPU pass that, every frame, computes light for the visible tiles from up to 64 sources, with shadows cast by the same opaque tiles the server uses for line of sight. Every material, actors included, samples that field. This one change gives many lamps, wall shadows from torches, real night and a black underground, and it uses the same rule the server uses to decide what you can see. On top of the genre baseline, light becomes a small server rule in `packages/game`. A deterministic clock comes from `state.time`. A pure `lightAt(tile)` function decides visibility. Creatures and players standing on dark tiles are **not sent to your client**, except as a pair of eyes when they are within 3 tiles. A held torch takes the off-hand slot, so carrying light costs you your shield. Natural regeneration stops in the dark. Because hidden things are never sent, a brightness slider for accessibility cannot be used to cheat. Actors become silhouette-first low-poly rigs rendered at low resolution. Their poses step at 10 fps and their facing snaps to 8 directions, so they read as pixel animation while still taking real torch light. A baked-sprite variant of the same rigs goes in the same picker for comparison. Grandeur comes from four things: cloud shadows, one landmark far too big for the screen (the Great Lantern in the market), sky and moon reflected in water, and a few "vista" moments where the camera lowers its pitch to show a painted sky. Build four prototypes, in order: `lightfield` (the engine decision), `nightfall` (light as a rule), `actors` (art and weight), `vista` (grandeur).

---

## 1. Engine: keep Three.js 0.187 on WebGL2, replace the lighting model

**Decision: no engine switch.** What hurts today is the lighting model, not the engine:

- Point lights come from a fixed pool of 8 (`apps/client/src/render/view.ts:12`, `:129`), chosen by distance to the camera centre four times a second (`view.ts:426`, `:503`). The pool is fixed for a reason: in Three's forward renderer every light is a loop iteration in every lit fragment shader, and changing the light count recompiles programs (from memory, consistent with the code fixing the pool at 8). A night town with 17 lamps (`packages/game/src/town.ts:140`, `:159`) plus torches, spells and windows will not fit in 8.
- Point-light shadows in `WebGLRenderer` are cube shadow maps: 6 scene renders per light (from memory, unverified against 0.187 source). That works for one light, not for a street of lamps. Today only the sun casts shadows (`view.ts:106-127`), so lamp light passes straight through walls.
- The player's torch exists only underground (`view.ts:499`). On the surface, darkness has no mechanism at all.

A WebGPU/TSL path does exist in the installed package (`node_modules/three/build/three.webgpu.js`, verified). It would buy compute shaders, but nothing here needs compute. A 2D grid light pass is an ordinary fragment shader on WebGL2. Switching to Babylon or a 2D sprite engine would mean rewriting `WorldView` (`update`, `onPick`, `applyStyle`, floors, roof hiding, labels, pixel-snapped camera) and losing the one thing the video-2 reference proves: real low-res 3D geometry with torch shadows reads as pixel art. **Not worth it.**

**What changes inside `WorldView`:**

1. **Tile light field (new).** This is the core change.
   - **Occupancy texture:** one R8 texel per tile per floor, 1 where `thingHidesSight` is true (`packages/game/src/model.ts`, `opaque` set). It is rebuilt only when doors change.
   - **Source table:** a 64×2 float texture holding position, height, radius, colour, intensity and flicker phase. The sources are lamps from `terrain.ts:348-370`, carried lights from players in view, spell flashes, windows and the Great Lantern.
   - **Light pass:** a render target covering the camera's tile window plus a 4-tile margin at 6 texels per tile. That is about 40×34 tiles, or 240×204 texels. For each texel it loops over the sources in range (frustum-culled on the CPU, typically 8–20) and marches the occupancy texture for at most `radius` tiles, about 12 steps. Two jittered samples per source give a soft penumbra. Order of cost: 50k texels × 16 sources × 12 steps ≈ 10M texture reads, comfortable on integrated GPUs (estimate, to measure in P1).
   - **Sampling:** every material samples the field through `onBeforeCompile`. Ground uses its own xz position. Vertical faces sample xz + 0.5·normal, so a wall face turned towards a lamp lights up and the far side stays dark. Actors sample at their feet plus a top-down term.
   - **Result:** shadows from every light source, cut along the same tile edges the rules use. What you see matches the rule.
2. **Sun/moon.** Keep the single directional light and its shadow map. Drop the map size from 2048 to 1024, because the internal target is only 480 px tall (`content/render-style.json` `pixelHeight: 480`). Its colour, direction and intensity come from the clock, and at night it becomes the moon.
3. **Darkness compositing.** Final light = sun·shadow·worldLight + hemisphere·worldLight + lightField. Underground `worldLight` is 0. The post shader (`view.ts:15-60`) gains a **value floor** uniform (the brightness setting) and a cold "night grade" that desaturates and pushes toward blue below a luminance threshold. Warm source light keeps full saturation. This produces the orange-against-blue palette of `video-1`.
4. **Keep:** the low-res half-float target, the post pass (ACES, outlines, Bayer quantisation), the pixel-snapped camera (`view.ts:481-492`), roofs and floors, labels, `onPick`. Remove the pooled `PointLight`s and the cave-only torch once P1 wins.
5. **Sky backdrop.** A camera-parented gradient plane with clouds, moon and stars sits behind the far plane. It is only visible in vista moments (§5) and in water reflections (it is sampled as a texture).

## 2. Actors and art pipeline

**Decision: silhouette-first low-poly rigs, rendered low-res, animated in stepped poses, plus a baked-sprite variant for comparison.** No artist is available, so the first pass has to be authored in code. Claude can author good shapes but not good hand-pixelled sprite sheets. The boxes fail because of their shapes and their smooth motion, not because they are 3D.

- **Shapes.** Replace unit boxes (`apps/client/src/render/actors.ts:3`, `part()`) with a small set of primitives: tapered box, wedge, low-poly cone (hood, cloak, skirt), 6-sided cylinder (limbs, tusks), and a squashed sphere (heads, boar body). Extend `content/models.json` parts with a `shape` field so Studio keeps editing them. Silhouette rules: big readable hood or hat, cloak as a cone that sways, proportions of about 2.5 heads, chunky hands and feet. Boars get a wedge snout, a hunched shoulder mass and short legs.
- **Pixel-art read.** Four things make 3D read as sprites:
  1. The pose updates at **10 fps** (animation time is quantised; position interpolation stays smooth and tile-exact).
  2. Facing snaps to **8 directions** with no rotation tween.
  3. Material colours are locked to a **32-colour palette** per look, using a 3-band toon ramp instead of Lambert.
  4. A **per-actor 1 px dark outline** comes from an ID/depth pass, already half there in the post shader (`view.ts:39-42`).
- **Frames per action** (pose keys, stepped): idle 2 (breath), walk 4, attack 3 (wind-up / strike / recover), hit 1, death 4, cast 3.
- **Light.** Rigs take the light field and the moon shadow like any geometry, so a torch lights a boar's face and leaves its back black. This is the video-2 effect, and the reason to stay 3D.
- **Variant B in the same prototype: baked sprites.** At load, render each rig from 8 directions × all pose keys into an atlas at the exact on-screen pixel size, together with a normal-map pass. Draw them as camera-facing quads lit by a light-field + normal shader. It costs no extra art. If the user prefers the flatter sprite look, the bake is ready to become the path for hand-painted overrides later (the same atlas layout an artist would paint into). Choose between A and B by eye in P3.
- **Pop.** Drop `actorPop` emissive self-light (`actors.ts:6`), which makes actors glow in the dark and kills fear. Readability comes from outline and rim instead.

## 3. Light as a mechanic

### Genre baseline (server)

- **Clock.** `dayPhase(time)` is derived from `state.time` (`packages/game/src/engine.ts:437`), which is deterministic and already ticked. It needs no new state field. `balance.world.dayMs` sets the length, and `GameView` gains nothing because `time` is already sent.
- **Light levels 0–7 per tile.** `lightAt(pos)` = max over:
  - world light: day 7, dawn and dusk 4, night 1; underground (`z=1`) always 0;
  - each source in radius r whose tile has `Geography.sight()` to the target tile, at level `L − distance`. Lamps are L6 r5, a held torch L5 r4, the altar L6 r4, the Great Lantern L7 r9;
  - spell flashes: Ember (L4) along its path and at impact for 1 s.
- New file: `packages/game/src/light.ts`. Pure functions over `MapData` plus state. Server and client import the same code. The client uses it only for the debug overlay; the authority is what the server sends.

### What we add so darkness is frightening (first rule change, behind `balance.world.light: false` by default)

1. **You cannot see into darkness.** A tile is *seen* if light ≥ 2 or it is adjacent to you (touch range). `Engine.view()` (`engine.ts:~640`) stops sending monsters, other players and corpses on unseen tiles. **Eyes:** an unseen monster within 3 tiles is sent as `{id, x, y, eyes: true}` with no kind and no HP. The client draws two glints and nothing else. You cannot target what you cannot see (`target` and `cast` reject unseen ids). This is the fear mechanic, and it is cheat-proof because nothing hidden is ever sent.
2. **Light costs something.** A `torch` item goes in the shield slot (`equipSlots`). While held it gives L5 r4, but it gives no block, because the guard falls back to the weapon (`engine.ts:597-599`). It burns for 8 minutes of tick time and then becomes a burnt stub. Pell sells torches cheaply. You choose between a shield and sight. (Later: a belt lantern that burns oil, for more money.)
3. **Darkness wears you down.** While you stand on a tile with light < 2, the fed regeneration tick (`engine.ts:443-446`) does not apply. It is invisible as a number, but you feel it, and it pushes players toward light.
4. **Creatures prefer the dark** (second change, still small). In darkness a monster's `aggro` grows by +2 (`engine.ts:584`), so it sees you before you see it. Creatures flagged `fearsLight` (undercroft grubs, a future night creature) will not step onto tiles with light ≥ 5, so lamps and the Great Lantern ward the town and a torch held high keeps them at the edge of your circle, where you only see eyes.

Deliberately left out of the first rule change: oil and fuel economy, light-based stealth for players, sanity meters, and monster light sources.

### Client presentation

- Exactly the light field from §1. Unseen tiles render at the value floor: geometry stays faintly outlined, but nothing lives there.
- A torch flickers in intensity and position by ±0.03 tiles (no ±radius flicker, so the visible area stays honest). Lamps come on at dusk.
- Eyes are two 1 px emissive pixels that blink, and they are not affected by the night grade.
- When your light runs out, the post shader runs a 1.5 s vignette contraction. Optional sound (P2 only): torch crackle, a low drone in darkness, a growl on the first eyes sighting. Fear does not land silently, so sound is the one exception I would make to "no sound yet".

## 4. Day and night

- **Cycle: 40 minutes real time.** Day 18, dusk 3, night 16, dawn 3. Night has to be long enough to plan around (a night hunt with torches is a choice) and short enough that nobody quits over it. The prototype has a scrub slider and a 60× speed toggle.
- **Palette keyframes** live in `RenderStyle`, extending `content-schema.ts`. Each is a look the existing style already supports:
  - day: neutral sun at 50° elevation, light split toning;
  - dusk: today's "Golden hour" look (`content/render-style.json`), low warm sun, long shadows;
  - night: the moon as the directional light, `#6f86c8` at about 12% of the sun's intensity, long cold shadows, hemisphere `#1a2340`/`#0b0f18`, night grade on;
  - dawn: pink-violet, mist planes in the meadow.
  `applyStyle` blends between keyframes by phase.
- **Lamps come on in order.** At dusk each lamp lights with a delay proportional to its path distance from the Lamplighter house (`town.ts:124`), 0–40 s, each with a brief match flare. At night windows show emissive warm quads on building walls, a random 70% lit; after midnight some go dark. Both are presentation only. The lamps' rule light switches at dusk start, a few seconds earlier, so the visuals never show more light than the rule grants.
- **Moon and stars from a steep camera.** The camera does not see the sky, so the sky has to reach the ground:
  1. water tiles reflect the sky texture: moon disc, stars, sunset gradient;
  2. the moon's direction gives long, cold shadows;
  3. moonbeam shafts reuse the existing ray planes (`view.ts:157-190`) in blue;
  4. fireflies drift in the meadow at dusk and dust motes by day (`view.ts` dust);
  5. vista moments show the sky directly (§5).
- **HUD:** a small sun/moon dial on the minimap panel.

## 5. Grandeur

Ranked by impact per cost. Build the first four:

1. **Cloud shadows.** A large scrolling noise mask multiplied into the sun term. Slow (1 tile per 3 s), soft-edged, 20–40% darkening. It tells you the world is bigger than the screen. It is the cheapest high-impact item.
2. **One landmark too big for the screen: the Great Lantern.** A tower in the market square (37–44, 28–36 is open ground per `town.ts:238`; exact tiles to confirm), 12–16 units tall. From the 50° camera its top runs off the screen edge, which is exactly what sells scale. In the day its shadow sweeps across the market as the sun moves. At night its beacon is the strongest light source (L7 r9), and the whole town's safety rests on it. It fits the fable (the town is literally named for it) and it ties light to place.
3. **Sky in water.** Covered in §4. The river under the north bridge (`town.ts:245`) becomes the most beautiful place in town at dusk and at night.
4. **Vista moments.** On a few flagged tiles (south gate looking out, north bridge, the undercroft exit at dawn) the camera eases its pitch from 50° to 28° over 1.2 s, and back when you step off. At 28° the ortho view covers about 18 tiles of depth, the sky backdrop shows above the far map edge with painted far ridges and a distant castle silhouette, and haze (blue fog by depth, which is now meaningful at low pitch) layers the distance like `ref-2`. It is input-safe: picking still raycasts against the same ground plane. It is optional per player.
5. Later, not now: creatures bigger than one tile (a 3×3 visual "old stag" occupying one rule tile), weather, a perspective-camera mode.

**Rejected:** a permanent low camera, which wrecks tile readability, and painted parallax backdrops during normal play (at a 50° pitch they cannot be placed honestly).

## 6. Feel and weight (true to server timing)

The server sends positions, `stepMs`, `attackAt` (in `Player`, `model.ts`), and effects with `time` and `from` (`model.ts` `Effect`). Everything below derives from those values and adds nothing to the outcome.

- **Steps.** Keep the exact interpolation over `stepMs` (`view.ts:446`), but shape it with an ease-in-out that still arrives exactly at `stepMs`. On foot contact, at the 10 fps pose key, emit 2–3 dust pixels on dirt or meadow and a splash on water. The body drops 1 px at contact. Never overshoot the tile.
- **Wind-up.** Your own `attackAt` is known, so the wind-up pose begins 200 ms before it. The strike pose shows **only when the `hit`, `miss` or `block` effect arrives**. If none arrives (the target died or moved), the wind-up relaxes over 150 ms. Other actors play the wind-up when their effect arrives, then strike: a 100 ms lie in pose order, never in outcome.
- **Hit-stop.** On a `hit` effect, freeze both actors' poses for 70 ms (scaled by damage share, up to 110 ms), flash the victim one frame in palette white, and squash the victim 0.12 tile away from the attacker, back in 160 ms. Positions stay within ±0.15 tile of the server tile. On a big hit, kick the camera 1 *pixel* (snapped) away from the source; on damage to you, 2 px plus the existing hurt flash (`view.ts:539`).
- **Spells.** The Ember projectile is a light source in the field, so walls and faces light up as it flies. Impact gives a light pulse (L6 r3, 300 ms) and 8–12 ember pixels that fall under gravity. Mend and Renew give a soft upward column of motes and a cool light pulse on yourself.
- **Death.** A 4-key collapse, a dust ring, and a short pause before the corpse mesh swaps in. A dying light source (a dropped torch) gutters out over 1 s.
- **Doors and roofs.** Doors swing with an overshoot (`view.ts:519`). Roofs fade by alpha dither instead of popping (`view.ts:513`).

## 7. Prototypes, in order

All four follow the `proto/chrome` pattern (`apps/client/proto/chrome/main.ts`): the real `Engine` runs locally, there is a picker on top, and nothing in production imports them. Shared prototype code goes in `apps/client/proto/lib/`.

### P1 — `proto/lightfield`: the engine decision

- **Proves:** Three.js on WebGL2 can light a whole town at night with 40+ sources, shadows from walls and trees for every source, and a smooth day/night blend, within budget. If this fails, we revisit the engine in round 2.
- **User sees:** the town and meadow with a time-of-day slider and a 60× button. Lamps light up one by one at dusk, torch shadows wedge out from walls and trees as you walk, the undercroft is black outside your torch, and cloud shadows drift by day. A picker switches between "light field", "today's 8 pooled lights" and "debug: light levels as numbers per tile".
- **Files:** adds `apps/client/proto/lightfield/{index.html,main.ts}` and `apps/client/proto/lib/{lightfield.ts,daynight.ts}`. It patches `WorldView` materials by scene traversal and `onBeforeCompile`, with no edits to `src/` (if a hook is unavoidable, one optional `beforeRender` callback in `view.ts`).
- **Judge:**
  - (a) Frame time is ≤ 8 ms GPU and steady at 60 fps on an M-series MacBook at 1080p and at 1600p, with 40 sources in view (Chrome performance panel, recorded).
  - (b) A lamp behind a wall leaves the wall's far side and the tiles behind it dark, along tile edges.
  - (c) Screenshots at noon, dusk, midnight and in the undercroft look like four different worlds.
- **Size:** about 700–900 lines.

### P2 — `proto/nightfall`: light as a rule

- **Proves:** darkness changes play, server-side, and the screen never contradicts the rule.
- **User sees:** night in the thornboar meadow. With a shield and no torch you see only adjacent tiles and pairs of eyes. Equip a torch (hotkey) and the circle opens to 4 tiles, but your shield stops blocking. In the dark the battle list only lists what you see, regeneration stops (shown by a small icon), and back inside the lamp ring of the town you are safe. A debug toggle overlays the server's "seen" tiles on the light field.
- **Files:**
  - `packages/game/src/light.ts` (new);
  - `engine.ts`: view filter, eyes, `target`/`cast` guard, regen gate, torch burn;
  - `model.ts`: an optional `eyes` field on `Mob` in the view;
  - `content-schema.ts` and `balance.json`: `world.light`, `dayMs`, torch item;
  - `tests/light.test.ts`;
  - `apps/client/proto/nightfall/`.

  Everything sits behind `world.light: false`, so production behaviour is unchanged until it is switched on.
- **Judge:**
  - (a) Tests pass: a boar 3 tiles away in the dark is absent from `view()` and present as eyes; with a torch it is present; it is never present behind a wall even when lit; you cannot target an unseen id.
  - (b) In the overlay, the client's lit contour (light ≥ 2) matches the server's seen set on every tile.
  - (c) `npm test` and `npm run typecheck` stay green.
- **Size:** about 250 lines in rules plus tests, about 300 in the prototype.

### P3 — `proto/actors`: art and weight

- **Proves:** characters and creatures read as pixel art with weight, without an artist, and the feel never lies about timing.
- **User sees:** the hero, Mira, NPC looks and thornboars fighting by a torch at dusk. The picker offers A (stepped low-poly rigs, live-lit) against B (baked 8-direction sprite atlas with normals), plus toggles for hit-stop, wind-up, squash and camera kick, and a 0.25× slow-motion button.
- **Files:**
  - `apps/client/proto/actors/`;
  - `apps/client/proto/lib/{rigs.ts,bake.ts,feel.ts}`;
  - a `shape` field read from a prototype copy of `content/models.json` (production file untouched).
- **Judge:**
  - (a) At 1× the user can tell the boar's facing and the hero's attack phase from a still screenshot.
  - (b) An instrumented log shows that no strike pose is drawn before its effect arrives, and that actors are never more than 0.15 tile from the server tile.
  - (c) The user picks A or B.
- **Size:** about 800 lines.

### P4 — `proto/vista`: grandeur

- **Proves:** a steep tile camera can feel vast.
- **User sees:**
  - the Great Lantern in the market, whose shadow sweeps at day speed ×60 and which is a beacon at night;
  - the river reflecting the sunset, then the moon and stars;
  - walking out of the south gate eases the camera into a vista with the painted sky, far ridges and haze, then back;
  - windows lighting at dusk.

  It builds on P1's light field.
- **Files:**
  - `apps/client/proto/vista/`;
  - `apps/client/proto/lib/{sky.ts,landmark.ts,water.ts}`;
  - the Great Lantern placed in a prototype-local map patch (no `town.ts` edit until it wins).
- **Judge:**
  - (a) A side-by-side of the user's references and four prototype screenshots: does the colour story (warm sources on deep blue) match `video-1`?
  - (b) The vista transition never moves the player's tile or breaks clicking.
  - (c) The frame budget from P1 holds.
- **Size:** about 600 lines.

### Explicitly not built yet

- Production migration of `WorldView`.
- WebGPU.
- Hand-drawn sprite pipeline and Studio pixel editor.
- Weather.
- New creatures or big multi-tile monsters.
- Fuel and oil economy.
- Explored-map memory or fog of war.
- Sound beyond three cues.
- Changes to the real `town.ts`.

## 8. Risks

- **Performance.** The internal target is fixed at about 853×480, so cost does not grow with display resolution. Only the final upscale pass does, and that pass is trivial. Budget on an M1/M2 integrated GPU at 60 fps (16.6 ms):

  | Item | Budget |
  |---|---|
  | Scene at low res | ~3 ms |
  | Sun/moon shadow map, 1024 | ~1 ms |
  | Light field, 240×204 × ~16 sources | ~1.5 ms |
  | Post | ~0.5 ms |
  | Upscale | ~0.5 ms |
  | **GPU total** | **~7 ms** (estimates; P1 measures them) |

  CPU risks:
  - the per-frame dust loop and per-actor DOM label transforms (`view.ts:520-526`, `:470-475`), fine at today's counts;
  - shader recompiles when material features toggle: keep all light uniforms fixed-size so no recompiles happen.

  Fallback if the light pass is too heavy: 4 texels per tile and one shadow sample per source.
- **Readability in the dark.** You always see adjacent tiles (the touch rule). Your own character always takes a minimum rim. Labels and HP bars only exist for things the server sent, so the HUD never shows what the screen hides. Town lamps and the Great Lantern make the town a readable safe zone. The value-floor slider (0–15%) lifts geometry only, and it is fair because hidden entities are not sent.
- **Brightness and accessibility.**
  - Respect `prefers-reduced-motion` for camera kicks, vista easing and flicker amplitude (flicker ≤ 3 Hz in luminance swings above 10%, to stay clear of photosensitivity limits).
  - Darkness uses value, not only hue, so colour-blind players get the same read.
  - Keep the hurt flash below full-screen white.
- **Fear vs. frustration.** If night empties the meadow, shorten nights or make torches cheaper. Both are balance values (`dayMs`, the torch price) editable in Studio, not code.
- **Art cost.** The code-authored rigs and the bake keep it near zero now. The risk is a ceiling on quality. P3 variant B keeps a door open for an artist to paint over baked atlases later without changing the engine.
- **Scope.** P2 is the only prototype that touches `packages/game`, and it does so behind a flag. If round 2 trims anything, cut P4's vista camera first and keep the Great Lantern and water.
