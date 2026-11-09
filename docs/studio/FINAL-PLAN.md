# Lanternfall Studio: final build plan

Merged from the council's round-3 plans (`round-3/{opus,sol,terra}.md`), which built on rounds 1 and 2. Where the plans disagreed, the majority decides and the reason is stated. This plan is what gets built.

## Goal

A separate local app, `npm run studio` on `127.0.0.1:4174`, for one developer to:

1. edit balance numbers and see derived economy numbers;
2. compare fights between the saved balance and an unsaved draft, run on the real engine;
3. paint the 16×16 icons;
4. import hand-made PNGs for ground, wall and roof textures.

Every edit must change what the game actually uses. The Studio works with the game stopped.

## Decisions

| # | Decision | Answer | Why |
| --- | --- | --- | --- |
| 1 | Source of balance data | All seven existing sections of `content/balance.json` become the only runtime source, and the old TS tables are deleted. Progression, items, creatures and spells are editable. Merchants, quests and starter kit are wired but read-only in v1. | Majority (Opus, Sol). A partly authoritative file leaves two sources of truth and fields that do nothing when edited. |
| 2 | How the engine gets data | `new Engine(map, balance, state?)`, where balance is required. `createRules(balance)` in `rules.ts` holds the progression formulas. IDs stay as TypeScript tuples in `ids.ts`. | Lets two engines (saved and draft) run side by side, and keeps the Studio's import graph away from `content/`. |
| 3 | Combat evidence | Real `Engine` fights on fixed seeds; no separate expected-value model. | All three agree. The engine already runs 1,600 fights in under a second. |
| 4 | Spell power | `power = base + level·perLevel + magic·perMagic`. Heal adds `random(power·spread)`. Ember adds `random(spread)`. The field name stays `spread`, with the units shown in the UI label. | Gives identical numbers to today's code and removes the special case for Renew. |
| 5 | New tuning constants | None in v1. Regen *amounts*, the block formula and potion spreads stay fixed and are shown as "fixed engine assumptions"; the existing `regenMs` and `shieldSkillBase` are read from progression everywhere. | Majority. Add them when a tuning need appears. |
| 6 | Applying changes | Explicit Save. A balance save restarts the server (`tsx watch --include content/balance.json`). Art and icon saves only reload the client. The player clicks Continue; there is no auto-reconnect. A SIGINT handler is added next to SIGTERM so Ctrl+C also saves the world. | Smallest loop that works; Continue already exists. |
| 7 | Saved world | The Studio never edits, resets, clamps or migrates the saved world. Normal server persistence and restart cleanup continue; acceptance checks use a disposable `LANTERNFALL_DB`. | A clamp would be a gameplay change. |
| 8 | Writing files | Vite middleware in the Studio exposes a fixed list of documents and art slots. Every write: Host/Origin check → size limit → full validation → revision check (409 on conflict) → one `.previous` backup in `.local/studio-backups/` → temp file then rename. Writes go through a single queue. | Small protections against lost work; there is no git repo. |
| 9 | Studio reloading itself | The Studio imports only JSON-free modules, and its Vite `hotUpdate` hook swallows changes to `content/` files and shows a "changed on disk" notice instead. | Otherwise every save would reload the Studio and wipe unsaved drafts. |
| 10 | Icons | `icons.json` is the only source, loaded by the client only, so icon saves never restart the server. A pure `iconSvg(def)` renders it for both the game and the Studio. Palette symbols are `123456789abcdefghijklmnopqrstuvwxyz` (as exported; at most 35 colours), and `.` means transparent. PNG import/export: exactly 16×16, alpha 0 or 255, no silent quantizing. | Smallest complete sprite loop. |
| 11 | Textures | Fully opaque PNG overrides (alpha 255 everywhere) at fixed paths, with no manifest: `content/art/ground/<kind>.png` (48×48: grass, meadow, dirt, cobble, plank, stone, sand, moss, flagstone), `content/art/wall/<style>.png` (16×32: plaster, stone, timber, rampart, cave), `content/art/roof/<kind>.png` (16×16: slate, clay, thatch, teal). No file means the current generator draws that slot. Water, void and props stay generated. Cobble is proven first, then the same code enables every slot. | Majority (Opus, Sol). Art can move to hand-made one material at a time. |
| 12 | Preview | Raw pixels, a tiling swatch and the HUD-size icon in the Studio. The real look is the running game after it reloads. No embedded `WorldView`. | All three agree an embedded preview needs cache invalidation and isn't worth it in v1. |
| 13 | UI stack | Vanilla TypeScript, DOM, Canvas and CSS, matching the game's tokens and fonts. No framework. | Same as the repo. |
| 14 | Models editor | Out of v1; `models.json` stays unused. | Hand-made textures and icons move the art further. Rigs can follow. |

