# Lanternfall Studio — round 3 revised build plan (Sol)

Build a standalone local Vite/TypeScript app for existing-content tuning, small icon edits, imported handmade terrain and repeatable solo fight comparisons. Keep the game renderer and character rigs. The first useful checkpoint is balance forms plus icon editing; finish v1 with terrain PNG imports and the simulator. Neither models nor a second renderer is a prerequisite.

This supersedes my round-1 plan. I read `BRIEF.md`, all three round-1 plans and all three round-2 cross-checks, then rechecked the disputed integration points against current code. This round changes only this report. No server, SQLite, browser, build, infrastructure or Git mutation was run. Acceptance checks below describe implementation work, not completed verification.

## 1. Decisions, including every ranked round-2 question

References in the first column are ranked decision numbers in `round-2/opus.md` (O), `sol.md` (S) and `terra.md` (T). They cover all O1–12, S1–9 and T1–7; closely related questions are resolved together.

| Round-2 decision | Answer | Reason |
| --- | --- | --- |
| O1, S2, T2 — authority | Make the existing balance document authoritative through instance-local Engine rules; keep IDs in TypeScript. | One runtime value source permits honest editing and independent draft simulations. |
| S1, T1 — first useful release | First ship existing item/creature/spell/progression forms and a tiny icon editor; then one ground import, remaining supported texture slots and solo simulation. | This supplies both requested workflows without waiting for rig migration or a comprehensive content platform. |
| O2, S6, T5 — combat evidence | Run the actual Engine with baseline/draft on the same nonzero seeds; no analytic combat implementation. | Rounding, attack phase, skill growth, regen and deaths already exist in Engine. |
| O3, S3, T4 — apply loop | Explicit Save; balance-only server watch/restart; full game-client reload; manual Continue. | Existing Continue works; automatic reconnection adds session/retry behavior that is unnecessary for a local v1. |
| O3, S5, T4 — saved world | Preserve stored HP, mana, XP, items, cooldowns and monster table; no new boot clamps or reset. | A clamp is a persistent gameplay change, not neutral content loading. |
| O4, S3 — Studio drafts | Keep default JSON outside Studio's runtime import graph, and suppress content-triggered Studio HMR while reporting changed revisions. | Fetching alone is insufficient if Engine or a renderer wrapper imports defaults transitively. |
| O5, S9, T1–2 — additional tuning groups | Add no new balance keys in v1; wire the existing export, and display remaining fixed rules as assumptions. | Regen/block/potion knobs can follow a concrete tuning need; corpse/stack/container policy is a wider compatibility change. |
| O6, S2, T2 — spell spread | Keep `spread`, with ID-constrained heal/attack schemas and explicit units in labels; no rename now. | The current format can express the exact behavior without conversion: heal fraction versus Ember's inclusive maximum bonus HP. |
| O7, S4, T3 — texture delivery | Fixed `content/art/<family>/<kind>.png` convention, no manifest; absent means generated, existing-but-invalid is an error. | One allowlisted file per slot removes manifest coordination and lets art migrate one material at a time. |
| O8, S1/4, T1/3 — art order | Icons first; prove one cobble ground import next, then enable the same path for the other ground/wall/roof slots. | Icons are the smallest end-to-end art path; ground art deserves the next increment rather than a long model detour. |
| O9, S7, T7 — local writes | Loopback, fixed slots, Host/Origin/content-type checks, bounded input, serialized revision checks, unique temp + rename and one pre-write recovery copy per target. | These are small protections against lost work; rotating history, authentication and Git setup are unnecessary. |
| O10, S8, T6 — preview | Raw/tiling/HUD previews and save/reload into the actual game in v1. | An embedded game-look preview needs cache invalidation and lifecycle work; the running game already supplies the real look. |
| O11, S9, T3 — palette | Per-icon palettes and free exact-color PNG imports; no project palette file, clustering, quantization or palette linter. | Cohesive art is useful, but palette policy does not need another format or migration. |
| O12 — UI stack | Vanilla TypeScript, DOM, Canvas and CSS; existing Zod/Vite, no React/Preact/component-library dependency. | This matches the project and avoids a framework migration for three small workspaces. |
| S6, T5 — economy claims | Buyer-aware ideal cash/kill and labeled successful-fight rate/budget estimates; failure counts always visible. | A reset duel does not measure recovery, respawn access, carrying or town income. |
| S9, T6 — deferred work | Models, embedded preview, additional rule groups, generator controls, advanced painting, spell/potion policies and content-version gates wait. | Each is independently addable after the owner uses the simpler tool. |

### Remaining disagreements, stated explicitly

- **I change my earlier manifest recommendation**, adopting Opus's fixed-file convention. Terra also wants fixed sparse slots; no runtime requirement needs a second file saying that an already-known filename exists. Invalid present assets must still fail visibly. This is a departure from the manifest preference in both Sol/Terra round 1, rather than an unresolved implementation choice.
- **I defer embedded WorldView preview**, despite Sol/Terra round 2 favoring an eventual adapter. Their implementation warning is correct; it is also the reason to omit it from v1. If later built, an adapter must invalidate floors/actors and manage disposal. Opus's claim that `setFloor()` alone rebuilds is false.
- **I retain an all-existing-fields balance migration**, rather than Terra's partially authoritative document. It includes merchants/quest/starter consumers, but their editor controls remain read-only initially. This avoids a mixed-source Engine and makes simulation isolation straightforward. It does not include models or additional tuning groups.
- I agree with Terra/Sol round 2 on preserving saved HP, existing spread encoding, bounded queued writes and deferring new rule groups. I reject Opus's clamp, auto-continue prerequisite, extra constants, shared palette and 30-version backup subsystem. These are minority proposals in round 2, not majority decisions silently adopted.

