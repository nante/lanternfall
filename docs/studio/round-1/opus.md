# Studio plan: round 1 (opus)

Scope: a local tool for one developer (`npm run studio`) to edit sprites and balance. The game loads the same files the studio writes. I read the brief, `packages/game/src/{model,engine,town,world}.ts`, `apps/client/src/render/{textures,actors,view,terrain}.ts`, `apps/client/src/{icons,main}.ts`, `apps/server/src/index.ts`, `tests/engine.test.ts`, `content/*.json` and `package.json`.

## 0. What I found that shapes the plan

- **`balance.json` misses some of the constants that matter.** These are still inlined in `engine.ts` and are not in the JSON:
  - diagonal step factor `1.45`
  - `CORPSE_PROTECT` 60 s and `CORPSE_TTL` 600 s
  - combat timer 30 s
  - regen amounts `1 + floor(l/4)` hp and `2 + floor(l/3)` mana per 3 s
  - block formula `defense * (0.5 + shielding/20)`
  - potion jitter `random(20)` and `random(15)`, and the 1000 ms potion exhaust
  - assist xp `ceil(xp/3)`
  - shrine heal limits (level > 6, hp > 30 %)
  - monster idle regen +2
  - fullness cap 1.5 M ms
  - vault 30 slots, corpse 12 slots, `stackMax` 100

  Several of these drive balance (regen especially, see below), so they have to move too.
- **`spread` means two different things in the spell data.** On `mend` and `renew` it is a fraction (`0.25` becomes `random(base/4)`). On `ember` it is a flat number (`12` becomes `random(12)`). The schema should split it into `spreadFlat` and `spreadFrac` before anything reads it.
- **Engine combat is easy to reuse headlessly.** `Engine` depends only on `MapData`, `Geography` (pure), `crypto.randomUUID` (present in Node and in a browser on localhost) and an rng seeded from `state.rng`. The simulator can run the real engine in the browser.
- **Downtime dominates the economy.** A back-of-envelope expected-value pass with the current numbers (level 1, melee 10, starter armor 4, cudgel):

  | Creature | Time to kill | Damage taken per kill |
  | --- | --- | --- |
  | rat | ~6 s | ~6 |
  | beetle | ~28 s | ~67 |
  | grub | ~44 s | ~201 |
  | boar | ~33 s | ~112 |

  The player has 150 hp, so a level-1 player with a cudgel loses to a grub on average. Level-1 regen is 1 hp per 3 s, so a beetle kill costs about 3.4 minutes of regen against 28 s of fighting. Food costs about 60 gold an hour (a 3 g loaf lasts 180 s). The tables in §3 have to show downtime and food upkeep, or xp/hour and gold/hour will look several times better than they really are.
- **The renderer takes texture inputs at a few call sites only.** These are `groundAtlas()`, `wallTexture(style)`, `roofTexture(kind)` and `plankTexture(dark)` in `textures.ts`, plus `human(look)`/`creature(kind)` in `actors.ts` and `icon(kind)` in `icons.ts`. Replacing those few functions moves the art to data without touching lighting or post.
- **Small bug:** `textures.ts:46` `hex('#724fS')` has an invalid hex digit. `parseInt('fS', 16)` returns 15, so the blue channel happens to come out as `0x0f`. Fix it when the textures are baked.
- **There is no git repo.** A studio that writes files needs backups (§4). I'd also run `git init` before M0.

## 1. Data move

### 1.1 One schema module

New file **`packages/game/src/content.ts`**. Zod is already a dependency.

