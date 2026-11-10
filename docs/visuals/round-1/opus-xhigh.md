# Round 1 proposal: one light rule, pixel discipline, baked figures

**Summary.** Keep Three.js r187 on WebGL2 and fork `WorldView` into one candidate renderer under `apps/client/proto/_next/`; switching engines buys nothing we need, and WebGPU's many-light addons would force a TSL rewrite of every custom shader. First fix the root cause of the "blocks under a filter" look: lock density to 24 render pixels per tile at integer scale (today ground texels are 24 per tile but the scene renders at about 49–60) and grade through a palette. Make light a server rule in `packages/game/src/light.ts`: integer tile levels from a 40-minute day/night clock on `state.time`, lamps and a carried torch, blocked by the tiles that block sight. The server stops sending creatures standing in darkness (dim ones arrive as eyes-only shades), you cannot target what you cannot see, and creatures notice an unlit player only within 3 tiles, so light lets you see and lets you be seen. The client draws that same function as a banded, dithered light field, replacing 8 point lights that shine through walls. Actors become procedural 3D figures baked at load into 8-direction pixel sprites with normal and depth, overridable by hand-made PNGs. Grandeur comes from a Lantern Spire, cloud shadows, sky in water and a vista camera that dollies down to a pixel sky; weight comes from anticipation driven by the `attackAt` times the server already sends, hit-stop and in-tile knockback. Build, in order: **Nightfall** (light and time; the engine decision), **Figures** (actors), **Vista** (grandeur), **Weight** (feel).

---

## Findings that drive the plan

- **Mixed pixel density is why it doesn't read as pixel art.** Ground snaps to 24 texels per unit (`apps/client/src/render/terrain.ts:101`, `textures.ts:48`), but the live style (`pixelHeight: 480`, `viewHeight: 7.2`, `content/render-style.json:4-5`) with `pixel = max(2, round(h/480))` (`view.ts:238`) renders about 49 px per unit at 1600×900 and 60 at 1080p. Box edges and grass blades (`terrain.ts:159`) sit on the finer grid, and zoom is continuous (`view.ts:151`).
- **Lights pass through walls.** 8 unshadowed `PointLight`s are pooled to the nearest lamps (`view.ts:12`, `:129`, `:424-430`); the cave torch is client-only (`view.ts:229`, `:499`); a lamp "never goes out" (`packages/game/src/engine.ts:546`).
- **A clock and honest anticipation are nearly free.** `GameView.time` is sent (`model.ts:72`) and the client tracks `serverOffset` (`apps/client/src/main.ts:159`); `state.time` pauses while the server is empty (`apps/server/src/index.ts:62`), which is fine. `view()` sends whole `Mob`s, `attackAt` included, within 22 tiles (`engine.ts:638-642`), and the hero's `attackAt` is in `self` (`engine.ts:491`). The flip side: darkness must be a filter in `view()`, not a shader.
- **Facing is already 8-directional** (step `atan2`, `engine.ts:465`, `:591`) and the camera never rotates (`view.ts:483`). The client already animates from shared rules (`rules.stepMs`, `view.ts:336-337`), so a shared `light.ts` is not a second simulation.

## 1. Engine: keep Three.js, change the light model

**Keep `WebGLRenderer` (three 0.187.0, installed).** The alternatives each lose more than they gain:
- **WebGPURenderer.** Its many-light systems (`examples/jsm/lighting/ClusteredLighting.js`, `DynamicLighting.js`) import `three/webgpu` and need node materials. Our post pass (`view.ts:16-59`) and our `onBeforeCompile` patches (`terrain.ts:28`, `:95`, `:139`) are GLSL and would all need a TSL rewrite. We don't need forward many-light rendering anyway; light becomes a field texture.
- **A 2D sprite engine.** We would lose roof geometry, sun shadows, depth outlines and the pitched camera. Video-2 shows that low-res real 3D is the right family.
- **Babylon.** No capability gain, at the cost of a full rewrite.

**What changes inside Three.** All of it goes into one fork, `apps/client/proto/_next/`, shared by every prototype.

1. **Pixel discipline.**
   - Render at 24 px per world unit.
   - Set `pixel = max(2, round(hostHeight/260))`: 3× at 1080p, 4× at 1440p.
   - Zoom in ±1 integer steps.
   - Size the canvas's CSS box to exactly `rw × pixel`. Today `width: 100%` (`style.css:31`) stretches it by a non-integer factor.
   - The buffer becomes about 443×290, which leaves plenty of GPU for lighting.
