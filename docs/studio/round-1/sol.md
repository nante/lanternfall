# Lanternfall Studio: round 1 independent plan — Sol

Build a local Vite app in `apps/studio`, with shared validated content and the existing game engine behind it. Prioritize a trustworthy edit → save → see-in-game loop, hand-painted texture import, and useful balance comparisons. Keep the box-rig renderer; making a sprite-sheet character renderer is a separate art-direction decision.

This is a read-only planning report, prepared from `docs/studio/BRIEF.md` and the requested implementation files on 2026-11-09. No implementation is included. Paths below are relative to `~/Personal/game`; new paths and function signatures are proposals.

## 1. What the implementation establishes

- `packages/game/src/model.ts` owns 22 item IDs, four creature IDs, three spells, six NPC roles, progression helpers, state/command Zod schemas, and merchant/quest constants. Ground and thing array order is a numeric protocol: `G`/`T`, map typed arrays, and even the ground shader's water index depend on it.
- `packages/game/src/engine.ts` imports the defaults directly. Its `Engine(map, state = emptyState())`, `createPlayer`, `action`, `tick`, `stats`, `cast`, `dead`, and `kill` already run without Three.js, Colyseus, SQLite, or the DOM. `Geography` in `world.ts` is equally portable. This is the simulator's implementation, not merely a source of formulas to copy.
- `content/balance.json` already captures most tunable values, including constants currently in `engine.ts`. Its loot objects differ structurally from `mobDefs`' tuple entries. Its spell `spread` is a fraction for healing but an absolute random maximum for Ember. Neither distinction should disappear accidentally during migration.
- `content/icons.json` contains 27 icons. I independently rasterized the existing SVG rect runs and compared every pixel with the JSON: all 27 match. The encoding is **one-based** palette indices (`1` is `palette[0]`); `.` means transparent. There is no `0` pixel today.
- `content/models.json` contains eight human appearances and four creatures. Parts refer to an implicit `body` or a named bone. Grub coordinates/sizes have been rounded: the first segment's live size is derived from `0.36 - abs(0 - 1.5) * 0.05`, while JSON stores `0.285`; its live Y is that size × `0.42`, while JSON stores `0.12`. Treat the export as a starting point requiring geometry/visual parity review, not a proven bit-identical serialization.
- `textures.ts` makes 48×48 ground images, 16×32 walls, 16×16 roofs and prop planks. `terrain.ts` packs ground images in `grounds` order, samples them at 24 pixels/world tile with a two-tile repeat, and world-projects walls. Water shading replaces the sampled color in GLSL, so a painted water image currently would have little visible effect. Grass blades, foliage and many prop colors also live outside the texture generators.
- `view.ts` provides the actual low-resolution target, pixel-snapped orthographic camera, lighting, shadows, split-tone post shader and animation. It scales human rigs by `1.25`, creatures by `1.15`, and interpolates movement with another hard-coded 300 ms step. Studio previews must include those factors.
- `main.ts` computes progression and shop UI locally. Its hotbar caches icons by ID; updating icon pixels under the same ID will not refresh those nodes automatically. It also hard-codes the five-shell quest text. `WorldView` caches existing rigs and floors.
- The server persists every accepted action and about every two seconds of active ticking. `tsx watch` restarts the process; it does not replace an engine's rules live. `Net` currently shows the join gate on unexpected disconnect and has no automatic reconnect. Electron loads `dist/client/index.html` from disk.

These details make content migration and reload semantics the first deliverable. An attractive editor that writes unused JSON would not satisfy the request.

## 2. Shared content and type safety

### Keep stable IDs in TypeScript; move editable values to JSON

Create the following small modules:

| Proposed file | Responsibility |
| --- | --- |
| `packages/game/src/ids.ts` | Extract `grounds`, `things`, `equipSlots`, `itemKinds`, new `mobKinds`, `spellIds`, `npcRoles` and their unions. No content imports. Preserve array order. |
| `packages/game/src/content-schema.ts` | Browser-safe `BalanceSchema`, `IconsSchema`, `ModelsSchema`, their inferred types and cross-reference validation. No filesystem access. |
| `packages/game/src/default-balance.ts` | Import `../../../content/balance.json`, parse once, export `defaultBalance`. |
| `packages/game/src/rules.ts` | `createRules(balance: Balance)` returning progression helpers and access to definitions for one immutable balance snapshot. |
| `apps/client/src/render/art.ts` | Parse default icons/models, later texture manifest; construct an `ArtContent` value that can also come from studio drafts. |
| `tools/check-content.ts` | Parse/check the complete files and print field-path errors. Runs without server or database. |

`model.ts` remains the state/command/types module and re-exports the existing named definition/helper API backed by `defaultRules = createRules(defaultBalance)`. Existing client imports can migrate incrementally. Remove the original constant tables when their callers have moved; never keep two editable value sources.