```ts
import { z } from 'zod';
import { itemKinds, equipSlots, npcRoles, mobKinds, spellIds } from './model.ts';
import balanceJson from '../../../content/balance.json' with { type: 'json' };

const Item = z.object({
  name: z.string(), icon: z.string(), weight: z.number().min(0), buy: z.number().int().min(0), sell: z.number().int().min(0),
  slot: z.enum(equipSlots).optional(), attack: z.number().int().optional(), defense: z.number().int().optional(),
  armor: z.number().int().optional(), slots: z.number().int().optional(), stack: z.boolean().optional(),
  food: z.number().int().optional(), heal: z.number().int().optional(), mana: z.number().int().optional(),
}).strict();
const Creature = z.object({
  name: z.string(), hp: z.number().int().positive(), armor: z.number().int().min(0), attack: z.number().int().min(0),
  xp: z.number().int().min(0), gold: z.tuple([z.number().int(), z.number().int()]),
  loot: z.array(z.object({ item: z.enum(itemKinds), chance: z.number().min(0).max(1) })),
  step: z.number().int().positive(), aggro: z.number().int().positive(),
}).strict();
const Spell = z.object({
  words: z.string(), name: z.string(), mana: z.number().int(), level: z.number().int(), cooldown: z.number().int(),
  kind: z.enum(['heal', 'attack']), range: z.number().int().optional(),
  base: z.number(), perLevel: z.number(), perMagic: z.number(),
  spreadFlat: z.number().default(0), spreadFrac: z.number().default(0),
}).strict();
export const BalanceSchema = z.object({
  progression: Progression,                  // existing keys + the missing ones from §0
  items: z.record(z.enum(itemKinds), Item),  // zod 4: an enum key makes every kind required
  creatures: z.record(z.enum(mobKinds), Creature),
  spells: z.record(z.enum(spellIds), Spell),
  merchants: z.record(z.enum(npcRoles), Merchant),
  quests: z.object({ shells: Quest }),
  starter: Starter,
}).strict().superRefine(crossRefs);          // loot, sells/buys, quest reward and starter items must exist
export type Balance = z.infer<typeof BalanceSchema>;
export const balance: Balance = BalanceSchema.parse(balanceJson);
```

`Progression` gets these extra keys:

```
diagonalStep: 1.45, combatMs: 30000, corpseProtectMs: 60000, corpseTtlMs: 600000,
regen: { hpBase: 1, hpPerLevels: 4, manaBase: 2, manaPerLevels: 3 },
block: { base: 0.5, skillDivisor: 20 },
potionJitter: { heal: 20, mana: 15 }, potionExhaustMs: 1000,
assistXpDivisor: 3, idleRegen: 2, fullMs: 1500000,
shrineHeal: { maxLevel: 6, hpFraction: 0.3 },
slots: { vault: 30, corpse: 12 }, stackMax: 100
```

**The ids stay in TypeScript and the numbers move to JSON.** `itemKinds`, `mobKinds` (new, replacing the `MobKind` string union), `spellIds`, `grounds`, `things` and `npcRoles` stay in `model.ts` as `as const` arrays. That keeps exhaustive `switch`, literal `ItemKind` types and the `Command` zod enums. As a result:
- Adding a new item or creature is a two-line code change (the id) plus a data change.
- Retuning an existing one is data only. For one developer that's the right trade.
- Typos in keys fail at parse time.

`Command`'s `z.enum(['mend','ember','renew'])` and `Monster.kind` switch to `z.enum(spellIds)` and `z.enum(mobKinds)`.

**Cross-ref checks** are a `superRefine` with errors that block a save:
- every loot item, merchant `sells`/`buys` entry and quest reward exists
- every `item.icon` key exists in `icons.json`
- `gold[0] <= gold[1]`
- equippable items have a `slot`

**Warnings** don't block a save. They come from a separate `lint(balance): Warning[]` (arbitrage and the rest of §3) so the studio can show them while still letting you save.

`icons.json` and `models.json` get schemas in the same file:

```ts
export const IconSchema = z.object({ palette: z.array(Hex).max(9), pixels: z.array(z.string().length(16)).length(16) })
  .refine(i => i.pixels.every(r => [...r].every(c => c === '.' || Number(c) - 1 < i.palette.length)));
// note: 1-based digit chars limit a palette to 9; switch to [0-9a-z] for up to 35 if needed
export const ModelSchema = z.object({
  kind: z.string(), height: z.number(),
  bones: z.record(z.string(), Vec3),
  parts: z.array(z.object({ bone: z.string(), color: Hex, size: Vec3, pos: Vec3 })),
}).refine(m => m.parts.every(p => p.bone === 'body' || p.bone in m.bones));
```

### 1.2 Formulas in one place: `packages/game/src/rules.ts`

This file is the core of keeping the simulator in sync. Every number-producing formula becomes a pure function of `(b: Balance, …inputs, rng)`:

```ts
export type Rng = (max: number) => number;    // Engine.random bound to the engine
export const xpAt = (b, l) => …;  export const level = (b, xp) => …;
export const maxHP = (b, l) => b.progression.hpBase + b.progression.hpPerLevel * (l - 1);   // maxMana, capacity likewise
export const skillFrom = (b, tries, base) => …;  export const magicFrom = (b, spent) => …;
export const meleeMax = (b, attack, melee, lvl) => Math.floor(attack * (b.progression.meleeWeaponScale + melee / b.progression.meleeSkillDivisor) + lvl * b.progression.meleeLevelBonus);
export const meleeHit = (max, mobArmor, rng: Rng) => Math.max(0, rng(max) - rng(mobArmor));
export const blockMax = (b, defense, shielding) => Math.floor(defense * (b.progression.block.base + shielding / b.progression.block.skillDivisor));
export const mobHit = (attack, blockRoll, armor, rng: Rng) => Math.max(0, rng(attack) - blockRoll - rng(armor));
export const spellPower = (s: Spell, lvl, magic, rng: Rng) => { const base = s.base + s.perLevel * lvl + s.perMagic * magic; return base + rng(s.spreadFlat + base * s.spreadFrac); };
export const regenAmounts = (b, lvl) => ({ hp: …, mana: … });
export const goldDrop = (c: Creature, rng: Rng) => c.gold[0] + rng(c.gold[1] - c.gold[0]);
```