2. **Palette.** Replace the per-channel `levels` quantize (`view.ts:57`) with a 32³ lookup table built from a ~40-colour fable palette (ambers, indigos, moss, bone), using the nearest match in OKLab. Dither only at band edges.
3. **Lighting.** One shared Lambert patch: `albedo × (sunOrMoon·NdotL·shadow·cloudMask + hemisphere(time) + field(xz + normal.xz·0.5))`.
   - The **light field** is a world-aligned target around the camera, 8 texels per tile (about 384×320).
   - Each frame it is filled from up to 32 sources: falloff, plus a 16-step march over an occupancy texture built from `thingHidesSight` (`model.ts:16`). Light stops exactly where the sight rule stops.
   - The result is quantized to 5 dithered bands, which gives pixel-art light rings.
4. **Variant: the hero's light casts shadows.** The hero's carried light is also a `PointLight` with a 256² cube shadow, so fences and trees throw moving shadows (the video-2 look). r187 renders this as 6 face passes (`three/src/renderers/webgl/WebGLShadowMap.js:287-289`).
5. **Haze.** Depth haze tinted by the sky colour, and cave mist multiplied by the light field so torches glow in it.
6. **Sky function.** Gradient, sun or moon disc, stars and quantized clouds. Used by the vista dome and by water reflections.

**API impact.** `update(view)`, `onPick`, floors, roofs, labels and `applyStyle` stay; add `setClock(time)`. Migration is a diff of `_next/` against `src/render/`.

## 2. Actors and art pipeline: procedural 3D baked to sprites at load

**Decision: sprites baked at runtime, with a hand-art override path.**

**Making a figure:**
- Figures are built in code from shaped primitives (tapered capsules, lathed heads, a cloak plane, tusks) and posed with keyframes, all in code.
- At load, each figure × animation × direction is rendered once into a multi-target render (`RenderTarget` has a `count` option, `three/src/core/RenderTarget.js:42`). It produces three channels:
  - **Colour**: a 4-tone palette ramp per material, a 1 px selective outline, orphan pixels removed, no antialiasing.
  - **Normal**: so the sun or moon and the field's dominant direction can light the sprite, giving it a rim on the lamp side.
  - **Depth offset**: written to `gl_FragDepth`, so sprites intersect walls correctly and feed the post outline.

**Drawing it:**
- Quads face the camera and snap to the pixel grid, so one sprite texel is one render pixel.
- Shadows are the frame's silhouette skewed along the sun or moon azimuth, plus a radial shadow from the hero's light.

**Why not live low-poly?** At this resolution it shimmers as it rotates, and you can't clean up or hand-edit a frame. It is still one variant in the Figures prototype, so the choice is made by eye.

**Frames.** 8 directions, all baked. Idle 2, walk 4 (one server step is half a cycle), attack 4 (wind-up, hold, strike with smear, recover), hurt 1, cast 3, die 5: 152 frames of about 32×40, one 512² atlas per channel.

**Proportions.** Humans are about 36 px tall with fable proportions: about 3 heads tall, a big hood, a strong cloak. Creatures should read from the silhouette alone: the boar's ridge and tusks, the rat's tail, the beetle's shell glint.

**First pass with no artist.** The figure kit, palette ramps and bake cleanup give a clean SNES-era look. PNGs at `content/art/actors/<figure>/<anim>_<dir>_<frame>.png` can override baked frames later, following the `texture-overrides.ts` pattern.

**Props and buildings stay real 3D.** The camera never rotates, so they are pixel-stable at the locked density. The 3D grass blades (16 per meadow tile, `terrain.ts:245`) become ground texture plus sparse pixel tufts.

**Gap.** Other players' equipment isn't in the view (`engine.ts:644`), so their outfits need a public field later.

## 3. Light as a mechanic

On top of the genre baseline (world light by time, per-source radius and colour, dark underground, carried light), we add three things:
- Darkness hides *who*, never *where*.
- Light costs a resource and a slot.
- Light makes you visible.

### Server rules

v1 lives in `packages/game/src/light.ts`, behind `balance.world.darkness`, which is off by default.

- **Light level.** Each tile has a level from 0 to 10: `max(ambient, max over sources of (L − euclideanDistance))`. A source only counts if `Geography.sight(source, tile)` passes (`world.ts:61`).
- **Ambient.**
  - Surface: day 10, golden hour 8, blue hour 3, night 1 (moonlight).
  - Undercroft: 0.
