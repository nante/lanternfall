# Lanternfall Studio: round 3 re-plan (opus)

Inputs: `BRIEF.md`, `round-1/{opus,sol,terra}.md`, `round-2/{opus,sol,terra}.md`. I re-read the code for each claim still in dispute; §1 lists what I checked. Nothing in the repo changed except this file.

## 0. The plan in one paragraph

Make `content/balance.json` and `content/icons.json` the only runtime source for the values they hold, with the engine taking its balance as a constructor argument. Then add `apps/studio`, a Vite + vanilla TS app on `127.0.0.1:4174` started by `npm run studio`. It has four parts:

- a balance editor with economy columns and lints
- a seeded real-engine fight simulator comparing the saved file against the draft
- a 16×16 icon painter
- PNG overrides for ground, wall and roof textures, stored at `content/art/<family>/<slot>.png`, with the existing generators as fallback

Saving writes one validated file. A balance save restarts the dev server through `tsx watch` and reloads the client; an art save reloads only the client. The player clicks **Continue**. Models, an embedded lit preview, new tuning constants, auto-reconnect and content-hash handshakes are out of scope.

## 1. Disputed claims I checked against the code this round

| Claim | Finding |
| --- | --- |
| A `tsx watch` restart sends SIGTERM | **True.** In `node_modules/tsx/dist/cli.mjs` the restart path is `async(m,S="SIGTERM",N=5e3)=>{… m.kill(S) …}`, with SIGKILL after 5 s. `apps/server/src/index.ts:64` persists on SIGTERM, so watch restarts already save the world. Ctrl+C relays SIGINT, which has no handler; that one line is worth adding. |
| `import.meta.glob('/content/art/**')` resolves to the repo's `content/` | **False (Terra is right).** `apps/client/vite.config.ts` sets `root` to `apps/client`, so a leading `/` means `apps/client/`. Fix: use a relative glob from `apps/client/src/render/art.ts`, which is `../../../../content/art/*/*.png`. Vite's default `server.fs.allow` is the workspace root, the nearest `package.json` with `workspaces`, which is the repo root. So dev serving works without config, and build emits hashed assets under `base: './'`, which works for Electron loading from disk. This is still an acceptance check (M4), not an assumption. |
| The studio will reload itself whenever content is saved | **Avoidable by construction.** Today the client imports values from `model.ts` (`main.ts:5-8`, `view.ts:2`), and `engine.ts:1-4` imports them too. If `Engine` requires its balance as an argument and only `content.ts` imports the JSON, the studio's graph (`engine.ts`, `balance.ts`, `model.ts`, `textures.ts`, `icon-art.ts`) contains no `content/` file. A 3-line `handleHotUpdate` guard stays as a safety net. |
| Wiring is a mechanical substitution | **Mostly.** `engine.ts` has about 70 references to `getDef`/`mobDefs`/`spells`/`npcDefs`/`shellTask`/`maxHP`/`maxMana`/`capacity`/`level`/`skillFrom`/`magicFrom`. Inline literals with existing JSON fields are `STEP=300` (`:9`), `respawn 45_000` (`:307`), death losses `0.08`/`0.05` (`:323`), `regenMs 3000` (`:341`), `attackMs 1500` (`:375`), `monsterAttackMs 2000` (`:401`), the melee formula `0.6`, `/18`, `+level` (`:372`), shield skill base `30` (`:134`), the starter kit (`:124-131`) and the spell power expressions (`:267`, `:274`). Trap: the `1500` at `:349` is a path-search limit, not `attackMs`. Leave it alone. |
| Spell spread can be data-driven with bit-identical results | **True.** Heal is `random(base/4)`, and `base*0.25` is exactly equal in IEEE doubles. Ember is `random(12)`, which becomes `random(spread)` with `spread: 12`. Wiring `base/perLevel/perMagic` deletes the `id === 'renew'` branch at `:267`. |
| Client HUD has its own copies of balance values | **True.** `main.ts:141` passes `30` to `skillFrom`, `main.ts:392` hard-codes "5 beetle shells", `view.ts:7` has `STEP_MS = 300`, and `engine.ts:180` hard-codes "a banded shield". All four must read the balance. |
| Texture generators can take overrides without restructuring | **Yes.** `groundAtlas()`, `wallTexture(style)`, `roofTexture(kind)` and `plankTexture()` are synchronous and are called during floor build (`terrain.ts:81,182,277,285,303,306`). PNGs must be decoded **before** `new WorldView(...)`. One `await loadArt()` in `main.ts` does that. Wall styles in use are `stone`, `rampart`, `cave`, `timber` and `plaster` (the `else` branch). |
| The project is under git | **No.** `git status` fails. That is why the studio keeps backups before every write. The plan does not run `git init`; the owner may choose to. |

## 2. Ranked decisions from round 2, resolved

Each answer comes with a one-line reason. "Majority" means at least two of the three round-2 reports.

