# Visuals build review, round 1: opus-medium

## Score: 7 / 10

## Verdict

This is a real step change from `today-meadow`. The pixel lock works, the palette and ground hold together at Play, and the light rule reads clearly in the picture: amber pools, teal wisps, roofed hearths. The field matches the rule exactly. I re-ran verify and got 0 mismatches at market night (25 sources) and in the undercroft with a torch. At night the darkness rule is frightening: eyes and nothing else, or a torch pool full of boars. The Scenery stop at golden hour is the first frame that comes close to "stunning and grand" (`scenery-gate-golden`: sun, haze, ruined keep, lit clouds). It does not yet reach ref-5. The near walls in Scenery magnify into the big-texel blocks the plan set out to remove. The far mountains are pale flat polygons, not painted forms. Figures in Scenery go nearly black against the low sun. In Play the hero mostly shows its back as a featureless blue cone. The rule and server hooks are small and well tested. Several acceptance checks, though, are weaker than the audit claims. I also found four defects that matter before anyone migrates:

- labels from behind the camera leak into Scenery;
- at 1080p, Play shows fewer tiles than the server's view and aggro window;
- loot on the ground is neither redacted nor lit in the dark;
- the client takes its clock inputs from a compiled-in balance, not from the server.

## Findings (most severe first)

### 1. At 1080p, Play and Close show less than the server's view window
`apps/client/proto/_next/stops.ts:21` sets `k = round(physH / 290)`. At 1920×1080 that gives k = 4 and a 480×270 buffer (confirmed by `labBench()`: "buffer 480x270"). That is 15 × 11.25 tiles at Play and 12 × 9 at Close. The server treats everything within `viewX 8, viewY 6` as on screen (`packages/game/src/engine.ts:591`), so 17 × 13 tiles. Creatures in that window notice you, chase you and are sent to you (`engine.ts:611`), but at 1080p they sit off the edge of the picture. Close, the stop meant for fighting, is the worst. At 1280×720, k = 2 and you see 20 × 15, so the problem only shows on the most common desktop size and on the user's Mac (2880×1800 gives k = 6, 15 tiles wide). The pixel-lock check passed because it only tests "exact, not stretched"; it never checks coverage.
**Fix:** cap k so the view covers the server window: `k = max(2, min(round(physH/290), floor(physW/((2·viewX+1)·PX)), floor(physH/((2·viewY+1)·PX·sin(pitch)))))`. At 1080p that gives k = 3 (640×360, 20 × 15). Add coverage to the pixel-lock readout.

### 2. Scenery shows name labels of actors behind the camera
`actor-layer.ts:292-295` projects each label with `view.ts:352` `screen()` and hides it only when it falls off the screen rectangle. When a point is behind a perspective camera, `project()` mirrors it into the frame. My real-time shot of `tab=scenery&at=bridge&t=1&stop=scenery` puts "WARDEN CORIN" in the night sky. Corin stands at (38, 52), 35 tiles south of the camera. The committed `scenery-bridge-night.png` shows the same label beside the hero's head. In the golden-hour shot, labels of actors hidden behind the gate wall also float over the wall. This undermines the main shots the user will judge, and it shows names the picture cannot see.
**Fix:** in `screen()`, return a flag when the camera-space z is ≥ 0 (or `p.z > 1` after projection), and hide the label then. In Scenery, also hide labels when `shown` is false or the actor is farther than about 12 tiles.

### 3. Ground items ignore darkness on the server and on the client
`engine.ts:679` builds `ground` from every item within 11 × 9 tiles. The darkness block (`engine.ts:683-707`) filters corpses (`:698`) but not `ground`. The client then draws item icons as unlit `SpriteMaterial`s (`view.ts:451`, colour `#f2ece0`). The field patch only reaches Lambert materials, so loot shows at full brightness in pitch dark. This is exactly the "picture shows more than it should" case the brief asks about, and it is the only one I found. It also breaks the dread: in a black undercroft, any dropped loot glows.
**Fix:** filter `view.ground` with `visibleTile` the same way as corpses, and multiply the item sprite colour by the field level at its tile, or use the same `withField` Lambert path.

### 4. The client takes its clock and lamp inputs from a compiled-in balance, not from the server
The field, lamps, wisps and sky all come from `staticSources(map, time, world)` (`view.ts:131-138`), where `world = {dayMs, dayOffset}`. `GameView` (`model.ts:74`) carries `time` but neither `dayMs`, `dayOffset` nor the `darkness` flag. The production client uses the compiled-in `defaultBalance` (`apps/client/src/main.ts:16`). The lab hides this because it passes `lab.balance.world` directly (`lab/main.ts:99,184`). If the server's `dayOffset` or `dayMs` changes (a Studio edit, or a server with a different balance), the client draws lamps, wisps and night at different times than the rule uses for visibility. The picture would then show lit pools where the server says dark, or the reverse. Verify cannot catch this because both sides read the same object.
**Fix:** add `world: {dayMs, dayOffset, darkness}` to `GameView` (optional, like `shades`), and feed `setWorld` from it.