The heal and ember branches in `cast()`, and the shrine heal limits, read from these functions and from spell data. The `id === 'renew' ? … : …` special case goes away.

`Engine` changes:
- Constructor becomes `constructor(map, state = emptyState(), readonly b: Balance = balance)`.
- All inline constants (`STEP`, `CORPSE_*`, `1500`, `2000`, `3000`, `0.08`, `30_000`, …) are read from `this.b`.
- `getDef(kind)` becomes `this.b.items[kind]`, and `mobDefs[k]` becomes `this.b.creatures[k]`.
- The loot loop becomes `for (const { item, chance } of def.loot)`.
- `createPlayer` builds the starter kit from `b.starter`.
- `talk`/quest code reads `b.merchants` and `b.quests.shells`. Dialogue strings move with merchants because they are already in balance.json. I'd rename the file section `merchants` to keep that, but it's fine as is.

Passing `Balance` explicitly instead of using a mutable singleton is what lets the simulator run unsaved draft numbers in a worker. It also lets tests build an engine with a tweaked balance in one line.

For compatibility, `model.ts` keeps thin re-exports during migration: `export const itemDefs = balance.items`, `maxHP = (l) => rules.maxHP(balance, l)`, and so on. The client (`main.ts`, `view.ts` use `getDef`, `spells`, `mobDefs`, `maxHP`, `level`) keeps compiling. Then migrate those callers and delete the shims in the same milestone (M0).

### 1.3 Parity check during migration

Before deleting the TS constants, add `tests/content.test.ts`:
- Assert that `balance.json` parses.
- Assert that every value matches the old constant. Copy the old objects into the test once, then delete them from the test after M0.
- Run the existing `tests/engine.test.ts` unchanged. It covers start kit, rat fight, trade, quest, mend, death and hatch. The data move must not need any test edit except the import path for `getDef`.
- Add one golden test: fixed seed, a scripted rat fight, and assert on the exact `p.xp`, `p.hp` and corpse contents. This catches formula drift during the move. It's cheap and deterministic because `state.rng` is seeded.

### 1.4 Hot reload into the running game

- **Server.** Change the script to `"dev:server": "tsx watch --include 'content/**' apps/server/src/index.ts"`. tsx follows the import graph, and `--include` makes JSON and PNG changes reliably trigger a restart. The world is restored from SQLite on boot.
  - **Verify:** the SIGTERM handler in `index.ts` persists state, but tsx's restart signal needs checking. Add `process.on('SIGINT', …)` with the same handler to be safe. Otherwise up to 2 s (20 ticks) of state can be lost on reload, which doesn't matter for a dev world.
  - Monsters restored with `hp` above a new lower max are harmless. Clamp `m.hp = Math.min(m.hp, b.creatures[m.kind].hp)` on boot.
- **Client.** Vite treats imported JSON as a module. A change to `content/balance.json` invalidates `content.ts` and its importers, and since no module accepts HMR, Vite does a full page reload. The client reconnects with its stored token. That costs a reload on every save, which is acceptable and needs no code.
- I'd skip in-process hot swapping on the server for now (`fs.watch` plus swapping `engine.b`). It works with the explicit-`b` design, but a restart is already a ~1 s loop and has no stale-state edge cases.

## 2. Sprites

### 2.1 Three ways to author art

| | Edit pixels directly in studio | Tune procedural generators (palette, noise params) | Import Aseprite/PNG |
|---|---|---|---|
| Gets to a hand-made look | Yes. This is how hand-made pixel art is made | No. Tuning noise weights still looks like noise. It can't place a deliberate highlight on a cobble or a readable plank knot | Yes, with better tools (layers, shading brushes, animation) |
| Build cost | Medium: one reusable indexed pixel canvas | Medium to high: every `case` in `groundTile` needs a param schema and UI. That's 11 grounds, 4 walls, 4 roofs, 2 planks, all with different algorithms | Low: PNG decode/encode and palette mapping |
| Fits existing data | icons.json is already a char grid | Generator code would have to be rewritten as data-driven anyway | Needs a PNG asset pipeline that doesn't exist yet |
| Long-term | Fine for 16×16 and 48×48 | A dead end once the art is hand-made | Best for anything bigger or animated |

