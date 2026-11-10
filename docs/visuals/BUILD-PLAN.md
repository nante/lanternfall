# Visuals: build plan

Merged from round 2 (`round-2/{opus-medium,opus-xhigh,terra-a,terra-b}.md`), which built on round 1 and `round-1/synthesis.md`. Where members split, the coordinator decided and the reason is given. This is what gets built.

## Decisions

| # | Question | Decision | Votes and reason |
| --- | --- | --- | --- |
| 1 | Engine | Keep Three.js 0.187 on WebGL2. One renderer fork at `apps/client/proto/_next/`, copied from `apps/client/src/render/`. Nothing under `apps/client/src` or `apps/server` changes until a prototype wins. | 4/4. |
| 2 | The user's zoom idea | **Adopt it as three camera stops**, available anywhere on the surface: **Close** (orthographic, pitch asin(7/8) ≈ 61°), **Play** (orthographic, pitch asin(3/4) ≈ 48.6°, the default), **Scenery** (perspective, low, behind the hero, sky and horizon to the north; no clicking; surface and open sky only). The wheel and `-`/`=` move one stop. A painted lookout panel that reuses the same sky and far layers stays in the picker as the fallback. | Opus ×2 adopt it everywhere; Terra ×2 only at the bridge overlook. Adopted everywhere because the camera never turns: the horizon is always north, where the river and bridge already make the best foreground, so far scenery is needed in one direction only. The live world (real lamps, real night, other players) beats a set piece. The Terra concerns (finite map, map edge, sprite pitch) are handled by far land, side skirts, haze and a second bake pitch, and the panel stays as the exit if Scenery fails its check. |
| 3 | Pixel density | **32 render px per world unit**, whole-number upscale `k = max(2, round(hostHeight / 290))`, canvas CSS box exactly buffer × k (crop the remainder, never stretch). At Play a tile is exactly 32×24 px; at Close 32×28. No free zoom. Close and Play are pixel-locked at rest; Scenery and transitions are not. | Opus xhigh's diagnosis (ground at 24 texels/unit, scene at ~62 px/unit, non-integer CSS stretch) is the root cause of "blocks under a filter". Terras accepted it as a hypothesis; 32 px/unit keeps Terra's ~300-row budget and gives a 40–44 px hero. |
| 4 | Colour | An Opus-authored palette of about 40 colours, applied through a 32³ lookup table by nearest colour in OKLab, replacing the per-channel `levels` quantize. Dither only at light-band edges. **Amber means fire, teal means the Lantern's magic**; teal is used nowhere else. | Opus ×2; Terras agree on the warm/cool/turquoise language. |
| 5 | Actors | **Figures written as code by Opus** (shaped primitives, a joint skeleton, keyframed poses), **baked at load** into 8-direction sprite atlases at two pitches (Play and Scenery), with palette ramps, a 1 px outline and stray-pixel cleanup. Drawn as upright planes through the feet, facing south. Lit by the light field at the feet. Hand-edited frames are an optional later layer. | Opus ×2 for the bake, Terra ×2 for hand-pixelled sheets. The author is Opus, which keeps volume and proportion consistent across 8 directions × 17 frames × 2 pitches only through code; hand sheets would need a second full set for Scenery. Terra's 4-direction hand sheet for hero and boar is the fallback if the user rejects the baked look. |
| 6 | Movement | **Keep the glide** from old tile to new over the server's step time. Everything with game meaning sits on the server's tile: click targets (already true), the target ring and hover box (`view.ts:479` changes to use the server tile). Snap when the new tile is not adjacent (late or merged updates) and on floor changes. Never extrapolate. A "Snap" toggle in the Figures picker shows Terra's alternative. | Opus ×2 glide, Terra ×2 snap. The glide is the genre mechanic and lags the truth by at most one step; snapping every step reads as stutter and removes the weight the user asked for. The toggle costs a few lines and lets the user judge. |
| 7 | Light rule v1 | Levels 0–7 per tile. **Lit** ≥ 2 (seen), **dim** = 1, **dark** = 0. `level = min(7, max(ambient, max over passing sources of L − ⌈euclidean distance⌉))`, computed exactly in integers by comparing squared distances. Light passes with the same stepping as `Geography.sight`, plus **closed doors are opaque** (new `lightPasses`; `sight` itself unchanged). | Levels, falloff and doors: all four converge here (Terras wanted 0–3 Chebyshev; Euclidean gives round pools, which matter for pixel art). |
| 8 | Ambient and sources | Outdoor: day 7, golden hour 5, blue hour 2, night 1, dawn ramps 1→7. Roofed tiles at least 3. Undercroft 0. Sources: the Lantern at the shrine 10 (high, walls don't block it), lamp 6, brazier and altar 5, torch 6, wild wisp 3. | Opus xhigh. Night ambient 1 is below the "seen" threshold of 2, which answers Terra B's pass-2 worry that positive night ambient reveals everything. |
| 9 | Lamps | Lamps light at the start of blue hour, in a ripple outward from the Lantern (0.5 s per tile of distance), each when a teal wisp lands on it; they go out at dawn in reverse. A pure function of time. The lamp's look text changes. | Opus ×2. Terras preferred always-lit lamps to keep the old text; the ripple is the fable moment and costs a pure function. |
| 10 | Darkness on the server | Behind `world.darkness` (default off). Lit + line of sight: full creature. Dim + line of sight, or dark within 3 tiles, or adjacent: a **shade** (`{id,x,y,z,facing,size}`, no kind, name or HP), drawn as a silhouette or eyes. Otherwise not sent. Players the same. Effects on tiles you can't see are dropped unless they involve you. You can only target what is lit and in sight, or adjacent; a target that goes unseen is dropped (manual walks continue). Ember needs a lit target. Look says "It is too dark to make out." | Eyes: Opus ×2 ("nothing" loses the dread). Effect redaction and the audit list: Terra ×2. |
| 11 | Cost of light | A `torch` item for the shield slot: light 6, no defence, so no blocking while held (guard is `shield ?? weapon`, `engine.ts:597`). Sold by Pell. **No fuel in v1.** Creatures notice a hero within `aggro` (8) if the hero's tile is lit, otherwise only within 3. | Opus ×2. A free lantern is never switched off, so the rule never bites. The slot cost plus "light makes you seen" gives both choices a price. Fuel stays out (Terra). |
| 12 | Day and night | 40-minute cycle from `state.time + world.dayOffset`: dawn 3, day 20, golden hour 3, blue hour 2, night 12. Pauses when the server pauses. Five colour keyframes blended by phase. Unlit terrain sits on a "night floor" (about 6% value, indigo, depth edges kept). | All four agree on ~40 min. |
| 13 | The fable layer | Teal wisps carry fire from the Lantern to the lamps at dusk and fly home at dawn; three wild wisps drift outside the walls at night as real light-3 sources; the Lantern breathes (6 s pulse); a Lantern Spire rises from the shrine, too tall for the screen; an oversized moon and twinkling pixel stars in Scenery; Mend lifts teal motes. Fireflies at dusk and moths at lamps are decoration. | Opus ×2; Terras agreed on one rare turquoise accent and a huge Spire. |
| 14 | Feel | Wind-up 180 ms before `attackAt`; the strike frame only when the server's `hit`/`miss`/`block` effect arrives; relax if none within 250 ms. 70 ms hit-stop on animation clocks only; knockback ≤ 0.12 tile; one-frame white flash; camera kick in whole pixels; footfall dust; collapse when a corpse appears. Reduced motion turns these off. | 4/4 on the principle. |
| 15 | How the user judges | One lab page, `/proto/lab/`, with tabs (Light, Figures, Scenery, Darkness), a clock scrubber (1×, 60×, 600×), stop selector, place jump, torch toggle and a **Today** variant using the untouched production renderer. All state lives in the URL, so every view is a link. A shot script captures named links with headless Chrome. | Opus ×2; the shot loop is also how Opus checks its own art. |

## Prototypes

All on `apps/client/proto/_next/` and the one lab page. Each has an **art** part (Opus only) and an **engine** part (any member). Sizes are estimates.

### P1. Lanternlight: pixel lock, palette, light field, clock (the engine decision)

1. **Engine.** Copy `src/render/` into `_next/` and fix relative imports and the texture-override glob. Lab page `apps/client/proto/lab/{index.html,main.ts,harness.ts,lab.css}`; `harness.ts` is `preview.ts`'s `startPreview` with the `Engine` exposed. Shot list and `shoot.sh`.
2. **Engine.** `packages/game/src/light.ts` (contract below) and `tests/light.test.ts`. Schema gains `world.dayMs`, `world.dayOffset`, `world.darkness` with defaults. Nothing in `Engine` calls it yet.
3. **Engine.** `_next/stops.ts`: pixel lock, Close and Play stops.
4. **Engine.** `_next/lightfield.ts`: a world-aligned field texture sampled by every material through one shared lighting patch. Remove the 8 pooled point lights, the free cave torch and `actorPop`. Light-level overlay and a verify button.
5. **Art.** Palette and lookup table (`_next/palette.ts`), five clock keyframes and the night floor (`_next/clock-style.ts`), ground textures at 32 texels per unit, grass blades replaced by pixel tufts.
6. **Art.** Wisps, the Lantern's breath, lamp flames, window glows, fireflies and moths (`_next/wisps.ts`).

**Checkpoint A** (first thing the user sees): tasks 1, 3 and 5 by daylight. **Checkpoint B**: the rest.

**Accept when:** the pixel-lock readout passes at 1280×720, 1920×1080 and 2560×1440; the verify button finds zero mismatches between the field and `lightGrid()` at noon, golden hour, blue hour, midnight and in the undercroft with the torch; closing a door cuts a pool (also a test); the lamp ripple runs nearest-first (also a test); night at 1080p stays at or under 10 ms per frame on the user's Mac (stop and rethink if not); `npm test` and `npm run typecheck` pass; nothing under `apps/client/src` or `apps/server` changed.

### P2. Figures and weight

1. **Engine.** `_next/figures/{bake,sprites}.ts`: two-channel offscreen bake (colour, normal), cleanup, atlas; upright-plane renderer lit by the field; contact and skewed silhouette shadows.
2. **Art.** `_next/figures/{kit,poses}.ts`: one human kit covering all 8 looks in `actors.ts`, the thornboar and the gutter rat, with idle 2, walk 4, attack 4, hurt 1, die 4, cast 2 frames per direction.
3. **Engine.** `_next/{feel,particles}.ts`: decision 14, plus the movement rules of decision 6.

**Picker:** Boxes / Baked; feel Off / Subtle / Heavy; Glide / Snap; 0.25× slow motion; 8-direction turntable.

**Accept when:** one sprite texel per render pixel at Play; a 5-minute auto-hunt log shows zero strike frames before their effect and the target ring always on the server tile; from one still shot the user names hero, Wren, a guard, boar and rat and the boar's facing; baking takes ≤ 400 ms; the user picks.

### P3. Scenery and wonder

1. **Engine.** The Scenery stop and its transitions in `_next/stops.ts`: Play→Scenery is a 900 ms dolly; a click returns to Play without walking; your own attack or a hit on you returns to Play on the frame the effect arrives; refused under a roof and underground; nearest-filtered mipmaps; a dithered cut-away between camera and hero. Second bake pitch. Lookout panel fallback (`_next/lookout.ts`).
2. **Art.** Sky (`_next/sky.ts`: phase gradient, sun, big moon, stars, clouds with lit edges); far land north of the map with side skirts (`_next/farland.ts`), including one ruined keep with a lit window; the Lantern Spire (`_next/spire.ts`); low-poly trees and pines (`_next/trees.ts`).
3. **Art.** Cloud shadows, sky reflected in the river, haze.

**Picker:** Continuum / Lookout panel / Neither.

**Accept when:** the stops behave as above; the scenery shots at golden hour, night and dawn sit beside ref-5, ref-2 and video-1 and the user judges them; Scenery stays at or under 12 ms per frame at 1080p; the user picks Continuum or Lookout.

### P4. Darkness: light becomes a server rule

1. **Engine.** Behind `world.darkness`: hooks in `engine.ts` for `view` (full, shade, `lights`), `target`, `cast`, `look`, the tick-time target drop, creature noticing and effect redaction. `model.ts` gains `Shade`, `GameView.shades`, `GameView.lights` (optional, so old clients and saves are unaffected). `ids.ts` appends `torch`; `content/balance.json` gets the torch and Pell's stock. `light.ts` gains `perceive()`. `tests/darkness.test.ts`.
2. **Engine.** `_next/shades.ts`: shades and eyes drawn from `GameView.shades`.
3. **Art.** Eye glints, the shade silhouette, the torch sprite and flame.

**Lab scenes:** night meadow, undercroft rats, two heroes on one `Engine` so one torch reveals a creature for the other.

**Accept when:** tests cover: a rat 5 tiles away in the dark is absent, at 3 a shade, with a torch full at 4 and a shade at 5, never full behind a closed door; targeting a shade at range throws; a target that goes dark is dropped and a manual walk continues; an unlit hero is not noticed at 5, a lit one is at 8; with the flag off, `view()` deep-equals today's on a seeded run. A scripted walk finds zero tiles where the picture disagrees with what the server sent. With 16 heroes at night, `view()` costs at most 2 ms more per tick than with the flag off. The user plays it and calls it scary but playable, or we tune the three numbers first (notice range 3, eyes range 3, torch light 6).

## `light.ts` contract

Pure functions shared by server and client. No `Engine` import. Integers only where a result decides visibility.

```ts
export type Phase = 'dawn' | 'day' | 'golden' | 'blue' | 'night';
export type WorldLight = { dayMs: number; dayOffset: number };
export type Clock = { day: number; phase: Phase; phaseT: number; dayT: number }; // phaseT, dayT in [0,1)
export type LightColor = 'amber' | 'teal';
export type LightSource = { id: string; x: number; y: number; z: number; level: number; color: LightColor; high?: boolean };

export const PHASES: { phase: Phase; minutes: number }[]; // dawn 3, day 20, golden 3, blue 2, night 12
export function clockAt(time: number, world: WorldLight): Clock;
export function outdoorAmbient(clock: Clock): number;                       // 0..7
export function ambientAt(map: MapData, p: Pos, clock: Clock): number;      // roofed ≥ 3, z=1 → 0
export function lampIgniteAt(map: MapData, lampIndex: number, world: WorldLight): number; // ms into the day
export function lamps(map: MapData): Pos[];                                 // stable order
export function wildWisps(time: number, world: WorldLight): LightSource[];  // pure function of time
export function staticSources(map: MapData, time: number, world: WorldLight): LightSource[]; // Lantern, lit lamps, braziers, altar, wisps
export function lightPasses(map: MapData, from: Pos, to: Pos, doors: Record<string, boolean>): boolean;
export function sourceLevelAt(src: LightSource, p: Pos): number;            // L − ⌈dist⌉, exact via squared distance, ≥ 0
export function lightLevel(map: MapData, p: Pos, sources: LightSource[], doors: Record<string, boolean>, clock: Clock): number;
export function lightGrid(map: MapData, z: number, rect: { x0: number; y0: number; x1: number; y1: number }, sources: LightSource[], doors: Record<string, boolean>, clock: Clock): Uint8Array;
export function reachMasks(map: MapData, z: number, rect: { x0: number; y0: number; x1: number; y1: number }, sources: LightSource[], doors: Record<string, boolean>): Uint32Array; // bit i set if sources[i] (i < 32) passes light into the tile
// P4 adds: perceive(...)
```

The client's field uses `reachMasks` for occlusion and draws `L − ⌈dist⌉` rings per texel inside each tile, so every tile centre equals `lightLevel` by construction.

## Who builds what

- **Art** (palette, keyframes, ground, wisps, figure kits and poses, sky, far land, Spire, trees, eye glints, torch): Opus only.
- **Engine** (fork, lab, stops, light field, bake, feel, `light.ts`, P4 hooks and tests): any member.
- `light.ts` and P4's server hooks are delegated to a Terra member in parallel, against the contract above. They touch only `packages/game`, `tests` and `content/balance.json`.
- The coordinator builds P1, P3 and the integration. P2's figures and feel go to an Opus delegate once Checkpoint A defines the seams (`_next/actor-layer.ts`, the field sampling chunk, the palette).
- Editing `packages/game` restarts the running world server (`tsx watch`). With the flag off, nothing changes for players beyond a Continue click.

## Not built now

WebGPU; production migration; Studio controls for clock, palette and stops; sound (first after these four); weather; moon phases; fuel; regeneration in the dark; light-shy creatures; spell light as a rule; other players' outfits; beetle and grub figures; multi-tile creatures; camera rotation; Scenery underground or indoors; new regions; hand-edited frame overrides; a shadowed carried point light; normal-map toggles beyond on/off.

## Cut order if time runs short

1. The Close pitch change (keep Close as a bigger upscale at the Play pitch).
2. Lookout panel fallback.
3. Fireflies and moths.
4. Cloud shadows.
5. The second bake pitch (Scenery then shows Play-pitch figures).