### 5. Two P4 acceptance checks are weaker than claimed
- The plan asks for "a scripted walk finds zero tiles where the picture disagrees". `labDarkCheck` (`lab/main.ts:163-176`) does not walk: the darkness tab forces `hunt=0` (`tabs/darkness.ts:7-11`). It also compares server output with `lightLevel`, not with the rendered picture. It also uses `lab.engine.state.time` rather than `view.time`, so moving wisps race the snapshot. My run (`tab=darkness&at=meadow&t=1&darkness=1&darktorch=1`, 15 s) returned **3 disagreements**, all "full on dark 34,60" at the edge of wisp loop 0. The audit says 0. This is most likely the probe's time skew and not a rule bug, but as written the check cannot tell the two apart.
- "With the flag off, `view()` deep-equals today's on a seeded run": `tests/darkness.test.ts:183-195` compares `darkness: false` with `darkness` deleted, which are the same code path. It never compares against the pre-change engine.

**Fix:** sample with `view.time`; give the probe a scripted walk (the lab needs a `labWalk(path)` hook); add a recorded golden run from `main` for the flag-off check.

### 6. The night floor with depth edges is missing underground
Decision 12 says unlit terrain sits on an indigo floor at about 6 % value with depth edges kept. In `dark-undercroft-none.png` the cave is uniform black: no walls, no edges, only eyes and the hero. That is frightening, but you cannot navigate: you cannot see the walls one tile away. That cuts against the plan's own readability risk ("the player must still be able to play"). The post pass has no night-floor term (`view.ts` post shader, lines 27-62; `uCave` only tints and vignettes).
**Fix:** add an edge-only floor in post: depth-edge outline × a fixed indigo at about 6 % wherever field and ambient are 0, independent of `uCave`.

### 7. Scenery's look is short of its own reference
These are art defects inside P3, not new features:
- (a) Near walls and roofs magnify to 4-8 screen pixels per texel while figures stay at about 1:1 (`scenery-gate-golden`, `scenery-bridge-night`). That brings back the "blocks under a filter" mix the pixel lock fixed. `placeScenery` (`view.ts:470-489`) pulls in to 2.5 tiles when a wall is close.
- (b) Figures facing the camera are backlit by the sun in the north and have almost no fill. Mira at golden hour is a black block with two red pixels and reads as a creature.
- (c) The far mountains are untextured pastel triangles (`farland.ts`), the weakest layer next to ref-5 and ref-2.

**Smallest fixes:** cap the near distance (or fade near occluders with the existing dithered cut-away); add a hemisphere or rim fill for sprites when `wide` is set (`setSpriteLight`); give the far land a dithered value ramp and lit ridge edges.

### 8. Structural risks to migration
- Late material patching. `patchTree(this.scene)` runs every 0.5 s (`view.ts:567`) to catch materials created after construction. A new Lambert material therefore renders up to 500 ms without the field: a lit flash in the dark. Patch at creation instead, in `buildFloor`, the trees, the far land and the corpses.
- Global field state. `fieldUniforms` is a module-level singleton rebound per floor (`lightfield.ts:13`, `bind()`), so the field is global state, not per-view. That is fine for one view but fragile for the lookout's second camera and for tests.
- No coverage beyond 32 sources. The 32-source cap is the nearest 32 to the focus (`lightfield.ts:142`). The busiest measured scene has 25 static sources plus torches, so 8 torch carriers in town at night pass the cap. Verify has never run above 32.
- An inconsistency in `perceive` (`light.ts:178`). A creature on a dark tile (level 0) within 3 tiles is a shade even behind a wall, but on a dim tile (level 1) behind a wall it is `none`. More light reveals less. Treat level ≤ 1 the same way within 3 tiles.

## What I verified myself

- Read `BRIEF.md`, `BUILD-PLAN.md`, `.audit/visuals-build.todo.md`, all 13 shots, `light.ts`, the `git diff` of `packages/game` and `content/balance.json`, `lightfield.ts`, `view.ts`, `stops.ts`, `feel.ts`, `shades.ts`, the `actor-layer.ts` sync, effect and frame code, `lab/main.ts`, `harness.ts`, `eval.mjs`, `shots.mjs` and `tabs/darkness.ts`, plus the test names and key bodies in both test files.
- `npm test`: 82 pass. `npm run typecheck`: clean (it covers `apps/**`, so `proto/` too).
- Counted sources with `tsx`: floor 0 has 5 at noon and 25 at night (17 lamps); floor 1 has 6.
- `eval.mjs` real-time probes:
  - `labVerify()`: 0 mismatches at market 23:00 (25 sources), 1920×1080, and in the undercroft with a torch (6 sources).
  - `labBench()`: night market at 1920×1080, median 0.70 ms, p95 3.70 ms, buffer 480×270. Scenery gate at golden hour, median 0.90 ms, p95 2.30 ms.
  - `labDarkCheck(15000)`: meadow at night with torch, 60 samples, 3 disagreements (see finding 5).
- Shots in my temp directory: `bridge-night.png` (reproduces finding 2), `dark-meadow-torch.png` (good: shades become full boars in the torch pool), `close-meadow-night.png`, and zoomed crops of Mira in Scenery and the hero at noon.
- I did **not** verify: the pixel lock at 2560×1440 or at DPR 2 (I only derived k from the formula); the 5-minute auto-hunt strike log. By reading the code, `log.early` is 0 by construction, because `effectAt` is set to `performance.now()` inside `strike()`. The ordering itself is honest: strike frames can only follow `effect()`. I also did not verify the bake time on a cold load, Scenery transitions by wheel or click in a headed browser, the 16-hero server cost (the test asserts it and I did not re-time it), or the Close → Play pitch tween.