1. **What is the first useful version?** It is milestones M0–M4: a balance editor with lints, the seeded simulator, an icon painter, and ground/wall/roof PNG overrides. Every milestone ships independently. *Reason:* the owner asked for both sprites and balance, and each milestone is a usable vertical slice. ⚑ See §10.1 for ordering.
2. **What is authoritative?** `balance.json` (all seven sections) and `icons.json` are the only runtime source for their values, and the TS value tables are deleted in M0. Ids stay TS tuples. `models.json` stays non-authoritative and is not editable. *Reason:* one source per value. Leaving `itemDefs` beside `balance.json` is how edits silently fail to apply.
3. **How does balance reach the engine?** Through `new Engine(map, state, balance)`, a required argument holding an immutable validated snapshot. Formulas stay in executable code: progression helpers move into `rules(b)`, and combat sequencing stays in `tick()`/`think()`. *Reason:* draft and baseline simulations run side by side, and the riskiest code is untouched apart from name substitution.
4. **Which constants join the balance?** Only those already in `balance.json`. Regen amounts, block, unarmed 3, potion spread, starting `fed`, assist XP and mob idle regen stay in code, and the simulator shows them as fixed assumptions. *Reason:* majority, and the export already covers the main knobs. ⚑ §10.3.
5. **Spell spread schema.** Keep the field name `spread`, in a discriminated union on `kind`. Heal `spread` is a fraction of base in (0, 1]; attack `spread` is a flat integer and `range` is required. The editor labels it "spread (fraction)" or "spread (flat)". *Reason:* majority, it matches the existing export, and the union prevents the bad combinations.
6. **What does Save do?** It writes one validated file. Balance: the server restarts through `tsx watch` (SIGTERM persists) and the client fully reloads. Icons and art: the client reloads only. The player clicks Continue, and SQLite is never touched. *Reason:* the signal behaviour is verified, and a click costs less than an auto-reconnect protocol. ⚑ §10.4.
7. **What happens to the existing world?** It is preserved, with no HP clamp and no inventory repair. The studio's status line explains it: live monsters keep their current HP until they respawn, and starter-kit changes apply to new characters. For a fresh world, run `LANTERNFALL_DB=.local/test.sqlite npm run dev:server`. *Reason:* majority. A clamp is a gameplay policy, not a reload mechanism.
8. **What computes combat numbers?** The real `Engine` on a 9×9 fixture: 200 seeded trials per creature, saved and draft balance on the same seeds, reporting win/death/timeout counts separately. Closed-form math covers only gold per kill, XP per level, budget ratios and arbitrage. There is no analytic EV model and no ±15 % gate. *Reason:* three independent probes agree (§10.1), and a second combat model would drift.
9. **How does hand-made art enter the game?** By convention: `content/art/{ground,wall,roof}/<slot>.png` loaded through a relative `import.meta.glob`. If the file is present it is used; if absent, the generator runs. There is no manifest and no hashed names. Water, void and prop planks are excluded. Generators are deleted only after every slot has a PNG, and that is not part of this plan. *Reason:* the filesystem is the manifest, and the owner can replace one material at a time.
10. **How does the studio avoid reloading on save?** No studio module imports `content/`, and a `handleHotUpdate` guard drops `content/**` updates. *Reason:* drafts in other tabs survive a save.
11. **Write safety.** The server binds to 127.0.0.1 and checks Host and Origin. Writes are limited to a fixed allowlist of documents and slots with a 2 MB body cap. Validation uses the same zod schema the game uses (422 with issue paths). A stale base hash returns 409. Before replacing a file, its old bytes are copied to `.local/studio-backups/`, keeping the last 20 per file. The write goes to a unique dot-prefixed temp file in the same directory, then a rename. The critical section from hash check to rename is synchronous, so writes are serialized without a queue. *Reason:* this covers every real failure for one local user, and the backup stands in for the missing git.
12. **In-studio game-look preview.** Not in v1. The running game on :4173 is the preview. The studio shows the raw canvas, a 3×3 repeat, a neighbour strip and the icon at HUD size. *Reason:* the majority agrees, and `setFloor` caches (`view.ts:175-178`), so a diorama needs real invalidation work.
13. **Shared palette.** No file. The painter offers the asset's own colours plus a swatch derived at runtime from every other icon and override, with no warning. *Reason:* it gets most of a consistent palette for no new format.
14. **UI stack.** Vanilla TS + DOM, like `main.ts`. *Reason:* same stack; the forms are tables.
15. **Content hash in `/health` and `welcome`, plus a mismatch gate.** Cut. *Reason:* client and server read the same disk, and the restart window is about a second.
16. **Models.** Out of v1. `buildRig(model)` and a part editor come later; at that point the grub's Y rounding (0.0003 units) needs a tolerance. *Reason:* no part of the request needs rig parity first.

## 3. Files

### Add

