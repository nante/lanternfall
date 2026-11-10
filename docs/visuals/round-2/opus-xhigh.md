# Round 2, Opus xhigh: final plan

**Summary.** Keep Three.js r187 on WebGL2, build all four prototypes on one renderer fork (`apps/client/proto/_next/`), and show them on one lab page where every view is a shareable link. On the user's zoom idea my verdict is **adopt it as three fixed camera stops**: Close (orthographic, pitch 61°, one integer zoom step bigger), Play (orthographic, pitch 48.6°, roughly today's view) and Scenery (a low perspective camera behind the hero with sky and horizon; surface only, no clicking). It is cheap here because the camera never turns, so the horizon is always north, where the river already runs along the map edge; a painted lookout panel stays in the picker as the fallback. Pixel density locks to 32 render pixels per tile with whole-number upscaling, and the stops replace free zoom. Actors become 3D figures that Opus writes as code, baked at load into 8-direction sprites at two camera angles, with a few key frames hand-edited as text grids: hand-pixelling whole sheets is where an AI artist is weakest, and the Scenery angle would double that work. Movement keeps the usual glide between tiles, but the target marker sits on the server's tile. Light is one shared function in `packages/game/src/light.ts`: levels 0–7, closed doors block light, the dark sends only shapes and eyes, a torch takes your shield slot, and creatures notice an unlit player only within 3 tiles. The magic is a two-colour light language: amber is fire, teal is the Lantern, whose wisps light the lamps at dusk. Build order: P1 Lanternlight (the engine decision), P2 Figures and Weight (art), P3 Scenery (art), and P4 Darkness (engine), which can run alongside the others from P1's first task.

---

## 0. What I changed since round 1, and why

