# Lanternfall Studio — round 3 revised build plan (Terra)

Build a separate local Vite/TypeScript app, launched with `npm run studio`, for one developer. The first release consists of four small milestones: make selected balance and icon data authoritative; provide safe forms and icon painting; add one hand-painted ground texture slot; add a seeded, real-Engine fight comparison. Each feature must change what the game actually uses. The first three milestones already deliver a useful edit → save → see-in-game loop; the fourth completes the balance feedback requested here. No renderer overhaul, model migration, new content IDs, or saved-world editor is required.

This report is a plan, not an implementation or a rendered verification. I read the brief, all six round-1/round-2 reports, and checked the disputed claims against `model.ts`, `engine.ts`, the client renderer, `net.ts`, server startup, the content exports, Vite configuration and the installed `tsx` watch code. In particular: water's fragment shader replaces the atlas color; `WorldView.setFloor` reuses cached floors; a game reload returns to a manual Continue gate; the server restores existing monster state without clamping; and `tsx`'s watch restart sends SIGTERM. The installed code supports the proposed directions, but the end-to-end asset, watch and Electron paths below remain implementation acceptance checks.

## Ranked decisions from round 2, resolved

The following covers the ranked lists in all three cross-checks; overlapping questions are combined.

| Decision | Answer and one-line reason |
| --- | --- |
| First useful version and order | Ship working balance forms, icons and one ground override before the simulator; complete v1 with a small real-Engine simulator. This covers both parts of the request without waiting for all content or rigs. |
| Authority / M0 | Make only `items`, `creatures`, `spells` in `balance.json`, and `icons.json`, authoritative; keep other balance sections explicitly non-authoritative. A narrow migration can be verified end to end, without making unexposed quest and progression exports falsely authoritative. |
| IDs and parity | Keep fixed ordered IDs in TypeScript, validate data, inject a per-Engine snapshot, and remove the migrated TS definition tables. This gives each migrated field one runtime owner without changing map/save identities or random behavior. |
| Additional tuning constants | Leave regen amounts, block, potion spreads, starter food, unarmed attack, assist XP and idle regen in code and label them as fixed simulation assumptions. They are useful future knobs, but are not needed to tune the selected fields or reproduce actual fights. |
| Spell spread | Keep the existing `spread` bytes, with a fixed ID/kind-discriminated schema and labels “fraction of heal base” versus “maximum added attack roll.” This preserves the unused export format while eliminating ambiguous controls. |
| Combat math | Keep combat sequencing and RNG in `Engine`; do not build a parallel analytical combat model. The simulator already calls the game behavior directly. |
| Balance results | Show direct stats, buyer-aware ideal cash per kill, affordability and arbitrage; add baseline/draft Engine duels with identical seeds. This is useful evidence without implying a duel predicts an entire hunt. |
| Save / apply | Explicit save writes disk only; restart the server for balance, reload the client, then click Continue. Art needs a client reload only. This is understandable and avoids unverified automatic synchronization. |
| Server watcher and reconnect | Use the existing manual restart as the v1 contract; no new watcher or auto-continue is required. `tsx` restart already uses SIGTERM, but watcher timing and persistence need an actual end-to-end check before making it a promise. |
| Studio draft survival | Fetch editable data through the Studio API; keep schema, icon renderer and Engine imports free of default JSON, and suppress content HMR events if any remain. An editor save must never reload the Studio and discard another dirty draft. |
| Saved world | Preserve SQLite and existing hero/monster state, with no automatic HP clamp or inventory repair. Retuning a definition is not consent to rewrite saved game state. |
| Art path and asset location | Keep generators; start with one opaque 48×48 grass PNG override under the client public directory, with a sparse manifest. A fixed slot plus packaged, explicitly referenced file avoids a big-bang bake and works with a disk-loaded build if verified. |
| Icon versus ground | Deliver a tiny icon editor first, then the ground slot before calling v1 complete. Icons prove the data pipeline; world art moves the scene toward the requested handmade look. |
| In-studio game-look preview | Use raw and repeat swatches, then the running game for the lit preview. `WorldView` caches floors and owns a loop, so an embedded preview is not a zero-refactor prerequisite. |
| Shared palette | No project-wide palette, clustering, or palette lint in v1; use each icon's existing palette. This preserves pixels and avoids an extra asset system. |
| Local write safety | Use loopback, fixed slots, bounded same-origin requests, a serialized revision check, unique sibling temp files and a single pre-write recovery copy. This protects ordinary editing without claiming a cross-process transaction. |
| UI stack | Use vanilla TypeScript, DOM and canvas as in the game. Existing dependencies already cover the app. |
| Later features | Defer progression and other tuning groups, full texture families, rig editing, a game-look diorama, policy automation and version handshakes. They are independently useful additions, not prerequisites for the initial tool. |