**Recommendation:** do direct pixel editing plus PNG round-trip, and don't parametrise the generators. Use the generators once to **bake** their current output to PNG as a starting canvas, then delete them from the client. Aseprite support means plain PNG import/export: you save a PNG from Aseprite and the studio imports it. Parsing `.ase` files is out of scope.

### 2.2 Shared project palette

Add **`content/palette.json`** as a flat `string[]` of about 32–48 hex colors. To seed it, collect the distinct colors from icons.json and the baked textures, then cluster them down. Editors pick from it. A linter flags off-palette pixels as a warning, not an error.

A small shared palette is most of what makes pixel art read as hand-made and cohesive, and the studio can enforce it for free. Icons keep their per-icon `palette` arrays, but the editor fills them only from `palette.json` entries.

### 2.3 Icons (16×16)

- **Data:** `content/icons.json` as it is now.
- **Game:** `apps/client/src/icons.ts` drops the `art` rect-run table and does `import icons from '../../../content/icons.json'`, parsed with `IconSchema`. `icon(kind)` keeps its signature. It turns rows into horizontal runs (one `<rect>` per run of the same char) and returns the same crisp SVG. `main.ts` needs no changes.
- **Studio:** a grid of all icons drawn the way the HUD draws them (same `icon()` function and `style.css` slot background), each at 1×, 2× and the in-game size. The editor has:
  - pencil, fill, eyedropper and a mirror-X toggle
  - shift-drag line
  - undo/redo, as a stack of `pixels` arrays per session
  - palette from `palette.json`
  - export/import PNG for a single icon or a sheet. The sheet is an N×16 strip and is the Aseprite round-trip.
- This ships first because the data and loader are trivial, and it produces the pixel-canvas component the textures reuse.

### 2.4 Ground, wall and roof textures

- **Files:**
  - `content/art/ground/<kind>.png` at 48×48. One per `grounds` entry except `void`. The size is fixed by the `S = 48` atlas math in `groundAtlas` and the shader in `terrain.ts`.
  - `content/art/wall/<style>.png` at 16×32 for `plaster`, `stone`, `timber`, `rampart` and `cave`.
  - `content/art/roof/<kind>.png` at 16×16 for `slate`, `clay`, `thatch` and `teal`.
  - `content/art/plank/{light,dark}.png` at 16×16.
- **Bake:** an "M3 bootstrap" button in the studio runs the current `textures.ts` generators in the browser and POSTs the PNGs. It runs once; after that the generators are deleted.
- **Game load:** `textures.ts` keeps the `Pix` helper for `glowTexture` only and gets an `art.ts` loader:

  ```ts
  const files = import.meta.glob('/content/art/**/*.png', { eager: true, query: '?url', import: 'default' });
  export async function loadArt(): Promise<void>   // decode all to ImageBitmap once, store in a Map
  export function art(path: string): CanvasImageSource
  ```

  `groundAtlas()`, `wallTexture()`, `roofTexture()` and `plankTexture()` keep their signatures and build `CanvasTexture`/atlas from `art('ground/grass')` and so on, using the same `NearestFilter`, `SRGBColorSpace` and wrap settings as now. `main.ts` calls `await loadArt()` before constructing `WorldView`.
  - The glob path may need Vite `server.fs.allow` at the repo root. Vite's default workspace-root detection should already allow it; verify.
  - In production, Vite hashes and copies the PNGs automatically, so Electron is unaffected.
- **Hot reload:** a PNG write makes Vite reload the client. No server involvement, because textures are client-only.
- **Studio editor:** the same pixel canvas, plus things specific to textures:
  - **Tiling preview:** ground at 3×3 repeat. Seams across the 48 px edge are the main problem with hand-made ground tiles. Walls are shown as a 4-unit-wide, 2-unit-tall wall with the texture world-mapped.
  - **Neighbor preview:** grass next to dirt next to cobble, because transitions are what look procedural.
  - PNG import that maps to the nearest palette color, with a warning listing pixels that changed. Exact-match import is the default.

### 2.5 Voxel models

