# Visuals build review, round 2: Opus high (correctness and server truth)

**Score: 7 / 10** (round 1 average: 6.1)

## Verdict

The rule and truth fixes hold, and I checked them against the real engine, the real map and the GPU rather than taking the fix list's word. `perceive` no longer sees through walls and never drops a level when light is added. I brute-forced 46,604 viewer/target pairs on both floors and found 0 failures.

- **Ground items and hidden torches** are now redacted on the server.
- **The golden fixture** deep-equals a replay on the HEAD engine, and two seeded mutations make it fail.
- **The floor round trip** comes back with 0 mismatches. This held both through the lab's probe and through my own Engine-plus-WorldView trip, in which lamps ignite and a door opens while the hero is underground.
- **The walking GPU probe** can fail: when I dropped the torch from the field, it reported 54 picture/server disagreements.

I could not get the picture to show more than the server sent.

Two things keep the score at 7:
- The darkness hooks rescan every item in the world on each lighting call. A tick that costs 0.015 ms with the flag off costs about 19 ms with it on in a world of 5,000 items. The plan's cost check measures only `view()`, in a world of about 150 items.
- The near-wall fade, added in this round, also dissolves the ground near the lens. Every Scenery frame now ends in a grey dither band.

On the user's request: darkness now frightens and stays navigable (outlines, eyes, wisp pools), and the golden and night Scenery moments come close to "stunning and grand". The far land is still faceted triangles, though, and unlit forms now read as thin line art rather than pixel art.

## Round-1 findings: do the fixes hold?

| Round-1 finding | Status | How I checked |
| --- | --- | --- |
| Floor round trip corrupts the field (Terra A, B) | **Holds** | `labFloorTrip()`: 0→1→0 and 1→0→1, 0 mismatches each. My own probe drove a fresh `Engine` + `WorldView` through `update()`: surface at minute 25.5, then undercroft, then minute 27.5 with a surface door opened, then surface again, then a one-update trip. All 6 full-floor GPU readbacks against `lightGrid`: 0 mismatches. |
| `perceive` sees through walls; light hides (Opus xhigh, medium) | **Holds** | Round-1 case (viewer 18,19,1, rock 19,19, target 20,19): `none` dark and `none` lit. Brute force on `buildTown()`: 46,604 pairs within the 17×13 window, each with a random extra source. 0 cases worse with more light, 0 seen through walls. |
| Ground items ignore darkness (Opus medium, xhigh, Terra A) | **Holds** on the server; **partly** on the client | Server: gold on the hero's own tile, an adjacent tile and 3 tiles away is not sent with no torch, and all three are sent with one. Client: the pile's level comes from the *previous* update's sources, so the first update after light arrives hides a pile the server sent (new finding 4). |
| Hidden torch carriers leak via `view.lights` (Opus xhigh) | **Holds** | 265 undercroft placements of a torch carrier around the viewer: 202 full, 59 anonymous `torch:anon:N`, 0 carrier ids sent for an unseen carrier. An anonymous light still gives the exact tile, but only when its light reaches a tile you can see, as the fix intends. |
| Client clock from compiled balance (Opus medium, xhigh) | **Partly** | `GameView.world` is sent under darkness, and `setWorld` uses it (`_next/view.ts:139`). The engine test changes `dayMs`/`dayOffset` live. Step timing still comes from compiled `defaultBalance.progression.stepMs` (`_next/actor-layer.ts:16`). That is not a truth issue, but it is the same class of drift. |
| Flag-off test cannot fail (Opus xhigh, medium) | **Holds** | I extracted HEAD (`git archive`), ran `darknessOffScenario` on the HEAD engine and deep-equalled the fixture: 300 views pass. Two mutations each fail the test: running the light-based noticing with the flag off, and dropping unseen targets with the flag off. Gap: the scenario has 0 ground items and never touches the surface, doors or torches. |
| Cost check only logs (Opus xhigh, medium) | **Partly** | It is asserted now. Run on its own: +0.54 to +0.63 ms. But in one full `npm test` at load average 13 it failed: off 2.41, on 5.07, extra 2.66 ms. It also measures only `view()`, with about 150 items in the world (new findings 1 and 3). |
| Darkness is one flat swatch (Opus xhigh, medium, Terra A) | **Holds** | In `dark-undercroft-none` the walls, ladder and eyes all read. Side effect: see new finding 5. |
| Lab cannot be played (all four) | **Holds** | `onPick` and the keys are wired (`lab/main.ts:100-124`), and `hunt` catches refusals (`lab/harness.ts:33`). I drove clicks through my own `WorldView`. I did not press keys in a headed browser. |
| Adjacent shades cannot be picked (Terra B, Opus xhigh) | **Holds** | Live, with a rat in the dark: a click on its tile at distance 1 gave `actor: "r"`, and the server accepted `target`. At distance 3 the click gave `actor: "r"` and the server refused with "You cannot see that creature." |
| Probe does not walk or check the picture (all four) | **Holds**, with one caveat | Undercroft with torch: 21 steps, 0/0. Meadow without torch: 0/0. Meadow with torch observed by Mira: 0/0. Sabotage (field drops `torch:*`): 54 disagreements and 2,095 field mismatches, so the probe can fail. Caveat: it checks the field at each actor's tile, not what `ActorLayer`/`ShadeLayer` drew. It also re-runs `setWorld` at view time before reading, so it checks a rebuilt field, not the one on screen. |
| Labels mirrored, and over walls in Scenery (Opus medium, xhigh, Terra A) | **Holds** | Visible `.world-label`s: bridge night Scenery 0, gate golden Scenery 0, gate Play 5, market Close 2. |
| Near walls fill the Scenery frame (Opus medium, xhigh) | **Partly** | The dither dissolve exists, but the side walls still fill a third of the frame in `scenery-gate-golden` and my gate dawn shot. The fade also eats the ground (new finding 2). |
| Hollow Keep floats; lookout is a split screen (Opus xhigh) | **Holds** | Seen in shots: the keep sits on its ridge, and the lookout is a framed inset. |
| Shades glide at frame rate (Terra B, Opus xhigh) | **Holds** (code) | Snap when the jump is more than 1 tile, then time-based at 1 tile per 300 ms (`_next/shades.ts:59,84-88`). |
| Hero's back, backlit figures, flat mountains (Opus medium, xhigh) | **Partly** | The pack and bedroll read in Play. In Scenery the hero is still a blue capsule from behind. The figure right of the hero in `scenery-gate-golden` is still near-black. The mountains have value ramps but are still flat facets. |
| Duplicated rule constants (Opus xhigh) | **Holds** | `_next/wisps.ts:3,96` imports `BLUE_MINUTE`, `CYCLE_MINUTES` and `RIPPLE_MS_PER_TILE`. |
| 1080p coverage, fog flash, first-Scenery stall, reduced motion, late materials | Not re-checked | Outside my focus. `patchTree` now runs on every `update()` (`_next/view.ts:418`). |

