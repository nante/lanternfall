# Visuals build review, round 1: Opus xhigh

**Score: 6 / 10**

## Verdict

The build is real and mostly does what the plan says. The light rule and the field agree exactly (0 mismatches over the whole floor, which I confirmed myself). Strikes are tied to server effects. The baked figures read well at Close. Several views already reach the fable look the user asked for: the blue-hour shrine with teal Lantern light against amber lamps, and the blue-hour Scenery over the market with the huge moon, the lit keep window and the lamps coming on. It is not ready for the user to judge yet, because four defects would skew the choices they are asked to make:

- `perceive()` sees through walls in the dark, and lit creatures are harder to see than unlit ones.
- The server sends hidden players' torch positions and ids.
- All darkness collapses to one flat palette colour. The "dim" state looks the same as "dark", and with no torch the undercroft is a blank screen.
- The lab has no input, so "the user plays it" (P4) and "the user picks" (P2) cannot happen as planned.

Scenery also has visible flaws that bias the Continuum-vs-Lookout pick: a fog flash at the start of every dolly, labels mirrored from behind the camera, a floating keep, near walls filling the frame, and a strawman lookout. Each fix is small. A short pass on the items below, then show it to the user.

## Findings (most severe first)

### 1. `perceive()` reveals creatures through walls in the dark, and light makes them invisible
`packages/game/src/light.ts:178`. The `level === 0 && d <= 3` branch has no line-of-sight test. The lit branch (`:177`) does have one, so a creature 2 tiles away behind solid rock comes out as:
- `shade` (exact tile, facing, size, real id) when its tile is dark;
- `none` when its tile is lit.

I ran `perceive` on the real `buildTown()` map at three undercroft wall cases (for example viewer 18,19,1, wall 19,19, target 20,19). Each gave dark → `shade`, lit (brazier level 5) → `none`.

Why it matters: light must never reduce what you perceive. This inverts the core meaning of the rule and leaks positions through walls. The plan's door test (`tests/darkness.test.ts:55`) passes only because the shrine is roofed, so its tile is lit.

Smallest fix: return `'none'` when `!lightPasses(viewer, target)` unless `d <= 1`, then apply the level tests. Add a test: a rat 2 tiles behind a wall is absent whether its tile is dark or lit.

### 2. Darkness renders as one flat colour: no night floor, no depth edges, invisible silhouettes
`apps/client/proto/_next/view.ts:57`, with `:53`.
- The split tone adds a constant `vec3(0, 0.012, 0.016)` to every dark pixel. After gamma this becomes a floor near sRGB (6, 34, 40).
- Anything unlit underground is roughly 20× dimmer than that floor, so the palette LUT snaps it all to one swatch, moss[2] (20, 34, 24).
- The depth-edge darkening (`:53`) is applied before the lift, so outlines vanish too.

Measured on my real-time shots:
- **Undercroft with no torch:** 21 colours in a 1000×600 box, and 91% of pixels are exactly (20, 34, 24). No wall or floor edge survives.
- **Night meadow, boxes around five shades:** only two colours, 7 luma apart, plus the eye pixels. The "dim → silhouette" state (`shades.ts:58`) cannot be told apart from "dark → eyes only".

Why it matters:
- Decision 12 promised "a night floor (about 6% value, indigo, depth edges kept)". It is not there.
- The P4 bar is "scary but playable". Without a torch the undercroft is unnavigable, since you click into a void.
- The three perception states that make light mean something collapse to two.

Smallest fix: apply the outline after the lift, or scale the lift by `smoothstep(0.0, 0.02, l)`. Give unlit terrain two or three steps of `ramps.night`. Add a lab assertion that `dark-undercroft-none` keeps at least N colours inside the view, with wall edges present.

### 3. The server sends more than the rule allows
- **Torch lights.** `packages/game/src/engine.ts:707` sends every present torch-bearer within 22 tiles as `{id: 'torch:<playerId>', x, y}`, whether or not they are perceived. In my script, a hero 12 tiles away behind undercroft rock was correctly left out of `players` and `shades`, but `view.lights` carried their exact tile and their player id. A modified client can mark hidden players by name.
- **Ground items.** `engine.ts:679` sends them regardless of light. The client draws them with an unlit `SpriteMaterial` (`view.ts:451`) that `withField` never patches (`lightfield.ts:101`), so loot on a dark tile shows at full brightness in pitch black. This one is from reading the code; I could not drop an item in the lab.

Smallest fix:
- Give torches per-view anonymous ids, and send only those whose light reaches a tile the viewer can see.
- Under darkness, filter `ground` with `visibleTile`.
- Draw item sprites through the field, or dim them by the tile's level.

### 4. The lab cannot be played, so P2's and P4's user checks cannot happen
- Nothing in `apps/client/proto/lab/` sets `w.onPick`, and `harness.ts` exposes no `send` (unlike `src/preview.ts:40`). Clicks do nothing except leave Scenery.
- Under darkness, the harness's `hunt()` throws inside the `setInterval` (`harness.ts:38`), which skips `e.tick()`. That is why the Darkness tab forces `hunt=0` (`tabs/darkness.ts:6`), so the hero stands still in every darkness scene.
- Shades are not pickable (`view.ts:368` only asks `ActorLayer`). The rule lets you target an adjacent shade, but the client cannot, so you cannot fight back against a rat biting you in the dark.