## 2. Rechecked facts and their implications

| Evidence in current code | Resolution |
| --- | --- |
| `model.ts:37–86,128–145`; `engine.ts:1–4` | JSON is still unused. An editor is not useful until consumers migrate. An in-memory comparison again matched 22 items, 4 creatures after tuple/object loot normalization, 6 merchants, spell core fields and shell reward data. |
| `icons.ts:2–35`; `content/icons.json` | Rasterizing the existing SVG rect runs matched all 27 JSON icon rasters. Use this baseline before deleting rect-run art; no current visual equality of a new implementation is claimed. |
| `engine.ts:24–25,265–275` | RNG is inclusive integer modulo, not continuous/unbiased uniform. Heal spread uses computed base × 0.25; Ember uses random(12). Keep RNG calls and flooring in the same order. |
| `engine.ts:318–341,369–408`; `model.ts:123` | Death restores HP immediately; effects have positions and IDs, retain 1.6 s of history, and omit passive regen. A stationary solo fixture can total incoming hit effects without an observer, but cannot call that total healing or net HP loss. |
| `index.ts:14,18–24`; `engine.ts:19–22,390,419` | `LANTERNFALL_DB` already supports a disposable world; populated monster tables are preserved. HP above a lowered max is not clamped at boot or by idle regen's guarded branch. Other ordinary gameplay, including fed hero regen's `min`, may later change current HP. |
| `net.ts:14–32`; `main.ts:93–124` | Stored token is recovery information, not automatic reconnect. Use Continue after the server is ready; early failure remains retryable. Do not change fencing/epochs/sequences. |
| Installed `node_modules/tsx/dist/cli.mjs`, `killProcess`/`relaySignal`; `index.ts:64` | Watch restarts default to SIGTERM, with SIGKILL after 5 s. Current server persists on SIGTERM. Ctrl+C relays SIGINT, requiring the same guarded shutdown handler. This verifies source behavior, not an end-to-end persistence run. |
| `view.ts:175–178,263–269`; `main.ts:343` | Floors, rigs and HUD icon markup are cached. A full game reload is the simple refresh contract. |
| `terrain.ts:91–107,216–224`; `textures.ts:39–40,109–159` | 48×48 ground spans 2×2 world tiles; wall is 16×32 and roof 16×16. Water replaces the atlas color in GLSL. Grass blades and props are separate geometry. No painted water/void/prop controls. |
| Client Vite config; installed Vite `toAbsoluteGlob()` and import-glob `hotUpdate()` | `/content/...` would resolve under `apps/client`, not repo root. Importer-relative `../../../../content/art/...` from `src/render` resolves correctly. Installed Vite 8 handles glob creation/deletion; its `hotUpdate` includes event type, whereas legacy `handleHotUpdate` only runs for updates. Test add/replace/remove, not only replacement. |
| `actors.ts:72–74`; `models.json` | First grub segment Y is ~0.1197 live, 0.12 exported; its width 0.285 already matches. Keep this tiny discrepancy out of a balance/icon migration; resolve precision and animations only if rigs later migrate. |
| `textures.ts:5,17,82` | `#724fS` parses blue as NaN, then stores 0 in clamped pixel bytes. Do not silently fix this or change generated pixels during content integration. |

The three round-2 probes all support “starter grubs are dangerous,” but different seeds produce different sampled win rates. Do not choose one probe as an exact target or inherit the round-1 analytic TTK/±15% gate. I did not rerun a performance benchmark or render a preview in this round.

## 3. Content boundary, data shapes and Engine wiring

Keep the on-disk documents as they are. No schema version bump, model format, generic expression language or content database is needed.

### Dependency direction

- `ids.ts`: fixed tuples/types only; preserve `grounds`, `things`, `equipSlots` ordering; add fixed `mobKinds` and `spellIds`.
- `model.ts`: state/protocol/map types, command validation, map indices, spatial helpers and fixed protocol limits. It may re-export IDs, but imports no default content.
- `content-schema.ts`: pure Zod schemas/types and content-reference validation; imports IDs, not model/defaults/Node.
- `rules.ts`: `createRules(balance)` with definitions and progression helpers; imports no JSON or Node APIs. Combat remains in Engine.
- `default-balance.ts`: imports/parses `content/balance.json`, exports `defaultBalance` and `defaultRules`. Only game entry points and authoring-default checks import this loader.
- `Engine(map, state, balance)`: balance is required and never defaults to an imported singleton; internally construct its rules once. Call server with `new Engine(map, restoredState, defaultBalance)` and simulator with a cloned, validated baseline/draft. Tests pass explicit fixture content. This avoids the transitive Studio-default import identified by Opus.

Move every Engine default-table/helper access to its instance rules, including inventory/weight, seeding, stats/skills, XP, words/casting, trade, quest/starter, combat, regen timing, respawn and death loss. Do not leave “mostly injected” rules. Remove old definition/progression literals from `model.ts` and migrate all callers in the same milestone. No permanent compatibility singleton in `model.ts`.

