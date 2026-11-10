# Round 2 final plan (opus-medium)

**Summary.** Keep Three.js r0.187 on WebGL2 and build everything on one renderer fork, `apps/client/proto/_next/`, shown on one page, `/proto/visuals/`, which has a picker. The verdict on the user's zoom idea is **adopt it, with a narrower range than proposed**. There are four zoom steps on one camera:
- three orthographic play steps: 64° ("flat"), 50° ("almost 2D", today's view) and 42°;
- one perspective **scenery** step at about 20°, with a sky, a horizon and the land north of the town.

Zoom works by changing the integer upscale factor while the pixel density stays locked at 24 render pixels per tile. That settles D1 and D5 together. It costs less than it sounds, because the camera never rotates: only the northern skyline has to be authored.

The other positions:
- **Actors (D2).** Opus-authored 3D figure kits, baked at load into 8-direction sprites for each pitch the camera uses. I adopt Opus xhigh's bake and drop my live rigs. The bake is what lets the figures survive the camera range.
- **Movement (D3).** The body still walks between tiles over the server's step time, but picking, rings, markers and light anchor on the confirmed tile. This adopts Terra's truthfulness without the teleport.
- **Light (D4).** Light becomes one small flagged rule: levels 0–7, round pools, closed doors block light. Creatures in the dark are not sent, and those within 3 tiles arrive as eyes. A torch costs the shield slot. An unlit player is noticed only within 3 tiles.
- **"Mystical" (the gap).** A two-colour light language: amber means fire and safety, teal means magic and wonder. Teal will-o'-wisps are real light sources in the rule. Runes glow only in the dark. The Lantern Spire is a living ward.

Four prototypes, in order:
1. **Nightfall**: engine, the engine decision.
2. **Darkness rule**: engine.
3. **Figures and weight**: art.
4. **Scenery and wonder**: mostly art.

---

## 0. Facts re-checked for this round

- **`apps/client/proto/chrome/` no longer exists.** HEAD `7b337a7` removed it. The local-engine harness pattern now lives in `apps/client/src/preview.ts:14-40` (`startPreview`), and the old page can be read with `git show e748f2b:apps/client/proto/chrome/main.ts`.
- The Vite dev server's root is `apps/client` (`apps/client/vite.config.ts:7`). A new `apps/client/proto/visuals/index.html` is therefore served at `/proto/visuals/` with no config change, and the production build does not include it.
- **Zoom.** Zoom is continuous today (wheel ±0.1, clamped 0.75–1.6, `view.ts:151`). `pixel = max(2, round(h/480))` (`view.ts:238`).
- **Camera.** The camera always sits at +z looking toward −z, which is north on the map (`view.ts:482-485`). It never rotates.
- **Picking.** Picking intersects the ground plane (`view.ts:250-254`). `Raycaster.setFromCamera` supports both perspective and orthographic cameras (`three/src/core/Raycaster.js:121`), but not a blended projection matrix.
- **Movement (D3).** The server assigns the new tile at the start of a step and then sets `moveAt = now + stepMs` (`packages/game/src/engine.ts:460-466`). The client lerps old→new over `stepMs` (`view.ts:448`), and the target ring follows the interpolated body (`view.ts:478`).
- **Sight.** `opaque` is wall, rampart, cavewall, tree and pine. `door` is in the `open` set (`model.ts:13-14`), so `Geography.sight` ignores door state (`world.ts:61-67`).
- **Creature detection** is `distance ≤ def.aggro && sight` (`engine.ts:586`).
- **Lamps.** There are 17 lamp tiles (`town.ts:140`, `:159`). The lamp description reads "Its flame never goes out" (`engine.ts:546`).
- The map is 84×68 (`town.ts:3`), and `view()` sends entities within 22 tiles (`engine.ts:638`, per round 1, not re-read).

## 1. Positions on D1–D6

### D1. Perspective: adopt the zoom continuum, narrowed

**Verdict: adopt part of it.** One camera, driven by zoom, in four discrete steps:

| Step | Projection | Pitch | Upscale at 1080p | Visible | Use |
|---|---|---|---|---|---|
| 1 "flat" | ortho | 64° | ×4 (270 rows) | ~11 tiles tall | close fights, looting |
| 2 "almost 2D" | ortho | 50° | ×3 (360 rows) | ~15 tiles | default, today's view |
| 3 "wide" | ortho | 42° | ×2 (540 rows) | ~22 tiles | travel, groups |
| 4 "scenery" | perspective, 32° FOV | ~20° | ×2 | horizon, sky ~40% of frame | wonder; walking still allowed |

What I reject and why:
- **True 90° top-down.** With real 3D walls and roofs, straight down turns walls into lines and figures into heads, and roofs cover whole blocks. 64° reads as "flat 2D" while keeping wall faces and silhouettes.
- **Eye-level, rider-from-behind framing (ref-5 literally).** That needs a camera behind the hero that rotates with facing, which means every prop is seen from four sides and the whole skyline must be authored. The 20° step gives ref-5's *composition* instead: a tiny figure in the low foreground, huge forms behind, sky over half the frame. It does so with a fixed north-facing camera.
- **Continuous zoom.** Steps keep pixel density exact (D5). Each step eases its pitch over 250 ms, and the 3→4 step dollies over 600 ms.

How it works:
- Steps 1–3 stay orthographic and pixel-snapped as today (`view.ts:481-492`).
- Step 4 swaps to a `PerspectiveCamera`. During the 600 ms dolly the transition uses the perspective camera with a narrowing FOV from a long distance, which looks near-orthographic. Picking is off only during those 600 ms; afterwards `Raycaster` works natively.
- Step 4 is off underground and under a roof, where the wheel stops at step 3.

What it costs:
1. **A sky dome**: gradient, sun or moon, stars and quantized clouds, as one shader.
2. **A northern skyline ring** beyond the map edge: three to four layered card meshes (ridges, forest line, one far ruin), hazed by distance. Only the north and the northern flanks are needed, because the camera never rotates.
3. **A terrain skirt** so the map edge does not end in void: about 12 tiles of flat procedural ground beyond each edge at low detail.
4. **A second bake pitch for figures** (D2), so sprites seen at 20° are drawn at 20°.
5. **Haze past about 18 tiles.** This is required for honesty. Beyond the server's ~22-tile view radius, creatures are never sent, so distant meadow must fade into haze rather than look empty.
6. **A light field that covers the whole map, not just the screen** (see §2). Night scenery then shows every lamp pool in town, which is the grandeur payoff of light as a rule.

**Compared with round 1's alternatives**:
- *My own vista at flagged tiles.* It is the same camera move with less reach. Allowing it everywhere on the surface costs only the skyline ring, which a vista needed anyway.
- *Terra's painted lookout panel.* It is cheaper, but it is a picture laid over the game. The scenery step is the live world at that moment: real lamps, real night, your friends walking. That is what the user asked for ("the scenery modes when we zoom out"). If P4 fails its budget or its looks, the fallback is to restrict step 4 to three overlook tiles, not to fall back to a painting.

### D2. Actors: baked figures, authored by Opus in code, baked per pitch

**Change from round 1:** I adopt Opus xhigh's bake as the path. Live low-poly drops to a free comparison toggle. The reasons:

1. **The author is Opus.** Opus is reliable at writing geometry, proportions, palette ramps and pose keyframes as code. It is unreliable at keeping hand-placed pixels consistent across 8 directions × ~25 frames. Terra's hand-pixelled 4-facing sheets ask for exactly that weakness.
2. **Baking fixes the shimmer** that live rigs show at low resolution. It also gives an exact 1:1 pixel grid and a place for cleanup: orphan-pixel removal and a 1 px selective outline.
3. **Baking at load is cheap**, so the pitch is not frozen: bake at 50° (shared by steps 1–3) and at 20° (step 4). Re-bake at 64° only if step 1 looks wrong. That answers the coordinator's "baked sprites are baked at one pitch".
4. **There is a hand-touch path.** PNGs at `content/art/actors/<figure>/<anim>_<dir>_<frame>.png` override single baked frames, following the `texture-overrides.ts` pattern. Opus can redraw a face or a weapon pixel by pixel where the bake is weak, a few frames at a time, which is the scale at which hand-pixelling works for it.

**Spec:**
- **Directions:** 8. Facing is already 8-directional (`engine.ts:465`).
- **Frames:** idle 2, walk 4, attack 3 (wind-up, strike, recover), hurt 1, cast 3, die 4.
- **Proportions:** humans about 36 px tall at 24 px/tile, about 3 heads tall, with a big hood and a cloak.
- **Channels:** colour (a 4-tone palette ramp per material), normal and depth. The normal channel lets the dominant field direction add a 1 px rim on the lit side. Depth goes to `gl_FragDepth`, so figures pass correctly behind walls and fences.
- **Shadows:** a skewed silhouette from the sun or moon, plus a contact blob.
- **First cast:** hero, Mira (NPC look), thornboar and gutter rat.

### D3. Movement between tiles: interpolate the body, anchor the meaning

The facts support both sides. The server has the hero on the new tile for the whole step, and today the client shows them arriving late. Snapping the sprite (Terra) is truthful but reads as teleporting, which works against "weight". My position:
- **Body**: it still walks old→new over the server's `stepMs`, eased so it arrives exactly on time, with no overshoot. Footfall dust and a 1 px dip land on the walk-frame keys.
- **Everything with game meaning sits on the confirmed tile from the moment the view arrives**: the click target for that actor, the target ring, the selection marker, label anchoring for targeting, and the light the rule grants. The rule overlay shows the server's light; the cosmetic flame position may trail.

The rule of thumb: you may see the body still arriving, but you can never act on, or be told about, a tile the server does not hold. **Adopted from Terra:** the anchor. **Kept from round 1:** the interpolation.

### D4. Light rule v1: smallest set that makes darkness frightening

This lives in `packages/game/src/light.ts`, behind `balance.world.darkness` (default `false`).

| Point | Decision | Origin |
|---|---|---|
| Levels | Integers 0–7, `L − round(euclidean distance)`, max over sources | mine. Euclidean gives round pools; Chebyshev gives square pools that look wrong in art |
| Occlusion | the existing `sight` line, plus **closed doors are opaque to light** | adopted from Terra A/B; `sight` ignores doors today |
| Ambient | day 7, golden 5, blue hour 2, night 1, undercroft 0, roofed interior = outdoor − 3 | merged |
| Seen | light ≥ 2 and line of sight, or adjacent ("touch") | all four |
| Hidden but near | unseen monster within 3 tiles is sent as `{id,x,y,z,eyes:true}` with no kind, HP or name | mine. It is the cheapest fear payload; Terra's "nothing" loses the dread |
| Actions | `target`, `cast` and `describe` reject unseen ids; a target that becomes unseen is dropped | all |
| Cost of light | `torch` occupies the shield slot (L5); **no burn timer in v1** | changed: dropped my 8-minute burn; Terra's "keep v1 small" wins, and the slot already forces a choice |
| Creatures | detect an *unlit* player only within 3 tiles; a lit one at normal `aggro` | changed: adopted Opus xhigh's "light makes you seen" in place of my +2 aggro. It is one condition at `engine.ts:586` and creates the real trade-off |
| Regen in dark | unchanged in v1 | changed: dropped; it is invisible and punishes without teaching |
| Street lamps | burn dusk→dawn; lamp *i* ignites at `duskStart + pathDistance(Lantern Spire, lamp) × 0.4 s` (pure function) | mine and xhigh's; the "never goes out" text changes |
| Wisps | 3 teal wisps in the meadow at night, L3, positions a pure function of `state.time` along fixed loops | new (§2) |

There is no fuel economy, sanity, light-shy AI or regen gate in v1. Next after v1, if night plays well: a torch burn timer, then light-shy undercroft creatures.

### D5. Pixel density: lock 24 px per tile, zoom by upscale factor

**Change from round 1:** I drop my 480 rows and adopt Opus xhigh's density lock, with one twist that reconciles it with D1:
- Render density is fixed at **24 render px per world unit** at every play step, so ground texels (`terrain.ts:101`, 24/unit) are always 1:1.
- **Zoom changes the integer upscale** (`pixel`) instead of the world size per pixel: ×4/×3/×2 at 1080p, ×5/×4/×3 at 1440p, chosen as `round(h / {270, 360, 540})`.
- The canvas CSS box is sized to exactly `rw × pixel`, with letterboxing for the remainder (Terra).
- **Palette:** replace the per-channel `levels` quantize (`view.ts:57`) with a 32³ LUT built from an Opus-authored palette of about 40 colours, matched by nearest colour in OKLab and dithered only at band edges.
- Step 4 (perspective) cannot keep a fixed density. It keeps the ×2 upscale, the palette and the outlines, and accepts some depth shimmer while the camera moves. That is the price of a horizon.

### D6. Prototypes: four, one fork, one page

- **One fork**, `apps/client/proto/_next/`, copied from `apps/client/src/render/` (adopted from Opus xhigh).
- **One page**, `apps/client/proto/visuals/`, with a picker. This answers the coordinator's "how will the user judge" gap. The picker has:
  - **Scene:** meadow, market square, north bridge, undercroft (reusing `previewScenes`, `preview.ts:6`);
  - **Time:** a scrubber, plus 1×, 60× and 600× speeds;
  - **Zoom step:** 1–4;
  - **Compare:** today's renderer against `_next`;
  - **One group per prototype**, added as each one lands.
- **Order:** light and night first (the engine decision, and the most visible change), then the rule, then figures, then scenery. P3 may start in parallel with P1 because it only adds files under `_next/figures/`.

## 2. Mystical, magical, fable-like

Enchantment should come from a few strong, cheap ideas that sit on the light rule, not from effects added everywhere.

1. **A two-colour light language.** Amber is fire: lamps, torches, hearths, the Spire. It means safety and people. **Teal** (`#4fd6c8`-ish, kept in the palette) is magic: wisps, runes, spell light, Mend motes. Teal never appears in ordinary daylight materials, so when you see it, something otherworldly is there. The night palette is indigo, amber and a rare teal, which matches the video-1 pattern of warm light on deep blue plus one wonder colour.
2. **Will-o'-wisps are real light.** At night three teal wisps drift slow loops in the meadow beyond the south gate. Their positions are a pure function of `state.time`, so there is no state and both sides agree. They are L3 sources in `light.ts`, which means they *actually reveal* what stands near them. Following one is a gamble: it lights the path, and it lights the boar on the path. Mystery that matters is the fable rule.
3. **Runes that glow only in darkness.** Glyph pixels in the shrine floor, on waystones at the gates and on the undercroft arches are emissive in inverse proportion to the field's light. They are invisible by day and faint teal at night, and in total darkness they are the only thing you see besides eyes. They make darkness beautiful as well as frightening, and they mark safe paths in the undercroft. This is presentation only, and it costs one shader term plus an Opus-authored glyph sheet.
4. **The Lantern Spire is alive.** It is the landmark (§P4), but it also breathes: a 6 s flame pulse, sparks that rise and drift, and the lamp ripple that starts *from it* at dusk ("The lamps are being lit." in the console). At dawn the lamps go out in reverse, toward it. The town's safety visibly flows from one living light.
5. **Spell light as wonder.** Ember is a moving amber field source. Mend and Renew release rising teal motes and give a 300 ms teal field pulse. Both reuse the field, so neither needs a new system.
6. **Night sky scale.** In the scenery step at night the moon is drawn oversized, about 3× its true angular size, as in video-1. In play steps it shows in the river at the north bridge.

**Not now:** fairy NPCs, magic weather, enchanted items, particle storms.

## 3. Light field implementation (P1 detail, revised)

This changes my round-1 design so the field also serves the scenery step:
- **Coverage:** the field covers the **whole floor**, 84×68 tiles at 4 texels per tile (336×272), not just the screen window.
- **Drawing:** each source draws **one quad over its own radius rectangle**, using `THREE.MaxEquation` blending. Max per channel equals the rule's max over sources. The quad marches the occupancy texture (opaque tiles plus closed doors) for at most `r` steps.
- **Cost:** about 40 sources × ~1,900 texels × ≤10 steps ≈ 0.8M fetches. Lamps re-render only when the phase or a door changes; moving sources re-render every frame.
- **Banding:** the shared `light.ts` levels are what the band edges are drawn from, so the picture is quantized to the rule.
- **Sampling:** materials sample at `xz + normal.xz × 0.5`, so wall faces turned toward a lamp light up.
- **Composition:** `albedo × (sunOrMoon·NdotL·shadow·cloudMask + hemisphere(time) + field)`.
- **Removals:** the 8 pooled `PointLight`s, the cave-only torch (`view.ts:229`, `:499`) and the `actorPop` self-glow.
- **Shadow map:** the sun/moon shadow map drops to 1024.

## 4. Prototypes, in order

Every prototype adds to `apps/client/proto/_next/` and to the one page `apps/client/proto/visuals/{index.html,main.ts}`. That page builds a local `Engine` the way `preview.ts:14-40` does (seeded rng, hero and friends, hunting on a 100 ms interval), and nothing in `apps/client/src/` changes. Each picker option keeps "today" as a comparison.

### P1. Nightfall: the clock, the light field and the zoom steps. **Engine.** The engine decision. Size L (~1,100–1,300 lines)

- **Proves:** WebGL2 Three.js lights a whole night town with rule-shaped light and wall occlusion within budget, the time of day reads from a steep camera, and the D5 density lock with zoom steps 1–3 works.
- **User sees:**
  - the town scrubbing from noon through golden hour and blue hour to midnight;
  - the lamp ripple spreading out from the shrine;
  - wall faces lit and back sides black, and a black undercroft;
  - cloud shadows;
  - wheel zoom through 64°, 50° and 42°.

  The picker offers a light-level overlay (numbers per tile) and Today against `_next`.
- **Files:**
  - **New:** `apps/client/proto/_next/*`, copied from `src/render/` plus `lightfield.ts`, `clock-style.ts` and `palette.ts`.
  - **New:** `packages/game/src/light.ts`, with only the pure functions (clock phase, ambient, sources, lamp ignition, `levelAt`), no enforcement yet; and `tests/light.test.ts`.
  - **New:** `apps/client/proto/visuals/{index.html,main.ts}`.
  - **New:** `content/palette.json`, about 40 colours (a **small art sub-task: Opus**).
  - **Changed:** `content-schema.ts`, which gains `world.dayMs` with a default.
- **Acceptance:**
  1. At noon, golden hour and midnight, the overlay band edges coincide with `levelAt` on every visible tile. A lamp behind a wall leaves the far side and the tiles behind it at the ambient level. A test asserts the same on a fixture.
  2. With a scripted timer query (`EXT_disjoint_timer_query_webgl2`, or `gl.finish()` timing as a fallback) at midnight in the market square: median GPU frame time is ≤ 7 ms at 1920×1080 and at 2560×1600 on the user's MacBook.
  3. A scripted pick check: for 100 random tiles at each of steps 1–3, `tileAtPoint(screen(tile))` returns that tile.
  4. A grid overlay at step 2 shows one ground texel per render pixel.
  5. The user can tell noon, dusk, midnight and the undercroft apart from four screenshots without labels.
  6. `npm test` and `npm run typecheck` pass, and `git diff --stat apps/client/src` is empty.
- **If it fails** the budget after one targeted fix (4→3 texels per tile, static-source caching), stop and reconsider the light model before going further. An engine switch is still not on the table, because nothing in the alternatives fixes that cost.

### P2. Darkness rule: light that the server enforces. **Engine.** Size M (~350 lines of rules and tests, ~150 in the page)

- **Proves:** night changes play, the screen never shows more than the rule, and hidden things are never sent.
- **User sees:**
  - the meadow at night with a shield: adjacent tiles, pairs of eyes, the battle list showing only what is seen;
  - pressing T swaps the shield for a torch: a 5-tile pool, real boars, and boars noticing you from further away;
  - the teal wisps drifting and revealing a boar as they pass;
  - a door closing and cutting a lamp's pool;
  - a "server seen" overlay.
- **Files:**
  - `light.ts`: visibility (`seen`, `eyes`), wisps and the closed-door occluder.
  - `engine.ts`:
    - a flagged filter in `view()` (~:636);
    - the `target`/`cast`/`describe` guards (~:277, ~:365);
    - dropping a target that becomes unseen;
    - the unlit-detection condition at :586;
    - the lamp text at :546.
  - `model.ts`: an optional `eyes` field on the mob view.
  - `content-schema.ts`, `ids.ts` and `content/balance.json`: `world.darkness: false`, and a `torch` item (shield slot, `light: 5`).
  - `tests/light.test.ts` (extended).
  - The P2 picker group in `apps/client/proto/visuals/main.ts`.
- **Acceptance:**
  1. Tests show the following:
     - an undercroft rat 4 tiles away is absent from `view().monsters` without a torch, present as eyes within 3 tiles, and fully present with a torch;
     - it is never present behind a wall or a closed door even when lit;
     - `target` on an unseen id throws;
     - an unlit hero is not acquired by a boar at 5 tiles, and a lit one is.
  2. On the page, the client field's level-≥2 contour equals the server's seen set on every tile, checked by a scripted diff in the overlay.
  3. With the flag off, the existing test suite passes unchanged, and a saved state from today parses.
  4. The user walks the night meadow with and without a torch and judges it "scary but playable".

### P3. Figures and weight. **Art (Opus authors kits, palettes, poses and override frames). The bake and feel code are engine.** Size L (~1,200 lines plus the art)

- **Proves:** characters and creatures read as pixel art with weight, authored entirely by Opus, at both bake pitches, and the feel never lies.
- **User sees:** the hero, Mira, a thornboar and a gutter rat fighting by torchlight at dusk and at night.
  - The picker offers **Boxes (today)**, **Live rig** and **Baked**, an 8-direction turntable, and a 0.25× slow motion.
  - Feel toggles:
    - wind-up from `attackAt` 180 ms early;
    - the strike frame only when the `hit`/`miss`/`block` effect arrives;
    - 70 ms hit-stop on animation clocks;
    - knockback ≤ 0.12 tile;
    - a 1–2 px camera kick on hits to you;
    - footfall dust;
    - a collapse on death.
- **Files:**
  - `apps/client/proto/_next/figures/{kit,poses,bake,sprites}.ts`, with the art living in `kit.ts` and `poses.ts`;
  - `apps/client/proto/_next/feel.ts`;
  - optional overrides under `content/art/actors/`;
  - the P3 picker group.
- **Acceptance:**
  1. From a single still screenshot at step 2, the user can name each figure and its facing.
  2. A grid overlay at 8× shows one sprite texel per render pixel.
  3. A 5-minute auto-hunt log records zero strike frames before their effect and zero frames with a body more than 0.12 tile off its interpolation path, and the target ring and pick target are always on the server tile.
  4. Baking all figures at two pitches takes ≤ 400 ms.
  5. The user picks Baked or Live.

### P4. Scenery and wonder. **Mostly art (Opus authors sky, skyline, Spire, runes and wisp look). The scenery camera and haze are engine.** Size L (~900 lines plus the art)

- **Proves:** the zoom continuum reaches ref-5-style grandeur on the live world, and the fable layer lands.
- **User sees:**
  - zooming past step 3 dollies down to the horizon: the sky dome, the oversized moon at night, three hazed northern layers including a far original ruin, and the Lantern Spire rising out of the market and breaking past the top of the frame at steps 1–3;
  - every lamp pool in town glowing from the scenery view at night;
  - sky and moon in the north river;
  - runes waking as dusk falls;
  - fireflies at dusk;
  - wisps at night (already a rule from P2, given their final look here).
- **Files:**
  - `apps/client/proto/_next/{scenery-camera,sky,skyline,spire,water,runes}.ts`;
  - the Spire and runes placed by a prototype-local map patch, with no `town.ts` edit;
  - the P4 picker group.
- **Acceptance:**
  1. At step 4 from the south meadow and from the market square, at noon and at midnight, sky and skyline fill 35–50% of the frame. The hero is still findable within 2 s by someone who has not seen the page.
  2. After returning to step 3, the scripted 100-tile pick check from P1 passes again, and walking was never blocked during step 4.
  3. A palette histogram of a step-4 frame contains only palette colours (no bloom smear).
  4. The P1 frame budget holds at step 4 at midnight (≤ 9 ms; scenery is allowed +2 ms).
  5. The user puts four screenshots next to ref-5 and video-1 and judges the colour story and scale.
- **Fallback:** if step 4 fails 1 or 4, keep it on three overlook tiles only. Do not replace it with a painted panel.

## 5. Explicitly not built yet

- Production migration of `WorldView`.
- WebGPU or TSL.
- A rotating or behind-the-hero camera.
- Authored scenery to the south, east or west.
- A torch burn timer and fuel.
- Light-shy AI.
- Regen gates.
- Weather.
- Moon phases.
- New regions, bosses or multi-tile creatures.
- Studio controls for clock and palette.
- Outfits for other players.
- Sound.

Sound is the first thing after P4: the fear payload is half audio.

## 6. Risks

- **Performance.** At ×3 the buffer at 1080p is about 640×360, which is cheap. The real unknowns are the whole-map field when many torches move, and step 4, which draws the full map plus the skirt. P1 and P4 measure both. Fallbacks:
  - 3 texels per tile;
  - caching static sources;
  - dropping cloud shadows at step 4.
- **Perspective shimmer at step 4.** The camera position is snapped to 1/24-unit world steps and the follow is damped, so the remaining depth swim shows only while moving. It is accepted.
- **Readability in the dark.** The touch rule, the self rim, the night floor (about 6% value, with depth edges kept), the runes and the lit town keep it playable. A brightness slider is safe because nothing hidden is sent.
- **Accessibility.**
  - Reduced motion turns off kicks, hit-stop and the dolly; step 4 then cuts instead of easing.
  - Flicker stays ≤ 3 Hz above 10% swing.
  - Flashes affect sprites only.
- **Art quality ceiling.** Procedural kits can look generic. The defence is silhouette rules, palette ramps, the cleanup pass and per-frame PNG overrides that Opus redraws where it matters (faces, weapons, the boar's tusks).
- **Gameplay.** If night empties the meadow, the levers are balance values in Studio, not code: night length (`dayMs` phases), the unlit detection range of 3, and the torch price.
- **Scope.** P2 is the only prototype that touches `packages/game` behaviour, and it is flagged. If anything must be cut, cut P4's skyline down to one layer plus the sky first, and keep the Spire and the water.

## 7. What changed from my round 1, and why

1. **Live rigs → baked figures** (adopted from Opus xhigh). The author is Opus, the camera now has two pitches, and bakes give cleanup and override paths.
2. **480 rows → 24 px/tile density lock, zoom by integer upscale** (adopted from Opus xhigh, extended). This is the only way integer density and a zoom continuum can coexist.
3. **Vista on flagged tiles → scenery zoom step everywhere on the surface.** The user's continuum costs only a north-only skyline because the camera never rotates.
4. **Screen-window light field → whole-map field drawn per source with max blending.** It is needed for scenery, and cheaper.
5. **Light v1 trimmed:**
   - no torch burn and no regen gate;
   - "+2 aggro in the dark" replaced by xhigh's "unlit players are noticed only within 3";
   - closed doors become opaque (Terra).
6. **Movement:** game meaning anchors to the confirmed tile (Terra), and the body's interpolation stays.
7. **Four separate pages → one fork and one picker page**, and P4's weight work is folded into P3 so the scenery prototype fits in four.
8. **New:** the mystical layer, with teal reserved for magic, wisps as rule light, runes and the living Spire.