| File | Purpose |
| --- | --- |
| `packages/game/src/balance.ts` | Zod `Balance` schema (strict objects), `type Balance`, `rules(b)`, `validateBalance(b)` returning hard errors (schema-level and cross-field). Imports `model.ts` only. **Imports no JSON.** |
| `packages/game/src/content.ts` | `import raw from '../../../content/balance.json'`, then `export const balance = Balance.parse(raw)` and `export const R = rules(balance)`. Only the server, the client and the tests import it. |
| `apps/client/src/icon-art.ts` | `IconSet` zod schema and a pure `iconSvg(def)` that turns pixel rows into run-length `<rect>`s. No JSON import. |
| `apps/client/src/render/art.ts` | Relative `import.meta.glob` of `content/art/*/*.png` (eager, `?url`). `loadArt()` decodes each file to `ImageData` and calls `useArt(map)`. |
| `apps/studio/package.json` | `{"name":"@lanternfall/studio","private":true,"type":"module"}` |
| `apps/studio/index.html` | Shell: tabs Balance · Icons · Textures, a status bar. |
| `apps/studio/vite.config.ts` | `root` = studio dir, `server: {host:'127.0.0.1', port:4174, strictPort:true}`, `plugins: [contentApi()]`, `handleHotUpdate` guard for `content/**`. |
| `apps/studio/server/content-api.ts` | The Vite `configureServer` middleware (§5). Written as a pure `handle(req, root)` plus a thin adapter so it can be tested. |
| `apps/studio/src/main.ts` | Tab routing, Cmd/Ctrl+S, dirty markers, the status line. |
| `apps/studio/src/store.ts` | `Doc<T> = {saved, draft, hash, issues, warnings}`, `load()`, `save()`, `revert()`, conflict handling. |
| `apps/studio/src/balance-view.ts` | Editable tables and the scenario bar (§7). |
| `apps/studio/src/economy.ts` | Pure derived numbers and lints (§7.2). |
| `apps/studio/src/simulate.ts` | Arena builder and fight loop (§8). Pure; runs in the browser and in Node tests. |
| `apps/studio/src/pixel.ts` | Canvas editor: pencil, eraser, fill, eyedropper, undo/redo, zoom, grid. |
| `apps/studio/src/icons-view.ts`, `textures-view.ts` | Asset lists, previews, import/export. |
| `apps/studio/src/style.css` | |
| `tests/fixtures/balance-v1.json`, `tests/fixtures/golden.json` | A frozen copy of today's balance, and results captured **before** M0 (§9). |
| `tests/content.test.ts`, `tests/simulate.test.ts`, `tests/content-api.test.ts` | §9. |

### Change

| File | Change |
| --- | --- |
| `packages/game/src/model.ts` | Delete `itemDefs`, `getDef`, `mobDefs`, `spells`, `npcDefs`, `shellTask`, `xpAt`, `level`, `maxHP`, `maxMana`, `capacity`, `skillFrom` and `magicFrom`. Add tuples `mobKinds` and `spellIds = ['mend','ember','renew'] as const`, and use them in `Monster` and `Command`. Keep the ids, types, `stackMax`, and the state and command schemas. |
| `packages/game/src/engine.ts` | Constructor `(map, state = emptyState(), readonly b: Balance)` with `this.r = rules(b)`. Substitute the ~70 references, replace the literals listed in §1 with `b.progression.*`, drive spells from `base/perLevel/perMagic/spread` (deleting the `renew` branch), read loot as `{item, chance}`, build the starter kit from `b.starter`, and take quest numbers and the reward name from `b.quests.shells`. Preserve the order of RNG calls exactly. |
| `apps/server/src/index.ts` | `new Engine(map, restored, balance)`, plus `process.on('SIGINT', …)` mirroring SIGTERM. |
| `apps/client/src/main.ts` | Import `balance`/`R` from `content.ts`. Replace the shield `30` at `:141` with `R.shielding(...)`, and build the quest text at `:392` from `balance.quests.shells` plus item names. Call `await loadArt()` before `new WorldView`. |
| `apps/client/src/render/view.ts` | `STEP_MS` becomes `balance.progression.stepMs`; `mobDefs` becomes `balance.creatures`; `level`/`maxHP` come from `R`. |
| `apps/client/src/icons.ts` | Becomes about 5 lines: import `icons.json`, parse it with `IconSet`, and `icon(name) = iconSvg(set[name])`. The hand-written `art` runs are deleted. |
| `apps/client/src/render/textures.ts` | Add a module-level `overrides` set by `useArt()`. `groundTile`, `wallTexture` and `roofTexture` return the override when present. Export `generated(family, slot): ImageData` for the studio's "start from current". Keep `#724fS` exactly as it is; fixing it is a separate art decision. |
| `tests/engine.test.ts` | Pass `balance` to `new Engine(...)`. No assertion changes. |
| `package.json` | Add `"studio": "vite --config apps/studio/vite.config.ts"`, and change `dev:server` to `tsx watch --include content/balance.json apps/server/src/index.ts`. |

