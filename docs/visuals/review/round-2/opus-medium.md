# Visuals build review, round 2: opus-medium

## Score: 7.5 / 10 (round 1: 7)

## Verdict

The round-1 fixes are real. The rule side is now sound. `perceive` never lets light reduce what you see. Ground items, torch carriers and the clock go through the rule. The flag-off golden fixture really comes from HEAD: I ran the scenario on a `git archive HEAD` copy and it deep-equals the fixture. The floor round trip holds on the GPU (0 mismatches both ways). The lab can now be played. The Play↔Scenery dolly no longer flashes (luma eases 55 → 81 with no spike; round 1 measured a 170 spike). The undercroft without a torch is now navigable and still frightening: indigo floor, wall edges, eyes. The hero's back reads as a traveller, and the keep sits on its ridge.

Two fixes brought new defects into the frames the user will judge:
- The Scenery near-fade also dissolves the ground, so every Scenery shot has a dithered strip of floor along the bottom edge.
- The night-floor silhouette pass draws the distant pine forest as glowing wireframe triangles in Scenery at night.

Three fixes are partial:
- Close still shows less than the server window at 1080p.
- The clock comes from the server only when darkness is on.
- Loot is now hidden on dark tiles even when the rule is off.

None of this blocks the user's choices. The first two are small, and they are worth fixing before the user looks at Scenery.

## Round-1 findings

| # | Round-1 finding (who) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Floor round trip corrupts the field (Terra A, B) | **Holds** | `bind()` re-uploads its sources (`lightfield.ts:133-141`). `labFloorTrip()`: 0→1→0 0 mismatches at market 23:00, 1→0→1 0 mismatches from the undercroft. Note: `update()` on a field that is not bound would still write to the shared uniforms, but `view.ts:159-161` only ever updates the bound field. |
| 2 | `perceive` sees through walls; light hides (Opus xhigh, medium) | **Holds** | `light.ts:176` returns `none` when d > 1 and there is no light line, before the level test. Test "a rat behind rock is absent in darkness, dim light and bright light". |
| 3 | Ground items ignore darkness (medium, xhigh, Terra A) | **Holds on the server, partly on the client** | `engine.ts` filters `view.ground` by `visibleTile`. The client dims each pile by level, but it also hides piles at level 0 with the rule off (new finding 3). |
| 4 | Hidden torch carriers leak via `view.lights` (xhigh) | **Holds** | A carrier's id is sent only when the carrier is perceived; otherwise an anonymous light, only when it lights a tile the viewer can see. Covered by a test. |
| 5 | Client clock from compiled balance (medium, xhigh) | **Partly** | `GameView.world` exists only under darkness (`engine.ts`, end of `view()`), so with the flag off the client still uses `defaultBalance`. Creature and hero step times still come from `defaultBalance` (`actor-layer.ts:15-16`). |
| 6 | Flag-off test cannot fail; cost check only logs (xhigh, medium) | **Holds** | I re-ran `darknessOffScenario()` against an untouched HEAD tree: it deep-equals the 300 views in the fixture. The 2 ms cost is now asserted with 16 clustered torch-bearers. The scenario only covers the undercroft with two heroes and a rat (no night, torches or ground items), but the flag-off path is a guarded early return, so that is enough. |
| 7 | Darkness collapses to one swatch; no night floor (xhigh, medium, Terra A) | **Holds, with a regression** | `dark-undercroft-none`: indigo floor, wall outlines, eyes. Walls one tile away are readable. The same pass outlines far geometry in Scenery at night (new finding 2). |
| 8 | Lab cannot be played (all four) | **Holds** | `lab/main.ts` wires `onPick` (walk, target incl. shades, talk, use, Shift-look), WASD/arrows and Space. `-` from Play drove a real dolly in my probe. Caveat: the handler calls `e.target.closest`, so a key event aimed at `window` throws (only synthetic events do that). |
| 9 | Adjacent shades cannot be picked (Terra B, xhigh) | **Holds** | `view.ts:372-378` falls back to `shades.pick`. The lab sends `target` for shade ids. A shade that is a player sends a player id, and the server refuses it with "That creature is not here" (acceptable). |
| 10 | Probe does not walk or check the picture (all four) | **Partly** | It now reads the GPU field and sends walks. Unloaded runs: meadow none 0/0, meadow torch 0/0, undercroft torch 0/0 (60 samples, 21 steps each). With 5 Chromes in parallel it reported **5–10 "full on dark"** disagreements and, in meadow+torch, **47 field/rule mismatches**. I could not pin down the cause, and four concurrent meadow runs later were clean. See new finding 5. |
| 11 | Labels from behind the camera / over walls (medium, xhigh, Terra A) | **Holds** | `screen()` sends z outside [-1, 1] off screen (`view.ts:364-369`). Labels are hidden when `wide` (`actor-layer.ts:298`). My bridge night shot has no stray "WARDEN CORIN". |
| 12 | Play covers fewer tiles than the server window at 1080p (medium) | **Partly** | Play holds: `labBench` at 1920×1080 gives a 640×360 buffer, 20×15 tiles. Close is still `k+1` = 4, 480×270, which is 15 × 9.6 tiles against the server's 17 × 13 (`stops.ts:24`). Close is the fighting stop. |
| 13 | Fog flash at dolly start (xhigh) | **Holds** | Per-frame mean luma through a `-` dolly at the gate, golden hour: 55 throughout the first half, then up smoothly to 81. No spike. |
| 14 | Near walls fill the Scenery frame (medium, xhigh) | **Partly, with a regression** | The walls at gate and bridge still take about 25 % of the frame each. Within 5.5 units they become a 4×4 screen-door, not a cut-away. The fade also eats the ground (new finding 1). |
| 15 | Hollow Keep floats (xhigh) | **Holds** | Seated on a mound on the ridge in the gate and bridge shots. |
| 16 | Lookout is a split screen (xhigh) | **Partly** | It is a framed inset now, and figures are not doubled. It still covers the top 34 % of the live Play view (`view.ts:645`): at 1200×700 that hides tiles 3–6 north of the hero, inside the server's window. |
| 17 | First Scenery entry stalls ~300 ms (xhigh) | **Mostly holds** | The idle bake runs. My first dolly after a 9 s load still had one **~96 ms frame gap** at the dolly's midpoint (`wide` flips there). That is likely the first use of the Scenery atlas or the first fog program compile. |
| 18 | Materials lit up to 0.5 s late (medium) | **Holds** | `patchTree` after each sync (`view.ts:418`). |
| 19 | Reduced motion keeps dust, collapse, sparks (Terra A) | **Holds** (code) | `feel.ts` `tuning` drops all three; sparks are gated by `!this.reduced` (`actor-layer.ts:228`). Not run with emulation. |
| 20 | Shades glide at frame rate, never snap (Terra B, xhigh) | **Holds** (code) | A jump of more than one tile snaps; otherwise the shade moves 1 tile per 300 ms on wall time and never overshoots (`shades.ts`). |
| 21 | Hero's back is a blue teardrop (medium, xhigh) | **Holds** | Pack, bedroll, lantern cage and gold hem are readable at Scenery and Play. |
| 22 | Backlit figures go black (medium) | **Partly** | At golden hour Mira now reads as a figure, though still dark. At night in Scenery, NPCs are black shapes with a blue outline. |
| 23 | Flat pastel mountains (medium) | **Partly** | The value ramp is there. They are still faceted low-poly cones, the weakest layer compared with ref-5. |
| 24 | Duplicated rule constants (xhigh) | **Holds** | `wisps.ts` imports `BLUE_MINUTE`, `CYCLE_MINUTES` and `RIPPLE_MS_PER_TILE`. |