### Balance document

Use exhaustive strict records keyed by known IDs and infer TypeScript types from schemas:

```ts
type Balance = {
  progression: Progression;
  items: Record<ItemKind, ItemDef>;
  creatures: Record<MobKind, CreatureDef>;
  spells: { mend: HealSpell; ember: AttackSpell; renew: HealSpell };
  merchants: Record<NpcRole, Merchant>;
  quests: { shells: { item: ItemKind; need: number; reward: ItemKind; gold: number } };
  starter: {
    equipment: Partial<Record<EquipSlot, ItemKind>>;
    pack: { item: ItemKind; count: number }[];
  };
};
// Existing ItemDef fields:
// name, icon, weight, buy, sell;
// optional slot, attack, defense, armor, slots, stack, food, heal, mana.
// CreatureDef: name, hp, armor, attack, xp, gold:[min,max],
// loot:{item:ItemKind,chance:number}[], step, aggro.
// Merchant: greeting, topics:Record<string,string>, sells:ItemKind[], buys:ItemKind[].
```

`Progression` retains exactly: `hpBase/hpPerLevel`, `manaBase/manaPerLevel`, `capBase/capPerLevel`, `xpCurve:[a,b,c]`, `stepMs`, `attackMs`, `monsterAttackMs`, `regenMs`, `deathXpLoss`, `deathSkillLoss`, `meleeWeaponScale`, `meleeSkillDivisor`, `meleeLevelBonus`, `meleeSkillBase`, `shieldSkillBase`, `skillGrowth`, `magicBase`, `magicGrowth`, `respawnMs`.

Spell common fields are `words,name,mana,level,cooldown,base,perLevel,perMagic,spread`. Heal has fixed `kind:'heal'`; Ember has fixed `kind:'attack'` and required `range`. Keep the IDs' behavior kinds fixed. In Engine, compute `power = base + level*perLevel + magic*perMagic`; heal adds `random(power*spread)` then clamps to missing HP; attack adds `random(spread)` before existing damage/XP logic. This removes the hard-coded Renew branch without moving combat sequencing into a report library. Labels are “Random bonus / base (fraction)” and “Random bonus maximum (HP, inclusive).”

`createRules` supplies item lookup, definition tables and the existing exact progression formulas, including `floor((a*n³+b*n²+c*n)/3)` with `n = level-1`, cumulative skill tries and magic thresholds. Engine and client shielding use `shieldSkillBase`, not a stray 30; `WorldView` movement reads `stepMs`, not a stray 300. Client quest count/item copy and Engine quest requirement/reward copy derive from quest/item definitions. Starter equipment is created in `equipSlots` order and starter pack entries in array order. Loot uses `{item,chance}` directly; never normalize it differently per consumer.

Validation blocks nonfinite/unsafe numerical values, invalid references, unknown/missing keys, nonpositive HP/intervals/divisors/threshold bases, growth ≤1, losses outside [0,1], invalid gold ordering/counts, duplicate merchant entries and malformed spell words. Keep nonnegative weights, prices and attack/armor; constrain emitted counts to existing item limits. Require worst-case creature loot entries plus a possible gold stack to fit 12 corpse slots and gold maximum ≤100. Check starter slot compatibility, equipped pack, payload slots/counts and starting carry capacity. Item structure (`slot/stack/slots` and optional capability fields) is not editable in this v1.

For editable XP coefficients require `a > 0` and strictly increasing integer thresholds for all nonnegative integer n: the unfloored consecutive difference is `a*n² + (a + 2*b/3)*n + (a+b+c)/3`; require at least 1 at zero and at nonnegative integer neighbors of its vertex. This conservative check guarantees floored growth, keeps the current curve, and avoids silently imposing a level-100 cap on old characters. Simulator level input remains bounded 1–100. Skill/magic growth retain existing ceil placement. Do not use an arbitrary sample of levels as proof that an unbounded runtime loop terminates.

### Icons and textures

```ts
type IconDef = { palette: string[]; pixels: string[] };
type Icons = Record<string, IconDef>;
// Exactly 16 rows × 16 chars; #rrggbb palette entries.
// '.' = transparent; alphabet '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', index 0 = palette[0].
// At most 35 colors; '0', lowercase, unknown and out-of-palette symbols are invalid.

type ArtSlot = `ground.${GroundArt}` | `wall.${WallArt}` | `roof.${RoofArt}`;
type AssetState = { revision: string | null; source: 'png' | 'generated' };
// Fixed server map: slot -> {path,width,height}; no file path from the browser.
```

Keep all existing 27 icon keys; adding/removing/renaming keys is deferred. Required item icons, spell IDs, `bag/person/menu` must resolve against current saved icons. A pure `iconSvg(def,label?)` renders same-color horizontal runs and escapes labels; game `icon(kind,label?)` loads validated saved JSON and keeps the bag fallback. Studio uses only the pure renderer and its own draft.

Ground slots: `grass, meadow, dirt, cobble, plank, stone, sand, moss, flagstone` at 48×48. Wall slots: `plaster, stone, timber, rampart, cave` at 16×32. Roof slots: `slate, clay, thatch, teal` at 16×16. Paths are exactly `content/art/ground/<kind>.png`, `content/art/wall/<style>.png`, `content/art/roof/<kind>.png`. Prop `plankTexture()` is not ground `plank`. Water/void and props remain generated and unavailable for import.