## Architecture

```
content/balance.json  content/icons.json  content/art/**.png        ← authored files
        │                    │                    │
packages/game: ids.ts · content-schema.ts (zod) · rules.ts · icon-svg.ts · art-slots.ts · simulate.ts
        │  default-balance.ts (only runtime loader of balance.json; server + client) · apps/client/src/icons.ts loads icons.json (client only)
        ├── apps/server   new Engine(map, state, defaultBalance)
        ├── apps/client   default rules, icons.json, texture-overrides.ts (import.meta.glob)
        └── apps/studio   Vite app + middleware API; imports only the JSON-free modules
```

## Studio

- **Balance:** sub-views for Items, Creatures, Spells and Progression. Each has a searchable list and a form for the selected record, with values shown against the saved baseline.
  - Merchants, quest and starter kit are shown read-only, with the dialogue that a change affects.
  - Derived numbers:
    - ideal cash per kill `C = mean gold + Σ chance·sell`, counting only drops some merchant buys;
    - kills to afford each item;
    - a progression table for levels 1–15.
  - Warnings that don't block saving: arbitrage (sell > buy where both a buyer and a seller exist), a sell price with no buyer, duplicate loot rows (each still rolls separately), dialogue to review. Invalid data blocks saving.
- **Simulate:**
  - **Setup:** pick a creature, a level, starting skills, equipment (or "Starter"), how long the hero stays fed, and the starting HP/mana fractions.
  - **Run:** 200 seeds by default (1–500), the same list for saved and draft. Each fight runs in a 7×7 arena map, steps 100 ms per tick and stops after 300 s. The batch runs in a Web Worker and can be cancelled.
  - **Output:** wins, deaths and timeouts over all trials; time to kill and damage taken (mean, median, P90) over victories only; xp/hour and gold/hour under an overhead time you enter, labelled "successful fights, unlimited targets".
  - **Food:** an optional food-cost assumption.
- **Art → Icons:**
  - **Editing:** a zoomed pixel grid with pencil, eraser and eyedropper, plus palette swatches. Undo/redo works per stroke.
  - **Preview:** 1×, 2× and HUD size.
  - **Import/export:** PNG.
- **Art → Textures:** pick a slot, import a PNG of the exact size, preview it raw and as a 3×3 tile, then Save. "Use generated" removes the override.
- **Saving:** Save (also Ctrl/Cmd+S) and Revert act on the active document. Failed saves keep the draft and offer a download of it.

## Files

**Add:**
- **`packages/game/src/`:** `ids.ts`, `content-schema.ts`, `rules.ts`, `default-balance.ts`, `icon-svg.ts`, `art-slots.ts`, `simulate.ts`.
- **Game client:** `apps/client/src/render/texture-overrides.ts`.
- **Studio app:** `apps/studio/{package.json,index.html,vite.config.ts}`, `apps/studio/server/content-api.ts`, `apps/studio/src/{main,store,balance,icons,textures,png,simulate,sim.worker}.ts`, `apps/studio/src/style.css`.
- **Tests:** `tests/fixtures/balance.json` (frozen copy for the behaviour tests), `tests/content.test.ts`, `tests/studio-content.test.ts`, `tests/simulate.test.ts`.
- **Docs:** `docs/studio/README.md`.