Smallest fix:
- Copy `preview.ts`'s `send` with its try/catch into the harness, and wrap `hunt`.
- Set `w.onPick` to walk or target.
- Resolve a click on an adjacent shade's tile to `{ actor: shade.id }`.

### 5. Scenery labels show through walls and are mirrored from behind the camera
`apps/client/proto/_next/actor-layer.ts:292-295`. Labels check only screen bounds. NPCs are always synced from `map.npcs` (`:176`). So in perspective:
- an actor behind the camera projects mirrored into the frame;
- occluded actors keep their labels.

Seen in `scenery-bridge-night` and my blue-hour market Scenery shot: "WARDEN CORIN", who stands at the south gate about 40 tiles behind the camera, is printed across the hero. In `scenery-gate-golden`, "ASH" and "WARDEN CORIN" float over the gate tower that hides them.

Smallest fix: hide labels when the projected `z > 1`, and hide them in Scenery altogether, since picking is already off there.

### 6. Every Play↔Scenery dolly starts with a sepia fog flash
`view.ts:542` uses `new THREE.Fog(…, 45, 560)` in absolute units. `placeScenery` starts the dolly as a 1° lens hundreds of units from the hero (`:472-473`), so for the first ~150 ms the whole town sits deep in fog.

My 150 ms frame sequence after a warmed bake:
- first frame: mean luma 170, a flat tan wash;
- next frames: about 60.

The same happens at the end of the return trip.

Smallest fix: set `fog.near/far` to the camera-to-hero distance plus 45 and plus 560 each frame, or fade fog in with `this.scenery`.

### 7. Scenery composition: Hollow Keep floats, and near walls fill the frame
- **Floating keep.** `apps/client/proto/_next/farland.ts:95` hard-codes the keep at `y = 15`. The ridge under it is about 11 high at that spot (`ridge()`, `:30-31`). From the north bridge at noon the hall and tower hang in the sky with sky visible under them (my shot, cropped).
  - Fix: sample the ridge height at the keep's position, or sink it.
- **Missing cut-away.** The plan's "dithered cut-away between camera and hero" exists only for the Spire (`spire.ts:19-24`, `view.ts:548-555`). `placeScenery` only pulls the camera in along the hero's own column (`view.ts:476`). At the gate and the bridge, wall blocks one to three units from the lens fill a third of the frame each, with texels 10–20 render px wide. That is the "blocks under a filter" look the plan set out to remove.
  - Fix: apply the Spire's dither-discard to terrain within about 3 units of the Scenery camera.

### 8. Evidence is weaker than the audit trail claims
- **Flag-off test.** `tests/darkness.test.ts:183` ("disabled darkness matches an absent flag") compares the new engine with itself, because `false` and `undefined` take the same branch. It cannot fail, so it does not prove the plan's "flag off deep-equals today's". The guarded diff makes this true by inspection, but the test proves nothing.
  - Fix: record 300 seeded views from `HEAD` as a fixture and deep-equal against it.
- **Cost test.** The 16-hero cost check (`:197`) only logs. Its heroes stand 17 tiles apart with no torches. My stress run (16 torch-bearers clustered in the meadow) measured +0.50 ms, so the 2 ms bar holds, but it should be asserted.
- **Dark-check probe.** `labDarkCheck` (`lab/main.ts:163`) samples a standing hero and compares the view against the rule recomputed on the client. It never looks at the picture. The plan asked for a scripted walk that compares the picture with the view.
- **Honesty counters.** `log.early` (`actor-layer.ts:279`) and the ring check (`tabs/figures.ts:75`) restate the construction: the strike frame exists only in the `strike` phase, and the ring is copied from the server tile every frame. They cannot fail. The property does hold; the counter just does not test it.

### 9. The lookout fallback is a split screen, not a panel
`view.ts:607-616` overwrites the top 40% of the live Play view with the Scenery camera. As a result:
- the hero and NPCs appear twice (`lookout-market-noon`);
- the north 40% of the play area is hidden;
- there is no frame or seam treatment.

Since P3 asks the user to "pick Continuum or Lookout", the comparison is against a strawman.

Smallest fix: make it a framed inset or a toggled overlay that hides actors in the strip, so it reuses the sky and far layers as decision 2 says.

### 10. Migration contract risks
- **`view.ts` is a rewrite, not a diff.** 398 of 546 lines differ, and it still owns post, both cameras, stops, dolly, lookout, items, effects, roofs, rays and dust.
- **Hidden per-frame duty.** The day clock reaches the view only through `setWorld()`, which the host must call every frame (`lab/main.ts:185`). Meanwhile `frame()` runs on its own `setAnimationLoop`. Production `main.ts` would inherit an undocumented duty with unspecified ordering.
- **Clock inputs can drift.** The client derives `dayMs`, `dayOffset` and step times from the compiled `defaultBalance` (`view.ts:3`, `actor-layer.ts:14-15`). The server reads live balance, and `GameView` carries no clock parameters. After a Studio edit, the lamps and field disagree with the server until the client reloads.
- **Duplicated rule constants.** `wisps.ts:96` copies `26/40` and `500` because `light.ts` does not export them.