## 4. Authoring UI and sprite workflow

Use three tabs: **Balance · Art · Simulate**. Within Balance select Items/Creatures/Spells/Progression; within Art select Icons/Textures. Each uses a compact searchable list/table, one selected record's form and a persistent Save/Revert area. IDs and units stay visible. Show changed values against the last saved baseline; do not build an editable spreadsheet grid or JSON/code editor.

Draft state per document is `{saved, draft, revision, dirty, issues, undo, redo}`; keep incomplete numeric input text visible until it parses. Save and Ctrl/Cmd+S target the active document/asset only. Save validates the whole document and server-side references, not just the visible row. Revert resets to the current baseline; Reload from disk is a separate explicit operation that warns before replacing dirty work. Failed saves/conflicts retain the draft and offer a download of draft JSON/PNG. Switching tabs never saves or discards work. Warn on browser navigation with dirty drafts; persistent crash recovery is not a v1 promise.

For icons: integer-zoom checkerboard, pencil, erase, eyedropper, editable per-icon palette swatches and one undo step per stroke. Use pointer capture so a stroke cannot paint another control. Provide keyboard-accessible palette/tool controls and a selected-pixel color control. Keep palette indices stable; forbid deleting a used entry until its pixels are explicitly remapped. No fill, mirror, line, layers, sheet editor or animation timeline. Display raw 1×/2× and the existing HUD slot size/background; the world post shader does not process HUD icons.

Import a flattened PNG from Aseprite or any image editor. Icons require exact 16×16, alpha 0 or 255 and ≤35 opaque RGB colors. Decode, make a deterministic first-appearance palette and preserve pixels exactly; reject partial alpha/too many colors with guidance to re-export. Never rescale or silently quantize. Export one icon as a source-size PNG. The imported icon PNG is an input conversion, not a second runtime source alongside `icons.json`.

For textures: choose a known slot, import opaque exact-size PNG, inspect raw pixels, a nearest-neighbor 3×3 repeat and a simple neighboring-material swatch when saved/imported neighbors exist. Save publishes that one PNG; export returns its exact source pixels. “Use generated” removes that slot's override with the same revision/recovery safeguards. It never deletes a generator or another slot. Begin with `ground.cobble`; enabling the other fixed slots reuses the same control. Keep world texture painting in external tools. A generated slot with no PNG is labeled Generated; no fabricated preview or hidden conversion is implied.

Game delivery: new `texture-overrides.ts` uses literal importer-relative globs from `apps/client/src/render`, e.g. `../../../../content/art/ground/*.png` and equivalent wall/roof patterns with `{eager:true, query:'?url', import:'default'}`. Filter through shared known slots; unsupported paths are not editor options. Await decoding of every present override before constructing `WorldView`. Initialize the game-only texture-source map once; Studio fetches previews from its API and does not import this default loader. `textures.ts` consults decoded sources at its existing atlas/wall/roof seams; generated paths are unchanged. Preserve top-to-bottom orientation, nearest min/mag, no mipmaps, sRGB, clamp for atlas, repeat for walls/roofs, existing UVs/world projection and shader scale. A missing file selects the generator; a discovered but undecodable file shows a startup error instead of silently falling back.

Vite bundles or inlines these URLs for the existing `base:'./'` build. Do not use a repository-root `/content` URL or a development-only fetch in the game. Electron must load built art from `dist/client/index.html` without the Studio running. Inspect source pixels and the actual game under its existing sunlight/cave lighting and pixel target; a repeat swatch does not claim lit parity. No lighting/post or actor silhouette change is part of this work.

UI guidance: no project-local Fluid Functionalism skill exists; I read `/Users/kubawiszniewski/.agents/skills/fluid-functionalism/SKILL.md` and ran its read-only stack check. The project has no React, Tailwind, Motion or installed Fluid components. Apply its clarity/stable-layout/reduced-motion principles with native controls and existing font/color conventions; no framework installation or signature hover animation. Avoid decorative transitions in v1, retain visible focus and field labels, preserve typing focus while derived values update. Implementation must verify the affected Studio and game UI running; this planning round has no new UI to run.

## 5. Save, reload and recovery contract