- **Source strength L.**
  - Lantern Spire (at the shrine): 12
  - Lamp: 7
  - Brazier: 6
  - Altar: 5
  - Lit window: 3 (derived deterministically from building walls)
  - Carried torch: 6
  - Self-glow: 2. Your own tile is always at least 2 and the adjacent tiles at least 1.
- **Lamps** burn from dusk to dawn. Each one ignites at `dusk + pathDistance(shrine, lamp) × 0.4 s`. It is a pure function, so the server and the client agree.
- **`Engine.view()`** sends a creature depending on the light on its tile:
  - Light 2 or more: as today.
  - Light 1: as a **shade** `{id, x, y, z, facing, size}`, with no kind, name or HP.
  - Light 0: nothing, unless it is adjacent, in which case it arrives as a shade.

  Players follow the same rule. Public heroes gain `carry`, so torches can be drawn.
- **Actions.**
  - `target` (`engine.ts:277`) rejects anything below light 2 unless it is adjacent.
  - Ember (`engine.ts:365`) needs light 2 or more at the target.
  - `describe` says "It is too dark to make out."
- **Creatures.** Detection range is `def.aggro` (8) if the player's tile is at light 2 or more, otherwise 3 (`engine.ts:586`). A torch at night is a beacon; going dark is stealthy but blind. This is the only behaviour change in v1.
- **Torch.**
  - It goes in the shield slot, so carrying light costs your blocks.
  - Light 6.
  - It burns one from the stack every 4 minutes while equipped.
  - Pell sells it, and the starter pack gets 3.
  - It needs `light` and `burnSec` on `ItemDef`, and `torch` appended to `itemKinds` and to `content/balance.json`. This is inert while the flag is off.
- **Tests.** An undercroft monster 5 tiles away is absent from `view().monsters` without a torch and present with one; the lamp ripple is deterministic; shades can't be targeted at range.

**v2, not now:** no regeneration below light 2; spell impacts light their tiles for 1–1.5 s (revealing shades); light-shy creatures that refuse lit tiles; a lantern burning oil; a `kindle` spell; moon phases.

### Client presentation

- The field draws the shared function, so the band edges sit on the rule's boundaries.
- Unlit terrain sits on a "night floor": about 6% brightness, indigo `#0b1020`, with depth edges kept.
- Shades are silhouettes with two amber eye pixels that turn toward you once they have noticed you.
- Torch flicker moves the radius by 1–2 px but never crosses a band.
- At light 0 the vignette tightens and the colours desaturate.
- The battle list shows adjacent shades as "Something".

## 4. Day and night

**Cycle.** 40 minutes (`world.dayMs`) on `state.time`, starting in late afternoon: dawn 3 min, day 20, dusk 5 (golden hour 3, blue hour 2), night 12. Golden hour reuses today's values (`view.ts:69-70`).

| Phase | Key light | Sky / ground ambient | Haze | Note |
| --- | --- | --- | --- | --- |
| Night | Moon `#8fa6d8`, low, shadows on | `#1a2340` / `#0b0f18` | `#141c30` | Crisp blue moon shadows |
| Dawn | Sun `#ffb0a8`→`#ffd2a0`, east, 5° | `#6a6a9a` / `#2a2a3a` | `#c89aa8` | Lamps go out in a reverse ripple |
| Day | Sun `#fff2dc`, 60° | `#9ec0d0` / `#4a5a44` | faint `#a8c4d4` | Strongest cloud shadows |
| Golden | Sun `#ffb06a`, 12–20° | `#7aaab4` / `#34443a` | `#e0a070` | Long sundial shadows, shafts |
| Blue hour | none | `#2a3a6a` / `#141826` | `#23305a` | Lamp ripple; warm windows on deep blue (video-1) |

**How a steep camera shows the time of day:**
- The sun sweeps east to west, so shadows rotate around every building: the town is a sundial. The sun's shadow map can drop to 1024.
- Windows light up at dusk on a stagger.
- Cloud shadows drift.
- The river reflects the sky gradient, the moon and the stars.
- Fireflies come out at dusk and moths gather at the lamps.
- A sun/moon dial sits on the minimap, and a console line reads "The lamps are being lit."

## 5. Grandeur, in order of worth