**Change:**
- **Game logic:** `packages/game/src/model.ts` (protocol, state and helpers only) and `engine.ts` (instance rules).
- **Server:** `apps/server/src/index.ts` passes the default balance and adds a shared SIGTERM/SIGINT save.
- **Client:**
  - `apps/client/src/main.ts`: rules, plus preloading art before `WorldView`;
  - `icons.ts`: loads and validates `icons.json` (client only);
  - `render/view.ts`: `stepMs` and maxima from the rules;
  - `render/textures.ts`: consults the overrides;
  - `vite.config.ts`: content access.
- **Config:** `package.json` (`studio` script, the server `--include`, `pngjs` as a dev dependency) and `tsconfig.json` (`resolveJsonModule`).
- **Tests:** `tests/engine.test.ts` uses the explicit fixture.

## Milestones and acceptance

- **M0, data seam:**
  - **Before the switch:** capture seeded fights, the three spell casts and all 27 icon rasters from the current code.
  - **Pass checks:**
    - after the switch they are identical;
    - typecheck, tests and build pass;
    - two engines with different balances behave independently;
    - a changed value reaches both the server and the client: creature max HP (nameplate bar), spell mana cost (hotbar), item attack (tooltip).
- **M1, Studio, balance and icons:** `npm run studio` runs with the game stopped.
  - **Balance save:** change a price and a creature's attack, save, then restart and Continue; the trade panel shows the new price and combat shows the new attack.
  - **Icon save:** change an icon and the client reload shows it, and the server log shows no restart.
  - **Rejected writes:** every rejected write (bad numbers, unknown IDs, a stale revision) leaves the target as it was just before that request and keeps the draft. When two tabs save the same revision, exactly one write updates the file and the other gets 409.
  - **Backup:** the `.previous` file holds the bytes from before the successful save. A previously absent art slot uses the revision `none` and gets no backup; replacing or removing it backs up the existing bytes first.
  - **Ctrl+C:** the world is saved, tested against a disposable `LANTERNFALL_DB`.
- **M2, textures:**
  - **Cobble first:** a 48×48 cobble PNG shows at two-tile scale in the game.
  - **Walls and roofs:** they render with unchanged texture mapping.
  - **Live updates:** adding, replacing, removing and re-adding a PNG all work without restarting Vite.
  - **Rejected files:** bad PNGs (truncated, wrong size, partial alpha) are refused.
  - **Desktop app:** the Electron build loads the art with the Studio stopped.
- **M3, simulator** ("damage taken" is total incoming hit damage counted from the engine's hit effects each tick, never a change in HP):
  - **Repeatability:** the same seeds give the same results in Node and the browser, and the harness matches an engine driven directly.
  - **Edge cases:** a deliberately weak hero's deaths are counted; an impossible fight times out.
  - **Drafts and isolation:** a draft change moves the results before saving, the saved baseline stays the same, and cancelling keeps the UI responsive.

## Out of scope for v1

- **Characters:** the models/rig editor, character sprites and animation.
- **Rendering:** an embedded renderer preview; changes to water, props, lighting or post-processing.
- **Painting:** fill, line and layer tools; animation timelines; parsing `.aseprite` files directly.
- **Content structure:** new or renamed IDs, new tuning constants, and editors for dialogue, quests, starter kit or merchant lists.
- **Live updates:** auto-reconnect, content-hash checks, and in-process balance hot-swaps.
- **Saves and history:** editing or migrating the saved world, git setup, rotating backups.
- **Simulation:** spell and potion casting, multi-creature hunts, an optimizer, a CLI simulator.
- **Platform:** hosting, accounts, an Electron wrapper for the Studio, a map editor.

## Round-4 sign-off

Sol 9/10, Opus 8/10, Terra 7/10. Their blocking findings are folded in above: icons load in the client only, the xp-curve check covers every level, duplicate drops are a warning, textures must be fully opaque, the Studio watches `content/`, and the acceptance wording is consistent. Reports: `round-4/{opus,sol,terra}.md`.
