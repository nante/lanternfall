# Round 1: what was fixed, what was deferred

Reviews: `opus-medium.md` (7/10), `opus-xhigh.md` (6/10), `terra-a.md` (5.5/10), `terra-b.md` (6/10).

## Fixed

| Finding (who) | Fix | Where | Evidence |
| --- | --- | --- | --- |
| Floor round trip corrupts the light field (Terra A, Terra B) | Each `LightField` keeps its own source table and re-uploads it on `bind()` | `_next/lightfield.ts` `bind`, `uploadSources` | `labFloorTrip()`: 0 mismatches surface→undercroft→surface and back |
| `perceive` sees through walls in the dark; light can hide (Opus xhigh, Opus medium) | Non-adjacent target with no light line → `none` at any level; light never reduces perception | `packages/game/src/light.ts` (Terra) | `tests/light.test.ts`, `tests/darkness.test.ts` |
| Ground items ignore darkness (Opus medium, Opus xhigh, Terra A) | Server filters them like corpses; client tints each pile by the rule's level at its tile and hides it when dark | `engine.ts` (Terra); `_next/view.ts` `drawGround` | tests |
| Hidden torch carriers leak through `view.lights` (Opus xhigh) | Carrier id only if perceived; otherwise an anonymous light only when it lights a tile the viewer can see | `engine.ts` (Terra) | tests |
| Client clock from compiled balance (Opus medium, Opus xhigh) | Under darkness `GameView.world` carries `dayMs/dayOffset/darkness`; the view uses it | `engine.ts` (Terra); `_next/view.ts` `setWorld` | |
| Flag-off test cannot fail; cost check only logs (Opus xhigh, Opus medium) | Golden fixture recorded from the pre-change engine at HEAD; cost limit asserted with clustered torch carriers | `tests/darkness.test.ts`, `tests/fixtures/darkness-off-baseline.json` (Terra) | `npm test` |
| Darkness collapses to one swatch; no night floor; no edges (Opus xhigh, Opus medium, Terra A) | Constant shadow lift removed; unlit pixels rest on palette `night[1]` with silhouette edges at `night[2]`; undercroft fill cut to 0.06 | `_next/view.ts` post shader, `applyLights` | shots `dark-undercroft-none`, `dark-meadow-none` |
| Lab cannot be played (all four) | Clicks walk/target/talk/use; Shift-click looks; WASD/arrows step; Space targets; `-`/`=` change stop; notices log; refused auto-hunt targets no longer stall the tick | `lab/harness.ts` `send`/`look`, `lab/main.ts`, `_next/view.ts` `stepStop` | |
| Adjacent shades cannot be picked (Terra B, Opus xhigh) | Shades resolve to their id and tile on click, with no name or kind | `_next/shades.ts` `pick`, `_next/view.ts` `actorAt` | |
| Probe does not walk or check the picture (all four) | `labDarkCheck` walks a scripted square, reads the field back from the GPU each sample, checks server lists against the picture and the field against the rule, using the view's own time | `lab/main.ts` | undercroft+torch, meadow+torch, meadow no torch: 0 picture/server disagreements, 0 field/rule mismatches over 48 samples and 17 steps each |
| Labels mirrored from behind the camera, labels over walls in Scenery (Opus medium, Opus xhigh, Terra A) | `screen()` sends points behind the eye off screen; labels hidden in Scenery (no picking there) | `_next/view.ts` `screen`, `_next/actor-layer.ts` | |
| Play shows fewer tiles than the server window at 1080p (Opus medium) | Upscale capped so Play covers 17×13 tiles (1080p: ×3, 640×360) | `_next/stops.ts` | |
| Fog flash at dolly start (Opus xhigh) | Fog near/far pushed out by the lens distance during the dolly | `_next/view.ts` | |
| Near walls fill the Scenery frame (Opus medium, Opus xhigh) | Lit surfaces within 5.5 units of the Scenery lens dissolve in a Bayer dither | `_next/lightfield.ts` `nearFade` | shots `scenery-gate-golden`, `scenery-bridge-night` |
| Hollow Keep floats (Opus xhigh) | Placed at the ridge's computed height, on a mound | `_next/farland.ts` | |
| Lookout is a split screen (Opus xhigh) | Framed inset at the top centre; figures stay in the play view (actors on render layer 1) | `_next/view.ts`, `figures/sprites.ts`, `actor-layer.ts`, `shades.ts` | shot `lookout-market-noon` |
| First Scenery entry stalls ~300 ms (Opus xhigh) | Scenery pitch baked in idle time after first paint | `_next/actor-layer.ts` | |
| Materials lit up to 0.5 s late (Opus medium) | `patchTree` after each sync | `_next/view.ts` | |
| Reduced motion keeps dust, collapse, sparks (Terra A) | All three off under reduced motion | `_next/feel.ts`, `_next/actor-layer.ts` | |
| Shades glide at frame rate, never snap (Terra B, Opus xhigh) | Snap on non-adjacent jumps; time-based glide at one tile per 300 ms | `_next/shades.ts` | |
| Hero's back is a blue teardrop (Opus medium, Opus xhigh) | Leather pack, bedroll, unlit lantern cage, gold cloak hem | `_next/figures/kit.ts` | turntable, Scenery shots |
| Backlit figures go black (Opus medium, P2 note) | Sprites take 1.45× sky and 1.2× ground fill | `_next/figures/sprites.ts` | |
| Flat pastel mountains (Opus medium) | Value ramp up each ridge, darker valleys, lighter crests | `_next/farland.ts` | |
| Duplicated rule constants (Opus xhigh) | Exported from `light.ts` (Terra) | | |

## Deferred, with reason

- **Split `view.ts` into camera/post/scenery modules.** Migration work, not prototype work; recorded as the first migration step.
- **Mipmapped town ground in Scenery.** The ground shader picks atlas cells with `fract`, which breaks mip selection at cell edges; needs a different sampling scheme. Shimmer only while moving.
- **More than 32 light sources.** Busiest measured scene has 25; recorded as a migration risk.
- **Honesty counters that restate the construction.** The property holds and the walking GPU probe now checks the picture independently.