- **Data:** `content/models.json` as it is now: `{kind, height, bones, parts[]}`.
  - It is flattened per look, so the 8 humans each carry a full body. Changing the shared human silhouette means editing 8 models.
  - For M5 I'd add an optional template: `{ extends: 'humanBase', colors: { cloth, trim, skin, hair, … } }`, with base parts using `color: '$cloth'`. That brings back what the `looks` table did.
  - Don't do it before the editor exists. Keep it flat until then.
- **Game:** `actors.ts` gets `buildRig(model: Model): Rig`:
  - Create a `THREE.Group` per bone at `bones[name]`.
  - For each part, `part(boneGroup, color, ...size, ...pos)`.
  - `legs` are the bones matching `/^leg/`, and `arms` are `armL`/`armR`.

  `human(look)` and `creature(kind)` become one-liners around it. One gap: the sword and guard pole are currently children of `arms[1]`. Check that models.json put them under `armR`; it looks like it did, but verify with the parity test from §5. `corpseMesh` colors stay in code because they aren't part of the brief.
- **Studio:** a Three.js viewport with orbit controls, using the real `buildRig`:
  - a part list grouped by bone
  - number fields for size and pos with arrow-key nudge at 0.01 (shift for 0.05)
  - a color swatch from the palette
  - add, duplicate and delete part; mirror part across X
  - a walk-cycle toggle that reuses whatever animates `legs`/`arms` in `view.ts`
  - No transform gizmo.

### 2.6 Preview with the real lighting and post

Reuse `WorldView` as it is, fed with a diorama:
- `apps/studio/src/diorama.ts` exports `buildDiorama(opts): MapData`. It makes a 16×16 single-floor `MapData` with a strip of every ground kind, one `Building` whose `wall` and `roof` match the selected texture, a lamp, and spawn/NPC entries for the selected models. It fills `shrine`, `vault`, `links: {}` and `places: []` so nothing crashes.
- It also provides a fake `GameView` with `self` placed in the diorama. `view.update(fakeView)` runs every frame, so models stand there and the camera follows `self`.
- For live editing without saving, `art.ts` exposes `setArtOverride(path, source: CanvasImageSource)`. The studio calls it from the pixel editor, then rebuilds the floor through `WorldView.setFloor(0, {})`.
- Models go through the actor creation path. Add a `modelOverride` map, or a dispose-and-recreate of the actor.
- The only renderer changes are these data seams. Lighting, post shader and resolution stay untouched.
- Risk: `WorldView` builds the full floor and light rays in its constructor and may assume town-sized maps. If that gets awkward, the fallback is to extract `postFragment` and the sun/sky light rig into `render/look.ts` and build a lighter preview scene. Try the diorama first; it needs zero refactoring if it works.

## 3. Balance

### 3.1 Tables (instant, from `rules.ts` expected values)

`packages/game/src/balance-report.ts` is pure, so it is testable and also runs in Node for CLI use. It exports `report(b: Balance, scenario: Scenario): Report`.

```ts
type Scenario = { level: number; melee: number; shielding: number; magic: number;
                  gear: Partial<Record<EquipSlot, ItemKind>>; travelSec: number; huntersPerArea: 1 };
type CreatureRow = { creature: MobKind; maxHit: number; hitsToKill: number; ttkSec: number;
  dmgTakenPerKill: number; deathRiskApprox: boolean /* dmgTaken > maxHP */;
  downtimeSec: number /* dmgTaken / regen rate */; cycleSec: number /* ttk + downtime + travel */;
  respawnCapPerHour: number /* spawns of that kind × 3600 / (respawnMs/1000 + ttk) */;
  killsPerHour: number /* min(3600/cycle, cap) */; xpPerHour: number; goldPerHourGross: number;
  foodGoldPerHour: number; goldPerHourNet: number; hoursToNextLevel: number };
```

Computing it:
- **Hit distributions.** Use exact discrete expectations: `E[max(0, U[0..max] − U[0..armor])]` by double loop, which is cheap at these sizes. Mob hits are the same, with the block roll folded in.
- **Gold per kill.** This is `avg(gold) + Σ chance × bestSellPrice(item)`. `bestSellPrice` is the max `sell` among merchants whose `buys` contains the item, or 0. That makes "drops loot nobody buys" visible. Tonic and cheese drops are valued at the cheapest merchant `buy` price, as gold you don't need to spend, in a separate column.
- **Spawn counts** per kind come from `buildTown().spawns`.
- **Respawn note:** respawn is blocked while a player is within 6 tiles of `home` (`think()`), so `respawnCapPerHour` assumes the hunter rotates. The tooltip should say that.