**Remaining disagreement with the majority:** Opus wants all of `balance.json` authoritative immediately and Sol's ranked first version includes editable progression; I would migrate the item/creature/spell sections only. The quest item/text, starter inventory and timing/progression consumers are distributed between code and saved state, so a partial migration must say exactly which source owns each field. I also include one ground slot before declaring v1 complete, earlier than the others' milestone order, because the owner explicitly wants sprite work and the terrain is a major part of the visible game. I do **not** adopt Opus's boot-time monster clamp, auto-continue, extra constants, shared palette or generator deletion; Sol and I agree that these are separate choices. Opus's claim that an embedded `WorldView` needs no invalidation is contradicted by `view.ts:175–178` and `:261–269`.

## Authority, data and file changes

Paths are relative to `~/Personal/game`. The list below is the complete intended v1 change set; it is not a list of work already performed.

**Add**

- `apps/studio/package.json`, `apps/studio/index.html`, `apps/studio/vite.config.ts`: private workspace and loopback Vite app (`127.0.0.1:4174`, strict port), with a dev-only middleware plugin.
- `apps/studio/server/content-api.ts`: fixed document/asset routes, validation, revisions and atomic writes.
- `apps/studio/src/main.ts`, `store.ts`, `style.css`: navigation, loading/error/dirty state, explicit save, revert, Ctrl/Cmd+S and conflicts.
- `apps/studio/src/balance.ts`, `economy.ts`: item, creature and spell tables/detail forms and buyer-aware calculations.
- `apps/studio/src/icons.ts`, `ground.ts`: indexed pixel editor and PNG ground-import/repeat preview.
- `apps/studio/src/sim.worker.ts`, `simulation.ts`: worker entry and isolated seeded arena/batch runner.
- `packages/game/src/ids.ts`: dependency-free, ordered ID tuples and types extracted from `model.ts`.
- `packages/game/src/content-schema.ts`: browser-safe schemas and cross-reference checks for the three authoritative balance sections, icon data and ground manifest; no filesystem or default JSON imports.
- `packages/game/src/default-content.ts`: server/client-only validated imports of `content/balance.json`, exporting the three authoritative sections as an immutable default snapshot.
- `packages/game/src/icon-svg.ts`: pure `renderIcon(icons, id, label?)` function shared by Studio and the game's icon wrapper.
- `content/ground-overrides.json`: initially `{ "ground": {} }`; the optional `grass` slot refers to one immutable, content-hashed PNG filename.
- `apps/client/public/art/ground/grass-<sha256>.png`: created only by a successful grass import; older referenced images are retained for recovery.
- `apps/client/src/render/ground-art.ts`: validate/resolve the grass manifest, load/decode its image before the first floor is built, and expose the optional image to the atlas builder.
- `tests/content.test.ts`, `tests/studio-content.test.ts`, `tests/simulation.test.ts`: focused boundary, migration and simulator checks described below. Use a temporary directory and isolated fixture, never the owner's DB.

**Change**