Do not make item, spell or creature IDs arbitrary strings in v1. Code currently has explicit spell actions, map spawns and animation kinds; saved inventories also reference item IDs. The studio edits values for existing IDs. Adding or renaming a gameplay ID remains a code change. Decorative icon IDs can be extensible, with required existing UI/item/spell references checked at runtime. No code generator is needed.

In `tsconfig.json`, add `resolveJsonModule: true`. Use supported ESM JSON imports, e.g. `import raw from '../../../content/balance.json' with { type: 'json' };`, and verify the installed TypeScript/tsx/Vite combination with typecheck, tests and a client build. The JSON is bundled into the client build; Electron must not depend on a development-only content HTTP endpoint.

### Schema contracts

Infer `Balance`, `ItemDef`, `CreatureDef`, `SpellDef`, `IconDef` and `ModelDef` from Zod schemas. Treat filesystem/network inputs as `unknown` until parsed. Use strict object schemas to catch misspelled fields rather than stripping them silently. Zod supports exhaustive enum-keyed records and partial enum records, which fit fixed definition tables and partial starter equipment respectively ([official Zod API](https://zod.dev/api#records)).

Illustrative core shapes, preserving the current on-disk layout:

```ts
const ItemId = z.enum(itemKinds);
const MobId = z.enum(mobKinds);
const Slot = z.enum(equipSlots);
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
const Size3 = z.tuple([
  z.number().positive(), z.number().positive(), z.number().positive(),
]);

const LootEntry = z.strictObject({
  item: ItemId,
  chance: z.number().min(0).max(1),
});
// items: z.record(ItemId, ItemDefSchema)
// creatures: z.record(MobId, CreatureDefSchema)
// merchants: z.record(z.enum(npcRoles), MerchantSchema)
// starter.equipment: z.partialRecord(Slot, ItemId)
// spells: z.strictObject({ mend: HealSpell, ember: AttackSpell, renew: HealSpell })
```

The full contracts should enforce:

- **Progression:** finite values; positive integer HP/mana/capacity bases and nonnegative increments; positive integer intervals; positive melee/shield/magic bases and divisors; growth factors greater than one; loss fractions in `[0,1]`. Keep `xpCurve: [a,b,c]` and the exact existing formula `floor((a*n³+b*n²+c*n)/3)`, `n = level - 1`. Reject a non-increasing curve: with positive cubic coefficient, validate the quadratic consecutive-level difference at its integer minimum for `n >= 0` and require a difference of at least one before flooring. This prevents `level()` from looping forever on a broken curve. Keep a bounded studio level input regardless.
- **Items:** required name/icon/weight/buy/sell, nonnegative prices and weights, integer attack/defense/armor, optional `slot`, `slots`, `stack`, `food`, `heal`, `mana`. Require positive container slots and usable weapon/shield stats where applicable; verify starter equipment matches each slot. Keep current `stackMax = 100` as a protocol limit initially; validate starter counts and maximum creature gold against it. Validate loot plus coins fits the current 12-slot corpse capacity. Do not expose container limits beyond the command/UI limits.
- **Creatures:** positive integer HP, nonnegative integer attack/armor/XP, ordered integer `gold: [min,max]`, positive `step`, nonnegative aggro, `LootEntry[]`. Loot entries are independent Bernoulli rolls, **not** a weighted choice; their probabilities need not sum to one. Warn on duplicate item entries.
- **Spells:** `mend`/`renew` retain `kind: 'heal'`; `ember` retains `kind: 'attack'` and required positive range. Fields are `words/name/mana/level/cooldown/base/perLevel/perMagic/spread`. Spell words must be nonempty, normalized and unique. Document fractional healing spread versus absolute attack spread, or rename to explicit fields in a later deliberate schema revision. Do not reinterpret `0.25` as 0.25 HP or `12` as 1200%.
- **Merchants/quests/starter:** all items resolve; lists are duplicate-free; `quests.shells.item`, `.need`, `.reward`, `.gold` are used by the engine, not just displayed in an editor. Starter must contain an equipped pack and a valid fitting pack payload. A sell price above buy is a warning, not invalid JSON: loot-only items deliberately have `buy: 0` and positive sell prices.
- **Icons:** `{ [name]: { palette: '#rrggbb'[], pixels: string[16] } }`; exactly 16 rows of 16 characters. Start with alphabet `123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ`, at most 35 colors, plus `.` transparent. Validate every character against the palette length. Retain required `bag`, `person`, `menu`, item icon names and spell icon IDs. Escape accessible labels when producing SVG.
- **Models:** `{ [name]: { kind, height, bones: Record<string, Vec3>, parts: {bone,color,size,pos}[] } }`. Required names are the eight existing looks plus all creature IDs. Human `kind` is `human`; creature kind must match its ID. Positive bounded height/sizes, finite bounded positions and reasonable part-count limits. `body` is implicit, not an entry to create under itself. Every part bone must exist or be `body`. Humans require `legL/legR/armL/armR`; creatures retain their supported ordered `leg0…` bones, including no legs for the grub. Avoid editable skeleton topology in v1.

Expose `validateContent({balance, icons, models, textures?})` for cross-file checks. Game server needs only balance checks; the build/content-check and studio validate the whole set. Distinguish hard errors (broken references, invalid numerics) from warnings (arbitrage, stale dialogue mentioning prices, impossible fights). Preserve explicit current shapes; do not wrap all three files in a new database/export format. A content schema version can be introduced with the first incompatible format change; it is separate from `GameState.version: 2`.

### Engine wiring: one rules snapshot per instance

Change the constructor to:

```ts
constructor(
  readonly map: MapData,
  public state: State = emptyState(),
  readonly rules: Rules = defaultRules,
) { /* existing Geography/seed behavior */ }
```

The server and existing tests keep `new Engine(map, restoredState)`. Studio uses `new Engine(fixtureMap, fixtureState, createRules(validatedDraft))`. Two engines with different balance drafts can then run together without mutating module globals.

`createRules()` supplies `getDef`, item/creature/spell/merchant tables, `xpAt`, `level`, `maxHP`, `maxMana`, `capacity`, `skillFrom`, `magicFrom`, quest/starter data and `progression`. Keep formulas as executable code. Replace **all** engine imports of default balance functions/tables with `this.rules` accesses, including seeding, inventory capacity/weight checks, NPC talk, trading, XP, skills, spells, loot, death and respawn. A simulator can otherwise silently use its draft for attacks but defaults for healing or prices.

Consume `balance.creatures[kind].loot` directly as `{item,chance}` in `dead()`; a temporary public `mobDefs` compatibility adapter may expose tuples if needed, but remove it when callers migrate. Keep spell typing discriminated and explicit so `spells.ember.range` is statically present. `Item`, `Monster`, and `Command` use the ID tuples, preserving runtime validation and exhaustive action handling.

Wire every existing `balance.progression` field: the 300/1500/2000/3000/45000 ms constants, both loss fractions, melee factors, all progression coefficients, both skill bases, and magic growth. Give `skillFrom(tries, base = configuredMeleeBase, rate = configuredGrowth)` its existing call shape; replace the client's explicit `30` shielding base with a named rules helper/configured base. Make `WorldView` interpolation use configured `stepMs`. Use `quests.shells.item` instead of literal `'shell'`; derive quest reward text and the client's five-shell description from the data. Iterate the configured starter slots in `equipSlots` order and pack entries in array order.

For remaining tuning that affects the requested comparisons, add only a few explicit groups with current defaults: shield scaling (`0.5`, divisor `20`), unarmed attack (`3`), regeneration amounts/divisors (`1`, `4`, `2`, `3`), potion random spreads (`20`, `15`) and cooldown (`1000`), and starter food time (`120000`). Keep potion exhaustion offset (`500`) consistent with that cooldown. Corpse lifetimes, chase/pathing algorithms and presentation timings can stay code constants for this scope; list them as fixed assumptions. No embedded JavaScript formulas or generic expression editor.

### Art consumers

- Replace the `art` rect-run table in `icons.ts` with `iconSvg(def, label?)`, keeping `icon(kind,label?)` as the game wrapper. Emit same-color runs from the JSON pixels. Studio calls the pure renderer with its draft; it must not modify a shared singleton.
- Add `buildRig(def: ModelDef): Rig` in `actors.ts`. Create root/body, bone groups positioned from `bones`, then box meshes scaled/positioned from `parts`. Build `legs` and `arms` in explicit left/right or numeric order, not alphabetical or accidental object order. Preserve Lambert materials and shadow flags. Keep `human(name)`/`creature(kind)` wrappers so callers stay simple.
- Existing corpse meshes can remain procedural and read-only; they are not represented in `models.json`. Keep the current sword/pack parts already exported with the human rather than adding them a second time in wrappers. Validate visual bounds as well as the manually supplied label height.

## 3. Reloading the running game

Use an explicit first-version contract: **Save applies to files; balance save restarts the dev server, art save reloads the dev client. Unsaved edits affect studio previews/simulations only.** Do not promise a seamless balance swap in an ongoing multiplayer fight.

1. Import balance JSON through `default-balance.ts`; use `tsx watch --include content/balance.json apps/server/src/index.ts` for an explicit dependency. Installed `tsx watch --help` confirms `--include`; its official documentation describes dependency-triggered reruns ([tsx watch documentation](https://raw.githubusercontent.com/privatenumber/tsx/master/docs/watch-mode.md)). Do not watch all `content/*` on the server: painting an icon should not disconnect players.
2. Add a small read-only content watcher plugin to the client Vite config. Watch balance/icons/models and, later, referenced texture files. On a valid saved change issue one full reload (coalescing an atomic replacement's events); validate malformed external edits and show errors rather than accepting them. Default JSON imports must be invalidated so reload cannot serve cached old content. Vite supports a full-reload event or custom HMR events through its plugin hook ([Vite plugin HMR API](https://vite.dev/guide/api-plugin.html#handlehotupdate)).
3. A full reload intentionally rebuilds cached floors and rigs and clears `main.ts`'s icon markup caches. Keep drafts/undo history in the studio during its own content events; do not let a save reload the entire studio and erase unsaved work in another tab.
4. On server restart retain tokens in localStorage and initially use the existing Continue flow after `/health` returns. Add a short bounded dev-only reconnect using the stored token when applying balance, rather than an infinite loop that masks startup errors. Keep fencing and sequence/epoch reset in `Net.join()` intact.
5. Handle both development signals (`SIGTERM` and the watcher interruption path, ordinarily `SIGINT`) with one guarded shutdown that persists the current state and closes SQLite. Current code only handles `SIGTERM`; verify an actual watch restart before claiming no tick loss. Do not change or clear `.local/lanternfall.sqlite` from the studio.
6. Add a hash of validated/canonical balance content to `/health` and `welcome`; inject the matching client hash at Vite dev/build time. Surface a mismatch rather than showing client-derived values from different rules. Label studio save status as written/applied only when the running server reports the expected hash; if the game is absent, report written, game not running.
7. On restoration, preserve entity state: item IDs, HP, XP, counters and cooldown timestamps are not replaced by definition edits. Clamp hero HP/mana and monster HP downward to new maxima, never heal everything or reset cooldowns. Changed monster max HP fills fully on its next normal spawn. Quest rewards already earned and starter kits already received do not retroactively change. Changing the XP curve reinterprets existing XP; show that consequence in the edit UI. ID deletion is out of scope.

A later targeted art refresh may replace a rig, atlas texture or icon markup without leaving town. It must invalidate all consumers and dispose owned GPU resources. The full-reload path should ship first. Built/Electron clients receive saved content on the next `npm run build`; v1 has no production runtime content service.

## 4. Art workflow: choose painting/import over more noise sliders

“Sprites” presently means three different representations. Present Icons, Textures, and Models separately, with thumbnails and a common raw/game-look preview.

| Approach | Icons, 16×16 | Ground/wall/roof textures | Characters/creatures | Recommendation |
| --- | --- | --- | --- | --- |
| Direct studio pixel painting | Small, useful pencil/erase/eyedropper and palette editor; one stroke per undo step | Reusable pixel grid is possible later; needs seam preview and larger canvas navigation | Cannot directly repaint a box rig into a directional sprite | Build a minimal icon painter; avoid a full painting suite. |
| Procedural parameter editing | Existing icons are fixed pixel runs, not noise generators | Palette, density, seed, blade length, mortar/seam controls preserve fast variations; random noise can still dominate clusters | Box sizes/pivots/colors are useful silhouette controls; these are model parameters, not pixel painting | Secondary convenience; do not make procedural tuning the only path to a handmade look. |
| Aseprite/PNG import | Mature drawing workflow; convert an exported PNG to the indexed JSON grid | Best early route to deliberate clusters, irregular edges and restrained detail | PNG cannot replace the current rig without an atlas/UV or billboard system | Prioritize static PNG import and external Aseprite export. Keep voxel models for now. |

The owner wants a handmade look. Imported, intentionally drawn **world textures** will change the world more than spending the first week on inventory icon tools. Reduce random speckle; use intentional pixel clusters, a small coherent palette and controlled material detail. Verify at the game's actual zoom and lighting, because downsampling/postprocessing can hide or overwhelm individual source pixels. Do not bake strong orange highlights into every asset: the game already supplies warm light and cool shadows.

### Icons

Load the existing JSON into a checkerboard canvas at integer zoom, with 1×/2× actual-size swatches. Support pencil, erase, pick color, edit a palette entry, undo/redo and PNG import/export. A 16×16 icon needs neither layers nor animation tools. Palette edits must preserve index meaning; deleting a used color needs explicit remapping.

Import PNG in the browser via decoded pixels; require exact 16×16, preserve transparent pixels, reject partial alpha initially, and build a deterministic first-appearance palette. If more than 35 colors exist, show a useful error and let the artist reduce the palette externally; never silently quantize or scale. PNG export has exact source pixels, no preview lighting or enlargement baked in. The authoritative runtime icon remains `icons.json`; imported PNG is a conversion input, not a second active definition.

Do not parse `.aseprite` binaries in the app. The artist can export PNG from Aseprite; an optional later task can run `aseprite -b source.aseprite --save-as output.png`. Aseprite also supports PNG sheets and JSON metadata if animation becomes a real requirement ([official Aseprite CLI](https://www.aseprite.org/docs/cli/)). Its installation is optional and should not prevent `npm run studio` from working. Preserve `.aseprite` source manually under `art/source/` if desired; the browser tool does not write arbitrary source paths.

### Textures and asset delivery

Add a small `content/textures.json` manifest when the first imported texture ships. Example **proposed** entry shapes:

```json
{
  "ground": {
    "grass": { "source": "png", "file": "ground/grass-a1b2c3.png" },
    "meadow": { "source": "generated" }
  },
  "wall": { "stone": { "source": "generated" } },
  "roof": { "slate": { "source": "generated" } },
  "prop": { "plank": { "source": "generated" } }
}
```

Require all supported slots in the actual manifest (the example is abbreviated): ground kinds; wall `plaster/stone/timber/rampart/cave`; roof `slate/clay/thatch/teal`; prop `plank/darkPlank`. `source: 'generated'` selects current defaults. Later permit a narrow per-family `params` object (seed/palette/detail density), not a generic node graph.

Store imported PNGs under `apps/client/public/art/textures/<relative file>`. Vite copies these into the client build; choose `import.meta.env.BASE_URL + 'art/textures/' + file` so `base: './'` and Electron file loading continue to work. Studio exposes that exact allowlisted asset subtree through its local middleware, not a duplicate copy. Use content-hashed filenames, then save the manifest last: a partial import leaves an unused image, never a manifest pointing to a half-written image. Do not automatically garbage-collect old assets in v1.

Refactor `textures.ts` into `loadTextureSources(manifest)` and the existing generation functions. Await decoded PNGs before building `WorldView`/floors. Pass a texture source set into `groundAtlas`, `wallTexture`, `roofTexture`, `plankTexture` and `buildFloor`; use the same path for game and studio. Ground PNGs remain 48×48 and are copied into their existing atlas slot; wall PNGs remain 16×32; roofs/prop planks 16×16. Reject mismatches, with explicit external resize guidance. Require opaque terrain textures initially; transparency is meaningful for icons, not missing wall geometry.

Set nearest min/mag filtering, no mipmaps, sRGB color space and the existing wrap modes, matching `Pix.texture()`; the ground atlas clamps, walls/roofs repeat. New images still pass through `groundMaterial`, `worldMapped`, Lambert shading and the shared post shader. Three.js documents texture properties and replacement/disposal constraints ([Texture documentation](https://threejs.org/docs/pages/Texture.html)). Use a repeated 3×3 swatch for seams, a real two-world-tile ground patch, and perpendicular wall faces to expose orientation errors. Painted water remains unsupported while its GLSL override is active; explain that in the selected asset panel instead of offering a nonfunctional control.

Keep generated fallback for slots deliberately marked generated. If a PNG-marked file fails to load, show an error; do not silently pretend a default generator is the imported result. The current plank palette contains malformed `'#724fS'`; surface this as a separate existing issue during palette extraction rather than quietly mixing an art change into the parity migration.

### Models

First provide a part list with bone, color, size and position numeric controls; allow duplicate/delete/add box after basic editing is reliable. Keep supported bone names and the current animation logic. Snap **edits** to an optional small world grid; do not quantize the entire imported file on save. Show human/creature scale and ground contact; preserve exact pivots.

Reuse the game's limb order and animation in idle/walk/swing preview. If needed, extract the existing animation block from `WorldView.frame()` into `animateRig(rig, pose)` used by both game and studio. Color group editing can use matching colors without introducing a second redundant `looks` palette source. More box controls improve silhouette and cohesion; they cannot supply authored directional pixel art. Defer `.vox`, GLTF, per-face UV painting and 2D billboard character sheets until the owner deliberately chooses a different actor representation.

## 5. Balance tables and the simulator

### Start with explicit assumptions and derived columns

Use ordinary sortable/filterable HTML tables: Items, Creatures, Spells, Progression, Economy. An edit panel beside the selected row is easier to validate than spreadsheet behavior in every cell. Include a baseline/draft difference column and field-path errors. Derived values are read-only and computed from the selected draft and scenario.

Put scenario inputs above combat results: level, raw melee/shielding/magic counters (with derived skill levels), equipment, initial HP/mana/food, strategy and inter-kill overhead. Start with real starter equipment and a melee-only strategy. Do not assume a “skill 10” input means `p.melee = 10`: `Hero.melee` is accumulated tries, and the displayed skill comes from `skillFrom()`.

| Derived column | Definition and caveat |
| --- | --- |
| Maximum melee roll / mean hit | `M = floor(attack * (scale + skill/divisor) + level*levelBonus)`. For ideal uniform inclusive integer draws, exact mean damage is the average of `max(0,u-v)` over `u=0..M`, `v=0..mobArmor`. Do not subtract averages and clamp once. |
| Incoming mean hit | Average `max(0,u-block-armorRoll)` across the current inclusive roll ranges; shield maximum is `floor(defense*(shieldBase+shieldSkill/divisor))`. Include no-shield case. |
| TTK | Before simulator: label `HP / estimated DPS` as a rough steady-state estimate. After simulator: mean, median and P90 victory duration, win rate and timeout count. First player attack can occur on tick 1; duration is not simply hits × 1.5 seconds. |
| Damage taken per kill | Sum incoming `hit` effect values, separately record healing and end HP. `startHp-endHp` is wrong when fed regen, spells or level-up healing occurs. Show failed fights separately. |
| Expected cash per kill | Mean coin roll plus `sum(dropChance * item.sell)` only for loot with an actual buying merchant. Unvendable loot contributes zero cash; consumables may have a separately labelled replacement-use value. |
| XP/hour | `3600000 * xpPerKill / (meanKillMs + overheadMs)` for a successful-fight, unlimited-target scenario. It is a combat throughput estimate, not measured world economy. |
| Gold/hour | Same throughput × expected cash, with gross and net-of-consumables/food columns. Show costs from actual strategy usage where available. Loot/sell travel, carry capacity, deaths and respawns must not be silently omitted. |
| Kills to afford | `ceil(max(0, buyPrice-currentGold)/expectedNetGoldPerKill)`, labelled expected-budget estimate rather than expected stopping time. Missing merchant or nonpositive net income gives N/A. |
| Arbitrage | Warn when sell > buy **and** a merchant sells and a merchant buys that item. Show the buy/sell merchant route and per-unit profit. Separately show raw price inversion as informational for loot-only items. |

A useful existing-data check: a rat has ideal expected coin value `2`; tail cash adds `0.6*2 = 1.2`; loaf has no buying merchant. Expected vendable value is therefore **3.2 gold per rat**, before food/travel costs. A 60-gold shortsword with 40 starting coins needs an expected-budget estimate of `ceil(20/3.2) = 7` rat kills. This is not a simulated outcome or a guarantee. Rat-tail `sell:2 > buy:0` is not a current arbitrage loop because nobody sells tails. No current item with both trade routes has sell above buy.

Do not claim the PRNG is perfectly uniform: `Engine.random(max)` uses inclusive modulo reduction of xorshift output, with a small modulo bias, and zero seed locks it to zero. Label closed-form averages as idealized; simulation uses the actual generator.

### Headless fight implementation

Add `packages/game/src/simulate.ts` with `runFight(balance, scenario)` and `runBatch(balance, scenario, seeds)`; it imports `Engine`, state/IDs and `createRules`, not server/client modules. Browser worker entry `apps/studio/src/sim.worker.ts` calls those functions; an optional `tools/simulate.ts` calls the same exports under `tsx` for repeatable Node runs.

1. Build a tiny deterministic two-floor `MapData` fixture with walkable ground, no other NPCs/monsters, valid shrine/vault and one chosen spawn. Place the hero adjacent to the target. Starting adjacent isolates combat; a second scenario can start at configured distance to exercise pathing/range. Do not import `buildTown()` for every micro-benchmark or let other town creatures contaminate the duel.
2. `const state = emptyState(); state.rng = nonzeroSeed; const e = new Engine(map, state, createRules(balance));` Create the hero through `e.createPlayer()`, then set XP/counters, replace equipment deliberately and set chosen health/mana/food after deriving maxima. Use `xpAt(level)` for level presets. Give only the selected consumables; the default melee-only policy must not automatically consume the starter tonic.
3. Call `e.action(hero, {kind:'target', id: mob.id})`; before each tick, execute the selected policy through normal cast/use actions if enabled. Step `e.tick(100)`, matching `TownRoom.setSimulationInterval(...,100)`. Fast forward means running more **100 ms ticks**, not increasing tick duration: regen currently processes at most one interval per tick.
4. Stop on target HP <= 0, **increase in hero.deaths**, or a bounded timeout (e.g. 120 seconds, configurable and capped). `kill()` immediately restores HP at the shrine, so `hero.hp <= 0` is not a death detector. Return explicit victory/death/timeout, never a fake infinite TTK.
5. Consume new effects per step using an effect-ID cursor, attribute hits by `from`/`at`, and record gross damage, healing, attacks/misses, XP delta, consumables and corpse contents. Do not count the whole `e.effects` array each tick: it retains effects for 1600 ms. Drain notices per step to bound memory. Keep optional short combat trace for one selected seed.
6. Use a fixed small list of nonzero seeds for quick draft comparison, e.g. 100 runs, with an optional larger batch. Report run count and uncertainty, timeout/death rate, and victory-only duration/damage. Compare baseline and draft using the same seeds; mark old results stale when the draft changes. Bounded batches can yield to the worker event loop; terminate/recreate the worker for immediate cancellation.
7. One fight uses normal XP/skill progression and fed regeneration. Independent fights reset their starting state, so a batch estimates that starting profile, not an hour of continuous progression. A sustained hunt, multiactor assist XP, healing trips and spawn competition remain separate future scenarios.

The simulator stays synchronized because it calls the same `Engine.action/tick/cast/hurt/dead/kill` as the server. Keep combat equations inside that engine; extract small shared roll-limit helpers into `rules.ts` only when the analytical table needs them. Never maintain `studioDamage()` as a second combat implementation.

Preserve inclusive random bounds, player-before-monster tick ordering (a killing player blow prevents the monster's turn), regeneration, rounding, shielding/melee skill growth, global spell cooldown, aggro and death semantics. UUIDs are currently nondeterministic, but the single-hero/single-monster fixture's numeric results should repeat for a fixed seed; compare normalized traces, not generated entity IDs. Add an injected ID source only if multi-actor deterministic tie-breaking becomes necessary.

For hourly figures offer explicit overhead seconds, with “unlimited targets” clearly named. Existing respawn delay is 45 seconds and respawn is suppressed while any present hero is within six tiles of home; “wait next to this spawn” cannot produce sustainable farming. Do not present a simple respawn division as a real town route simulation. Quest payout is one-off, so exclude it from recurring gold/hour and show it separately.

## 6. Local app and safe file writes

Use Vite + TypeScript + DOM/Canvas + Three.js, matching the existing client. There is no React dependency here; a component framework, Electron shell, authentication system or new database would add work without helping this developer.

Proposed layout:

```text
apps/studio/
  package.json                  # private @lanternfall/studio workspace
  index.html
  vite.config.ts                # 127.0.0.1:4174, strictPort
  server/content-api.ts         # development-only file middleware
  src/main.ts                   # tabs, selection, draft/save state
  src/balance.ts                # table/detail editor and warnings
  src/icons.ts                  # tiny pixel editor and PNG conversion
  src/models.ts                 # constrained part inspector/editor
  src/preview.ts                # game renderer adapter
  src/sim.worker.ts
  src/style.css
```

Root script: `"studio": "vite --config apps/studio/vite.config.ts"`. It starts only the studio, not the game server. `npm run dev` remains optional alongside it. Resolve repository/content paths from `import.meta.url`, not the shell working directory. The workspace root must remain visible to Vite for imports from `packages/game` and `apps/client/src/render`; if setting `server.fs.allow`, preserve the workspace allowance rather than accidentally narrowing it to `apps/studio`.

Use a Vite `configureServer()` plugin for local `/api/content` routes; this hook supplies development middleware and does not run during production build ([official Vite middleware API](https://vite.dev/guide/api-plugin.html#configureserver)). A second Express application is unnecessary even though Express is already installed.

- `GET /api/content/:document`, where document is exactly `balance`, `icons`, `models` or later `textures`: return validated data, raw-file SHA-256 revision and warnings. Initial corrupt JSON returns a field/file error; do not replace it with defaults.
- `PUT /api/content/:document` with `{baseRevision, data}`: parse request shape, enforce a bounded body, validate proposed document and cross-references against the other current files, serialize a stable readable JSON format, then write. Return `422` with field paths on schema error and `409` on stale revision. A valid JSON document can still contain balance warnings and be saved.
- Serialize saves through one queue so two tabs in this studio server cannot both pass the same revision check. Re-read and compare the hash immediately before replacement to catch normal external editor saves. This is an optimistic local-editor guard, not a claim of cross-process compare-and-swap atomicity; external editors can still race between final check and rename. Surface external changes and never silently overwrite a dirty draft.
- Write a unique sibling temp file with exclusive creation, flush/close, then rename over the target on the same filesystem; clean up temp files on failure. Return the hash of the actual written bytes. Node exposes the required filesystem operations ([Node filesystem API](https://nodejs.org/api/fs.html#fspromisesrenameoldpath-newpath)). Atomic replacement prevents readers seeing half-written JSON; it is not a transaction across several files. Save one content document at a time.
- Use fixed server-side document/path maps, no arbitrary filesystem path parameter. Bind loopback only, require same-origin browser writes/JSON content type and reject unexpected Host/Origin. Resolve asset paths within the fixed texture directory and reject traversal/symlinks escaping it. No permissive CORS and no arbitrary command execution endpoint.
- Texture import is a separate allowlisted endpoint accepting the known texture slot and PNG bytes. Validate PNG signature/dimensions/size on the server as well as browser UX; use a small PNG decoder when this milestone lands. Write immutable hashed PNG first and manifest last. Never trust a client filename as a path.

Maintain saved baseline, current draft, dirty flag, undo history and revision per document. Update preview on valid drafts; invalid numeric input remains visible with errors without running a broken simulation. Save is explicit; add Ctrl/Cmd+S and revert-to-saved. Offer JSON export of an unsaved draft when a conflict occurs. Detect external changes through the studio server's own file watcher and custom HMR notification; that watcher is independent of the game's Vite process, so both see the shared files without messaging each other directly.

### Preview with the actual game look

Import `WorldView`, `buildFloor`, `buildRig` and texture loaders, never `apps/client/src/main.ts` (which creates UI/network connections at module load). Inject `ArtContent` and rules into `WorldView`/render helpers; default them for normal game callers. Provide a valid synthetic `GameView` from the headless engine and a small fixture map with an outdoor floor, a cave floor, representative walls/roof/door and lamps.

Let studio `replaceArt(draft)` rebuild only that small preview scene. Retain the existing camera angle, sun direction/intensity, shadows, Lambert material, 1.25/1.15 actor scales, cave torch behavior and post shader. Mount it in a fixed representative viewport size so `resize()`'s `max(3, round(h/215))` behaves as expected; scaling a tiny thumbnail should not secretly change the rendering conditions. Show the raw asset beside the game view; icons remain UI art and must not receive the world post effect.

Add a `WorldView.dispose()` that stops its animation loop, disconnects its stored ResizeObserver and listeners, removes labels and disposes owned targets/textures/materials/geometries. Retain globally shared box/material ownership correctly rather than disposing shared resources on every rig replacement. Do not build a cloned studio-only lighting/post pipeline that will drift.

This is a renderer adapter and lifecycle cleanup, not a lighting overhaul. Verify the eventual affected UI in a running studio and game; no UI implementation or browser verification was performed for this planning report.

## 7. Independently shippable milestones

1. **Make existing exports authoritative.** Add IDs/schemas/default loaders/rules, inject rules into Engine, wire icons/models and every existing balance field, and add `npm run content:check`. Keep the normal game working with its current defaults. Exit: existing `npm test`, typecheck and client build pass; old/new normalized seeded combat traces and icon rasters agree; inspect model transforms at appropriate precision and verify all 12 rigs in motion. Retire duplicate constant/art tables only after parity review.
2. **Ship a useful local balance editor.** `npm run studio`, Items/Creatures/Spells/Progression tables, basic economy estimates and merchant-route warnings, safe explicit saves/revert/conflicts, read-only art browser, and the documented dev reload path. Exit: change attack/price, save, see matching client/server content hash and changed game behavior; invalid saves leave file bytes unchanged; restarting preserves the world and requires at most Continue. Usable even with the game server stopped.
3. **Ship handmade-art import and game preview.** PNG→icon JSON conversion, palette edits/minimal pencil/erase/undo, `textures.json`, one PNG override per existing texture family, and the real `WorldView` preview. Exit: replace a grass/wall/roof texture and an icon, inspect seams and both lighting presets, save/reload into the game; build and verify Electron loads assets offline from `dist/client`. This milestone fulfills the art-direction need without waiting for advanced editors.
4. **Ship engine-backed fight comparison.** Tiny fixtures, worker, repeatable seeds, melee policy first, victory/death/timeout, damage taken, TTK distribution and documented hourly/affordability estimates. Add Mend/Ember/potion policies only after melee correctness. Exit: the same scenario/seed/draft produces the same normalized result in browser and Node; two engines with different drafts stay independent; an impossible fight terminates; death is recognized despite restored HP; no server/database imports.
5. **Only after use: constrained model edits and generator conveniences.** Part/bone inspector controls, grouped recoloring and shared idle/walk/swing; optional extracted ground/roof/wall palette/density controls or “generate a base, export PNG, paint externally.” Exit: editing a model affects an existing actor after reload and animations/pivots stay correct. This can ship separately and is optional for the initial useful tool.

Verification should target migration risks, not field-by-field UI unit tests: existing engine suite; a few seeded behavior checks (including Ember/heal spread and custom rules isolation); rejected-write/conflict/atomic-file checks; icon raster parity; actual game/studio preview and build asset-path smoke checks. For a report-only round, these are acceptance criteria, not claims that implementation tests passed.

## 8. Explicitly leave out

- Hosted service, accounts, collaborative editing, permissions, cloud sync or production content publishing.
- Studio access to saved SQLite characters, automatic world resets, save-game migration UI or a live server-admin console.
- Seamless mid-combat balance replacement; development restart/reconnect is enough.
- Arbitrary new gameplay IDs, editable action/spell behavior scripts, formula language or code generation.
- Full Aseprite clone: layers, animation timeline, brushes, selection transforms, atlas packing and direct `.aseprite` decoding.
- Character conversion to 2D billboards/directional sheets, `.vox`/GLTF import, skeletal-animation authoring or UV painting.
- Map/world-building editor, spawn-route editor, complete prop/foliage generator UI, lighting/postprocessing redesign or painted water until its shader path changes.
- Economy auto-optimizer, real-player bots, full MMO route/competition simulation, loot trading market or automated balance recommendations.
- More framework infrastructure, a separate Electron studio build, or external editor command execution from the browser.

## Top five recommendations

1. **Wire the existing JSON into the game first**, with shared Zod validation and fixed typed gameplay IDs; an editor alone is insufficient.
2. **Give each Engine its own validated rules snapshot** so draft comparisons execute real formulas without contaminating the running/default game.
3. **Prioritize imported hand-painted world textures and a tiny icon editor**; keep voxel actors and procedural fallback while the art direction develops.
4. **Reuse the actual WorldView, texture mapping and post look**, with explicit asset injection and cleanup, so preview decisions survive in-game rendering.
5. **Keep delivery local and explicit:** Vite middleware, revision-checked atomic saves, server restart/client reload, honest simulation assumptions, and no saved-world editing.