## New findings (most severe first)

### 1. The Scenery near-fade dissolves the ground in front of the lens
`apps/client/proto/_next/lightfield.ts:86-93`, `apps/client/proto/_next/view.ts:578`. `nearFade()` runs on every field-patched Lambert material, and the town ground (`terrain.ts:98`) is one of them. In Scenery the lens sits about 1.2 units above the ground, and the bottom of the 40° frame meets the ground about 3–5 units away. Inside 5.5 units the fade discards `1 − (cd/5.5)²` of the pixels, so 20–70 % of that ground is thrown away. The sky or clear colour shows through as a dithered band along the bottom of every Scenery frame (`scenery-gate-golden`, `scenery-bridge-night`, my own shots). When `placeScenery` pulls in to 2.5 units, the hero's own tile goes too. The fix was meant for walls and now damages the floor that grounds the figure.
**Fix:** skip the fade for up-facing surfaces (`if (vFNrm.y > 0.7) return;` at the top of `nearFade`), or apply it only to building and prop materials.

### 2. The night-floor silhouette draws far geometry as wireframe in Scenery at night
`apps/client/proto/_next/view.ts:59-62`. `sil` is a raw depth-difference step (`0.002`) over a perspective depth buffer. It lifts every depth edge to `night[2]`, however far away it is. In `scenery-bridge-night` the pine forest past the river becomes rows of thin blue triangle outlines over black, and the NPC beside the hero is a black cut-out with a blue rim. It reads as a debug overlay, in the one night Scenery shot. At Play, which has an orthographic camera and near geometry, it works as intended.
**Fix:** gate the floor's edge term to the orthographic stops (pass a uniform such as `uSil = 1.0 - scenery`), or fade it with linearised depth so it only applies within about 15 units.

