# Studio app brief

Project: `~/Personal/game` (Lanternfall), an original small multiplayer tile RPG. npm workspaces, TypeScript, Vite, Three.js client, Colyseus + SQLite server, Electron desktop shell.

Request from the owner: **prepare a separate app for modifying/working with sprites and overall balancing of the game.**

## What exists today

- `packages/game/src/model.ts`: all game data as TypeScript constants: `itemDefs` (weapons, armor, food, potions, loot with buy/sell prices), `mobDefs` (hp, armor, attack, xp, gold range, loot table with drop chances, step speed, aggro), `spells` (mana, level, cooldown), XP curve `xpAt`, `maxHP`/`maxMana`/`capacity` per level, skill progression (`skillFrom`, `magicFrom`), NPC shop lists and dialogue (`npcDefs`), `shellTask` quest reward. Ground kinds and "thing" kinds (wall, tree, lamp, ...) are enums here.
- `packages/game/src/engine.ts`: server-authoritative simulation, including the damage formula (e.g. `max = attack * (0.6 + melee/18) + level`, attack interval 1500 ms), regen, loot rolls, death penalty. Some balance constants are inlined in code, not in model.ts.
- `packages/game/src/town.ts`: procedural map generator. `world.ts`: pathing and sight.
- `apps/client/src/render/textures.ts`: **all ground, wall and roof textures are generated procedurally in code** (a `Pix` class writing pixel buffers from palettes + seeded noise, one `case` per kind). Ground tiles are 48×48 px covering 2×2 world tiles (24 px per tile); walls are 16×32 px per 1×2 world units, box-projected in world space.
- `apps/client/src/render/actors.ts`: characters and creatures are built from Three.js boxes (voxel-ish rigs) with colors from a `looks` table.
- `apps/client/src/render/terrain.ts`, `view.ts`: scene, props, lighting, post-processing (low-res pixelated render target).
- `apps/client/src/icons.ts`: item and spell icons as hard-coded 16×16 rect runs rendered to SVG.
- **Groundwork already done (not yet wired in):** `content/balance.json`, `content/icons.json` and `content/models.json` were exported from the current code with identical values. balance.json holds progression constants (hp/mana/cap per level, xp curve coefficients, step/attack/regen ms, death losses, melee formula factors, skill growth), items, creatures (loot as `{item, chance}`), spells (with `base/perLevel/perMagic/spread` power params), merchants (greeting/topics/sells/buys), quests and starter kit. icons.json is `{name: {palette: string[], pixels: string[16]}}` (one char per pixel, `.` transparent). models.json is `{name: {kind, height, bones: {legL: [x,y,z], ...}, parts: [{bone, color, size, pos}]}}` for 8 human looks and 4 creatures. Nothing reads these files yet; the code still uses the TS constants.
- `tests/`: engine tests via `tsx --test`.
- No image asset files exist yet; there is no asset pipeline.

## Constraints

- The visual overhaul of the renderer (`apps/client/src/render/*`) is finished for now: chunky low-res pixel render (~215 px tall target), low sun, long shadows, teal/orange split-tone post shader, edge rim light, world-mapped wall textures. The owner still wants the art to move closer to a hand-made pixel-art reference, so the studio's sprite side should make that easier, not just edit what exists. The plan must say how the game will consume assets/balance data produced by the studio.
- Dev servers: game client `npm run dev` (Vite :4173, Colyseus :2567 via `tsx watch`). The server persists world state in `.local/lanternfall.sqlite`.
- Keep scope small and shippable. It is a dev tool for one developer, run locally (`npm run studio`), not a public product.
- Same stack as the repo unless there is a strong reason.