1. **Vista camera.**
   - Why: every reference is a low-angle view with sky, and a 50° orthographic camera can never show a horizon or parallax.
   - When: on overlook tiles (the rampart walk, the north bridge, the shrine steps), or while V is held.
   - The move: a 1.5 s dolly-zoom from near-orthographic to a 12° pitch and a 35° field of view.
   - It reveals a sky dome and three procedural parallax layers (a mountain ridgeline, a far city of spires, a forest line), hazed by distance.
   - While in a vista, picking is off; any click or step exits.
2. **Lantern Spire.** A tower about 14 units tall on the shrine's footprint. It is presentation only, and the roof still hides the interior. Its top runs off-screen, its shadow is the sundial, and its L12 lantern is why the town is safe. Tall geometry between the camera and the player is cut away in a dithered circle.
3. **Cloud shadows.** Two-level dithered noise multiplied into the sun term.
4. **Sky in water.**
5. **Haze.** Subtle in normal play (the top two rows), strong in vistas.

**Skipped:** planar reflections, volumetrics, weather, multi-tile bosses.

## 6. Feel and weight, true to server timing

- **Steps.**
  - Keep linear interpolation over the server's step time (`view.ts:448`).
  - A 1 px body dip mid-step.
  - Footfall dust: 3–5 pixels on dirt or grass, 1–2 on cobble.
  - A 40 ms lean pose when starting from rest. The position still moves on time.
  - A 2-frame settle on stop.
- **Anticipation from the schedule.**
  - An adjacent attacker (the hero, or a creature with `attackAt`) starts its wind-up 180 ms before `attackAt`.
  - **The strike frame plays only when the server's `hit`, `miss` or `block` effect arrives.**
  - If nothing arrives within 250 ms, the attacker relaxes as a feint.
- **Hit.**
  - 70 ms hit-stop on both actors' animation clocks, never on positions.
  - The victim flashes white for one frame, then shows a red tint for 2 frames.
  - 2 px knockback, eased back over 120 ms and capped at 0.12 tile.
  - One squash frame.
- **Camera.** On hits to you only: a 2 px integer kick (3 px at 25%+ of max HP), decaying over 100 ms; off under `prefers-reduced-motion`.
- **Block, miss and spells.** Block: blue-white sparks, attacker recoils 1 px. Miss: a whiff smear. The ember projectile is a moving light-field source whose impact adds +4 light for 120 ms; the cinderburst ring is drawn into the field.
- **Deaths.** Creatures: 120 ms hit-stop, 5-frame collapse, dust, eyes go out. Yours: the world fades to the night floor as your light shrinks to 0 over 600 ms; you wake at the shrine under the spire.
- **Particles** are whole-pixel squares, at most 400, instanced. **Sound** is the biggest fear multiplier and comes first after these prototypes.

## 7. Prototypes, in order

All four share the fork `apps/client/proto/_next/` (copied from `src/render/`), so there is one candidate to migrate. Each page is a thin `proto/<name>/{index.html,main.ts}` running the real local `Engine`, like `proto/chrome/main.ts:18-59`, with a picker and a dev panel. Sizes: L is roughly 1,200–1,500 new lines including tests, M roughly 600–800.

### P1. Nightfall: light and time (the engine decision). Size L

- **Proves:** the shared rule draws the picture, night is scary but playable, the time of day reads from the steep camera, and WebGL2 with a light field fits the frame budget.
- **What you see:**
  - The town and the undercroft, with a time scrubber (1×, 60×, 600×), a torch toggle, a floor jump and an overlay of each tile's light level.
  - The base view already has pixel discipline and the palette, with a toggle to compare grades.
  - Picker: **Field** / **Field + cast shadows** / **Today + clock**, plus a night-floor slider.
- **New files:** `packages/game/src/light.ts`, `tests/light.test.ts`, `apps/client/proto/_next/*` (the fork, plus `lightfield.ts`, `sky.ts` and `clock-style.ts`) and `apps/client/proto/nightfall/*`.
- **Changed files:**
  - `engine.ts`: flagged hooks.
  - `content-schema.ts`: `darkness`, `dayMs`, `light`, `burnSec`.
  - `ids.ts`: adds `torch`.
  - `content/balance.json`: adds the torch.