1. `npm run studio` starts only `127.0.0.1:4174` with a strict port. The game remains independently optional at `:4173/:2567`. Studio works with the game stopped.
2. `GET /api/content/balance|icons` returns `{data,revision,warnings}`, with SHA-256 of raw disk bytes. Bad disk content returns a file/field error without substituting defaults. `GET /api/art` lists fixed slots/revisions; `GET /api/art/:slot` serves only a known PNG. No models write endpoint.
3. JSON `PUT /api/content/:document` accepts `{baseRevision,data}`. PNG `PUT /api/art/:slot` uses `image/png` and an explicit expected-revision header (`none` for absent); `DELETE` uses the same expectation. Bound JSON to 1 MiB and PNG to 256 KiB. Check exact local Host/Origin and content type; no wildcard CORS, arbitrary filesystem or command endpoint. Resolve paths from `import.meta.url`, independent of cwd, and refuse symlink targets/parents escaping the content/recovery roots.
4. A single asynchronous write queue covers all Studio mutations. Inside it reread the current target and referenced document, check revision, validate the proposed whole result, and recheck the target just before replacing. Return 422 with field paths on invalid data, 409 on conflict, IO error on failure. Dirty state survives all three. This guards ordinary competing Studio tabs/external edits, not atomic compare-and-swap against arbitrary external writers.
5. Before destructive replacement/deletion, keep the old bytes in `.local/studio-backups/<document-or-slot>.previous` (one recovery copy per target, replaced atomically). If that copy cannot be written, fail the save. New assets have no prior version. Write canonical pretty JSON plus trailing newline, or fully decoded/re-encoded PNG, to an exclusively created unique sibling temp; flush/close then rename. Clean up failed temps. Return success/new revision only after replacement. A no-op save returns unchanged without restarting the game. “Use generated” removes only the fixed override after backup/revision validation.
6. Server-side PNG checks inspect signature/IHDR bounds before full decode, then actually decode and validate dimensions/alpha using a small dev-only PNG decoder (`pngjs` plus types). IHDR dimensions alone are insufficient. Re-encoding strips irrelevant metadata without changing RGBA pixels. No manifest or multi-document transaction exists. Fixed icon IDs mean changing an item's icon reference always targets an already-saved key.
7. Studio's pure import graph excludes default balance/icons and game entry points; simulator imports the JSON-free Engine. Its Vite 8 `hotUpdate` filter runs after built-in glob handling, sends a narrow `studio:content-changed` notification, and returns `[]` for authored content create/update/delete. Middleware reads disk per request, never a cached imported snapshot. External notifications mark a document changed; do not overwrite baseline/draft or undo automatically. Code edits may reload Studio; dirty navigation gets a warning where the browser allows it.
8. Change `dev:server` to `tsx watch --include content/balance.json apps/server/src/index.ts`; the server import graph must not include icons/PNGs. Share one guarded persist/close shutdown for SIGTERM and SIGINT. Native Vite JSON/glob invalidation should reload the game, rebuilding its caches. Explicitly allow the repo workspace as needed in client config and test content add/replace/remove; if a native event misses a consumer, add only a narrow Vite-8 `hotUpdate` full-reload/invalidation hook in that config. Do not assume legacy `handleHotUpdate` covers new/deleted PNGs.
9. After balance Save, wait for server `world_ready` (or check existing `/health`), then reload the game if necessary and click Continue. Art/icon saves need only game reload; no server restart. A page reload still shows Continue under current behavior. Studio reports **Written to disk**, followed by this instruction, never **Applied to game** without acknowledgement. Watchers are not synchronized; an early failed Continue can be retried. No new `/health` hash, welcome protocol, health-polling reconnect or gameplay gate.
10. Invalid hand-edited content can block game startup/build until corrected; show the actual diagnostic and retain Studio drafts. Built/Electron clients require `npm run build` to pick up saved content. There is no production content service.

Studio never opens or writes `.local/lanternfall.sqlite`. The restarted game server performs its normal persistence; no content/save-state schema version or ID change is introduced. Existing monsters retain current HP and fully use new maxima on their next ordinary spawn. Progression changes reinterpret XP and capacity; item stats affect existing equipped items. Starter changes, if later edited manually, affect new characters only; earned quest rewards are not retroactive. Do not repair inventories or normalize HP during reload.

For fresh-world implementation checks use the existing `LANTERNFALL_DB=.local/studio-test.sqlite npm run dev:server` workflow, without running a second server on the same port. Never delete the owner's DB or initialize Git. Source inspection confirms no Git repository currently exists; recovery copies are useful independently of a future owner decision to use Git.

## 6. Balance views and simulator

### Views before simulation

- **Items:** existing name/icon, weight, buy/sell and existing attack/defense/armor/food/heal/mana values; buyer/seller roles and affordability for the selected enemy. Slot, stack behavior, containers and presence of capabilities are read-only.
- **Creatures:** HP/armor/attack/XP, gold min/max, independent loot rows, step ms and aggro tiles. Each loot chance is [0,1]; sums need not equal 1. Show ideal coins and vendable loot separately, plus unsellable drops.
- **Spells:** existing mana/level/cooldown/range and power parameters with kind-specific spread units; fixed IDs/kinds. Melee-only simulation does not pretend to evaluate spell effectiveness.
- **Progression:** existing fields and levels 1–15 table of XP threshold, next-level XP, max HP/mana/capacity and skills derived from raw counters. Level/XP/capacity consequences are explained next to Save. Remaining regen/block/potion rules appear as fixed Engine assumptions, not disabled fake editable fields.
- **Context:** merchant stock/dialogue, starter kit and shell quest are consumed from JSON but shown read-only. Show exact related dialogue beside changed prices/unlock levels, with “Review dialogue copy” advisory; no heuristic number-word parser or dialogue editor. All editable values must be wired before controls ship.

Warnings do not block valid tuning: actual arbitrage (`sell > buy` with both a seller and buyer), positive sell price with no buyer, duplicate loot entries, and dependent dialogue review. Broken references/numeric constraints block Save. Avoid arbitrary resell thresholds, `designLevel`, unlock-hour alarms or loot-sum alarms.

### Reproducible real-Engine fights

