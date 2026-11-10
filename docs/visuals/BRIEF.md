# Visuals council: brief

Date: 2026-11-09. Coordinator: Claude (Opus 5.5). This brief is the only context each council member gets.

## What the user asked for

In their words, lightly cleaned up:

> I'd like to add more prototypes to visuals; this might include a new engine. Overall I want mystical, magical, fable-like visuals in the game.
> I want light to mean something: when there is no light source it should be scary. There should be night and day.
> It should have stunning visuals and a feeling of grandiosity.
> Figure out how to handle Tibia's mechanics, but also build on top of that to add that immersive feel.
> I still want everything to be pixel art, but with feel to it, and weight, just like the mechanics.
> Two turns of planning, then go to building it.

"Tibia's mechanics" means the genre mechanics the game already copies in spirit (tile grid, deliberate stepping, floors with roofs that hide, a light radius around the player and light sources, darker underground, day/night world light). The world is original (Lanternfall). Do not propose Tibia names, sprites, maps, UI art or any recreation of that game. Mechanics are fair game; look and content are ours.

## The project today

Lanternfall, a small multiplayer tile RPG. Root: `/Users/kubawiszniewski/Personal/game`. Read `README.md` first.

- `packages/game/src`: shared rules. `model.ts` (protocol and state, two floors: `z=0` town, `z=1` undercroft), `town.ts` (map generator, 80-ish tiles wide, lamps at fixed tiles), `world.ts` (pathing, sight, protection zones), `engine.ts` (server-authoritative simulation), `rules.ts`, `content-schema.ts` (includes `RenderStyle`), `style-presets.ts` (five look presets).
- `apps/client/src/render`: the renderer. `view.ts` (`WorldView`: Three.js r0.187 WebGL2, orthographic camera at ~50° pitch, scene rendered into a low-res half-float target sized from `pixelHeight`, then a post shader does ACES, depth-edge rim light and outlines, split toning, vignette, hurt flash, colour quantization with Bayer dithering, nearest upscale; one directional sun with a 2048 PCF shadow map, a hemisphere light, a player torch on the cave floor, up to 8 pooled point lights for the nearest lamps, additive glow sprites, fake light-shaft planes, dust points, a pixel-snapped camera). `terrain.ts` (instanced boxes for walls, props, trees, grass; ground shader with an atlas; lamps list). `actors.ts` (characters and creatures built from Lambert boxes, swinging limbs). `textures.ts` (procedural canvas textures) and `texture-overrides.ts` (hand-made PNGs from `content/art/`).
- `apps/client/src/main.ts`: the HUD and the networked game. `apps/client/proto/chrome/`: a throwaway prototype page that runs the real `Engine` locally (no server) inside `WorldView`, with a top "picker" to switch variants. Nothing in production imports it. That is the pattern for visual prototypes: `http://127.0.0.1:4173/proto/<name>/`.
- `content/render-style.json`: the live look ("Golden hour"). `apps/studio`: balance and art tool.
- Servers already running: client Vite on `:4173`, world server on `:2567`, Studio on `:4174`. Do not start, stop or restart them.
- `npm test` and `npm run typecheck` pass today.

Light has no meaning in the rules today. Lamps are decoration (`engine.ts` describes a lamp as "Its flame never goes out"). There is no clock, no time of day, no light level, no light-dependent sight or behaviour. `world.ts` sight is line-of-sight only.

## References (in `docs/visuals/reference/`)

Look at the images if you can open them; the descriptions are here in case you can't.

- `current-game.png`: the game now, from `/proto/chrome/`. Box-built voxel-like characters and boars, dark noisy grass, a faint diagonal light shaft, no sky, no horizon, no sense of place or scale. It reads as "Minecraft-ish blocks under a filter", not as pixel art and not as fable.
- `ref-1-dragon-ruins.png`: painted pixel art. A knight on horseback, seen from behind, faces a huge dragon over a ruined castle. Grandeur comes from scale contrast (tiny figure, huge creature and towers), a big bright sky, atmospheric blue haze on distant forms, warm embers in the foreground.
- `ref-2-cathedral-city.png`: a vast gothic city at golden hour from a high vantage. Layered depth: dark green foreground trees, mid city roofs in warm orange, a cathedral lit by low sun, hazy far skyline, dramatic clouds with lit edges, a river and bridges reflecting light.
- `ref-3-dusk-field-fight.png`: side view of two figures in a meadow at sunset. Simple shapes, saturated dusk gradient, dark tree silhouettes, a single firefly light.
- `ref-4-forest-ride.png`: first-person on horseback down a sunlit forest path. Huge trees, dappled warm light, a turquoise magical wisp floating ahead.
- `video-1-fable-scenes.mp4` and `-contact.png`: AI-generated animated pixel-art scenes. A stone bridge at sunset with flickering torches reflected in a river; a castle on a hill under a moon; two cloaked figures watching an enormous orange moon over mountains and a lake castle; a gnome outside a hut at dusk with a huge pale moon. Warm orange light against deep blue night is the recurring palette. Motion is slow: flickering fire, drifting clouds, shimmering reflections.
- `video-2-pixel3d-flashlight.mp4` and `-contact.png`: a streamer reacting to a pixel-art 3D horror game. The world is real 3D geometry rendered at low resolution: you see multiple sides of objects as the camera rotates. Darkness is near total; the player's flashlight cone is the main light, plus fires. The camera moves from steep top-down to over-the-shoulder third person when aiming. Fences, stairs and props cast real shadows from the flashlight. This is the "light means something, darkness is scary" reference, and a proof that low-res 3D can read as pixel art.