Not touched: `town.ts`, `world.ts`, `terrain.ts`, `actors.ts`, `apps/desktop`, and the SQLite file.

## 4. Data shapes

`balance.json` keeps its current top-level shape: `progression`, `items`, `creatures`, `spells`, `merchants`, `quests`, `starter`. The schema in `balance.ts`:

```ts
const Id = <T extends readonly [string, ...string[]]>(ids: T) => z.enum(ids);
const Item = z.strictObject({
  name: z.string().min(1), icon: z.string().min(1), weight: z.number().min(0),
  buy: z.number().int().min(0), sell: z.number().int().min(0),
  slot: z.enum(equipSlots).optional(), attack: z.number().int().min(0).optional(),
  defense: z.number().int().min(0).optional(), armor: z.number().int().min(0).optional(),
  slots: z.number().int().min(1).max(40).optional(), stack: z.boolean().optional(),
  food: z.number().int().min(0).optional(), heal: z.number().int().min(0).optional(), mana: z.number().int().min(0).optional(),
});
const Creature = z.strictObject({
  name: z.string(), hp: z.number().int().min(1), armor: z.number().int().min(0), attack: z.number().int().min(0),
  xp: z.number().int().min(0), gold: z.tuple([z.number().int().min(0), z.number().int().max(stackMax)]),
  loot: z.array(z.strictObject({ item: Id(itemKinds), chance: z.number().min(0).max(1) })),
  step: z.number().int().min(100), aggro: z.number().int().min(1).max(12),
});
const SpellBase = { words: z.string(), name: z.string(), mana: z.number().int().min(0), level: z.number().int().min(1),
  cooldown: z.number().int().min(0), base: z.number().min(0), perLevel: z.number().min(0), perMagic: z.number().min(0) };
const Spell = z.discriminatedUnion('kind', [
  z.strictObject({ ...SpellBase, kind: z.literal('heal'), spread: z.number().gt(0).max(1) }),   // fraction of base
  z.strictObject({ ...SpellBase, kind: z.literal('attack'), spread: z.number().int().min(0), range: z.number().int().min(1) }), // flat
]);
export const Balance = z.strictObject({
  progression: z.strictObject({ /* the 22 existing fields, numeric with bounds */ }),
  items: z.strictObject(Object.fromEntries(itemKinds.map(k => [k, Item]))),   // every id present, no extras
  creatures: z.strictObject(/* every mobKind → Creature */),
  spells: z.strictObject({ mend: Spell, ember: Spell, renew: Spell }),
  merchants: z.strictObject(/* every npcRole → {greeting, topics: record<string,string>, sells: ItemKind[], buys: ItemKind[]} */),
  quests: z.strictObject({ shells: z.strictObject({ need: int≥1, gold: int≥0, reward: Id(itemKinds), item: Id(itemKinds) }) }),
  starter: z.strictObject({ equipment: z.partialRecord(z.enum(equipSlots), Id(itemKinds)), pack: z.array(z.strictObject({ item: Id(itemKinds), count: int≥1 ≤stackMax })) }),
});
```

`validateBalance(b)` adds cross-field **errors**, which block a save:

- each creature has `gold[0] ≤ gold[1]`
- `xpAt` is strictly increasing for levels 1..200, checked by brute force (`level()` is also capped at 200, so a bad curve cannot hang the engine)
- each `starter.equipment` item's `slot` matches its key
- the starter pack fits in the pack item's `slots`
- non-stack items in the pack have count 1
- the `ember` spell is `attack` and `mend`/`renew` are `heal` (the engine's targeting assumes this)

`rules(b)` returns `{ def(kind), mob(kind), spell(id), xpAt(l), level(xp), maxHP(l), maxMana(l), capacity(l), melee(tries), shielding(tries), magic(spent), triesForSkill(level, base) }`. These are the current functions with constants read from `b.progression`. `triesForSkill` is new; the simulator uses it to set a skill level.

`icons.json` keeps its current shape, `{ [name]: { palette: string[], pixels: string[16] } }`, under this schema:

- `palette` has 1–9 entries of `#rrggbb`
- each pixel row is exactly 16 characters from `.` or `1`..`palette.length`, so `0` is rejected
- every `items[k].icon` and every spell id has an entry; this is a cross-file check, shown as a **warning** in the studio because the documents save separately

Art files are `content/art/ground/<grass|meadow|dirt|cobble|plank|stone|sand|moss|flagstone>.png` at 48×48, `content/art/wall/<stone|rampart|cave|timber|plaster>.png` at 16×32, and `content/art/roof/<slate|clay|thatch|teal>.png` at 16×16. All are opaque RGBA or RGB PNGs. The slot list is one `const` in `content-api.ts`, and the studio fetches it from the API.

## 5. Save and reload flow

API (the studio's middleware only; nothing is added to the game server):

| Method and path | Body / response |
| --- | --- |
| `GET /api/doc/:name` (`balance`, `icons`) | `{json, hash}`, where hash is the sha256 of the bytes on disk |
| `PUT /api/doc/:name` | `{baseHash, json}` → `200 {hash}`, `409 {json, hash}` (current disk content), or `422 {issues: [{path, message}]}` |
| `GET /api/art` | `{slots: [{family, slot, w, h, hash or null}]}` |
| `GET /api/art/:family/:slot.png` | The PNG bytes, or 404 |
| `PUT /api/art/:family/:slot.png` | PNG body plus an `X-Base-Hash` header (`none` for a new file). Returns `200`/`409`/`422`. The server checks the PNG signature and that IHDR width and height match the slot. |
| `DELETE /api/art/:family/:slot.png` | `X-Base-Hash`. Backs up the file, deletes it, and the game falls back to the generator. |

Every request goes through the same gate: Host must be `127.0.0.1:4174` or `localhost:4174`, and any Origin must equal that host (otherwise 403). The body is capped at 2 MB, and names must come from the allowlist. No path is ever built from user input other than the allowlisted keys.

The write sequence runs in one synchronous block after the body is read:

1. Read the current bytes and compare the hash to `baseHash`. A mismatch returns 409.
2. Copy the old bytes to `.local/studio-backups/<name>.<ISO time>.<ext>` and prune that name to the newest 20.
3. Write the new bytes to `content/.<name>.<pid>.<random>.tmp` (or the same pattern in the art family directory). JSON is pretty-printed with 2 spaces and a trailing newline, so the owner can diff backups.
4. `renameSync(tmp, target)` and return the new hash.

What each process does after a save:

| Saved | Game server (:2567) | Game client (:4173) | Studio (:4174) |
| --- | --- | --- | --- |
| `balance.json` | `tsx watch` (exact include) sends SIGTERM, and the handler persists the world. The new process re-parses the balance and restores the world from SQLite. It reaches `world_ready` in about 1 s. | Vite sees the JSON in its graph and does a full reload. The gate shows **Continue**. | Dirty tabs keep their drafts. The saved baseline updates and the simulator re-runs. |
| `icons.json` | Nothing; the server does not import it. | Full reload (it also clears the icon markup cache at `main.ts:343`). | Same as above. |
| `content/art/**` | Nothing. | The glob invalidates, so a full reload; `loadArt()` decodes the new PNGs. | Same as above. |

The temp files are dot-prefixed, and tsx ignores `**/.*` while Vite ignores files outside its graph, so a temp file never triggers anything.

Studio-side behaviour:

- The draft is validated live with the same `Balance` and `IconSet` schemas the game uses. Errors are shown in the field and disable Save. Warnings are listed but never block.
- On 409, a banner reads "Changed on disk since you opened it" with two choices: *Load disk version* (discards the draft, after a confirm) or *Overwrite* (re-PUT with the new hash). The draft is never lost silently.
- Revert restores the draft to the last loaded save.
- The status line reports what the save did, for example: "Saved balance.json. Game server restarts; reload shows in the game after Continue. Live monsters keep current HP until respawn; starter kit applies to new characters."

What the studio does not do:

- It never touches SQLite, the game server or `.local/lanternfall.sqlite`.
- It never claims a change is live. It only reports the write.
- A built client or the Electron app bundles content at build time, so `npm run build` is needed. The status line says so once.

## 6. Sprite workflow

**Painter (`pixel.ts`).** One canvas component is shared by icons and textures. It offers integer zoom from 4× to 24×, a grid toggle, pencil, eraser (icons only), flood fill, an eyedropper, and undo/redo with 100 snapshots. The swatch shows the asset's own colours first, then colours derived at runtime from all other icons and overrides, then a native colour input. There is no anti-aliasing, scaling or filtering anywhere.

**Icons tab.**

1. The list shows all 27 entries in `icons.json`, each with its name and the items or spells that use it.
2. Selecting one opens it in the painter.
3. The previews are the icon at 1× and 2× inside a copy of the hotbar slot frame on the HUD background, plus a strip of the icon beside its neighbours in the inventory.
4. The palette is capped at 9 colours. Adding a 10th colour is refused with a message.
5. Import accepts a 16×16 PNG. It is refused if any alpha value is other than 0 or 255, or if it has more than 9 opaque colours; it is never quantized silently.
6. Export downloads the 16×16 PNG and an 8× upscaled PNG for reference.
7. Saving writes the whole `icons.json`.
8. Adding a new icon name is allowed, since names are free strings. An icon only appears in game when an item's `icon` field in balance points at it.

**Textures tab.**

1. The list shows every slot from §4, each with an "override" or "generated" badge.
2. Selecting a generated slot shows the generator output (`textures.generated(family, slot)`).
3. **Start from current** copies that output into the painter, which is the practical starting point for redrawing toward the reference look.
4. Import accepts an exact-size PNG, with no rescaling. It must be fully opaque, because terrain and walls have no alpha path; otherwise it is refused.
5. Export downloads the current pixels as a PNG, so the owner can work in Aseprite or Pixelorama and re-import. This round-trip is the main path for serious art.
6. The previews are:
   - ground: a 3×3 repeat, which shows seams, the real problem with hand-made tiles
   - ground: a strip beside each common neighbour (grass, dirt, cobble) at 1×, 2× and 4×
   - walls: 4 horizontal repeats
   - roofs: a 3×3 repeat
   - a note that the in-game look adds low sun, split-tone post and rim light, so the result should be judged in the game
7. Save PUTs the PNG. **Use generator** DELETEs the override, with a backup.
8. Water, void and prop planks are not listed. The tooltip on the family header says: "water is shaded in GLSL (`terrain.ts:97-105`); a PNG would be invisible."

**How the game consumes art.**

- `art.ts` globs `content/art/*/*.png`.
- `main.ts` runs `await loadArt()`, which turns each URL into an `Image`, then a canvas, then `ImageData`, before constructing `WorldView`.
- `textures.ts` copies an override into its `Pix` in place of running the generator, so atlas layout, NearestFilter, sRGB, wrap modes and world projection are unchanged.
- A PNG that fails to decode logs `art_load_failed`, and that slot falls back to the generator.

## 7. Balance views

### 7.1 Layout

A **scenario bar** at the top drives every derived column:

- hero level (1–20)
- melee and shield skill levels (default: what that level typically has; editable)
- gear per slot, from items valid for that slot (default: the starter kit)
- fed yes/no
- trials (default 200)
- seed (default 91827)

Sub-tabs, each an editable table of draft values. A changed cell is tinted, and its saved value appears on hover.

- **Creatures**: the hp, armor, attack, xp, gold min/max, step and aggro fields, plus a loot list editor.
  - Derived: xp/kill, expected gold/kill, kills to the next level at the scenario level.
  - Simulator columns (§8): win / death / timeout, TTK on wins (mean, p10–p90), damage taken on wins. Each is shown as `saved → draft`.
- **Items**: all fields. Derived: sold by, bought by, profit flag.
- **Spells**: all fields, with spread labelled by kind. Derived: min–max effect at the scenario level and magic.
- **Progression**: the 22 fields. Below them, a table for levels 1–20 with xp to next, hp, mana, cap, and kills per level for each creature.
- **Merchants & quest & starter**: text areas for greeting and topics; multi-selects for sells and buys; the quest fields; the starter kit.

### 7.2 Closed-form numbers (`economy.ts`, pure)

- **Expected gold/kill** = `(gold[0]+gold[1])/2 + Σ chance × sell`, counting only items that some merchant `buys`. Loot rolls are independent (`engine.ts:314`), so chances are not normalized. Labelled "ideal cash per kill (sold at a buyer)".
- **Kills to afford** an item = `max(0, buy − starter gold) / gold-per-kill`. Labelled "budget ratio, not an expected time". There is no gold/hour figure, because respawn suppression within 6 tiles of home (`engine.ts:390`) and travel make that a guess.
- **Kills per level** = `(xpAt(L+1) − xpAt(L)) / creature.xp`.

### 7.3 Lints (warnings, never blocking)

- **Arbitrage**: an item is sold by one merchant and bought by another, with `sell > buy` (a break-even price is not profit).
- **Unsellable loot**: an item that appears in creature loot, has `sell > 0`, and no merchant buys it.
- **Dialogue drift**: a merchant topic contains a digit or number word (one … one hundred) and the merchant buys or sells an item. The warning shows the sentence and the item's current price. Dialogue is not templated in v1.
- **Missing icon**: an item's `icon` is not in `icons.json`.
- **Starter overweight**: the starter kit weighs more than `capacity(1)`.
- **Creature sanity**: a creature with a win rate under 50 % at the level where its kills-per-level first drops below 30. This is shown as information, not a design rule, so the owner sees "grub: 16 % win at L1" immediately.

## 8. Simulator (`simulate.ts`)

```ts
type Scenario = { creature: MobKind; level: number; melee: number; shielding: number;
  gear: Partial<Record<EquipSlot, ItemKind>>; fed: boolean; trials: number; seed: number; maxMs: number /* 300_000 */ };
type Outcome = { wins: number; deaths: number; timeouts: number;
  ttk: { mean: number; p10: number; p90: number } | null; taken: number | null /* mean on wins */ };
export function simulate(b: Balance, s: Scenario): Outcome;
export function compare(saved: Balance, draft: Balance, s: Scenario): { saved: Outcome; draft: Outcome };
```

**Arena.** One 9×9 grass floor, no walls or things. `shrine` is at (0,0) and `vault` at (0,1). There are no NPCs and `links: {}`. There is one spawn of the scenario creature at the centre. Built once per creature with `MapData` types from `model.ts`.

**Each trial** `i` runs these steps:

1. Setup:
   - `st = emptyState()` with `st.rng = seed + i`, which is never 0
   - `e = new Engine(arena, st, b)`
   - `p = e.createPlayer('Sim')`
2. Hero:
   - set `p.xp = r.xpAt(level)`
   - set `p.melee` and `p.shielding` to `r.triesForSkill(...)`
   - set `p.hp` and `p.mana` to the level maximums
   - set `p.fed` to `fed ? Number.MAX_SAFE_INTEGER : 0`
   - replace the equipped items for the scenario gear using the engine's own `add` into `equip:<id>` at `equipSlots.indexOf(slot)`
   - place the hero adjacent to the creature
   - `e.action(p, {kind:'target', id: m.id})`
3. Loop `e.tick(100)` until one of three things happens:
   - `m.hp <= 0`: a win
   - `p.deaths` increased: a death (`kill()` restores HP, so `p.hp` cannot detect it)
   - `st.time > maxMs`: a timeout
4. Damage taken: each tick, scan `e.effects` with an id cursor (effects are pruned at 1.6 s, so this has to be per tick). Count the `hit` effects whose `at` equals the hero's position and whose `from` equals the creature's position. In a solo arena that attribution is unambiguous. No engine observer is needed.

**Performance.** Measured in round 2: 1600 Node fights took 0.86 s including startup. The studio runs `compare` for all four creatures on **Run** (button or Cmd+Enter) and after each save, on the main thread, with a "running…" state. If it ever janks, moving it to a Worker is a later change of about 15 lines; it is not in v1.

**Fixed assumptions** are listed under the table: regen 1+L/4 HP every `regenMs` while fed, shield block formula, unarmed attack 3, no spells or potions used, solo adjacent start, no travel or respawn.

## 9. Milestones and acceptance checks

**Step zero of M0, before touching any code.** Copy `content/balance.json` to `tests/fixtures/balance-v1.json`. Run a capture script with the **current** code that writes `tests/fixtures/golden.json`. It records:

- `xpAt`, `maxHP`, `maxMana` and `capacity` for levels 1–60
- `skillFrom` and `magicFrom` at 40 sample inputs
- for each creature, 50 seeded fights in the §8 arena: final `rng`, `time`, hero `hp`/`xp`/`melee`/`shielding`, and the loot kinds and counts on the corpse
- one seeded Mend and one seeded Ember cast

The golden test runs against `balance-v1.json`, not the live file, so later retuning never breaks it.

### M0: the game reads content (no studio yet)

Work: `balance.ts`, `content.ts`, `icon-art.ts`; trim `model.ts`; inject the balance into the engine; update the client and server callers listed in §3; the SIGINT handler; the `tsx watch --include`; `icons.ts` from JSON; `tests/content.test.ts`.

Acceptance:

- `npm run typecheck` and `npm test` pass, with `engine.test.ts` assertions unchanged.
- The golden test is byte-identical.
- No `itemDefs`, `mobDefs`, `npcDefs`, `shellTask` or `art:` icon runs remain in `packages/` or `apps/`.
- All 27 icons rasterize identically to the old rect runs (checked in the test by turning both into 16×16 grids).
- Two `Engine`s with different balances, ticked alternately in one process, each match their solo runs.
- With `npm run dev` running, hand-edit `gutterRat.hp` to 1:
  - the server log shows a restart and `world_ready`
  - the client reloads; after Continue, the player is where they were with the same inventory
  - a rat dies in one hit
- Hand-edit one icon pixel: the hotbar changes and the server does **not** restart.

### M1: studio shell and balance editor

Work: `apps/studio` (vite config, content API, store, balance view, economy, lints), the `npm run studio` script, `tests/content-api.test.ts`.

Acceptance:

- `npm run studio` opens on `127.0.0.1:4174`.
- Editing `shortsword.buy` 60 → 40 and pressing Cmd+S changes the price in the game's trade window after reload and Continue.
- An invalid edit (`gold [9, 2]`) shows a field error and Save stays disabled.
- A PUT with a forged `Origin: http://evil.test` returns 403.
- Editing `balance.json` in a text editor and then saving from the studio gives 409 and keeps the draft.
- A backup file appears in `.local/studio-backups/`, and restoring it by copying it back works.
- Saving balance while an icon draft is dirty leaves the icon draft intact (no studio reload).
- The lints fire on a planted case: set `tail.buy = 1` with tail sold by the store, and arbitrage appears.

### M2: simulator

Work: `simulate.ts`, simulator columns, the scenario bar, `tests/simulate.test.ts`.

Acceptance:

- Level 1 with starter gear shows approximately rat 100 %, beetle 100 %, grub 15–20 %, boar 92–96 % wins. That matches all three round-2 probes.
- The same scenario and seed give identical numbers on repeat.
- Lowering grub attack 22 → 14 in the draft visibly raises its win rate before saving, and the saved column does not change.
- Running all four creatures × 200 trials × 2 balances takes under 2 s in the browser.
- A test asserts determinism and saved/draft isolation.

### M3: painter and icons

Work: `pixel.ts`, `icons-view.ts`.

Acceptance:

- Redraw `sword`, save, and the game hotbar shows it after reload; the server did not restart.
- Importing a 16×16 PNG with semi-transparent pixels is refused with a message.
- Export → edit in an external tool → import round-trips exactly (byte-compare the pixel grid).
- Undo and redo cover at least 100 strokes.

### M4: texture overrides

Work: `art.ts`, `textures.ts` overrides and `generated()`, `textures-view.ts`, the art endpoints.

Acceptance:

- "Start from current" on cobble, then repaint, then save: the town's cobble lanes show the new tile under the normal light and post in the dev client.
- All unpainted kinds look identical to before (screenshot compare of one fixed camera spot, before and after M4 with no PNGs present).
- Adding a **new** override file (not just editing one) triggers the client reload.
- Deleting the override restores the generated tile.
- `npm run build && npm run desktop` shows the override from disk, which proves the relative glob and `base: './'`.
- A 47×48 PNG is refused.
- Water is not offered.

The first useful version is M0–M4. Each milestone is independently shippable in that order. The owner can swap M3 and M4 if ground art matters more than icons, because M4 only needs `pixel.ts`, so build that first in that case.

## 10. Where I still disagree with the majority (and where I conceded)

1. **The simulator belongs in the first version, right after the editor (M2), not as a later increment.** Sol and Terra place it after the first release. I disagree:
   - Three independent probes (mine, Sol's with 500 trials, Terra's with 200) found that a level-1 player loses to the mire grub 79–86 % of the time.
   - That is the most important balance fact in the game today, and no table of hp/attack numbers shows it.
   - The code is about 60 lines that already ran unchanged against the current `Engine`.
   - A balance tool that cannot answer "what happens if I lower grub attack?" is a JSON form.
   - I did keep it as its own milestone, so the editor ships even if the simulator slips.
2. **Wire all seven `balance.json` sections in M0, not only items, creatures and spells (Terra).** Every section already exists in the export with identical values, and each one's consumers are a handful of references. Leaving merchants, quests, starter and progression in TS means two sources for those values, and editor fields that silently do nothing. Terra's real concern was quest text and existing inventories; those are handled by the text substitution and the "applies to new characters" note.
3. **Conceded: no new tuning constants** (regen, block, unarmed, potions, starting fed, assist XP, idle regen). I still think regen and block are the next two fields worth adding, because downtime and death rate depend on them more than on anything else. Each is a 2-line schema-plus-engine change when the owner asks. The simulator lists them as fixed assumptions, so they are visible.
4. **Conceded: Continue click instead of dev auto-continue.** In normal use the human click comes after the roughly 1 s server restart. If it doesn't, the existing join error appears and a second click works. Auto-continue (poll `/health`, then `enter()`) is a 15-line follow-up if the click gets tiresome.
5. **Conceded: keep `spread`, typed by kind,** instead of renaming it. The discriminated union and the labels remove the ambiguity, which was the whole point.
6. **Conceded: no HP clamp, no shared palette file, no models in v1, no bake-and-delete of generators.**
7. **Partly conceded: write serialization.** Sol and Terra asked for a write queue. A synchronous hash-check → backup → write-temp → rename block inside a single-threaded handler is serialized by construction, and I'd rather not add a queue that does nothing. The unique temp names and backup-before-replace from their reports are adopted; my round-1 order of backing up after the rename was wrong.
8. **Small difference from Terra: all ground, wall and roof slots in M4, not one ground slot.** The code path is identical per slot, and the allowlist is a `const` array. Shipping one slot saves no work and makes the owner wait for the next milestone to repaint a wall.

## 11. Out of scope for this plan

- Model or rig editing, `buildRig(models.json)`, and any change to `actors.ts`. `models.json` stays as exported and non-authoritative.
- Character or creature sprite sheets, billboards, directional sprites, or any renderer change beyond reading override pixels in `textures.ts`.
- An embedded lit game preview, a `WorldView` diorama, and `WorldView.dispose()`.
- Painted water (needs a shader change), prop planks, grass blades, foliage and the other procedural props in `terrain.ts`.
- Deleting texture generators, and fixing the `#724fS` colour.
- New tuning constants beyond the existing export; adding or renaming item, creature, spell, NPC, ground or thing ids (these stay code changes).
- Templated NPC dialogue (prices in prose are only linted).
- Gold/hour, hunt-route or town-economy modelling; spell or potion use in the simulator; multi-mob or travel scenarios; a Worker; a CLI simulator.
- Content-hash handshakes, mismatch gating, auto-reconnect, and in-place hot swap of a running engine.
- Any write to SQLite, automatic world reset, HP clamping or inventory repair.
- `git init`, multi-file transactions, auth, Electron packaging of the studio, `.aseprite` parsing, sprite-sheet slicing, palette files or enforcement, and line, mirror or selection tools.
