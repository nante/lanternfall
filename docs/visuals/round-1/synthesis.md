# Round 1 synthesis (coordinator)

Reports: `opus-medium.md`, `opus-xhigh.md`, `terra-a.md` (pass 1: `terra-a.pass1.md`), `terra-b.md` (pass 1: `terra-b.pass1.md`).

## Where all four agree

These are settled unless round 2 finds a concrete flaw.

1. **Keep Three.js r0.187 on WebGL2.** No engine switch. WebGPU's many-light addons need TSL node materials, which means rewriting every GLSL patch; a 2D engine loses roofs, depth, sun shadows and pitch; Babylon gains nothing.
2. **Fork the renderer for prototypes**, do not touch `apps/client/src/render/` until a prototype wins. (Opus xhigh: one shared fork, `apps/client/proto/_next/`, so there is one candidate to migrate, not four.)
3. **Replace the 8 pooled point lights with a tile light field**: a texture of light per tile, occluded by the same opaque tiles that stop sight, sampled by every material. No point-light shadow arrays (r187 renders 6 cube faces per shadowed point light, verified at `WebGLShadowMap.js:287`). At most one shadowed carried light, as a variant.
4. **Light becomes a server rule** in `packages/game` (a new `light.ts`), behind a balance flag that is off by default. `Engine.view()` stops sending creatures you cannot see; you cannot target what you cannot see; anything adjacent is always perceivable ("touch"). Brightness settings are then safe because hidden things are never sent.
5. **Clock from `state.time`**, roughly a 40-minute cycle. It pauses when the server pauses (no one online), which everyone accepts.
6. **Underground ambient is zero.** Remove the free client-only cave torch and the `actorPop` self-glow that makes actors shine in the dark.
7. **Feel never lies about outcomes.** Impact, flash and strike frames only when the server's `hit`/`miss`/`block` effect arrives. Hit-stop is cosmetic (40–110 ms) on animation clocks only. Knockback within ±0.12–0.15 tile. Camera kicks in whole render pixels. Reduced motion turns these off.
8. **Grandeur ingredients**: one landmark far too big for the screen (Great Lantern / Lantern Spire / distant tower), sky and moon reflected in water, drifting cloud shadows, and an overlook moment with sky.
9. **Not now:** WebGPU, weather, production migration, new regions, bosses, full fuel economy.

## Where they disagree (round 2 must resolve)

### D1. Perspective: the user's zoom continuum (new)

The user added a consideration after round 1 (see the end of `BRIEF.md`): one camera driven by zoom, flat 2D when zoomed in → almost 2D → a scenery view with sky and horizon when zoomed out, with `ref-5` as the target. It is a consideration, not a requirement.

Round-1 positions it bears on:
- Opus medium and Opus xhigh: a real camera move at overlook tiles (pitch 50° → 28° ortho, or a perspective dolly to 12° pitch / 35° FOV with a sky dome and three parallax layers). Picking off during it.
- Terra A and Terra B: no real tilt; a painted, dismissible lookout panel over the normal view, because an orthographic ground view does not by itself produce a useful horizon.

### D2. Actor pipeline

- Opus medium: live low-poly rigs with stepped 10 fps poses, 8-direction facing snap, palette toon ramp; variant B = the same rigs baked to sprites.
- Opus xhigh: procedural 3D figures **baked at load** into 8-direction sprite sheets with colour, normal and depth channels (depth via `gl_FragDepth` so sprites intersect walls); hand-made PNG frames can override baked ones later; live low-poly as a comparison variant.
- Terra A and Terra B: hand-pixelled sprite sheets, 4 cardinal facings, 32×48 hero, a 20-frame test slice, flat tint from the light field, no normal maps.

New constraint from the user: **all art is authored by Opus** (Claude), not by a human artist and not by Codex. Engine code can go to anyone. Judge each pipeline by what that author can actually make look good, and by how it behaves if the camera pitch changes (D1): baked sprites are baked at one pitch.

### D3. Movement between tiles

- Opus medium and Opus xhigh: keep smooth interpolation from the old tile to the confirmed new tile over the server's step time, with stepped poses and dust on footfall.
- Terra A and Terra B: the server commits the new tile before the client starts animating (`engine.ts:460`), so snap the foot anchor and pick target to the confirmed tile and animate only within it.

### D4. Light rule v1 details

| Point | Opus medium | Opus xhigh | Terra A | Terra B |
| --- | --- | --- | --- | --- |
| Levels | 0–7, L − distance | 0–10, L − euclidean | 4 bands, Chebyshev | discrete falloff, threshold |
| Cost of light in v1 | torch takes shield slot, burns 8 min | torch takes shield slot, burns 4 min/torch | free toggle lantern | free toggle lantern |
| Hidden but near | "eyes" within 3 tiles | "shades" at light 1 or adjacent | nothing | nothing |
| Creatures in v1 | +2 aggro in dark (later: light-shy) | detect unlit players only within 3 (light makes you seen) | unchanged | unchanged; later lantern attracts beetles |
| Regen in dark | stops (v1) | stops (v2) | no | no |
| Street lamps | ripple on at dusk from the Lamplighter | ripple on at dusk from the shrine | on at night band | always lit |
| Closed doors | not addressed | not addressed | block light (new; `sight` ignores doors today) | block light (new) |

### D5. Pixel density

- Opus xhigh: the root cause of the "blocks under a filter" look is mixed density (ground texels 24/unit, scene ~49–60 px/unit, continuous zoom, CSS stretch to non-integer). Lock 24 render px per unit, integer scale (~290 rows), integer zoom steps, palette LUT (~40 colours, OKLab nearest) instead of per-channel levels.
- Terra A and B: 300–360 rows, integer upscale with letterboxing.
- Opus medium: keeps 480 rows.

Note: integer zoom steps conflict with a continuous zoom-driven camera (D1). Round 2 should reconcile.

### D6. Prototype list and order

- Opus medium: lightfield (engine) → nightfall (rule) → actors → vista.
- Opus xhigh: Nightfall (light + time, engine decision) → Figures → Vista → Weight, all on one shared fork.
- Terra A: Paint and step (art, engine decision) → Lantern and the corner → River overlook.
- Terra B: Fable slice (art) → Lantern and shadow → Cycle and overlook → Confirmed impact.

## Gaps nobody covered well

- **"Mystical, magical, fable-like."** Round 1 is mostly about light and night. Only Terra A mentions a turquoise magical accent. Say what makes this world feel enchanted (for example will-o'-wisps, runes that glow, the Lantern as a living thing, spell light as wonder), in a way that fits light-as-a-rule and stays cheap.
- **How the user will see and judge the prototypes**: a single entry page with a picker across directions would let them compare quickly.

## What round 2 must produce

A revised, standalone plan that takes a clear position on D1–D6 and the mystical gap, then gives **at most four prototypes**, ordered, on one shared renderer fork, each with files, an observable acceptance check and size. Mark each prototype task as **art** (Opus authors) or **engine** (anyone). Keep scope tight: the user wants to see something built soon.