Add `packages/game/src/simulate.ts` with `runFight(balance,scenario,seed)` and `runBatch(balance,scenario,seeds)`. Keep it pure with respect to disk/network: imports Engine, model/IDs and rules, no server, SQLite, renderer or default loader.

```ts
type Scenario = {
  mob: MobKind;
  level: number;                         // bounded 1..100; initialize XP with xpAt(level)
  meleeTries: number; shieldTries: number; magicSpent: number;
  equipment: Partial<Record<EquipSlot, ItemKind>>;
  initialHpFraction: number; initialManaFraction: number;
  fedMs: number;                         // default 120000; 0 = unfed; never an implicit infinite supply
};
type Trial = {
  seed: number; outcome: 'victory' | 'death' | 'timeout'; elapsedMs: number;
  incomingHitDamage: number; endHp: number; endMana: number;
  xpDelta: number; meleeDelta: number; shieldDelta: number;
  loot: { item: ItemKind; count: number }[];
  rngEnd: number;
};
```

Use one 7×7 walkable floor, no NPCs/buildings/links, valid shrine/vault and one monster spawn. Create through Engine, replace starter equipment/contents deliberately using real item structures, set XP/raw counters and starting HP/mana/fed duration, place adjacent and target through `action()`. No skill-level inversion or arbitrary movement fixture in v1. Use explicit valid equipment, including the no-shield case. Each trial is independent; baseline and draft derive maxima from their own rules at the same chosen level/fractions. Offer “Starter” from the selected content plus a custom existing-gear preset; show actual loadout and counters.

Step exactly 100 ms per tick. Stop immediately on target death, increased hero deaths, or 300 s (3,000 ticks); check deaths before reading restored HP. Aggro zero/low damage are legitimate configurations that may timeout. All normal fed regen, XP/skill growth, level-up and RNG sequencing remain enabled. No casts, potions, refeeding, looting AI or second fight. Clearing notices/effects after collecting a tick must not change gameplay state or RNG.

Read new effects by monotonically increasing effect ID. In this stationary adjacent fixture, sum only `hit` values at the hero's pre-tick position with the monster's position as `from`. The fatal tick uses positions captured before immediate shrine revival. This is **gross incoming rolled hit damage**, including a fatal blow's overkill, not HP removed after clamping or total healing. End HP is separately shown and labeled restored on death. Do not promise total regen/heal, partial-block counts or generalized actor attribution; no Engine observer is needed for these metrics. Deduplicate retained effects and drain notices. Extract killed target corpse loot immediately. UUIDs may differ; compare normalized numeric outcomes/item-kind counts, not UUIDs.

Default 200 nonzero seeds from a displayed fixed base, same list for baseline and draft. Permit 1–500 trials; reject seeds that become zero after uint32 conversion. Start runs explicitly, mark results stale on draft/scenario changes and reject invalid drafts. Run bounded batches in one worker with request IDs; Cancel terminates/recreates it and late results are ignored. The worker is a responsiveness boundary, not a claimed millisecond performance target. Show progress and measure actual browser duration during implementation.

Results: victories/deaths/timeouts as counts and percentages over **all** trials; mean/median/P90 TTK and incoming damage **conditioned on victory**, N/A if no wins; failed-trial damage/end-state separately. Label each scenario, tick, fed duration, seeds and content baseline/draft. A compact distribution and saved-versus-draft comparison may use native SVG; no chart library. Do not silently drop failures from the visible denominator or present conditional results as safe farming.

### Economy assumptions

Let `C = (goldMin+goldMax)/2 + sum(chance*sell)` only for drops with an actual merchant buyer. This is idealized cash/kill with all loot recovered/sold; the modulo PRNG and 1/10000 chance quantization mean it is not an exact RNG expectation. Unsold consumables have zero cash value, not their shop replacement price. Show buyer routes. Current rat ideal value is 2 coins + 0.6×2 tail value = 3.2; its loaf has no buyer.

Before simulation, show C and `ceil(max(0,price-currentGold)/C)` for items an actual merchant sells, N/A for C≤0; call it a **budget ratio**, not an expected random stopping time.

After simulation let `T = mean winning fight seconds + chosen recovery/travel/loot seconds`. Show `3600*creature.xp/T` and `3600*C/T` only under **Successful fights, unlimited targets**. Require explicit overhead entry; no default implication that full healing is free. Keep mortality/timeouts beside the rates and warn these estimates omit them. They are planning scenarios, not observed/sustained income.

Food costing is an optional assumption selector: “starter/no purchased food” or “continuous feeding with selected merchant-sold food.” The latter displays ideal `foodGoldPerHour = price*3600000/foodMs` (currently loaf 60 gold/hour), ignoring drops/initial food/waste. Then `netGoldPerHour = gross - assumedFoodGoldPerHour`; net per kill for affordability is `C - assumedFoodGoldPerHour*T/3600`, N/A if nonpositive. Potions/casts are never silently charged or modeled in this melee policy. Warn if the chosen continuous-feeding cost assumption extends beyond the trial's finite fed state. No automatic downtime reconstruction, spawn-count cap, hours-to-next-level claim, quest income, shop travel, capacity, death recovery or continuous-hunt simulation.

## 7. Exact implementation files

Paths are relative to `~/Personal/game`. This is the v1 file set, not work performed in this round.