- Root `package.json`: add `studio` script, e.g. `vite --config apps/studio/vite.config.ts`; add `pngjs` and its TypeScript declarations as development dependencies for actual server-side PNG decoding. Update `package-lock.json` for the new workspace/dependencies. Do not make `studio` start the game.
- `packages/game/src/model.ts`: import/re-export ordered IDs as needed, remove only the migrated item/creature/spell definition tables, retain existing progression helpers, NPC definitions, quest, starter behavior and protocol/state schemas. Preserve all numeric enum ordering and types.
- `packages/game/src/engine.ts`: require `Engine(map, state, balance)` with a validated immutable snapshot; use its item/creature/spell sections at every corresponding call site. Preserve existing progression, starter/quest/merchant code, combat ordering, rounding and RNG calls. Convert loot-object iteration deliberately; replace hard-coded spell powers with the equivalent data fields.
- `apps/server/src/index.ts`: pass `defaultBalance` into `Engine`; validate before accepting connections. Preserve restore behavior and SQLite data. Add an idempotent SIGINT handler sharing the existing SIGTERM persistence/close path, and verify both signals in a disposable world; this is not a new reload protocol.
- `apps/client/src/main.ts`, `apps/client/src/render/view.ts`: use the same default definitions for prices, stats, spell UI and creature names/HP, while retaining code-owned progression and movement constants. Await ground-image preload before constructing `WorldView`; make a missing/invalid selected asset a visible startup error.
- `apps/client/src/icons.ts`: replace rect-run definitions with the validated `icons.json` and shared pure renderer; retain its public `icon()` signature and bag fallback. Full page reload clears the current icon cache.
- `apps/client/src/render/textures.ts`: let `groundAtlas` substitute the preloaded grass image in the existing grass atlas slot, otherwise use the existing generator. Preserve 48 px atlas layout, sampling, color conversion and texture settings. Leave `terrain.ts`, lighting, shader, grass geometry and other generators unchanged unless the preload seam proves a minimal signature change necessary; do not silently fix the existing `#724fS` art literal.
- `content/balance.json`: preserve the present data and `spread` encoding; no unrelated numerical changes. Its `items`, `creatures` and `spells` sections become authoritative. `progression`, `merchants`, `quests`, `starter`, and all of `content/models.json` remain historical exports, not editable runtime configuration.
- `content/icons.json`: existing authoritative icon pixels, changed only when the owner saves an icon.
- `tests/engine.test.ts`: supply an explicit default or frozen test balance to existing Engine construction/imports. Keep initial behavior checks, but avoid tests whose assertions forever depend on values the owner is expected to retune.
- `README.md`: document launch, authoritative boundary, exact reload steps, immutable asset recovery, existing-world caveats and the separate `LANTERNFALL_DB` test workflow.

The game does not import the Studio or its API. `default-content.ts` is imported by the server and the game client, never by the Engine, pure schemas, simulator or Studio. This avoids the `model → schema → model` initialization cycle and keeps a saved JSON file out of the Studio Vite module graph. If Vite still forwards an external `content/` event through another import, a narrow Studio `handleHotUpdate` filter suppresses that content event only; test actual draft survival rather than assuming the graph is clean.

### Content shapes and validation

Keep the existing JSON layout and IDs. A precise conceptual snapshot, with types inferred from Zod, is:

```ts
type CombatContent = {
  items: Record<ItemKind, {
    name: string; icon: IconId; weight: number; buy: number; sell: number;
    slot?: EquipSlot; attack?: number; defense?: number; armor?: number;
    slots?: number; stack?: boolean; food?: number; heal?: number; mana?: number;
  }>;
  creatures: Record<MobKind, {
    name: string; hp: number; armor: number; attack: number; xp: number;
    gold: [number, number]; loot: { item: ItemKind; chance: number }[];
    step: number; aggro: number;
  }>;
  spells: {
    mend: HealSpell; renew: HealSpell; ember: AttackSpell;
  };
};
type HealSpell = { kind: 'heal'; words: string; name: string; mana: number;
  level: number; cooldown: number; base: number; perLevel: number;
  perMagic: number; spread: number /* fraction of base */ };
type AttackSpell = { kind: 'attack'; words: string; name: string; mana: number;
  level: number; cooldown: number; base: number; perLevel: number;
  perMagic: number; spread: number /* inclusive added-roll maximum */; range: number };
type Icons = Record<IconId, { palette: string[]; pixels: string[] }>;
type GroundOverrides = { ground: { grass?: `grass-${string}.png` } };
```

`IconId` is the current fixed 27-key set; retain all IDs, including `bag`, spells and HUD utility icons. Icon rows are exactly 16 ASCII symbols, exactly 16 rows; `.` is transparent, `1`–`9` refer to a present 1-based `#RRGGBB` palette entry. Explicitly reject `0`, unknown symbols and out-of-range indices. The game must keep the existing draw ordering and visually match all current icons before the rect-run table is removed.

Schemas require every current fixed ID, reject unknown keys, use finite bounded numbers and integer constraints wherever the engine expects integers, positive HP/step/cooldown, probabilities in `[0,1]`, and ordered nonnegative gold endpoints. Enforce `gold[1] <= stackMax` and a loot list that, including a possible gold stack, fits the 12-slot corpse; preserve independent loot-roll order. Validate that item icon and loot references exist, and that slot/item and fixed spell-ID/kind combinations are coherent. Check icon references against the fixed `IconId` tuple at runtime and against the current icon document on save; the server must not import `icons.json`, so icon saves do not restart it. Validate all used values at load and save and report path-specific errors. A malformed external file must fail visibly, not fall back to stale or made-up defaults. Do not add configurable stack/container limits.