**Economy tables:**
- **Shop table:** each item with buy, sell, buyer/seller merchants, attack/defense/armor per 100 gold, and **kills to afford** for each creature (`buy / goldPerKill`).
- **Gear ladder:** each weapon upgrade's Δ max hit, Δ TTK on beetle/grub/boar, and price. This shows whether hatchet → blade is worth 220 gold.
- **Level table:** levels 1–15 with `xpAt`, maxHP, mana, cap, regen per minute, and the death xp loss in xp and in minutes of farming the best creature at that level.

**Warnings** come from `lint(b)` and appear as a badge in the studio nav:
- **Arbitrage:** for each item, `max(sell over merchants that buy it) ≥ min(buy over merchants that sell it)`. This is an error-level warning. Also flag `sell > 0.5 × buy` on resellable gear (a soft threshold that can be edited inline).
- An item with `sell > 0` that no merchant buys, and a merchant that sells an item with `buy == 0`.
- A creature where `dmgTakenPerKill > maxHP` at the level its area is designed for. Each creature gets an optional `designLevel` field, so a level-1 grub would be flagged.
- A spell unlock level above the level that 1 hour of best-hunting reaches. This is advisory only.
- A loot `chance` sum above 3, as a sanity check.

### 3.2 Fight simulation (real engine, headless, in a worker)

`packages/game/src/sim.ts`:

```ts
export function arenaMap(mob: MobKind): MapData   // 7×7 floor, ground everywhere, no things, one spawn at (3,3), shrine at (0,0)
export function simulateFight(b: Balance, s: Scenario, mob: MobKind, trials: number, seed: number): {
  ttk: Stats; dmgTaken: Stats; deathRate: number; hits: Stats; misses: number; blocked: number; skillGain: { melee: number; shielding: number } }
// Stats = { mean, p10, p50, p90 }
```

Each trial does:

```ts
const e = new Engine(arenaMap(mob), { ...emptyState(), rng: seed + i }, b);
const p = e.createPlayer('Sim');
```

Then it sets level/skills by assigning `p.xp = xpAt(b, s.level)` and `p.melee` to the tries for skill N (inverse of `skillFrom`, a new small helper in `rules.ts`). It equips `s.gear` with `e.add(kind, 'equip:'+p.id, equipSlots.indexOf(slot))` after removing the starter items, puts the player adjacent to the mob, and runs `e.action(p, { kind: 'target', id })`. It then loops `e.tick(100)` until the mob corpse appears, the player dies (`p.deaths` increments), or 5 minutes pass.

It reads the outcome from `p.hp` and `e.effects`, which already records `'hit' | 'miss' | 'block'`. Notices are ignored. The arena has no walls, so the creature cannot leash: the `distance(h, m.home) < 14` check always passes.

Cost: about 300 ticks per fight × 500 trials, with the Engine's `Object.values` scans over 1 player and 1 mob. That's tens of milliseconds, so run it in a **Web Worker** (`apps/studio/src/sim.worker.ts`) to keep the editor responsive. The worker gets the **draft** balance from the editor, so you can see the effect of a number before saving. The same function runs from Node: `npx tsx tools/sim.ts beetle --level 3 --gear shortsword,buckler` prints the table. `tools/**` is already in `tsconfig.json`'s include.

Optional "hunt" mode, later: chain fights with real regen ticks between them (keep ticking while `hp < maxHP*0.8`) and eat when `fed` runs low. That measures xp/hour and gold/hour with the real regen and food code instead of the analytic downtime.

### 3.3 Keeping the simulator in sync with the engine

1. **The simulator is the engine.** `simulateFight` calls `new Engine(…).tick()`. There's no copy of the combat loop to drift.
2. **The analytic tables call the same `rules.ts` functions** that `Engine.tick`, `think`, `cast` and `dead` call. Formulas have one definition.
3. **A test pins them together.** `tests/balance.test.ts` asserts that for each creature × {starter, shortsword+buckler, hatchet+banded} × level {1, 5}, the analytic `ttkSec` is within ±15 % of `simulateFight(...).ttk.mean` over 300 trials with a fixed seed.

    The tolerance is there because the analytic model ignores skill growth during the fight and the attack-timer phase. If someone later inlines a formula in `engine.ts` and stops calling `rules.ts`, this test fails.
4. A lint rule by convention: `engine.ts` contains no numeric literals besides 0, 1 and 100 (tick). `grep -nE '[^.\w][2-9][0-9]{2,}' packages/game/src/engine.ts` in the test file is a crude but effective guard. It's optional.

## 4. App structure

