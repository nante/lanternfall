# Lanternfall style: how the picture is made

After round 2 the user judged the build "far away from what I gave as inspiration" and asked for the style "almost 1:1", scalable, and holding up as the window resizes and the perspective changes. This is the pipeline that answers it. Everything is a rule applied at render time, so it works at any zoom stop, size and angle; nothing is a painted backdrop fixed to one view.

## Where it lives

The renderer is `apps/client/src/render/` (paths below are relative to `apps/client/src/`). The game (`apps/client/src/main.ts`) and the lab (`apps/client/proto/lab/`) both draw with it; there is no second renderer. In the game, `-` steps out one stop (Close, Play, Scenery), `=` or `+` steps back in, and the mouse wheel over the world does the same.

## 1. Palette from the references

`apps/client/proto/lab/extract-palette.mjs` runs k-means in OKLab on the reference art (phone UI cropped out):
- 28 colours from ref-1 (dragon ruins): blue-violet stone, peach light, rust reds;
- 28 from ref-2 (cathedral city): slate shadow, gilded stone, orange roofs;
- 14 from ref-4 (forest ride) and 6 from ref-3 (dusk field): olive and forest greens (the field's two acid greens are left out);
- 17 from video-1 (fable scenes): night blues, moon and torch oranges;
- the Lantern's three brightest teals, because magic is not in any reference.

Near-duplicates (OKLab distance under 0.018) are merged. The post pass snaps every pixel to this set through a 32³ lookup (`render/palette.ts` `lutColors`, `paletteLut`). Material colours (`ramps`) stay as authored albedo; only the final picture is snapped.

## 2. Hue-shifted light

Each time-of-day keyframe (`render/clock-style.ts`) carries a `shadowTint` and a `lightTint`. The post shader multiplies dark pixels towards the shadow tint and bright pixels towards the light tint:
- day, after ref-1: violet-blue shadows, peach light, cobalt sky light, lavender haze;
- golden hour, after ref-2: slate-teal shadows, gilded light, warm haze, dark clouds with lit rims;
- night, after video-1: deep blue with amber fire.

Depth outlines are kept faint (0.15): the references draw form with value and hue, not ink.

## 3. Painted blocks, anchored to the world

Every lit Lambert surface (terrain, walls, trees, far land, architecture) runs `blockTone` (`render/lightfield.ts`): the surface is split into rows two render pixels tall and blocks two to five pixels wide, staggered row to row. Each block shifts value by up to ±12% and leans cool (blue-violet) or warm (peach). This is the rectangular brushwork of ref-1.
- **Anchored:** blocks are computed from world position on the surface's plane, so they never swim as the camera moves.
- **Scales with distance:** the block size doubles wherever one block would fall under a screen pixel (`fwidth` of world position), so distant surfaces keep coherent blocks instead of shimmering noise.
- **Calmer on the ground:** up-facing surfaces take half strength, so the play field stays easy to read.

## 4. Sky

`render/sky.ts`: gradient, sun and an oversized moon, stars, and clouds sampled on a plane above the land (so they hold their place as pitch changes), stretched into horizontal streaks, in three tones: a body darker where dense, and a rim on the side facing the sun in elevation. Tops are lit when the sun is high (ref-1), undersides when it is low (ref-2).

## 5. Block size per stop

`render/stops.ts`: Close and Play render at 32 render px per tile with a whole-number upscale (Play always covers the server's 17×13-tile window). Scenery has `chunk: 1.5`: it paints in blocks half as large again (×6 where Play is ×4), fine enough to hold a vista's detail and still plainly pixel art. Still a whole-number upscale, so crisp at any window size. Scenery also runs without dither (`view.ts`), so sky and far land fall into clean flat bands, as in the references.

## 6. Atmospheric depth

Scene fog in Scenery runs from 70 to 680 units and blends towards the keyframe's horizon and haze colours, pushed out by the lens distance during the dolly so the transition never washes out. The castle (110–180 units) keeps its detail and the cathedral city (about 320 units) shows its spires, as ref-2's cathedral does, while the mountain wall fades. Layers (town, forest band, hills, castle ridge, mountain wall) separate by haze, as in both references.

## 7. Grand architecture

`render/farland.ts`, `render/spire.ts`, `render/architecture/`: Hollow Keep, a ruined castle on a crag 110–180 units north, with a broken crown, round towers, stepped curtain walls and a great arched bridge over a gorge (ref-1); the cathedral city of Saint-Vigil about 320 units out, with twin spires, flying buttresses and about 450 roofs climbing its hill (ref-2); and the Lantern Spire, a gothic tower about 22 units tall with an open lantern chamber holding the teal core. Each landmark is one merged mesh and one draw call. The lab place `spire` (shots `spire-play-noon`, `spire-play-night`) shows the Spire at the Play stop. Built from Lambert flat-shaded geometry, so they take the palette, the hue-shifted light and the painted blocks like everything else.

## 8. Vantage: a long lens from low down

The Scenery stop ends 30 tiles behind the hero and 4.4 up, looking at a point 7.4 up through a 30° lens (`render/view.ts` `sceneryEye`; the lab's `eye=back,up,look,fov` overrides it). Both references are long-lens views from near eye level: distance is compressed, so the castle and cathedral loom over the town instead of sitting small on the horizon, and the horizon lies low in the frame with the hero at the bottom. Figures are baked for this view at 9° (`actor-layer.ts` `SCENERY_PITCH`).

## 8b. Open foreground, framed by trees

In Scenery, whatever stands between the lens and the hero is cut away (`uFCut`, `uFAxis` in `render/lightfield.ts`, set in `view.ts`): walls and roofs across the whole width, trees only down a corridor in the middle (`material.userData.frame`). Trees outside the corridor stay and fall into dark silhouette (`nearShade`), framing the view like ref-2's bottom corners. Close and Play are untouched.

In Scenery the ground also takes long horizontal painted strokes (`uFGround`, `blockTone`) over a flatter ground texture (`uGroundDetail`), after ref-1's foreground; Play keeps its hand-painted tiles.

## 9. Figures

Humans are about four heads tall (`render/figures/kit.ts`): long legs, a head scaled to 0.8 with everything worn on it, cloaks and robes reaching the ground, and a rust wool bedroll (not a white block) on travellers' packs. The hero's cloak stops at the knee with a gold hem, over brown trousers and boots, with a rust wool shoulder mantle and a belt: from behind (the most-seen view) it reads as a traveller with legs and shoulders, not a blue bell. They are heroic travellers like the references' riders and cloaked pairs, not toys, and the head and hood still read at Play scale.

## 10. Light stays on the ground

The light field is light on the ground the rule plays on. It climbs walls and trees, then falls away in dithered steps between 3 and 4.5 units up, so the Lantern Spire keeps its own stone instead of turning lamp-coloured. After golden hour a quarter stays, a faint teal sheen on the stone; in daylight teal on warm stone would read olive.

## 11. Roofs and rubble

Generated roof tiles take the references' colours (`render/textures.ts`): ref-1's blue-violet slate, ref-2's terracotta clay and straw thatch; slate clouds at golden hour (`clock-style.ts`) instead of olive. Fallen stones pile at the foot of outdoor walls and rust-red leaf litter lies near them (`render/terrain.ts` `rubble`). Both are purely visual, under a quarter of a tile high, placed by hash, never inside a house.

## 12. The lower town

Between the forest band and the castle's crag lies a sprawl of small terracotta and straw-roofed houses with a few towers (`render/architecture/cathedral.ts` `lowerTown`), kept clear of the crag and of the sightline to the castle's bridge. A near quarter of smaller houses stands among thinned pines just across the river (26–56 units north of the map edge), with the street from the bridge running between them, so from the north bridge the roofs fill the ground between the viewer and the keep. All of it is outside the playable map. From every Scenery view the town now looks out over roofs towards the keep, the layering of ref-2: roofs, then the dark castle, then the cathedral city in haze.

## 12b. The dragon of Hollow Keep

ref-1's dragon, as an original creature (`render/architecture/dragon.ts`): perched on the walls behind and beside the keep, so the tower stands in front of one wing; its neck arches up, forward and down so the horned head hangs low between the wings and looks over the wall at the town (ref-1's pose); tail down the walls, and wings raised and spread four times the tower's width, with membranes scalloped between the fingers. Blue-violet scales and rust-red membranes, ref-1's two signature colours. At noon it is the reference's composition; at golden hour a silhouette over the castle; at blue hour and night its wing cuts across the moon. It stands 1.7× its first size, its wing membranes torn into notches of different depth between the fingers (ref-1's ragged wings). Its arms are pale bone, the wings' leading edge, so the silhouette reads against the sky; its fingers sweep back so the wings have depth. Far scenery, one merged mesh, no part of play.

## 12c. Long shadows and lit windows

Shadows from a low sun let 45% of the light through (`sun.shadow.intensity` 0.55 below 20° elevation, 0.85 above), so long dusk shadows read as shade on a lit field (ref-3) instead of dark slabs. From blue hour on, the lower town's windows kindle amber (`lowerTown` returns its windows as a separate unlit mesh; `FarLand.update` sets their colour), so night reads as warm points against deep blue (video-1).

A warmer golden-hour grade (sun #ffb25a, saturation 1.25, shadow tint #98a8e0, light tint #ffd49a) and a higher golden sun (17°) were both measured and rejected: they lowered overlap with ref-2 (0.31 → 0.25 and 0.28) and ref-3 (0.27 → 0.21 and 0.23).

## 12d. Sun through leaves, and a dragon with mass

Canopy light (ref-4): the light field's ambient texture carries canopy density in its green channel (trees and pines within two tiles). On sunlit ground under it, `canopyShade()` in `render/lightfield.ts` lays solid leaf shade with a dithered rim, broken by flecks of sun on the 32 px grid that drift a little with the wind. Visual only; the rule never reads it.

The dragon's vertex colours carry form and rim (`architecture/dragon.ts`): tops lighter, undersides darker, and faces turned side-on to the town take a pale rim, so it reads as a mass against the sky.

## 12e. Grass tufts in their own colours

The tuft and wisp sprites (`render/tufts.ts`, `render/wisps.ts`) were built through `THREE.Color`, which returns linear values, and then stored in sRGB textures, so they were decoded twice and drew near-black: the meadow's tufts read as dark holes. They now store each hex's sRGB bytes directly, so tufts are green clumps with lit tips and wisps glow in their drawn colours.

## 12f. Grass painted, not camouflaged

The play field had a camouflage look from three layers at once: a per-tile brightness jitter in the ground shader (`terrain.ts`, now off), painted blocks on the ground (`blockTone` now skips ground-level up-facing surfaces; walls, stone and far land keep them), and large low-frequency clusters in the grass art. Grass is now painted in tighter clusters (`ground-art.ts`, 8 cells per tile instead of 4) on a hue-shifted ramp from cool blue-green shade to warm yellow-green light, with short sun-caught blades. The colour score dips slightly (ref-4 market 0.35 → 0.32, ref-3 0.27 → 0.26, noon grass now brighter than the references); the change answers a texture complaint that a colour score cannot see.

## 12g. Golden hour floods the field

At 12° a sun lights flat ground at about a fifth of its strength, so golden hour read as a general darkening ("muddy" in every review). The golden sun now runs at 7.0 instead of 3.6 (`clock-style.ts`), keeping its low angle: the field is warm-lit and green, roofs catch orange, and shadows stay long. The colour score against ref-3 dips (0.26 → 0.24; ref-3's whole frame is darker than a lit field); the change answers the reviewers' judgement, which the score cannot capture.

## 12h. Water reads as water

The river took 42% of the sky colour and sparkled in clumps, so from above it read as sky with stamped clouds. It now has a brighter, low-contrast base (a regular wave snapped to two palette tones drew cloud-like blobs), takes 30% of the sky colour, and glints in single scattered points of its own lighter colour, not white (white points read as stars) (`terrain.ts`).

## 12i. Trees painted as foliage

Trees stay 3D (they cast shadows and turn in Scenery), but their canopies are no longer flat-shaded facets: rounder geometry, smooth light rolling round the crown, broken into world-fixed leaf clumps four render pixels across in three values, with clumps dropping out near the silhouette for a ragged leaf edge (`render/trees.ts` `foliage`). In the Play view they read as pixel-art trees.

## 12j. Rim light on figures

A sprite pixel on the silhouette edge facing the sun or moon catches its light (`render/figures/sprites.ts`): gold at golden hour, cool blue under the moon. Figures separate from dark ground at dusk and night instead of reading as blobs.

## 12k. A saturated dusk sky

The golden hour follows ref-2: slate cloud (#3b4553) over a pale cream-gold glow (#f0d49c) with warm rims, a paler sun (#ffd49a) standing in the south-west behind the Scenery lens so it gilds the faces the view looks at, and saturation 0.95. A saturated orange-and-navy version was tried and measured further from ref-2 (colour overlap 0.20–0.23 against 0.29–0.31).

## 12l. Flame flicker

Each amber light's colour steps between three strengths on its own beat (`LightField.flicker` in `render/lightfield.ts`, called each frame from `view.ts`, off under reduced motion). Picture only: light levels, which the rule plays on, are untouched, and verify still finds 0 mismatches. The Lantern's teal stays steady.

## 13. Underground dark

Underground the dark is earth, not sky: below ground, shadows lean warm-neutral and unlit stone rests on a warm near-black instead of the night's indigo (`render/view.ts` post pass, `uCave`), after the flashlight reference's cellar. Outside the torch it is still black.

## Measured against the references

`apps/client/proto/lab/style-distance.mjs <ref> <game...>` compares colour distributions in OKLab. `overlap` is how much of the two pictures' colour distributions coincide (lightness × hue × chroma bins; 1 is identical), `lightness gap` the difference in mean OKLab lightness. The baseline is the game before this work (`reference/current-game.png`); the cropped references are in `compare/refs/`.

| Reference | Game shot | Overlap before → now | Lightness gap before → now |
|---|---|---|---|
| ref-1 dragon ruins | `scenery-bridge-noon` | 0.05 → 0.42 | 0.327 → 0.030 |
| ref-2 cathedral city | `scenery-gate-golden` | 0.08 → 0.30 | 0.303 → 0.142 |
| ref-2, from the market | `scenery-market-golden` | 0.08 → 0.31 | 0.303 → 0.051 |
| ref-2, from the north bridge | `scenery-bridge-golden` | 0.08 → 0.23 | 0.303 → 0.080 |
| video-1 moon scene | `scenery-steps-blue` | 0.24 → 0.33 | 0.222 → 0.096 |
| video-2 flashlight cellar | `night-undercroft-torch` | 0.40 → 0.37 | 0.019 → 0.076 |
| ref-4 forest ride | `noon-meadow` | 0.29 → 0.30 | 0.212 → 0.170 |
| ref-3 dusk field | `golden-meadow` | 0.27 → 0.28 | 0.117 → 0.001 |

The three grand references (ref-1, ref-2, the moon scene) moved from near-unrelated to a third of the colour distribution shared, and their lightness now sits close to the art. The cellar is level with before. The forest ride is a first-person view with no top-down equivalent, and the dusk field matches its colours as well as before and its lightness far better. Its acid greens glare on noon grass (forest overlap 0.29 → 0.21 when always on), so the palette changes with the sun: `paletteLut(32, LOW_SUN_GREENS)` is used while the sun is low (dawn, golden hour) and the day palette otherwise (`render/view.ts` `applyLights`). That lifted ref-3 from 0.20 to 0.27 for a 0.03 dip on ref-2's golden vista.

## 13b. Set pieces are placed from data

`render/architecture/scene.ts` lists what stands beyond the playable map: the road, Hollow Keep, the dragon, the cathedral city, four districts, six ruins and three groves, each with a position and its parameters (size, seed, house count, storeys). One unit is one tile. Builders in `architecture/pieces.ts` (`buildDistrict`, `buildRuin`, `groveSpots`, `townHouse`, `cityTower`) take a piece and the ground and nothing else. This is the shape a world-map editor would write, and the step towards making these places visitable. One exception: the keep's origin is data, but its towers and walls are still authored around that origin in `castle.ts`.

- **Districts (ref-2):** houses pack on a jittered grid like streets, with tall pale fronts in storeys, rows of small windows (about a third light at night), steep roofs, chimneys, dormers and corner turrets, and spired towers among them.
- **Cathedral:** scaled 1.2 and moved nearer (z −255), so its twin spires rise over the castle.
- **Ruins (ref-1):** broken walls of uneven height with breaches, lancets and round tower stubs on the north bank, with fallen stone around them.
- **Groves:** round-crowned trees and tiered firs, painted as foliage, in place of the plain cone pines.

## 13c. Clouds and stonework

Clouds are cumulus built from rounded lumps in direction space (`render/sky.ts`), so they keep their shape to the horizon instead of stretching into bands, with edges broken into staggered pixel dashes. By day the body is bright with soft blue bases (ref-1); with the sun low it is slate with darker cores and warm lit edges (ref-2). Clouds part around the moon.

In Scenery, upright walls take rougher brickwork (`blockTone` in `render/lightfield.ts`): more contrast from stone to stone, an occasional dark gap and pale stone.

At night in Scenery the moon lights the land (`view.ts`): the river, the road, the ruins and the town's roofs read in deep blue. Play keeps the full dark, where the darkness rule lives.

## 14. The east reach (map)

The map is 104 tiles wide instead of 84 (`packages/game/src/town.ts`). The original 84 columns are generated tile for tile as before (the east reach has its own random stream). The new strip holds two small example areas: Whisperwood, a dense old wood with a winding path, and the Fallen chapel, a ruin of broken walls and pillars at the path's end. It has no altar or other light source, so the rule's lights are unchanged. Lab places `wood` and `chapel`; shots `scenery-wood-noon`, `scenery-chapel-golden`, `wood-play-noon`. Kept small on purpose: the map gets its own pass later.

## What gameplay keeps

Nothing here touches the rules. After the restyle: 84 tests pass; the light field still equals the rule (verify: 0 mismatches); the walking darkness probe finds 0 picture/server disagreements (with the rule on, on the surface at night and in the undercroft with and without a torch); Play frames cost 0.7 ms and Scenery 0.5 ms at 1920×1080 (limit 4 ms).