Smallest fix:
- Add `{dayMs, dayOffset}` (or the `Clock`) to `GameView` and have `frame()` read it.
- Export the phase and ripple constants from `light.ts`.
- Split `view.ts` into camera/stops, post and scenery modules before migrating.

### 11. First entry into Scenery stalls for about 300 ms
`actor-layer.ts:242` bakes the Scenery pitch synchronously on the first wide frame:
- bake time 230–257 ms;
- worst rAF gap 316 ms, measured live at the start of the 900 ms dolly.

The plan says both pitches are "baked at load".

Smallest fix: bake the second pitch in idle time after first paint.

### Smaller unmet items
- `-`/`=` stop keys from decision 2 are not implemented. Only the wheel works.
- The plan's "nearest-filtered mipmaps" for Scenery cover only the far meadow skirt (`farland.ts:18`). The town ground atlas is `NearestFilter` without mipmaps (`textures.ts:32`), so grazing ground will shimmer in motion.
- Shades glide with a frame-rate-dependent 0.25 lerp, then round to the pixel grid (`shades.ts:69-70`). They stop 1–2 render px short of their tile and move at a different pace from actors.
- The hero's back view, the most-seen sprite and the focal figure in every Scenery shot, is a featureless blue teardrop (turntable direction 4; `scenery-*` shots). Backlit figures in Scenery also get no rim, because the post rim needs the pixel itself to be bright (`view.ts:46-48`).

## Against the user's request

- **Delivered:**
  - Day and night with real meaning: lamp ripple, wisps, Lantern teal.
  - Strong blue-hour and night colour.
  - A working zoom continuum.
  - Figures with weight that never lie about timing.
  - Darkness that is genuinely frightening: eyes around a lone hero.
- **Short of the ask:**
  - Darkness is not *playable* (finding 2).
  - Scenery's far land is crude flat-shaded triangles with a floating keep. Near geometry turns blocky at the low lens.
  - Figures in Scenery read as dark blobs from behind.
  - Play-view ground transitions read as tile-shaped procedural noise more than painted pixel art.
- **Overall:** the "stunning and grand" moments exist (blue-hour market Scenery), but only at some times and places, not yet everywhere the user will zoom out.

## What I verified myself

- `npm test`: 82/82 pass; the cost line printed +0.414 ms. `npm run typecheck`: pass.
- Opened all 13 shots in `docs/visuals/shots/`.
- **Real-time shots** with `eval.mjs`, plus my own CDP driver for frame bursts, wheel and click (scratch dir only):
  - undercroft dark with and without the rule torch;
  - meadow night with torch;
  - gate Play → Scenery dolly at 150 ms steps, after warming the bake;
  - gate Scenery at golden hour;
  - bridge Scenery at noon;
  - market Scenery at blue hour;
  - market night at Play;
  - Close line-up of all figures;
  - figure turntable.
- Pixel histograms from my own PNG decoder; numbers in findings 2 and 6.
- **Lab probes:**
  - `labVerify` at market night: 0 mismatches, 25 sources.
  - `labBench` at 1920×1080 night: median 0.70 ms, p95 1.10 ms, buffer 480×270. The `calls 1` it prints is only the post pass, so it is not a draw count.
  - `labDarkCheck(12000)` in the undercroft with the rule torch: 48 samples, 192 full, 0 disagreements.
- **Scripts run with `tsx` against the real engine and map:**
  - the `perceive` wall inversion (three cases);
  - the `view.lights` leak;
  - 16 clustered torch-bearers: `view()` +0.50 ms.
- **Live timings:** Play bake 226–297 ms; Scenery bake 230–257 ms; first-entry frame gap 316 ms.
- **Read in full:** `light.ts`, the engine diff, both test files, `view.ts`, `stops.ts`, `lightfield.ts`, `actor-layer.ts`, `feel.ts`, `shades.ts`, `wisps.ts`, `farland.ts`, `palette.ts`, `clock-style.ts`, `figures/sprites.ts`, and the lab's `main.ts`, `harness.ts`, `tabs/*`, `eval.mjs` and `shots.mjs`.

## What I did not verify

- Any real (non-headless) display, DPR 2 Retina, 2560×1440, fractional DPR, or another GPU. I took the pixel-lock claim on trust.
- A 5-minute auto-hunt log (I watched about 5 s logs), and long-run motion or feel by eye.
- Ground items drawn at full brightness in the dark: from code only.
- Skimmed or did not read in full: `figures/bake.ts`, `kit.ts`, `poses.ts`, `sky.ts`, `spire.ts`, `trees.ts`, `terrain.ts`, `tufts.ts`, `ground-art.ts`, `particles.ts`.
- Production or Electron integration, and Studio.