Keep UI editing narrower than the schema: existing numeric item `weight`, `buy`, `sell`, `attack`, `defense`, `armor`, `food`, `heal`, `mana`; creature `hp`, `armor`, `attack`, `xp`, `gold`, each existing loot chance, `step`, `aggro`; spell `mana`, `level`, `cooldown`, `base`, `perLevel`, `perMagic`, `spread`, and Ember `range`. Display fixed IDs, item names/icons, item category/slots/stacking, loot item identities, spell kind/words, merchant routes and other exported sections read-only or label them code-owned; do not offer add/remove or rename. The API accepts only the editable projection and merges it into the current document under the revision check, preserving all other bytes semantically; it rejects attempts to alter protected fields. Runtime consumers nevertheless use the complete three validated authoritative sections. Merchant routes, quest, starter and progression values shown in the Studio must come from their actual code-owned definitions, not stale copies in JSON.

For healing, compute `base + random(base * spread)`; for Ember, compute `base + random(spread)`. `random` floors the nonnegative bound and returns an inclusive integer, so the current `0.25` and `12` reproduce `/4` and `random(12)`. Do not reorder RNG calls or loot. Show a specific warning if changed tail/shell/silk sell prices disagree with the existing fixed NPC dialogue, or Ember/Renew levels disagree with the shrine's fixed unlock text; those warnings do not pretend the dialogue changed.

## Studio workflow and save/reload contract

The app has **Balance**, **Icons**, **Ground**, and **Fight** views. Each saved document has a baseline, editable draft, dirty indicator, validation errors, explicit Save and Revert. Invalid input stays visible; it cannot be saved or run in the simulator. Ctrl/Cmd+S saves the active document. A reload-from-disk action is explicit and warns before discarding a dirty draft; an external-change conflict leaves the draft available for copying or export. The app runs independently of the game server.

1. `GET /api/balance`, `/api/icons`, and `/api/ground` return the current allowed data plus SHA-256 of the actual document bytes. Ground also returns the current referenced image through a fixed, read-only route. The middleware never accepts a client-supplied filesystem path.
2. A `PUT` carries the draft and its `baseRevision`. The server accepts only the fixed routes and editable fields, validates the proposed document and references against current other documents, and reports `422` with field paths for invalid data. It rejects unexpected Host/Origin, wrong content type and oversized bodies; bind only to loopback, provide no CORS, shell command or arbitrary-file endpoint.
3. Serialize saves inside one Studio server. Re-read and compare the actual file hash immediately before replacement; return `409` for a changed revision and retain the draft. Preserve one previous document in `.local/studio-backups/` **before** replacing it; use a unique exclusive sibling temp file, flush/close and rename on the same filesystem, clean up failures, and return the revision of the bytes written. This protects ordinary two-tab edits, but an unrelated process can still race between the last check and rename. Per-file replacement is atomic, not a multi-file transaction.
4. For ground import, accept only the `grass` slot, validate a bounded PNG by fully decoding it server-side with `pngjs`, require exactly 48×48 and alpha 255 for every pixel, and do not resize, quantize or silently discard pixels. Write a content-hashed immutable PNG first; recheck the manifest revision and then atomically replace the manifest. A failure or conflict leaves the previous manifest usable; an unreferenced staged PNG may remain. Clearing the slot writes an absent entry and retains old PNGs. A missing/invalid image named by the manifest is an error, while an absent entry intentionally uses the generator.
5. Report **Saved to disk**, not “applied to game.” For balance, wait for an already-triggered `tsx watch` restart or manually stop/restart `npm run dev:server` if needed, wait for `world_ready`, reload the client page, then Continue. The tested SIGINT/SIGTERM shutdown path persists the latest state before exit; if it fails, stop and report the failure rather than claiming a safe reload. For icon/ground edits, reload the client only. A malformed manual external edit can prevent startup and must show its error. Do not require a watcher; if using `tsx watch`, verify the balance file actually triggers it and the SIGTERM path persists state, and watch balance only, never art. No auto-reconnect or client/server content hash is claimed. A packaged client holds a build snapshot: run `npm run build` again before launching Electron after edits.