| Add | Purpose / milestone |
| --- | --- |
| `packages/game/src/ids.ts` | Content/protocol IDs without defaults (M0). |
| `packages/game/src/content-schema.ts` | Balance/icon validation and inferred types (M0). No model schema yet. |
| `packages/game/src/rules.ts` | Per-snapshot progression/helpers (M0). |
| `packages/game/src/default-balance.ts` | Game-only parsed balance and rules (M0). |
| `packages/game/src/icon-svg.ts` | Pure draft/saved grid-to-SVG renderer (M0). |
| `packages/game/src/art-slots.ts` | Fixed slot IDs, relative paths, dimensions (M2). |
| `packages/game/src/simulate.ts` | Arena, trial/batch and normalized results (M3). |
| `apps/client/src/render/texture-overrides.ts` | Static globs, decode/preload and game-only source lookup (M2). |
| `apps/studio/package.json` | Private `@lanternfall/studio` workspace (M1). |
| `apps/studio/index.html` | Standalone entry (M1). |
| `apps/studio/vite.config.ts` | Root, loopback port, middleware and content HMR isolation (M1; M2 art events). |
| `apps/studio/server/content-api.ts` | Fixed GET/PUT/DELETE, revisions, queue, recovery/atomic IO (M1; M2 PNG decoder). |
| `apps/studio/src/main.ts` | Tabs, selection, shortcuts/status (M1). |
| `apps/studio/src/store.ts` | Saved/draft/revision/conflicts/undo, no imported defaults (M1). |
| `apps/studio/src/balance.ts` | Tables/forms/progression/economy/warnings (M1; M3 combat results). |
| `apps/studio/src/icons.ts` | Indexed pixel controls and HUD previews (M1). |
| `apps/studio/src/png.ts` | Browser PNG decode/import/export (M1; M2 opaque textures). |
| `apps/studio/src/textures.ts` | Fixed-slot PNG import/repeat/neighbor/revert UI (M2). |
| `apps/studio/src/simulate.ts` | Scenario/results and worker lifecycle (M3). |
| `apps/studio/src/sim.worker.ts` | Batch entry with request IDs (M3). |
| `apps/studio/src/style.css` | Native form/table/canvas layout and existing visual conventions (M1). |
| `tests/fixtures/studio-balance.json` | Frozen current balance for engine behavior fixtures, not an authoring source (M0). |
| `tests/content.test.ts` | Content boundary, icon raster migration, spell/loot and snapshot isolation regressions (M0). |
| `tests/studio-content.test.ts` | Temporary-directory write rejection/conflict/recovery and PNG boundaries (M1/M2). |
| `tests/simulate.test.ts` | Direct-Engine versus harness, death/timeout and seeded repeatability (M3). |
| `docs/studio/README.md` | Run/save/Continue, asset dimensions, DB semantics, assumptions, manual recovery and smoke checklist (M1 onward). |

| Change | Exact responsibility |
| --- | --- |
| `package.json` | Add `studio` script and balance-only `dev:server` include; add dev-only `pngjs`/`@types/pngjs` for PNG save validation in M2. |
| `package-lock.json` | Workspace registration and PNG dev dependencies only, using npm. |
| `tsconfig.json` | Enable `resolveJsonModule`; retain strict settings and existing included paths. |
| `packages/game/src/model.ts` | Extract/re-export IDs, retain protocol/state/helpers, remove default tables/progression; known mob/spell enums use tuples. |
| `packages/game/src/engine.ts` | Required balance injection, all existing exported consumers, object loot, exact data-driven spell/quest/starter behavior; no observer/clamps/new groups. |
| `apps/server/src/index.ts` | Pass default snapshot; guarded shared SIGTERM/SIGINT persistence/close. No protocol or DB schema changes. |
| `apps/client/src/main.ts` | Read default rules, configured shielding/quest copy; M2 await art preload before `WorldView`. No auto-continue. |
| `apps/client/src/icons.ts` | Validated JSON wrapper around pure SVG rendering; delete rect-run table. |
| `apps/client/src/render/view.ts` | Read saved rules for actor labels/maxima and `stepMs`; no new preview/lifecycle API. |
| `apps/client/src/render/textures.ts` | Consult loaded ground/wall/roof overrides at existing seams, preserve generators/settings. |
| `apps/client/vite.config.ts` | Workspace/content access; verify full reload for balance/icons and PNG add/replace/remove, narrow reload hook only if native behavior misses it. |
| `tests/engine.test.ts` | Pass explicit frozen fixture rules and migrate imports; preserve behavioral assertions. |

No initial authored JSON values need changing: `content/balance.json` and `content/icons.json` become runtime sources as-is and are subsequently written by owner saves. `content/models.json`, `actors.ts`, `terrain.ts`, `town.ts`, `world.ts`, `net.ts`, lighting/post, desktop shell and existing client CSS are unchanged. The PNG loader seam avoids threading a new renderer abstraction through them. Assets are created only when imported; no default baking task. Runtime writer-owned files are `content/{balance,icons}.json`, the 18 enumerated PNG slots above, unique sibling temporary files and bounded `.local/studio-backups/*.previous`; no other write roots.

## 8. Milestones and acceptance

### M0 — only the required runtime content seam

Implement IDs/schema/rules/default loader, explicit Engine balance, current-field wiring and indexed icon consumer. Freeze the pre-migration balance fixture and capture normalized seeded fights plus Mend/Ember/Renew casts before removing literals. Compare item/merchant/creature records and all icon rasters before/after. No model migration.