| Round 1 (mine) | Round 2 | Why |
| --- | --- | --- |
| Vista only on a few overlook tiles | The user's zoom continuum as three stops, available anywhere on the surface | The fixed yaw and the north river make it cheap. Grandeur from the real world beats a set piece (§2). |
| 24 render px per unit | 32 px per unit; Play pitch asin(3/4) = 48.6°, so a tile is exactly 32×24 px | A Tibia-like 15×11 view at 1080p and a 40–44 px hero (§6) |
| Sprite depth via `gl_FragDepth` | Upright quads facing south, stretched by 1/cos(pitch) | Simpler and keeps early-z. Adopted from Terra B's upright mesh planes (§3). |
| Light field: GPU ray march | The CPU runs the shared rule's occlusion per tile; the GPU draws only the falloff rings | The picture equals the rule by construction (§5) |
| Light 0–10, self-glow, torch burns 4 min | Light 0–7, no self-glow, no fuel in v1; closed doors block light; roofed tiles at least 3; eyes within 3 tiles | Doors: Terra A/B. Eyes: Opus medium. No fuel: Terra's "smallest first change". |
| Weight as its own prototype | Folded into Figures | The poses and the feel are the same code (Opus medium's pairing) |
| Nightfall = light, time and rule together | Split: P1 is the picture plus the shared function; P4 wires the rule into `Engine` | The user sees P1 sooner, and P4 needs no art, so it runs in parallel |
| Movement: interpolate only | Interpolate, plus Terra's snapping rules, and the target marker on the server tile | Keeps the glide, moves the truth markers (§4) |
| Separate prototype pages | One lab page with tabs and URL shots | The synthesis gap. It is also how Opus sees its own art. |

## 1. Facts re-checked where a disagreement turns on them

- **The prototype harness in the brief is gone.**
  - HEAD `7b337a7` deleted `apps/client/proto/chrome/`; its commit message says so.
  - The local-engine runner now lives in `apps/client/src/preview.ts:14` (`startPreview`), and it does not expose the `Engine`. The lab needs its own copy (`harness.ts`) that does, so it can drive the clock.
  - `/proto/chrome/` still answers 200 on :4173. That is probably Vite's HTML fallback (unverified).
- **The camera never turns.** The offset is `(0, sin p, cos p)` (`apps/client/src/render/view.ts:482-483`), so the camera always looks north. The map is 84×68 (`packages/game/src/town.ts:3`). The river runs the full width at y≈3–7 (`town.ts:39-44`), the bridge is at x 39–42, and the map ends at y=0.
- **Today's pixel density is mixed.**
  - The pixel scale is `max(2, round(h/480))` (`view.ts:238`).
  - The orthographic camera is 7.2 units tall × zoom (`view.ts:243`), with continuous wheel zoom from 0.75 to 1.6 (`view.ts:151`).
  - CSS `width: 100%` stretches the canvas (`apps/client/src/style.css:31`).
  - Result: about 62 render px per unit on a 900 px host, against ground textures at 24 texels per unit. A character spans about 90 render pixels, which reads as low-res 3D rather than pixel art.
- **How movement works today.**
  - The server moves the hero, then sets `moveAt` (`packages/game/src/engine.ts:466`).
  - The client glides from the drawn position to the new tile over the rules' step time (`view.ts:325-331`, `:447`).
  - Clicking an actor already resolves to its server tile (`view.ts:274`, `:291`).
  - The target ring follows the drawn body (`view.ts:479`).
  - Only jumps of more than 3 tiles snap (`view.ts:331`).
- **Doors do not block sight.** `door` is in the `open` set (`packages/game/src/model.ts:13-14`), and `Geography.sight` ignores door state (`packages/game/src/world.ts:61-68`). Terra was right.
- **A torch in the shield slot removes all blocking.** The guard is `shield ?? weapon` (`engine.ts:597`), so a torch with 0 defence becomes the guard and nothing blocks. The weapon does not take over, contrary to round 1's assumption.
- **What `view()` sends.** It sends whole creatures within 22 tiles, `attackAt` included (`engine.ts:636-642`). Other players' equipment is not sent, so a carried torch has to be sent explicitly.
- **How creatures notice you.** A creature notices a hero when `distance ≤ def.aggro && sight` (`engine.ts:586`); `aggro` is 8 for all four creatures (`content/balance.json`).
- **Effects have no attack-start or death event** (`model.ts:70`). A death shows up as a corpse appearing.
- **Server timing.** The server ticks every 50 ms, sends views every 100 ms, and pauses with nobody connected or in combat (`apps/server/src/index.ts:40`, `:62`).
- **Point-light shadows cost 6 passes each**, one per cube face (`node_modules/three/src/renderers/webgl/WebGLShadowMap.js:288`).
- **There is no hand art to protect.** `content/art/` is empty.

## 2. D1, perspective: adopt, as three stops on one camera rig

| Stop | Camera | Upscale | Clicking | Where |
| --- | --- | --- | --- | --- |
| **Close** ("flat 2D") | Orthographic, pitch 61.04° (a tile is 32×28 px) | k+1 | On | Everywhere |
| **Play** ("almost 2D", default) | Orthographic, pitch 48.59° (a tile is 32×24 px) | k | On | Everywhere |
| **Scenery** | Perspective, 40° vertical field of view; camera 8 units behind the hero, 1.2 units up, tilted 2° up | k | Off | Surface, not under a roof |

**Controls**
- The mouse wheel or `-`/`=` moves one stop.
- Close↔Play is a 250 ms pitch ease.
- Play→Scenery is a 900 ms dolly:
  1. Swap the orthographic camera for a 1° field-of-view perspective camera placed to match it (an estimated 1–3 px jump at the screen edges, hidden by the motion).
  2. Widen the field of view and lower the pitch until the camera sits below the hero's head. That is the ref-5 framing, with the sky filling about 55% of the frame.

**Inside Scenery**
- You can keep walking with the keys.
- A click returns to Play and does nothing else.
- Your own attack or a hit on you returns to Play on the frame the effect arrives.
- Anything between the camera and the hero is cut away by a dithered cone.

**Not adopted**
- True top-down: walls vanish and upright sprites stop making sense. 61° keeps the classic slight-front sprite view.
- Free zoom: it breaks the pixel lock.
- Scenery underground or indoors: there is no sky there.
- Camera rotation.

**Why adopt it instead of round 1's fixed camera plus a lookout (Terra) or overlook tiles (mine):**
1. **The horizon is always north, and the map already has its best foreground there.** The camera never turns, so far scenery is needed in one direction only, plus side skirts as the view widens. The river and the north bridge are exactly the near-water, mid-bridge, far-hills layering of ref-2.
2. **A painted panel shows a different world.** It cannot show this town's lamps coming on, the time of day, or other players. Opus also cannot paint at ref-5 quality. What Opus can make is geometry and procedural layers, and those serve both options. So the panel stays in P3's picker as an honest comparison at almost no extra cost.
3. **D1 and D2 decide each other.** With baked figures, the low angle is one more bake pass. With hand-pixelled sheets it would be a second set of every sheet.

**What it costs** (all in P3, about +40% on top of a lookout-only P3):
- The perspective stop and its transition: about 350 lines.
- A sky dome.
- Far land north of y=0, plus east and west skirts.
- One far landmark.
- Trees rebuilt as low-poly shapes that hold up at any pitch. Today they are stacked boxes (`terrain.ts:264-280`).
- Nearest-filtered mipmaps so distant ground doesn't sparkle.
- A second figure bake.

**Pixel lock is deliberately given up in Scenery and during transitions.**
- The sky and far layers are drawn in screen space at whole pixels, so they stay crisp.
- The near world shimmers while you walk, and haze softens it.
- At rest, Close and Play are fully pixel-locked.

## 3. D2, actors: code-built 3D figures, baked at load, with hand touch-ups

**Decision**
- Opus writes figures as code: a kit of shaped primitives (tapered capsules, lathed heads, cone hoods and cloaks, wedge snouts), a joint skeleton, and keyframed poses.
- At load, each figure × animation × direction × pitch is rendered once into an atlas with two channels:
  - **Colour**: 4-tone palette ramps, a selective 1 px outline, stray single pixels removed, snapped to the palette.
  - **Normal**: so lights can shade the sprite.
- Text-grid overrides (`content/art/actors/<figure>/<anim>_<dir>_<frame>.txt`, palette letters) replace single frames.

**Why this fits an AI artist**
- Opus can make one good hand-pixelled frame. Keeping volume, proportions and lighting consistent across 8 directions × 17 frames is where it fails, and D1 would need everything twice.
- Code is where it is strong. A kit makes every direction and pitch consistent by construction.
- Hand work goes where it pays: the hero's front and back idle and walk frames, edited as text over the baked frame. That makes Terra's hand-pixel route an editing layer rather than the source.

**Why not live low-poly.** Moving geometry crawls at sub-pixel positions. Baked frames move in whole pixels and get the cleanup pass. That is the difference between pixel art and low-res 3D. Live boxes stay in the picker as the baseline.

**Drawing**
- Each sprite is a vertical plane through the feet, facing south (the camera never turns), stretched by 1/cos(pitch) so it shows at full height.
- A vertical plane sorts correctly against any wall wholly north or south of the actor's tile. I worked this through for the 48.6° case; no depth writes are needed.
- Shadows: a contact blob, plus the silhouette skewed along the sun or moon direction.
- Light: each sprite takes the light field at its feet. With normals on, the sun or moon and the field's local gradient light the side facing the source: a torch lights a boar's face and leaves its back black. Flat tint is a toggle.

**Frames.** Per direction:
- idle 2
- walk 4
- attack 4 (wind-up, hold, strike with smear, recover)
- hurt 1
- die 4
- cast 2

That is 17 frames. × 8 directions × 2 pitches (48.6° for Close and Play, 10° for Scenery) = 272 frames per figure.

**Sizes.** Humans are about 40–44 px tall (about 3 heads, big hoods and cloaks). The boar is about 40×30 and the rat about 24×14.

**First set**
- One human kit whose outfit parameters cover all 8 looks in `apps/client/src/render/actors.ts:15-24`.
- The thornboar and the gutter rat.
- The beetle and the grub come after the user accepts the style.

**How Opus sees its own work.** P1 builds a shot set: about 10 fixed lab URLs, captured by headless Chrome into a temp folder. Opus reads them back and compares them with the references. No art task is done without a shot review.

## 4. D3, movement: keep the glide, move the truth markers

Keep the glide from the old tile to the new one over the server's step time. That is the genre mechanic the user asked to keep. It lags the truth by at most one step, and it never shows a tile the server didn't hold.

Adopted from Terra:
- **Snap** when the new tile isn't adjacent to the last one (late or merged updates; today only jumps over 3 tiles snap) and on floor changes (already done).
- **Never extrapolate** past the tile. Positions round to whole render pixels.
- **The target marker and hover box sit on the server tile**: change `view.ts:479` to use `target` instead of the drawn body. Clicking already resolves to the server tile.

Rejected: snapping to the new tile and shuffling in place. Every step becomes a teleport, which reads as stutter and removes the weight the brief asks for. Nothing the player acts on uses the drawn position, so snapping buys no truth.

## 5. D4, light rule v1

| Point | Decision | Source |
| --- | --- | --- |
| Levels | 0–7 per tile: **lit** at 2 or more (seen), **dim** at 1, **dark** at 0 | Opus medium's range |
| Formula | `min(7, max(ambient, max over sources of L − ⌈distance⌉))`, where distance is straight-line (Euclidean). It is computed exactly with whole numbers by comparing squared distances, so client and server cannot round differently. A source counts only if its light passes. | Mine, made exact |
| Light passes | The same stepping as `Geography.sight` (`world.ts:61`), plus closed doors are opaque. A new `lightPasses()`; `sight` itself is unchanged. | Terra A/B |
| Ambient light | **Outdoors:** day 7, golden hour 5, blue hour 2, night 1, dawn steps 1→7. **Roofed tiles:** at least 3 (hearths and candles: the town is warm inside). **Undercroft:** 0. | Mine; interior floor is new |
| Sources (L) | **The Lantern at the shrine:** 10, set high, so walls don't block it. **Lamp:** 6. **Brazier, altar:** 5. **Torch:** 6. **Wild wisp:** 3. | |
| Lamps | Light at the start of blue hour + 0.5 s × distance from the Lantern; go out at dawn in reverse order. A pure function of time. The look text at `engine.ts:546` changes. | Mine |
| What the server sends (players are treated the same) | **Lit tile, in line of sight:** the full creature. **Dim tile, in line of sight:** a *shade* `{id,x,y,z,facing,size}`, with no kind or HP. **Dark tile within 3 tiles:** a shade, drawn as eyes. **Adjacent:** always at least a shade. **Corpses:** at dim or better. **Effects:** dropped on tiles you can't see, unless they involve your own tile. | Eyes: Opus medium. Effect redaction: Terra. |
| Actions | Targeting needs lit + line of sight, or adjacent. A target is dropped when it goes unseen, and a manual walk continues (`dropTarget`, `engine.ts:557`). Ember needs a lit target. Look says "It is too dark to make out." | All four |
| Creatures | Notice a hero within `aggro` (8) if the hero's tile is lit, otherwise only within 3 (`engine.ts:586`) | Mine |
| Cost of light | A `torch` item for the shield slot: light 6, 0 defence, so no blocking while held. Pell sells it. **No fuel in v1.** | Slot: Opus×2. No fuel: Terra. |
| Regeneration | Unchanged in v1 | Terra and me |
| Payload | `GameView.shades[]` and `GameView.lights[]` (carried sources in range). Static sources are computed on the client from map + time. | New |
| Flag | `world.darkness: false` (default), `world.dayMs: 2400000`, `world.dayOffset` | All four |

**Why this cost and not a free lantern.** A free lantern is never switched off, so nobody ever stands in the dark and the rule never bites. The slot cost plus "light makes you seen" gives both choices a price:
- **Carry the torch:** you see 4 tiles, but you give up blocking and creatures notice you from 8.
- **Go dark:** you stay hidden until 3 tiles, but you see only shapes and eyes.

If torches end up always on, fuel is the next lever.

**Same rule on client and server.**
- The client's light field calls the same `light.ts`.
- The CPU computes, for each visible tile, which of up to 32 sources reach it (a 32-bit mask, recomputed only when doors, sources or the light phase change). This is the rule's own occlusion.
- The GPU draws, per texel at 8 texels per tile, the rings `L − ⌈distance⌉` for the sources in that tile's mask.
- So every tile centre shows exactly the rule's level. Shadows behind walls follow tile edges, which suits pixel art.
- One shadowed carried light (the video-2 look) is a P4 variant: it is decoration and decides nothing.

## 6. D5, pixel density

| Setting | Value |
| --- | --- |
| Horizontal density | **32 render px per unit** |
| Pitches | Play: asin(3/4) → a tile is exactly 32×24 px. Close: asin(7/8) → 32×28 px. Because the row count per tile is a whole number, every tile drops the same texture rows and no beat pattern forms. |
| Pixel scale | `k = max(2, round(hostHeight / 290))`, giving 270–320 rows: about 11–13 tiles tall and 15–20 wide. At 1080p, k=4 gives 15×11 tiles. |
| Canvas size | The CSS box is exactly buffer × k. Any remainder (less than k px) is cropped, not stretched. |
| Zoom | The stops from §2. No free zoom. |
| Colour | A palette of about 40 colours (written by Opus), turned into a 32³ lookup table by nearest match in OKLab. It replaces today's per-channel levels (`view.ts:57`). Dithering only at light-band edges. |
| Ground art | Written as 32×32 top-down tiles: one source serves Close, Play, Scenery and the minimap. |

**Why 32 rather than my 24.** At 24, the hero is 36 px tall and Play shows 15 tiles of height, too small for the hoods and faces of a fable. 32 stays inside Terra's ~300-row budget and matches Terra's 32×48 hero range.

**How it fits D1.** Integer zoom and a zoom-driven camera stop conflicting once zoom means fixed stops.

## 7. Mystical, magical, fable-like

These are cheap, and each one is tied to light as a rule:

1. **Two kinds of light** (P1, palette).
   - **Amber is fire:** lamps, torches, braziers and hearths. Warm, flickering, ordinary.
   - **Teal is the Lantern's light:** wisps, the Spire's core, Mend motes and rune glints.
   - The palette's light ramps use teal nowhere else, so teal always means magic. The shrine's teal roof stays: it is the Lantern's house.
2. **The Lantern is alive** (P1 wisps, P3 Spire).
   - Its flame breathes: a 6 s pulse, in palette steps.
   - At blue hour it sends one wisp to each lamp, and a lamp lights when its wisp lands, at exactly the rule's ripple time.
   - At dawn the wisps fly home. One wisp circles the Spire all night.
3. **Wild wisps** (drawn in P1, part of the rule in P4). Three wisps outside the walls each night, on paths that are a pure function of time.
   - They are light-3 sources: each lights its own tile and the four next to it, so it can briefly show you what is out there.
   - That is folklore and mechanic at once, in about 30 lines.
4. **Your light goes out** (P2). When you die, the screen falls to the night floor, and you wake under the Spire as a wisp settles into you. It is 1 s and purely cosmetic; it does not delay the respawn the server already did (`engine.ts:415-424`).
5. **A storybook sky** (P3):
   - a moon drawn three times its true size, as in video-1;
   - pixel stars that twinkle by one palette step;
   - clouds with lit edges at golden hour.
6. **Spells as wonder** (P2):
   - Ember is a moving amber light.
   - Cinderburst rings the light field.
   - Mend lifts teal motes and brightens your tile for 1 s. This is presentation only; spell light as a rule is v2.
7. **Voice** (P1): console lines at dusk and dawn ("The Lantern sends out its wisps"), and a new lamp description.
8. **Decor**: fireflies at dusk and moths at the lamps. They cast no light.

## 8. Day and night

**Cycle.** 40 minutes, from `state.time + world.dayOffset`:
- dawn 3 min
- day 20
- golden hour 3
- blue hour 2
- night 12

Round 1's colour keyframes stand: a blue moon `#8fa6d8` with crisp shadows, and golden hour as today's look. They become 5 entries in `_next/clock-style.ts`, blended by phase.

**The night floor.** Unlit terrain sits at about 6% brightness in indigo, and depth edges are kept, so the map is never lost.

**How a steep camera shows the time of day:**
- sundial shadows around every building;
- the lamp ripple;
- lit windows (emissive pixels only, casting no light);
- sky colour reflected in the river;
- cloud shadows;
- the Scenery stop itself.

## 9. Prototypes (D6)

**One entry page: `/proto/lab/`** (`apps/client/proto/lab/`).
- **Tabs:** Light, Figures, Scenery and Darkness, each with its own picker.
- **Always on screen:**
  - a clock scrubber at 1×, 60× or 600× (it moves the local `dayOffset` and never rewinds `state.time`);
  - a stop selector;
  - a place jump: meadow, market, bridge, shrine, undercroft;
  - a torch toggle;
  - a **Today** variant that renders with the untouched `src/render/WorldView`.
- **Every state lives in the URL** (`?tab=light&v=field&at=bridge&t=19.5&stop=play`), so a shot is a link.
- **Shots:** `shots.ts` names about 10 of them, and `shoot.sh` captures them with headless Chrome against the running :4173.

The shot links are the user's comparison tool and Opus's eyes. Nothing under `apps/client/src` or `apps/server` changes until a prototype wins.

### P1. Lanternlight: pixel lock, light field, clock (the engine decision). Engine, with two art tasks. Size L (about 1,300 new lines, not counting the fork copy)

**Tasks**
1. *Engine.* Copy `src/render/` into `_next/`. Build `lab/{index.html,main.ts,harness.ts,shots.ts,shoot.sh,lab.css}`; `harness.ts` is `startPreview` with the `Engine` exposed.
2. *Engine.* Write `packages/game/src/light.ts`: clock, phases, ambient, static sources, lamp ripple, wild-wisp paths, `lightPasses`, `lightLevel`, `lightGrid`. Add `tests/light.test.ts`. Add `world.dayMs`, `dayOffset` and `darkness` (with defaults) to `content-schema.ts`. Nothing in `Engine` calls `light.ts` yet.
3. *Engine.* In `_next/stops.ts`, add the pixel lock and the Close and Play stops: 32 px/unit, whole-number k, exact canvas size.
4. *Engine.* In `_next/lightfield.ts`:
   - a light-field pass sampled by every material through one shared Lambert patch;
   - remove the 8 pooled point lights (`view.ts:12`, `:129`), the free cave torch (`:71`) and `actorPop` (`:203`);
   - a light-overlay and verify button in the lab.
5. *Art (Opus).* The palette and its lookup table (`_next/palette.ts`); the 5 clock keyframes and the night floor (`_next/clock-style.ts`); ground textures regenerated at 32×32; grass blades replaced by pixel tufts.
6. *Art (Opus).* Wisps, the Lantern's breath, lamp flames, window glows, fireflies and moths (`_next/wisps.ts`).

**Checkpoints.** **A**, the first visible result: tasks 1, 3 and 5, by daylight only. **B**: everything else.

**Acceptance**
1. **Pixel lock.** The lab's readout shows canvas CSS size = buffer × k at 1280×720, 1920×1080 and 2560×1440, at DPR 1 and 2. The magnifier shows every Play ground tile at 32×24 px.
2. **The field equals the rule.** The verify button compares the field at every visible tile centre with `lightGrid()` and finds 0 mismatches at noon, golden hour, blue hour, midnight, and in the undercroft with the lab torch. At night, with the lab torch held just inside the Copper Kettle's door, closing the door drops the street tile outside from lit to dim, and a test asserts the same.
3. **Lamp ripple.** At 60× through blue hour, each lamp lights as its wisp lands, nearest the shrine first. The tests assert the order and the times.
4. **Speed.** Median GPU frame time is 6 ms or less at 1920×1080, at night, with at least 16 sources in view, on the user's MacBook. If it is above 10 ms after one targeted fix, stop and revisit the engine.
5. **Nothing else breaks.** `npm test` and `npm run typecheck` pass, and `git diff --stat` shows nothing under `apps/client/src` or `apps/server`.
6. **The user picks:** palette or free colour; Close at 61° or Close at the Play pitch.

### P2. Figures and Weight: actors and feel. Art, with engine infrastructure. Size L (about 1,200 lines)

**Tasks**
1. *Engine.* Build `_next/figures/{bake.ts,sprites.ts,overrides.ts}`:
   - the bake: a two-channel offscreen render, the cleanup pass, and the atlas;
   - the upright-quad renderer with field and normal lighting;
   - shadows;
   - the text-grid override loader.
2. *Art (Opus).* `_next/figures/{kit.ts,poses.ts}`: the human kit (all 8 looks), the thornboar and the gutter rat, with all animations. Touch-ups for the hero's front and back idle and walk frames go in `content/art/actors/hero/*.txt`.
3. *Engine.* `_next/{feel.ts,particles.ts}`:
   - **Attacks:**
     - the wind-up starts 180 ms before `attackAt`;
     - the strike frame plays only when the server's `hit`, `miss` or `block` arrives;
     - if nothing arrives within 250 ms, the attacker relaxes.
   - **Hit response:**
     - 70 ms of freeze on the animation clocks only;
     - knockback capped at 0.12 tile;
     - a one-frame white flash.
   - **Steps and deaths:**
     - footfall dust;
     - a death collapse when the corpse appears.
   - **Camera and accessibility:**
     - a camera kick in whole pixels;
     - reduced motion turns these off.
   - **Ember:** the projectile takes about 120 ms, and its damage number appears when it lands (today the number comes first).
   - **Truth markers:** the snapping rules and the server-tile marker from §4.

**Picker:** Boxes / Baked / Baked + touch-ups. Toggles: normals on or off; feel Off / Subtle / Heavy; 0.25× slow motion; an 8-direction turntable.

**Acceptance**
1. **Pixel-true sprites.** At Play the magnifier shows one sprite texel per render pixel. While a figure walks, a pixel-difference counter shows its inside changing only on frame changes.
2. **Feel never runs ahead of the server.** A log over a 5-minute auto-hunt shows:
   - zero strike frames before their effect;
   - no actor at rest drawn more than 0.12 tile from its server tile;
   - the target marker always on the server tile.
3. **Readable at a glance.** From the still shot `meadow-dusk`, the user names the hero, Wren, the guard, the boar and the rat, and says which way the boar faces.
4. **Fast enough.** Baking every P2 figure at one pitch takes 400 ms or less at load (logged).
5. **The user picks** the variant and the feel level.

### P3. Scenery: the zoom continuum and grandeur. Art plus engine. Size L (about 1,100 lines)

**Tasks**
1. *Engine.* Add the Scenery stop and its transitions to `_next/stops.ts`, with these rules:
   - **Clicking:** off in Scenery.
   - **Back to Play:** automatic on your own attack or a hit on you.
   - **Where it is refused:** under a roof and in the undercroft.
   - **Rendering:**
     - mipmaps;
     - the cut-away cone;
     - the field centred on the hero;
     - far lamps drawn as glow pixels;
     - sun shadows over the near ~30 tiles.
2. *Art (Opus).* The world beyond the town:
   - **Sky** (`_next/sky.ts`): phase gradient, sun, a big moon, stars, and clouds with lit edges.
   - **Far land north** (`_next/farland.ts`): hills, forest, the river continuing, and side skirts.
   - **Hollow Keep:** a ruin on the far ridge with one lit window.
   - **Lantern Spire** (`_next/spire.ts`): about 14 units tall on the shrine. It hides with the shrine's roof, and the wisps launch from its top.
   - **Low-poly trees and pines** (`_next/trees.ts`).
3. *Art (Opus).* Effects that tie the near world to the sky:
   - cloud shadows (`_next/clouds.ts`);
   - the sky reflected in water (`_next/water.ts`);
   - haze.
4. *Engine.* A second bake pitch (10°) in `figures/bake.ts`, and the lookout panel (`_next/lookout.ts`): the same sky and far layers in a dismissible strip over Play.

**Picker:** Continuum / Lookout panel / Neither. Haze: normal or heavy.

**Acceptance**
1. **The stops behave.** The wheel steps Close ↔ Play ↔ Scenery.
   - At rest in Close and Play, the pixel-lock readout passes.
   - In Scenery, a click returns to Play without walking.
   - Scenery is refused under a roof and in the undercroft.
   - A hit on the hero returns to Play on the frame its effect arrives.
2. **Grandeur, side by side.** The shots `scenery-gate-golden`, `scenery-bridge-night` and `scenery-meadow-dawn` are placed beside ref-5, ref-2 and video-1, and the user judges. Each shot's colour histogram shows palette colours only, so there is no smooth bloom.
3. **Speed.** Scenery's median GPU frame time is 9 ms or less at 1920×1080.
4. **The user picks:** Continuum or Lookout.

### P4. Darkness: light becomes a server rule. Engine (one small art task). Size M (about 600 lines)

**Tasks**
1. *Engine.* Behind `world.darkness`, hooks in `packages/game/src/engine.ts`: `view` (full or shade, plus `lights`), `target`, `cast`, `look`, tick-time target drop, creature noticing, and effect redaction. Also:
   - `model.ts`: `Shade`, `GameView.shades`, `GameView.lights`;
   - `ids.ts`: append `torch`;
   - `content/balance.json`: the torch item and Pell's stock;
   - `light.ts`: `perceive()`;
   - `tests/darkness.test.ts`.
2. *Engine.* `_next/shades.ts`, plus the battle list showing "Something" for shades. Variant: one 256² cube-shadowed torch for your own hero only.
3. *Art (Opus).* Eye glints, the shade silhouette treatment, and the torch sprite and flame.

**Lab scenes:** the night meadow, the undercroft rats, and two heroes on one `Engine` so you can see someone else's torch reveal a creature.

**Picker:** Rule off / Rule on / Rule on + shadowed torch.

**Acceptance**
1. **Tests pass for:**
   - **Visibility:**
     - an undercroft rat 5 tiles away in the dark is absent;
     - at 3 tiles it is a shade;
     - with a torch it is shown in full at 4 tiles and as a shade at 5;
     - behind a closed door it is never shown in full.
   - **Targeting:**
     - targeting a shade at range throws;
     - a target that goes dark is dropped, and a manual walk continues.
   - **Creatures:**
     - an unlit hero is not noticed at 5 tiles;
     - a lit hero is noticed at 8.
   - **Flag off:** `view()` deep-equals today's on a seeded run.
2. **The picture matches what the server sent.** On a scripted 3-minute walk, the lab overlay finds zero tiles where a lit tile holds a shade or a dark tile holds a full creature.
3. **Server cost.** With 16 simulated heroes at night, `view()` costs at most 2 ms more per tick than with the flag off.
4. **The user plays** the night meadow and the undercroft with and without a torch and calls it scary but playable. Otherwise we tune three numbers first: unlit notice range 3, eyes range 3, torch light 6.

### Lanes and order

- **Engine lane (anyone):**
  - P1 tasks 1–4;
  - P2 tasks 1 and 3;
  - P3 tasks 1 and 4;
  - all of P4 except its art task.
- **Art lane (Opus only):**
  - P1 tasks 5–6;
  - P2 task 2;
  - P3 tasks 2–3;
  - P4 task 3.
- **Order.** Show P1 → P2 → P3 → P4. P4's engine work starts as soon as `light.ts` lands (P1 task 2) and can be demoed with whichever prototype is current. P2's kit can start on checkpoint A.
- **Migration.** Production migration is a diff of `_next/` against `src/render/` after P1 and P2 win.

### Explicitly not built yet

- WebGPU
- production migration
- Studio controls for the clock, palette and stops
- sound (the first thing after these four)
- weather
- moon phases
- fuel
- regeneration in the dark
- light-shy creatures
- spell light as a rule
- outfits for other players
- beetle and grub bakes
- multi-tile creatures
- camera rotation
- Scenery underground
- new regions

## 10. Risks

- **Scenery looks like a toy diorama.** The town is 84×68 tiles.
  - Mitigations: strong haze, far layers much larger than the town, and the Spire and the Keep for scale.
  - The lookout panel in P3's picker is the exit, and it reuses everything built.
- **Opus's art has a ceiling.**
  - Mitigations: the shot loop, the palette lock and hand touch-ups.
  - If the user rejects baked figures in P2, the fallback is Terra's slice: 4-direction text-grid sheets for the hero and the boar only. Scenery then ships as the lookout panel, because there would be no second pitch.
- **Performance.** All the millisecond figures are unverified until P1 measures them on the user's MacBook.
  - The buffer stays near 130k pixels at any window size.
  - Fallbacks: 4 field texels per tile, a 512² sun shadow, closer Scenery haze.
- **Night readability.**
  - The map stays visible at night: the night floor keeps terrain and depth edges.
  - Safe light is close by: adjacent creatures are always at least a shade, interiors are at least light 3, and the town is lamp-lit.
  - Night is only 12 of every 40 minutes.
  - A brightness slider cannot cheat, because the server never sends what you can't see.
- **Accessibility.**
  - Reduced motion removes the camera kick and turns the Scenery dolly into a fade.
  - Flicker stays at or below 3 Hz for brightness swings over 10%.
  - Flashes hit sprites only, never the whole screen.
- **Saves and multiplayer.**
  - `torch` is appended to `itemKinds`, and there are no new state fields, so old saves still parse.
  - The rule ships with the flag off.
  - P4's tests pin down the flag-off view.
- **Scope.** There is one fork, and nothing in `src/` changes until a prototype wins. If anything is cut, cut the Close pitch change and the normals toggle first, not P1.

**Verified in this round:**
- the `path:line` citations above;
- that `proto/chrome` was removed at HEAD;
- the fixed camera yaw and the north river;
- doors ignored by sight;
- the shield-slot guard;
- the 6-face point-light shadows.

**Unverified:**
- every millisecond figure;
- the size of the ortho-to-perspective jump;
- GLSL and JS rounding agreeing in the field (task 4's verify button checks it);
- bake times;
- whether the 61° Close reads as different enough from Play to be worth keeping.