The saved world is never reset by Studio. Existing mobs retain their current HP until subsequent game behavior or respawn: after lowering a maximum it can temporarily exceed that maximum; raising it does not heal them. Existing inventories, XP and equipment remain; starter changes, when supported later, would apply to newly created characters. For a fresh-state smoke check, run the server manually with a **new, separate** path, e.g. `LANTERNFALL_DB=.local/studio-test.sqlite npm run dev:server`; do not overwrite or delete the real DB. The owner decides when to remove any disposable files.

## Sprite and texture workflow

**Icons:** choose an existing icon, paint individual pixels on a zoomed 16×16 checkerboard with pencil and eraser, select/add/edit up to nine per-icon colors, and undo/redo within the current session. Show the selected icon at actual HUD size using the shared renderer. Allow single-icon PNG import/export for an external pixel editor: exactly 16×16, alpha must be either 0 or 255, at most nine distinct opaque RGB colors; reject unsupported dimensions, partial alpha or excess colors with a clear reason. Preserve colors exactly and encode an explicit 1-based palette; never silently quantize. Save writes `icons.json`, then reload the game to see it in the hotbar/inventory.

**Grass:** choose the grass ground slot and import a flattened 48×48 opaque PNG from Aseprite or another editor. Show the raw image and a nearest-neighbor 3×3 repeat so the owner can inspect seams; offer export of the currently selected image and a visible “use generated grass” revert. The original generator remains the fallback. The actual game is the lighting/post-processing preview: save, reload, inspect grass in the world, and iterate. The swatch is not a claim about the final lit look; separate procedural grass blades remain visible. There is no pretend water import: water's shader overrides its atlas sample. Wall/roof (16×32/16×16), other grounds and prop planks can reuse the proven path in a later slice, but are not v1 controls.

The sparse manifest's `grass` filename must match `grass-<64 lowercase hex characters>.png` and point under the fixed public asset directory. Resolve it relative to the built document (`new URL(..., document.baseURI)`), and preload with an `Image`/decode path that can work from Electron's `file:` URL; do not assume a `fetch(file://...)` call works. `public` is served by client Vite in development and copied by the client build. Prove both assumptions with actual dev and Electron smoke checks. Preserve nearest filtering, sRGB handling, atlas clamp/wrap and the existing 2×2-world-tile scale. No root-relative `import.meta.glob('/content/...')` is assumed to resolve outside the client root.

## Balance views and simulator

**Tables.** Items show editable stats and price/weight, merchant buyer/seller roles from the code-owned NPC definitions, and baseline versus draft. Creatures show HP, armor, attack, XP, gold, step, aggro and each independent drop chance. Spells show cost, unlock, cooldown, power and the kind-specific spread units. A read-only progression/assumptions panel shows the currently code-owned progression and fixed regen, block, potion and starter-food rules. Show validation errors at their fields. Warnings are advisory, distinct from invalid data.

**Economy.** For each creature, show idealized gold per successful kill: `(goldMin + goldMax)/2 + Σ(chance × item.sell)` only for drops an actual merchant buys; identify unsellable drops separately. The actual PRNG uses modulo and quantized chance checks, so label this an idealized value, not an exact measured expectation. Show buyer and seller roles and warn on arbitrage only if an item has both routes and `sell > buy`. A selected sold item can show `ceil(max(0, price − currentGold) / idealCashPerKill)` as an *affordability ratio*, or N/A if cash is zero/no seller; it is not an expected random stopping time. Do not present XP/hour, gold/hour, food cost or downtime as observed town outcomes in v1.

**Fight view.** Inputs: a fixed creature ID; level/XP, raw melee and shielding counters with displayed derived skill levels, valid weapon/shield/armor equipment, initial HP and fed duration; defaults are the actual level-1 starter equipment, HP and 120,000 ms fed. State exactly that the only policy is solo auto-melee, no casts, potions or new food, beginning adjacent, with normal skill gain, regeneration and level-up. `xpAt` and `skillFrom` remain the actual code helpers; never confuse raw counters with skill levels. Do not imply editable spell values are exercised by this melee-only simulator.

Run a bounded default batch of 200 nonzero fixed seeds, with a 300-second simulated timeout per fight, in a Web Worker so the editor remains usable. For each seed, create a fresh one-floor 7×7 walkable `MapData` with one spawn, no NPCs, valid shrine/vault/links; set `emptyState().rng`, construct `Engine` with a validated immutable saved baseline or unsaved draft, create/equip the hero, position hero and monster adjacent, target via `Engine.action`, then advance `tick(100)` just like the server. Stop on target death, `p.deaths` increment, or timeout; death immediately restores HP, so final HP is not a death test. Use the same scenario and seed list for baseline and draft and flag results stale after edits. Generated UUIDs are excluded from comparisons; if they ever affect behavior, explicitly control their source rather than claiming full determinism.