Acceptance: `npm run typecheck`, `npm test`, `npm run build`; existing engine behavior assertions remain valid with explicit fixtures; seeded outcomes, final HP/XP, RNG and loot match migration baselines. Two simultaneous Engines with different snapshots use their own prices, skill/progression and combat data. A changed spell power/creature HP/progression field reaches both server and HUD. No JSON/default import path reaches Engine/model/rules/icon-svg. Bundled icon/default data works in the disk-loaded client. Frozen fixtures remain intentional so later tuning does not rewrite gameplay tests for every price change.

### M1 — first useful checkpoint: balance and icons

Add standalone Studio, small forms, icon tools, save/revert, API/recovery and draft HMR isolation. Wire balance-only server watch and both shutdown signals. Ship direct-value/economy views, not fake TTK estimates.

Acceptance: `npm run studio` works with the game stopped. Change a price and creature attack, save, restart/Continue and verify actual trade/combat plus matching HUD; change an icon and verify hotbar/trade pixel output after client reload, without server restart. Malformed numbers, unknown IDs, icon `0`, bad references and stale revisions preserve target bytes and drafts. Two saves of the same revision yield one success/one conflict. Recovery contains previous bytes, not newly saved bytes; a failed backup/write reports failure. Save one document while another is dirty: Studio page, selection and other undo/draft survive. Actual balance watch restart and Ctrl+C persist active test-world state; confirm no new reset/clamp logic and no art-triggered server restart. Check keyboard/focus/invalid numeric input in running UI. Re-run typecheck/tests/build.

### M2 — handmade world textures

Prove `ground.cobble` first, then enable the other eight ground, five wall and four roof slots through the same allowlist/loader/import UI. No pixel painter or embedded renderer. Add dev-only full PNG decoding and source preload.

Acceptance: an opaque 48×48 cobble appears in both Studio repeat swatch and actual game at the expected two-tile scale. A 16×32 wall and 16×16 roof render on both axes/orientations with unchanged mapping/sampling. Add, replace, remove and re-add a PNG without restarting Vite; the next game load must see the new source set. Unmodified slots keep generated output, including current plank pixels. Truncated PNG, forged dimensions, wrong size, partial alpha, unknown slot and escaping path cannot publish. Water/void/prop controls explain unsupported status. Invalid external PNG is a visible load error. Build, launch the existing Electron client from disk with Studio stopped and verify imported art resolves. Inspect under the actual game's lighting/post, not just raw canvas. Art saves never restart the server; Studio drafts survive content events. Re-run typecheck/tests/build.

### M3 — bounded real-Engine comparison; v1 complete

Add melee-only arena harness, worker, scenario controls, baseline/draft comparisons and labeled estimates.

Acceptance: same validated scenario/content/seeds repeats normalized outcomes in Node and browser; compare the harness to a separately driven direct Engine fixture including HP/XP, elapsed ticks, loot and final RNG. A deliberately weaker hero dies and is counted despite restored HP; an impossible fight times out. Incoming damage does not double-count retained effects, omit the fatal tick or subtract regen; victory-only metrics exclude failures with denominators visible. Draft creature/item/progression changes affect results before Save; baseline remains unchanged, stale results are marked and cancellation keeps typing responsive. Food expiration, no-shield and snapshot isolation cases work. Costs/rates display chosen overhead, finite fed state and failure exclusions. No server/DB/default-loader imports. Preserve the direct spell-spread migration checks even though the melee policy does not cast. Re-run typecheck/tests/build and verify the complete app in use.

Tests protect content/IO boundaries and real behavior; no field-by-field form tests, source-literal grep, analytic tolerance gate or unrelated unit-test expansion. All filesystem tests use temporary directories, game checks use the disposable DB, and none require mutating the owner's world.

## 9. Explicitly out of scope for v1

- Model JSON authority/editor, rig builder, body/bone topology, per-face textures, `.vox`/GLTF, directional/billboard character sprites, actor animation editing.
- Embedded WorldView preview, second lighting/post pipeline, floor/actor live invalidation/disposal framework, renderer overhaul, water/void/foliage/prop art changes.
- Full paint suite, terrain painting, palette enforcement/clustering, sheet packing, fill/line/mirror, layers, animation timelines, `.aseprite` parsing or external editor command execution.
- New/renamed gameplay or icon IDs, scripts/formula editor, protocol/stack/container limits, extra regen/block/potion/assist tuning groups, editable quest/starter/merchant workflows. The existing JSON sections still have real runtime consumers.
- In-process balance swaps, automatic reconnect, server/client content-hash gates or “applied” acknowledgements, automatic publishing or production write endpoints.
- Saved-world editing/reset/clamping/repair, content-driven save migrations, automatic Git initialization or commits, rotating backup history, multi-file transactions or multiuser editing.
- Cast/potion/refeed policies, continuous hunts, route/spawn competition, multiplayer assists, exact town-income predictions, automatic rebalancing/optimization, CLI simulator and broad analytics.
- New framework, Electron Studio wrapper, hosting/accounts/cloud sync, map editing, infrastructure execution/deployment.

The owner gets a small local tool with useful end-to-end saves, intentional pixel assets and draft balance evidence. Further capabilities should follow actual use, not delay these three workflows.