## New findings (most severe first)

### 1. The darkness hooks cost O(all items) per lighting call, many times a tick
`packages/game/src/engine.ts:207` (`lighting()` calls `carriedTorches(…, Object.values(this.state.items), …)`), called from `targetVisible` (`:216`) up to three times per targeting player per tick (`:472`, `:504`, `:521`), from `think` (`:616`) per creature looking for prey, and once per `view()`.

Measured with 16 torch-bearing heroes each targeting a creature (`tick(100)`, median of 100):

| Items in the world | Flag off | Flag on | Lighting calls per tick |
| --- | --- | --- | --- |
| 144 | 0.016 ms | 0.21–0.34 ms | 30 |
| 1,144 | 0.015 ms | 3.1–3.6 ms | 30 |
| 5,144 | 0.014 ms | 19 ms | 30 |

The test's `view()` cost scales the same way. Darkness adds 0.48 ms per 16 views at 144 items, 1.84 ms at 1,144 and 10.3 ms at 5,144, so the plan's "≤2 ms" check passes only because the test world is nearly empty.

**Why it matters:** in a live town, every inventory, corpse and pile is an item. At 10 ticks a second this is the first thing that breaks when the flag goes on.

**Smallest fix:** build the torch list from the present players' shield slot (`this.equipped(p, 'shield')`), which is O(players). Then compute `lighting()` once per tick and pass it into `targetVisible` and `think`. Add a few thousand idle items to the cost test.

### 2. Near fade dissolves the ground: a grey dither band across the bottom of every Scenery frame
`apps/client/proto/_next/lightfield.ts:86-93`. `nearFade()` discards any field-patched fragment within `uFNear` (5.5 units) of the lens. The Scenery camera sits low over the ground, so the ground in front of the hero dissolves into the clear colour. You can see it in the committed `scenery-meadow-dawn` and `scenery-bridge-night`, in the lower-left of `scenery-gate-golden`, and across the full width of my gate-at-dawn capture (about the bottom 90 px).

**Why it matters:** this fix shipped in this round, and it is in every frame the user will judge for P3.

**Smallest fix:** fade only vertical or raised surfaces, e.g. return early when `vFNrm.y > 0.5` or `vFPos.y < 0.05`.

### 3. The asserted cost limit is a wall-clock bar inside a parallel test run
`tests/darkness.test.ts:293`. `node --test` runs files concurrently. Run on its own, the extra cost is about 0.6 ms. In a full run at load average 13 it read 2.66 ms and failed `npm test`, then passed again at load 2.

**Why it matters:** a flaky required test gets ignored, and then it stops guarding finding 1.

**Smallest fix:** keep the assertion in a separate script (`npm run bench:darkness`), or assert on `process.cpuUsage()`. Either way, include the item load from finding 1.