- **Judge:**
  1. The overlay's band edges match the rule's boundaries at noon, golden hour and midnight.
  2. In the undercroft, the counter shows no creature beyond 1 tile in `view.monsters` without a torch, and up to 4 tiles with one. Tests assert the same.
  3. Scrubbing a day at 600× hits all five keyframes without popping, and the lamps ripple outward from the shrine.
  4. On the user's MacBook in a 1920×1080 window, timed with `gl.finish()`: a median of 6 ms or less for Field, and 9 ms or less with cast shadows.
  5. The user walks the meadow at night with and without a torch and confirms it is scary but playable.
  6. Tests and typecheck pass, and production is unchanged because the flag is off.

### P2. Figures: the actor pipeline. Size L

- **Proves:** baked sprites beat live low-poly and boxes.
- **What you see:** the hero, an NPC, a thornboar and a rat in the live town. Picker: **Boxes** / **Live low-poly** / **Baked sprites**, plus an 8-direction turntable.
- **Files:** `apps/client/proto/_next/figures/{kit,poses,bake,sprites}.ts` and `apps/client/proto/figures/*`.
- **Judge:**
  1. A grid overlay at 8× shows exactly one render pixel per actor pixel.
  2. While walking, a diff counter shows sprite pixels changing only on animation frames.
  3. Silhouettes can be told apart at night.
  4. Baking takes 300 ms or less.
  5. The user picks.

### P3. Vista: grandeur. Size M

- **What you see:** the Lantern Spire, cloud shadows, the sky in water, the see-through circle and the vista at three overlooks, at any time of day. Picker: **No vista** / **Vista** / **Vista + heavy haze**.
- **Files:** `apps/client/proto/_next/{vista,spire,clouds}.ts` and `apps/client/proto/vista/*`.
- **Judge:**
  1. The user compares golden-hour and night screenshots with the references.
  2. A frame histogram shows only palette colours, so there is no smooth bloom.
  3. After a vista, the next click picks the correct tile.

### P4. Weight: feel. Size M

- **What you see:** the hero auto-hunting. Picker: **Off** / **Subtle** / **Heavy**.
- **Files:** `apps/client/proto/_next/{feel,particles}.ts` and `apps/client/proto/weight/*`.
- **Judge:**
  1. In 5 minutes, zero strike frames are drawn before their effect arrives (logged).
  2. A runtime assert shows actors never drawn more than 0.12 tile off the server's tile.
  3. The user watches an Off vs Heavy recording.

**Order and parallelism.** P1 first. P2 can run alongside it if it only adds `_next/figures/`. P3 and P4 are independent of each other.

**Not built yet:** WebGPU/TSL, production migration, Studio controls for clock and palette, sound, weather, moon phases, the v2 light rules, outfits for other players, hand-drawn art, new regions, bosses, planar reflections.

## 8. Risks

- **Performance.**
  - The integer scale and `setPixelRatio(1)` keep the buffer at about 130–160k pixels at any window size.
  - GPU per frame: about 40 draw calls, a 1024² sun shadow, a 6×256² cube shadow, a light field of about 8M fetches (123k texels × about 4 sources × 16 steps), and one post pass.
  - I expect under 6 ms on an integrated MacBook GPU. This is **unverified** until P1 measures it.
  - CPU: `lightAt` for up to 30 creatures × 30 sources per view every 100 ms, memoized per tick. Test it with 20 heroes.
- **Readability.**
  - Darkness never hides terrain: there is always the night floor, depth edges and self-glow.
  - Torches are cheap, the town is lit, and night is 12 of every 40 minutes.
  - A brightness slider or a "clear nights" option can't become a cheat, because the server never sends what you can't see.
- **Accessibility.** Reduced motion drops the camera kick, cuts into vistas and halves flicker; flashes hit sprites only, never the full screen.
- **Gameplay.** Night may frustrate grinding. Tune the torch price, night length and the unlit detection range of 3 in P1, before any v2 rule.
- **Pixel integrity.**
  - The vista shimmers while it moves; that is accepted for 1.5 s.
  - Sprites baked at 50° may look off at a 12° vista; if so, bake a second pitch.
  - The palette lookup may posterize light at night; P1 compares one palette against per-phase palettes.
- **Art cost.** Procedural figures risk looking generic. Silhouettes and ramps help, but the real cure is an artist editing baked frames, and the pipeline accepts that.
- **Scope.** `_next/` stays the only fork. Migrate by diff once P1 and P2 win.

**Verified:** the `path:line` citations; three 0.187.0; the WebGPU-only lighting addons; 6-pass point shadows; `RenderTarget` `count`.

**Unverified:** that `onBeforeCompile` is ignored by WebGPU node materials (from memory); every millisecond figure; how the palette lookup behaves at night; bake time.