### 3. Loot is hidden on dark tiles even when the darkness rule is off
`apps/client/proto/_next/view.ts:481-483`. `s.visible = lv > 0 || near` does not check `view.world?.darkness`. With the flag off, the server sends every pile, but in the undercroft (ambient 0) any pile beyond a brazier or torch disappears, while the engine still lets you walk to it and pick it up. With the flag on, this check is redundant, because the server already drops piles below level 1 (`visibleTile`). So the hide only ever takes effect when it is wrong. Production is flag-off today, so this would migrate as a regression.
**Fix:** keep the dimming, and hide only when `view.world?.darkness` is true, or drop the hide and let the 0.25 floor stand.

### 4. Close still shows less than the server window at 1080p
`apps/client/proto/_next/stops.ts:24`. The cover cap is computed for Play's pitch, then `+ stop.zoomStep` adds a step for Close. At 1920×1080, Close is ×4, 480×270, which is 15 × 9.6 tiles against the server's 17 × 13. Creatures that aggro and chase you are off the picture at the stop meant for fighting. This was the core of round-1 finding 1, which said "Close … is the worst".
**Fix:** compute `cover` per stop with `sin(stop.pitch)`, and cap `k` (zoom step included) at it. If Close is meant to be tighter than the server window, say so in the plan.

### 5. The dark-check probe can disagree for reasons it cannot tell apart
`apps/client/proto/lab/main.ts:198-212`, `apps/client/proto/lab/tabs/darkness.ts:22-23`.
- With CPU contention I got 5–10 "full on dark" disagreements and 47 field/rule mismatches. Unloaded runs were clean. The probe does not assert that it sampled a rule-on view (`v.world?.darkness`), and it does not check that the hero actually moved: `steps` counts walk actions sent, not steps taken. So a stale or rule-off snapshot looks the same as a rule defect.
- Separately, the Darkness tab overrides `setWorld` so that `view.carried` holds every present carrier's torch from live engine state, under its real id. That happens even with the rule on. The dedupe against served `torch:anon:N` ids never matches. So the lab picture lights torches the server withheld, and lights them where the engine is now, not where the snapshot put them. Today only the hero can carry a torch in that tab, so this is latent. But the tab is where the user judges whether darkness is honest.

**Fix:** under the rule, take carried lights only from `view.lights`. Have the probe skip or flag samples where `!v.world?.darkness`, and count real position changes.

### 6. Small structural items
- `labProbe` and `labBench` are defined twice in `lab/main.ts` (`:178/:226`, `:184/:232`). It is a leftover from the fix pass and harmless, but the migration diff will carry it.
- The anonymous torch ids (`torch:anon:N`) are renumbered every view, so the order of carriers changes the `LightField` key. That costs extra mask rebuilds, not wrong light.

## What I verified myself

- Read `BRIEF.md` (review), the four round-1 reports, `fixes.md`, the engine and model diff, `light.ts` (perceive, `lightGrid`), `lightfield.ts`, the relevant parts of `view.ts` (`setWorld`, `screen`, `actorAt`, `drawGround`, `placeScenery`, `frame`, the post shader), `stops.ts`, `shades.ts`, `feel.ts`, the `actor-layer.ts` bake, sparks and labels, `lab/main.ts`, `harness.ts`, `tabs/darkness.ts`, `tests/darkness.test.ts` (names, golden test and cost test) and the fixture scenario.
- `npm test`: 85 pass. `npm run typecheck`: clean.
- Golden fixture provenance: `git archive HEAD packages content` into my scratchpad, then ran `darknessOffScenario()` with tsx against that tree. The output deep-equals `tests/fixtures/darkness-off-baseline.json` (300 views).
- Live, real-time, through `eval.mjs`:
  - `labFloorTrip()`: market 23:00 gave 0 mismatches; undercroft gave 0 mismatches.
  - `labVerify()`: market 23:00 at 1920×1080 gave 0 mismatches with 25 sources.
  - `labBench()`: 1920×1080 night market gave median 0.60 ms, p95 0.80 ms, buffer 640×360.
  - `labDarkCheck(15000)`, unloaded: meadow none 0/0 (60 samples, 21 steps), meadow torch 0/0, undercroft torch 0/0. Four meadow runs at once were also 0/0. Five mixed scenes at once gave 5–10 disagreements, plus 47 field mismatches with the torch.
  - Dolly: dispatched `-` at the gate, golden hour, and sampled the canvas luma every rAF for 1.3 s. No fog spike. One 96 ms frame gap at the midpoint.
  - Shots, in my scratchpad only: `dark-under-none.png`, `dark-meadow-none.png`, `scen-gate.png`, `scen-bridge.png` and `lookout.png`, all 1200×700. They are the basis for findings 1, 2 and 16.
- **Not verified:** reduced-motion behaviour live (code only); shade snap and glide live (code only); Close coverage from a live readout (derived from `pixelLock`); the flag-off loot hide in a running scene (I could not drop an item through the lab; from code); the root cause of the loaded-probe disagreements; DPR 2 and 2560×1440; a headed browser; the 5-minute hunt log.