```
apps/studio/
  package.json            {"name":"@lanternfall/studio","private":true,"type":"module"}
  index.html
  vite.config.ts          root = apps/studio, port 4174 strictPort, host 127.0.0.1, plugins: [contentApi()]
  vite/content-api.ts     the read/write middleware (runs in Vite's Node process)
  src/main.ts             nav: Balance · Simulate · Icons · Textures · Models; hash routing
  src/store.ts            loads files, holds drafts + dirty flags, save(), per-file undo
  src/pixel/canvas.ts     indexed-pixel editor component (shared by icons and textures)
  src/pixel/png.ts        decode/encode via canvas.toBlob / createImageBitmap, palette mapping
  src/balance/tables.ts   renders report(b, scenario) into <table>s, inline edit cells
  src/balance/sim.worker.ts
  src/models/editor.ts
  src/preview/diorama.ts  buildDiorama() + fake GameView, hosts WorldView
  src/style.css           reuse the client's tokens (Inter + Silkscreen), plain CSS
```

- **Script:** `"studio": "vite --config apps/studio/vite.config.ts"`. You can also run it alongside the game with `concurrently` as `dev:all`, but keep `studio` standalone. It doesn't need the game server running.
- **UI stack:** vanilla TS with template strings and event delegation, matching `apps/client/src/main.ts`. The studio is a few tables and two canvases, so that needs no framework. If forms get painful, Preact (3 kB) is the only addition I'd accept. No component library.
- **Read/write API.** `vite/content-api.ts` is a `Plugin` with `configureServer(server) { server.middlewares.use('/api', handler) }`:
  - `GET /api/content/:name` for `name ∈ {balance, icons, models, palette}` returns `{ data, hash }`, where `hash` is sha256 of the file bytes.
  - `PUT /api/content/:name` takes the body `{ data, baseHash }`:
    1. Look up the schema with a fixed map, `{ balance: BalanceSchema, … }`, imported from `packages/game/src/content.ts`. Vite's SSR loader handles the TS import through `server.ssrLoadModule`, so schema edits are picked up without a restart.
    2. Validate with `safeParse`. On failure return 422 with the zod issues, which the UI shows next to the field path.
    3. Check cross-file refs, e.g. item icons exist in the current icons file.
    4. If the hash of the file on disk is not `baseHash`, return 409. This covers an edit by hand or by another tab; the UI offers reload or overwrite.
    5. Serialize with `JSON.stringify(data, null, 2) + '\n'`, keeping the schema's key order so diffs stay stable. Icon `pixels` rows stay one per line.
    6. Write `<file>.tmp`, `fsync`, then `rename` over the target. This is atomic on the same filesystem.
    7. Copy the previous version to `.local/studio-backups/<name>-<ISO>.json` and keep the last 30. `.local/` is already the untracked local directory.
    8. Return the new hash.
  - `PUT /api/art/*path.png` takes a raw `image/png` body:
    - Resolve the path and require it to stay under `content/art/` (no `..`, no absolute paths).
    - Require the category directory to be one of `ground|wall|roof|plank`.
    - Decode the size from the PNG IHDR bytes 16–23 and require it to match the category: 48×48, 16×32, 16×16 or 16×16. No image library is needed.
    - Write atomically and back up the same way.
  - The server binds to 127.0.0.1 only. There's no auth because it is local-only.
- **Vite reload inside the studio.** The studio fetches files through the API instead of importing them, so a save doesn't reload the studio page. It does import `packages/game` code (rules, engine, sim, schemas) and the client's `render/*` and `icons.ts`. Edits to those reload the studio, which is what you want.
- **How the game consumes studio output:** the studio writes `content/*.json` and `content/art/**`. The game's normal `npm run dev` restarts the server (tsx `--include content/**`) and reloads the client (Vite). The game never talks to the studio.

## 5. Milestones (each one ships alone)

**M0. The game reads content files (no studio).**
- Add `content.ts` schemas, `rules.ts` and the missing progression keys in balance.json.
- Make the spell `spread` split and pass `Engine(map, state, b)`.
- Migrate `model.ts` callers, then delete `itemDefs`, `mobDefs`, `spells` literals, `npcDefs`, `shellTask` and the inline engine constants.
- Add `tsx watch --include content/**`.
- Add `tests/content.test.ts` (parity plus the golden rat fight).
- **Ship check:** `npm test` passes unchanged. Editing a number in balance.json by hand changes the running game after an automatic restart and reload.

**M1. Studio shell and balance tables.**
- `apps/studio`, `npm run studio`, `content-api` (GET/PUT, validation, atomic write, backups, 409).
- Balance page: editable items, creatures, spells and progression tables with derived columns from `report()`, a scenario picker (level, skills, gear), the warnings badge, and save.
- **Ship check:** change the beetle's hp in the studio, see TTK and xp/hour update, save, and the game picks it up.