### 4. The client lights piles and shades with the previous update's sources
`apps/client/proto/_next/view.ts:420,481`. `update()` runs `drawGround` and `shades.sync` using `this.lastSources`, which `setWorld` last filled from the *previous* view's `lights` and time. Live: on the update where another hero's torch first lights a pile, the server sends it, and the client hides it (level 0 from the stale sources). It shows on the next update. When light leaves, the tint stays one update too bright. A shade's silhouette can likewise show one update after its tile has gone dark.

**Why it matters:** this never shows more information than was sent, since the silhouette size is in the shade. But "the picture follows the server" is the claim the probe exists to prove, and the probe does not look at piles or silhouettes.

**Smallest fix:** in `update()`, rebuild the sources from the incoming `view.lights`/`view.time` before drawing, or move both calls after `setWorld`.

### 5. The night-floor outline turns unlit forms into line art
`apps/client/proto/_next/view.ts:61-62`. Every depth step gets a 1-px `night[2]` line at every stop and distance. In `scenery-bridge-night` the tree line becomes zigzag wires across the frame. In `dark-undercroft-none` and `night-gate` the walls read as blueprint lines rather than pixel forms.

**Why it matters:** it is readable, but it pulls against "pixel art with feel and weight" in exactly the shots meant to sell night.

**Smallest fix:** limit `sil` to Play/Close, or scale it by linear depth so that far geometry gets no line.

### 6. Lab honesty: the darkness tab adds every torch to the picture
`apps/client/proto/lab/tabs/darkness.ts:21-25`. The override sets `view.carried` to every present torch even with the rule on.

- Served anonymous ids (`torch:anon:N`) never match `torch:<id>`, so each hidden carrier's light is uploaded twice.
- A torch the server withheld is still drawn.

The current scenes have one carrier, so the probe's 0/0 stands. But the lab would show light the server never sent as soon as a second carrier exists.

**Smallest fix:** skip the override when `rule` is on.

**Also:** `labProbe` and `labBench` are defined twice (`lab/main.ts:178-191` and `:226-239`), so `?bench=1` runs the bench twice.

## Against the user's request (from the recaptured shots)

- **Delivered:**
  - Light now carries meaning in every darkness shot: torch pools, teal wisp pools in the black meadow, and eyes that sit just outside them. Unlike round 1, the undercroft without a torch can now be walked.
  - The golden-hour gate and the moonlit bridge (huge moon, lit window in the keep) are the most fable-like frames, and close to grand.
  - The lookout is now a real framed panel, so the Continuum-vs-Lookout choice is fair.
- **Short of the ask:**
  - Every Scenery frame ends in the dithered band (finding 2).
  - The far land is still flat triangles.
  - Backlit figures in Scenery are still near-black blocks.
  - The torch pool in `night-undercroft-torch` is a saturated maroon, not warm amber.
  - Night outlines read as vector lines (finding 5).
  - Play ground transitions are still blocky noise rather than painted edges.

Better than round 1 on "frightening without light". Not yet "stunning" everywhere the user will zoom out.

## What I verified myself

- **Tests:** `npm test` 85/85 at low load, 3 runs; it failed once at load 13 on the cost test. `npm run typecheck`: clean. The cost test run alone 4 times gave +0.54 to +0.58 ms.
- **Golden fixture:** `git archive HEAD packages/game content` into my scratch dir, then ran the fixture scenario on the HEAD engine; it deep-equals. Two mutated copies of the current engine both fail it.
- **`tsx` scripts against the real engine and `buildTown()`:**
  - the `perceive` wall case and a 46,604-pair monotonicity and wall sweep;
  - ground items with and without a torch;
  - 265 torch-privacy placements;
  - tick and `view()` cost against item count, with a call counter on `lighting()`.
- **Live lab** (`eval.mjs`, real time, 1200×700):
  - `labDarkCheck(15000)` in three scenes;
  - `labDarkCheck` with a sabotaged `LightField.update`;
  - `labFloorTrip()` from both floors;
  - label visibility at 4 stops.
- **My own in-page probe:** a fresh `Engine` and `WorldView` on a `v=today` page (so there is no shared field state). It covered the floor trip through `update()` with time and doors changing, piles under another hero's torch, and shade clicks through `WorldView.click`.
- **Shots:** opened `dark-undercroft-none`, `dark-meadow-none`, `night-gate`, `night-undercroft-torch`, `blue-shrine`, `golden-meadow`, `lookout-market-noon` and all three `scenery-*`. Captured my own gate-at-dawn Scenery shot. A meadow-at-dawn recapture at 7 s had already dropped to Play after a boar hit, which is designed behaviour.

## What I did not verify

- Keyboard play in a headed browser.
- The 1080p coverage, the fog flash, the first-Scenery stall and reduced motion.
- Any DPR other than 1, or another GPU.
- The five-minute strike log.
- Whether anonymous torch ids stay stable across views, beyond the tests.
- Production or Electron integration.