## Constraints

- Pixel art everywhere: low internal resolution, nearest-neighbour upscale, controlled palette, crisp silhouettes. No smooth high-res rendering, no bloom smear that erases pixels.
- Tile mechanics stay authoritative on the server: tile grid, step timing from the rules, floors, roofs hiding interiors. Visual feel must not lie about game state (no animation that shows a hit landing before the server says it did, no movement that drifts off the tile the server holds).
- TypeScript, browser-first, Electron desktop already exists. No C++.
- Prototypes come first. They live under `apps/client/proto/<name>/`, run the real local `Engine` like `proto/chrome` does, and nothing in production imports them. The production renderer is migrated only after a prototype wins.
- No dual simulation. If light becomes a rule, it lives in `packages/game` and the server, not as a client-only guess.
- The user asked for two planning turns, then building. Plan something that can actually be built and shown soon. Fight scope creep: a few strong prototypes beat a long roadmap.

## What to answer

1. **Engine.** Keep Three.js and extend `WorldView`, or switch? If you propose a switch (for example a 2D sprite engine with normal-mapped lights, a custom WebGL2 or WebGPU renderer, Babylon.js, or anything else), name the concrete capability we cannot get otherwise and the migration cost against today's `WorldView` API (`update(view)`, `onPick`, `applyStyle`, floors, roofs, labels). If you keep Three.js, say what changes inside it (lighting model, many lights, light-occlusion or shadows from point lights, fog/volumetrics, sky). Verify current library facts from code or docs rather than memory where it matters.
2. **Actors and art pipeline.** Today's box rigs are the weakest part. Choose how characters, creatures and props become real pixel art with weight: hand-pixelled sprite sheets on billboards, low-poly models rendered low-res, pre-rendered 3D-to-sprite, or something else. Say how many directions and frames, how sprites receive dynamic light (normal maps? flat?), and what the first pass of art looks like when we have no artist.
3. **Light as a mechanic.** Start from the genre baseline (world light level by time of day, per-source light radius and colour, underground darkness, carried light sources) and say what we add on top so that having no light is frightening. Be concrete: what can the player not see or not do in darkness, what do creatures do differently, what resource or risk does light cost, how is it shown. Split it into server rules (what goes in `packages/game`) and client presentation. Keep the first rule change small.
4. **Day and night.** Cycle length, phases, palettes, how lamps and windows come on, moon and stars, how the change reads from a steep top-down camera that does not see the sky.
5. **Grandeur.** How a tile game with a steep camera gets a sense of scale and wonder: horizon or sky visibility, painted backdrop layers, distant landmarks, cloud shadows, camera moments, scale of buildings and creatures, atmospheric perspective. Pick what is worth it.
6. **Feel and weight.** Animation and feedback that make steps, hits, spells and deaths feel heavy while staying true to server timing: anticipation, hit-stop, knockback squash within the tile, camera response, particles, footstep dust, light flashes from spells, sound only if you think it is essential.
7. **Prototypes to build.** A short ordered list (aim for 3 to 5). For each: what it proves, what the user sees, which files it adds or touches, how we judge it (an observable check), and rough size. Say which one is the engine decision if there is one. Say what we explicitly do not build yet.
8. **Risks.** Performance budget on a MacBook-class integrated GPU at 1080p and higher, readability when it is dark (the player must still be able to play), brightness and accessibility, art cost.

## Rules for council members

- Read-only on the repository. The only files you may create or change are your own report files named in your task. You may write scratch files and screenshots outside the repository (use your own temp directory).
- Do not install packages, run downloaded code, deploy, publish, or start, stop or restart the running servers. You may take headless screenshots of `http://127.0.0.1:4173/proto/chrome/` if useful, for example with `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --user-data-dir=<your temp dir> --use-angle=metal --window-size=1600,900 --virtual-time-budget=8000 --screenshot=<your temp dir>/shot.png <url>`.
- Do not delegate to other agents.
- Cite code as `path:line`. Mark anything you did not verify as unverified.
- Write plainly. Short sections, concrete numbers, no filler. Aim for 1,500 to 3,000 words.

## Added by the user after round 1 (a consideration, not a requirement)

> Overall, to get the best of both worlds, I think we should have a unique perspective engine where we can flatten to 2D → almost 2D → the scenery modes when we zoom out. That way we keep playability while also getting to that level of grandiosity.

Reference: `reference/ref-5-dragon-ruins-scenery-target.png` (the dragon over the ruined castle, a rider seen from behind and below eye level, sky filling half the frame). That is the target for the zoomed-out "scenery" end.

Read this as one continuous camera, driven by zoom:

1. **Zoomed in: flat 2D.** Near top-down, the most readable, the mode you fight and loot in.
2. **Middle: almost 2D.** The current steep ¾ view, a little depth, walls and trees standing up.
3. **Zoomed out: scenery.** The camera tilts toward the horizon. Sky, clouds, moon, distant landmarks and the land beyond the town come into view. This is where grandeur lives.

The user later clarified: this is **not fixed, it is a consideration**. Round 2 must evaluate it seriously and give a verdict: adopt it fully, adopt part of it (for example only some of the range, or only at certain places), or reject it, with reasons. If adopted, say what it costs: the world would have to hold up from top-down to a near-horizon view, which means real depth, a sky, a horizon, far scenery, and actors and props that read at every pitch. Compare it with the round-1 alternative of a fixed play camera plus a separate painted lookout.