**M2. Pixel canvas and icons.**
- `pixel/canvas.ts`, `palette.json` (seeded from existing colors).
- Icons page with HUD-accurate preview and PNG sheet import/export.
- `icons.ts` reads `icons.json` (delete the `art` table).
- **Ship check:** redraw the sword icon, save, and it shows up in the game's hotbar and trade list.

**M3. Textures as PNG plus the game-look preview.**
- One-time bake of the generators to `content/art/**`, fixing the `#724fS` typo.
- `art.ts` loader with `await loadArt()` in `main.ts`, and textures.ts generators deleted.
- Texture editor with 3×3 tiling and neighbor preview, PNG import with palette mapping.
- Diorama preview using `WorldView` and `setArtOverride`.
- **Ship check:** the game looks identical right after the bake (screenshot-compare one frame). After that, a hand-painted cobble tile appears in the game.

**M4. Fight simulator.**
- `sim.ts`, a worker in the studio "Simulate" page (distributions as small inline SVG histograms, no chart library), and the `tools/sim.ts` CLI.
- `tests/balance.test.ts` analytic-vs-engine agreement.
- **Ship check:** the sim reports how often a level-1 player with a cudgel dies to a grub, and the analytic table agrees within tolerance.

**M5. Model editor.**
- `buildRig(model)` in `actors.ts`, used by `human()`/`creature()`. Parity: one screenshot of each look before and after.
- Studio model page with part list, numeric edits, palette colors, mirror, and the walk-cycle toggle in the diorama.
- Optional `extends` and `colors` templates for the humans.
- **Ship check:** recolor the guard and lengthen the boar's tusks in the studio, and they show up in the game.

Order rationale: M0 is the base for everything. M1 gives the quickest real value: the numbers in §0 show balance problems the owner can't see today. M2 and M3 push the art toward hand-made, with M3 as the biggest visual lever because ground and walls cover most of the screen. The simulator refines what the tables already show approximately, and models come last because they already work and are the most UI work for the least visual change.

## 6. What to leave out

- Parametric UIs for the procedural texture generators. Bake once and delete instead.
- `.ase`/`.aseprite` file parsing (PNG round-trip only) and any layers or animation timeline.
- Billboard or sprite-sheet characters to replace voxel rigs. That's a renderer change, and the renderer is frozen.
- Prop models (tree, lamp, well, …) in `terrain.ts`, `corpseMesh`, light rays, the post shader and lighting parameters. They aren't in the brief and they're renderer work.
- A map or town editor (`town.ts`), and a dialogue tree editor. Merchant greetings and topics can be edited as plain text fields in the balance page because they already live in balance.json, but nothing beyond that.
- Adding new item, creature or spell **ids** from the studio. That stays a code change (§1.1).
- In-process hot swap of balance in the running server (the restart is enough), and any WebSocket or IPC between the studio and the game.
- Electron packaging of the studio, auth, multi-user, undo history that survives a reload (backups cover recovery), and git integration.
- An auto-balancer or optimizer, spreadsheet import/export, and a charting library.
- A transform gizmo in the model editor (number fields and nudge keys only).
- Database or world-state editing tools. If balance changes leave a weird world, delete `.local/lanternfall.sqlite`.

## Top 5 recommendations

1. **Pass a `Balance` object into `Engine` and put every formula in `packages/game/src/rules.ts`.** The engine, the analytic tables and the simulator then share one definition per formula, and a test holds the analytic tables and the real engine within 15 % of each other.
2. **Run the fight simulator on the real `Engine` in a 7×7 arena map inside a Web Worker,** fed the unsaved draft balance. That gives zero formula duplication and instant feedback.
3. **For hand-made art, bake the procedural textures to PNG once and edit pixels from there, with a shared `content/palette.json`.** Don't build tuning UIs for the noise generators. Use PNG round-trip for Aseprite.
4. **Studio writes go through a Vite middleware:** zod validation with the game's own schemas, hash-based conflict check, atomic tmp+rename, and backups in `.local/studio-backups`. The game picks up changes through `tsx watch --include content/**` and Vite reload, with no coupling between the studio and the game.
5. **Ship in this order:** M0 data move (tests unchanged plus a golden fight), M1 balance tables with downtime and food upkeep, M2 icons, M3 textures plus a diorama preview that reuses `WorldView`, M4 simulator, M5 models. The tables already show that a level-1 player with a cudgel loses to a grub and that regen downtime dominates xp/hour, which is the strongest reason to put balance tables first.