Count new effects once per tick by effect ID. In this stationary single-hero/single-monster fixture, sum incoming `hit` values attributed to the hero's pre-tick position and monster's position, including the terminal tick. This is **gross incoming damage**, not net HP loss; fed regen and level-up changes are not effects. Report wins/deaths/timeouts and their percentages, mean/median victory duration and mean gross damage **on victories**, trial count, seed range and timeout. Do not report healing totals or treat a `block` effect as every partially blocked hit. If attribution cannot be verified for this fixture, omit that metric or add a minimal observational hook without altering action/RNG order; do not fabricate it. Independent fights reset the hero, so no simulated town route, respawns, travel, loot collection, consumption, competition or sustained income is implied.

## Milestones and acceptance checks

1. **Authoritative data and parity.** Add IDs, pure schemas and default snapshot; inject it into the real Engine, migrate only item/creature/spell lookups and icon rendering. Before removing old tables, compare every migrated value (including object-form loot) and rasterize all 27 icons against the current SVGs. Capture representative fixed-seed behavior from the pre-migration engine, then verify equivalent rat fight, loot and both heal/Ember spread behavior with unchanged RNG order. Existing Engine tests pass with explicit fixture content; `npm run typecheck`, `npm test`, and `npm run build` pass. A changed creature attack or spell power in a disposable fixture changes the Engine and client-facing definitions consistently; untouched JSON sections demonstrably do not drive the game.
2. **Local editor and icon loop.** Run `npm run studio` with the game stopped; edit item/creature/spell values and an icon; save and revert. Verify malformed values, an unknown icon symbol, a stale two-tab revision and an interrupted write do not replace the last valid document or discard the draft; verify the recovery copy contains the actual previous bytes. Reload Studio without losing unrelated dirty drafts on a save. Start a game with a separate DB: a saved changed item/creature value and redrawn icon appear after the documented restart/reload/Continue. Price/unlock dialogue drift warnings appear when applicable. Existing DB is not touched during these checks.
3. **One handmade world asset.** Import an intentionally distinctive valid grass PNG and inspect the 3×3 repeat; reject wrong size, translucent, corrupt and oversized PNGs. Save/reload and verify the actual world uses it while unmodified slots still use the original generators. Clearing the manifest returns generated grass; a missing named file fails visibly. Build and launch the Electron client from `dist/client/index.html` and confirm the same image loads from disk. Confirm water stays procedural and no server restart is needed for art.
4. **Engine fight comparison.** A draft creature change affects the draft results before Save; baseline remains unchanged. Same scenario/seeds yield repeatable normalized results in worker and a direct Engine fixture; separate balance snapshots do not contaminate each other. Cover a victory, immediate death despite restored HP, timeout, loot roll ordering and effect deduplication/terminal damage attribution. Report all outcomes and scenario assumptions as above. Check responsiveness with the default batch on the actual machine; reduce or chunk work if needed rather than promising an unmeasured runtime.

At each milestone, exercise the affected UI in the running Studio and game, including keyboard use and visible errors. The tests above target migration and file-safety risks; no field-by-field UI unit-test suite is necessary.

## Explicitly out of scope for v1

- Editing progression, timings, regen/block/potion constants, NPC dialogue/routes, quests, starter kits, arbitrary IDs, saved characters, maps or SQLite; live server hot-swapping; automatic clamp, reset, git initialization, deployment or production publishing.
- Water shader changes, every-material conversion, mandatory shared palette, generator parameter controls, automatic texture baking/deletion, wall/roof/prop import, image clustering, layered painting, sprite sheets, animation timelines or direct `.aseprite` parsing.
- Migrating `models.json`, a rig/part editor, billboard characters, UV painting, full embedded game-look preview, camera/light/post changes or a generic renderer framework. If a later preview is built, use the real `WorldView` through explicit art injection, floor/actor invalidation and lifecycle cleanup; its current `setFloor` does not rebuild cached floors. Verify the small grub export rounding difference and animation/limb order before model migration.
- Analytical combat/DPS substitute, promised hourly economy or automatic optimizer, continuous hunting, multiplayer simulations, spell/consumable policies, a simulation CLI, content-hash gameplay gating, accounts, cloud services and collaborative editing.
