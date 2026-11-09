# Studio plan: round 2 cross-check (opus)

I read `round-1/{opus,sol,terra}.md` and checked their claims against `packages/game/src/{model,engine,world}.ts`, `apps/client/src/render/{textures,actors,view,terrain}.ts`, `apps/client/src/{icons,main,net}.ts`, `apps/server/src/index.ts`, `content/*.json`, `package.json`, `tsconfig.json`, `apps/client/vite.config.ts` and the installed `tsx` CLI. I changed nothing in the repo. The one experiment I ran was a scratch script outside the repo that imports the current `Engine` unchanged.

## 0. New evidence that settles several arguments

**1. The real engine already runs as a simulator, today, with no changes.** I built a 9×9 grass `MapData` (no walls, no NPCs, one spawn, `shrine` and `vault` set, `links: {}`) and wrote this loop:

```ts
const st = emptyState(); st.rng = seed;
const e = new Engine(arena(kind), st);
const p = e.createPlayer('Sim');
// place p next to the mob, then:
e.action(p, { kind: 'target', id: m.id });
// e.tick(100) until m.hp <= 0, p.deaths > 0, or 300 s
```

Damage taken comes from scanning new `e.effects` each tick with an id cursor. It ran 400 fights per creature, 1600 fights in total, in **0.86 s wall time in Node**, including tsx startup. Level 1, starter kit, current numbers:

| Creature | Win rate | Mean TTK (wins) | Mean damage taken (wins) |
| --- | --- | --- | --- |
| gutterRat | 100 % | 5.1 s | 6.1 |
| caveBeetle | 100 % | 27.5 s | 67.2 |
| mireGrub | **16.5 %** | 36.6 s | 137.1 |
| thornboar | 94 % | 32.1 s | 109.9 |

My round-1 back-of-envelope numbers were close: rat ~6 s, beetle ~28 s, boar ~33 s. The grub was worse than I said: a new player loses 83 % of the time. Three conclusions follow:
- The simulator is the cheapest balance feature, not the most expensive one.
- The analytic expected-value model I proposed in round 1, and the ±15 % agreement test pinning it to the engine, are not worth building. Use the engine for anything stochastic, and closed-form math only for trivial things like gold per kill, kills to afford and arbitrage.
- A Web Worker is optional at this speed. 200 trials take about 0.1 s.

**2. `tsx watch` restarts with SIGTERM.** In `node_modules/tsx/dist/cli.mjs`, `killProcess(child, signal = "SIGTERM", 5000)` sends SIGTERM and falls back to SIGKILL after 5 s. The existing `process.on('SIGTERM', persist…)` in `apps/server/src/index.ts:64` therefore already saves the world on a watch restart. All three plans said "verify". It's verified. Ctrl+C relays SIGINT to the child, which has no handler, so a one-line SIGINT handler is still worth adding.

**3. A disposable test world already exists.** `index.ts:14` reads `process.env.LANTERNFALL_DB`. So `LANTERNFALL_DB=.local/test.sqlite npm run dev:server` gives you a fresh world with no code. Terra's "separate disposable test database" and my "delete the sqlite" become one documented command.

**4. The game client does not auto-reconnect, and a page reload does not auto-continue.** `net.ts:32` shows "Lost the connection" on any close code other than 1000. `main.ts:99-121` shows a **Continue** button and only joins on click. Sol and Terra are right, and my round-1 line "the client reconnects with its stored token … needs no code" is wrong. A balance save restarts the server and reloads the client at about the same moment, so the reload can land before the server is up. That needs a small dev-only auto-continue: poll `/health`, then `enter(name, token)`.

**5. The studio's own page would reload on every save in my round-1 design.** My `content.ts` imported `balance.json` and exported both schemas and the parsed default. The studio imports `packages/game` (schemas, engine), which puts `content/balance.json` in the **studio's** Vite module graph. Every save would then full-reload the studio and lose unsaved drafts in other tabs. `icons.ts` → `icons.json` has the same problem. Sol flagged the risk in general terms. The fix is in decision D4.

## 1. Where the three plans agree

All three plans make these calls:

**Data and engine**
- `apps/studio` as a Vite + TS + vanilla DOM app on `127.0.0.1:4174`, started by `npm run studio`, with no Electron and no framework.
- Writes go through a dev-only Vite `configureServer` middleware with zod validation, a fixed allowlist of documents, temp file + rename, and a 422 response with field paths.
- Stable ids (`itemKinds`, new `mobKinds`, `spellIds`, `npcRoles`, `grounds`, `things`) stay as TS tuples. Values move to JSON, and new ids remain a code change.
- `Engine` takes an explicit validated balance per instance, so draft simulations never touch globals.
- Loot changes from tuples to `{item, chance}` all the way into `Engine.dead`.
- The `spread` ambiguity is real: heal spells use a fraction, ember uses a flat amount. I confirmed this at `engine.ts:267-274`.

**Reload**
- Reload means a server restart via `tsx watch` plus a full client reload. There is no in-place hot swap, and SQLite is never reset by the studio.

**Art**
- Icons are painted in the studio into `icons.json`. Ground, wall and roof textures come in as PNGs at fixed sizes (48×48, 16×32, 16×16).
- No `.aseprite` parsing; PNG round-trip only.
- Voxel rigs stay. Billboards and sprite sheets are a later art-direction decision.
- `actors.ts` gets a generic `buildRig(model)`.

**Simulator and order**
- The simulator is the real `Engine` on a tiny fixture map, run with `tick(100)` and seeded via `state.rng`. Death is detected by `p.deaths`, not `p.hp`, because `kill()` restores HP.
- Milestone order starts with the data move and ends with the model editor.

That is most of the architecture. The disagreements below are smaller.

## 2. Disagreements and which side is right

### 2.1 Which constants move into balance.json

- **Mine:** move about 15 inlined constants.
- **Sol:** move a short list: shield, unarmed attack 3, regen, potion spread and cooldown, starter `fed` 120000.
- **Terra:** wire only what is already exported and leave the rest for later.

**Verdict: Sol's list, plus the two from mine that affect the simulator's outputs.** Those two are assist XP `ceil(xp/3)` and mob idle regen `+2`.
- Regen (`engine.ts:341`) and block (`:403`) decide downtime and death rate, which are the numbers the studio exists to show.
- Leaving them hard-coded means the most important tuning knobs are the ones you can't tune.
- Corpse TTL, slot counts, `stackMax`, combat timer and diagonal step are protocol or feel, not balance. Keep them in code. I'm dropping those from my round-1 list.
- Sol caught two I missed: unarmed attack 3 (`:371`) and starting `fed` 120000 (`:125`).

### 2.2 Spell `spread`

- **Mine:** split into `spreadFlat` + `spreadFrac`, both optional.
- **Sol and Terra:** keep `spread`, define its meaning per `kind`, and rename later.

**Verdict: rename now, in a discriminated union.** The shapes become:
- `heal: { kind:'heal', …, spreadFrac }`
- `attack: { kind:'attack', range, …, spreadMax }`

Nothing reads `balance.json` yet, so this is the one moment a rename costs nothing. "Later with a migration" is strictly more work. An editor field called `spread` whose unit changes with another field is exactly what a balance UI should not show. The union keeps Sol's point that `ember.range` is statically present. My two-optional-fields version allowed both at once, which is meaningless.

### 2.3 Where formulas live

- **Mine:** every formula in `rules.ts` as pure functions, shared by the engine, analytic tables and simulator.
- **Sol:** combat stays in the engine, plus `createRules(balance)` for progression helpers.
- **Terra:** about the same as Sol.

**Verdict: Sol and Terra.** §0.1 removes the reason for my design: there's no analytic combat model to share formulas with. Pulling `meleeHit`/`mobHit` out of `tick()`/`think()` is a refactor of the riskiest code, and it gains nothing when the simulator calls `tick()` itself.

What I'd keep:
- Progression helpers take the balance explicitly: `xpAt`, `level`, `maxHP`, `maxMana`, `capacity`, `skillFrom`, `magicFrom`. Use `rules(b)` or `(b, …)`; either is fine.
- Engine constants are read from `this.b`.
- The heal-spell branch becomes data-driven, which deletes the `id === 'renew'` special case.

### 2.4 Analytic tables vs simulator first

- **Mine:** M1 analytic tables, M4 simulator.
- **Sol:** M2 tables, M4 simulator.
- **Terra:** M3 tables and simulator together.

**Verdict: Terra's grouping, pulled earlier, with the simulator as the source of the combat columns.** Per §0.1 the simulator is about 60 lines that already work. The balance page should show these for a chosen scenario:
- TTK, damage per kill and win rate from about 200 seeded fights
- next to closed-form gold per kill, kills to afford, and arbitrage warnings

A separate EV engine would disagree with the real one in edge cases (player acts first, regen while fed, level-up healing) and need its own tests.

### 2.5 Texture files: bake-and-delete, manifest, or convention

- **Mine:** bake every generator to PNG once, then delete the generators.
- **Sol:** `textures.json` manifest with `source: 'png'|'generated'`, content-hashed file names, PNGs in `apps/client/public/art`.
- **Terra:** a manifest where a missing entry falls back to the generator.

**Verdict: no manifest. Use convention plus fallback.**
- `content/art/{ground,wall,roof,plank}/<kind>.png`, loaded with `import.meta.glob`. If the file exists it's used; if not, the generator runs.
- The file system is the manifest. Adding or removing a PNG is the whole operation, with no second file to keep in sync and no "manifest points at a half-written image" ordering problem (Sol's write-asset-then-manifest dance).
- Generators get deleted only after every slot has a PNG. My bake-everything step forced a big-bang visual parity check for no benefit; I concede it.
- "Start from current" in the editor runs the generator in the browser and opens its output as the starting canvas. That keeps the useful part of baking.
- Content-hashed names are unnecessary: Vite already hashes on build, and dev reloads on change.
- Keep the PNGs under `content/` rather than `apps/client/public/`. Then everything the studio writes is in one directory, Vite puts it in the module graph (reload on change works), and the server's watch exclusion is one glob.

### 2.6 Server watch scope

- **Mine:** `--include 'content/**'`.
- **Sol:** `--include content/balance.json` only.

**Verdict: Sol.** The server doesn't read icons, models or art. Painting an icon should not restart the server and kick the player to the gate.

### 2.7 In-studio game-look preview

- **Mine:** reuse `WorldView` with a diorama `MapData` and a fake `GameView`.
- **Sol:** `WorldView` plus `dispose()` and injected `ArtContent`.
- **Terra:** extract camera, light and post into a shared helper.

**Verdict: none of these in the first useful version.** The real game at :4173 *is* the game-look preview. One save takes about a second to show up there, under the real light and post, once auto-continue (§0.4) removes the click.

The studio needs only:
- the raw canvas
- the 3×3 tiling and neighbour swatch, because seams are the real hand-made-tile problem
- the HUD-size icon render

When an embedded preview is wanted, my diorama is the cheapest of the three. `WorldView`'s constructor (`view.ts:87-139`) needs only `host`, `labels` and a `MapData`. It needs no refactor and no `dispose()` if the studio mounts it once and calls `setFloor` to rebuild. Terra's extraction and Sol's lifecycle work both touch the finished renderer for a convenience.

### 2.8 Content hash in `/health` and `welcome`, gating play on mismatch

- **Sol and Terra:** propose it.
- **Mine:** doesn't.

**Verdict: cut it.** Client and server load the same files from the same disk, and both reload on save. The only mismatch window is the second or two of restart. Auto-continue covers that. A mismatch gate is a production concern for a tool that has no production.

### 2.9 Studio write-safety depth

- **Sol and Terra:** Host/Origin checks, realpath and symlink guards, exclusive temp create, serialized write queue, body-size limits, custom header.
- **Mine:** loopback, path allowlist, hash check, atomic write, backups.

**Verdict: mine, plus the Origin/Host check.** The Origin check is cheap and matters, because any web page can POST to `127.0.0.1`. The rest isn't needed:
- A write queue is unnecessary if check-hash, write and rename run synchronously in the handler. Node is single-threaded, so there's no interleaving.
- Symlink guards protect against an attacker who already controls the repo directory.
- Keep the backups to `.local/studio-backups`. Sol and Terra don't have them, and the repo is **not under git** (`git rev-parse` fails). An undo for a bad save is the one safety feature a solo dev will actually use. Separately, suggest `git init`.

### 2.10 Shared palette file

- **Mine:** `content/palette.json`, about 32–48 colours; the editor picks from it and off-palette pixels are a warning.
- **Sol and Terra:** none.

**Verdict: keep it, but make it smaller.** Seed it with the plain distinct colours from `icons.json` plus the generator palettes, with no clustering. It's still a warning only. A fixed palette is the cheapest lever toward a hand-made look that the brief asks for, and the picker needs a colour source anyway. Make it the last item of the icon milestone so it never blocks.

## 3. Factual errors and claims that don't match the repo

**Mine (round 1)**
- `textures.ts:46` for `#724fS` → it's `textures.ts:82`. It's in the ground `plank` case, not `plankTexture()`.
- "Client reconnects with its stored token, needs no code" → wrong (§0.4).
- The studio importing `content.ts` doesn't reload only on code edits; it reloads on every content save (§0.5).
- "Read the outcome from `p.hp` and `e.effects`" → `e.effects` is pruned after 1600 ms (`engine.ts:335`), and `p.hp` is masked by fed regen and reset by `kill()`. You need a per-tick id cursor. Sol is right.
- "One PNG per `grounds` entry except `void`" → water's atlas sample is overridden in GLSL (`terrain.ts:97-104`). A water PNG would be invisible, so exclude it, as Sol and Terra say.
- "Verify SIGTERM in tsx" → verified (§0.2).

**Sol**
- "`balance.json` already captures most tunable values, including constants currently in `engine.ts`" → partly. Only `stepMs`, `attackMs`, `monsterAttackMs`, `regenMs`, `respawnMs` and the loss fractions are there. Regen amounts, block, unarmed, potions and starting `fed` are not. Sol lists most of these later, so it's an overstatement, not a design error.
- Grub "coordinates/sizes have been rounded: … live size derived from `0.36 - abs(0-1.5)*0.05`, while JSON stores `0.285`" → that expression equals 0.285 exactly, and `0.285 * 0.8 = 0.228` matches too. Only the Y positions are rounded, at the third decimal (`0.1197 → 0.12`, `0.1407 → 0.141`). That's under 0.001 world units, invisible at a 215 px target. It's not a parity risk worth a review step.
- PNGs in `apps/client/public/art/textures` and loaded by `BASE_URL` fetch → that works, but it puts them outside Vite's module graph and outside `content/`. That's a design weakness, not an error (§2.5).

**Terra**
- "`Effect` has positions, not actor IDs … add a minimal optional observer at mutation points" → not needed for v1. In a solo arena, position plus `from` attributes every hit unambiguously; my script does this. Touching engine mutation points for an observer is avoidable risk.
- Otherwise Terra's repo facts check out: no reseed of a populated monster table (`engine.ts:21`), no auto-reconnect, `view.ts:7` `STEP_MS = 300`, the hard-coded "5 beetle shells" in `main.ts:392`, and the water shader override.

**Things only the others caught that I should have**
- `main.ts:141` passes the shield base `30` explicitly, and `main.ts:392` hard-codes the quest count. Both must read balance, or the HUD lies after an edit.
- `main.ts:343` caches icon markup by id. A full reload clears it, which is another reason not to attempt in-place icon HMR.
- NPC dialogue embeds prices ("I pay twenty-eight a skein", "Two coins each", "Twelve each"), which will drift from edited prices. A lint warning is enough: flag any merchant topic containing a number word or digit near an item it buys. Don't template dialogue in v1.
- Respawn is suppressed while a player is within 6 tiles of home (`engine.ts:390`). Any gold/hour figure needs a stated travel or rotation assumption.

## 4. Over-scoping to cut from the first useful version

From Sol and Terra:
- Content revision hash in `/health`/`welcome` with gameplay gating (§2.8).
- Write queue, realpath/symlink checks, exclusive temp create, custom headers (§2.9).
- Texture manifest and content-hashed file names (§2.5).
- `WorldView.dispose()`, `ArtContent` injection, and extracting the render look into a shared helper (§2.7).
- An engine observer or event hook for the simulator (§3).
- Terra's validation of XP-curve monotonicity via a quadratic minimum. A loop guard (`level()` capped at, say, 100) plus "xpAt strictly increasing for 1..100", checked by brute force, is 2 lines.
- Sol's model-schema limits on part counts, bounds and bone topology. Validate that bones exist and sizes are positive; that's enough.

From mine:
- The analytic EV report and ±15 % agreement test (§0.1).
- `rules.ts` extraction of the combat formulas (§2.3).
- The numeric-literal grep "lint" on `engine.ts`.
- The `tools/sim.ts` CLI. It's nice, but the studio page covers it. Add it later if wanted; it's about 10 lines once `simulate.ts` exists.
- The `extends`/template system for human models.
- The bake-everything step (§2.5).
- `designLevel` per creature and spell-unlock warnings. Keep only arbitrage, unsellable loot, and dialogue-price drift.

## 5. Missing pieces none of us fully covered

1. **Dev auto-continue in the client.** If `import.meta.env.DEV` and a stored token exist, poll `/health` every 300 ms (up to about 10 s), then call `enter()`. Do the same on `closed` when the reason is a lost connection. Without it, every balance save ends in a click on a gate that may fail because the server isn't up yet.
2. **Studio HMR filter.** In the studio's `vite.config.ts`, add a `handleHotUpdate({ file })` that returns `[]` for files under `content/`. The studio learns about external edits via the API's hash check on next save, plus an optional "reload from disk" button. Code edits still reload the studio.
3. **Which default-content module the engine imports.** Keep schemas pure, in a module that imports no JSON. Put the JSON import in one `default-content.ts`. The server and client use it. The studio fetches from the API but will still pull it in transitively through `Engine`'s default argument, which is why item 2 is needed rather than "just don't import it".
4. **Starter food assumption in the simulator.** Players start with `fed: 120000` (2 minutes) and only regenerate while fed (`engine.ts:339`). A scenario needs a "fed: yes/no" toggle. Otherwise long fights such as the grub or boar silently change behaviour mid-fight when food runs out.
5. **Monster HP above a lowered max.** Idle regen only heals up to max (`engine.ts:419`), and nothing clamps it down. Add one line on boot: `m.hp = Math.min(m.hp, b.creatures[m.kind].hp)`.

## 6. Ideas from the others worth adopting

From Sol:
- `tsx watch --include content/balance.json` only (§2.6).
- The discriminated spell union (merged with my rename, §2.2).
- `fed`/unarmed constants (§2.1).
- Stop conditions: target dead, `deaths` increased, or timeout. Report win, death and timeout separately.
- Compare baseline vs draft on the **same seeds**. That's the single most useful view for a tuning tool: "beetle TTK 27.5 s → 24.1 s".
- `kills to afford` labelled as a planning ratio, not an expectation.
- Strict-object schemas, so misspelled keys fail.
- Ctrl/Cmd+S and revert-to-saved.

From Terra:
- The `LANTERNFALL_DB` disposable-world workflow (made concrete in §0.3).
- Treat a disabled water import control as an explicit "not supported" state, not a silent no-op.
- Tell prop planks (`plankTexture`) apart from the ground `plank` tile in the asset list.
- Order icons before textures within the art work, since the pixel canvas is shared and icons are the trivial data path.

From both:
- `main.ts` and `view.ts` must read step ms, shield base and quest text from balance (§3).

## 7. Revised milestone order (for reference)

| | Content | Ship check |
| --- | --- | --- |
| **M0** | Data move. Schemas (pure), `default-content.ts`, `Engine(map, state, b)`, the constants from §2.1, spell rename, loot shape, `main.ts`/`view.ts` callers, `icons.ts` reads JSON, `buildRig` from `models.json`, `--include content/balance.json`, SIGINT handler, HP clamp, dev auto-continue. | `npm test` passes unchanged. A golden seeded rat fight gives identical xp, hp and loot before and after. A hand-edited `balance.json` changes the running game with no click. |
| **M1** | Studio shell. Content API (allowlist, Origin check, hash 409, atomic write, backups, studio HMR filter), then the balance page: editable tables, a scenario bar, simulator columns (win %, TTK, damage taken) with baseline vs draft on the same seeds, gold per kill, kills to afford, and lint warnings. | Raising grub attack visibly moves its win rate before saving. Saving shows the change in the game. |
| **M2** | Pixel canvas and icons. Pencil, fill, picker, undo, PNG import/export; `palette.json` last. | A redrawn sword icon appears in the hotbar after save. |
| **M3** | Texture PNGs by convention, with generator fallback, "start from current", 3×3 and neighbour swatches, water excluded. | A painted cobble tile shows in game. Unpainted kinds look identical to today. |
| **M4** | Model editor (part list, numeric fields, walk toggle). Optional embedded `WorldView` diorama. | — |

`buildRig` moves to M0 because the parity check is mechanical and both other plans wire models in their first milestone. It's fine to slip it to M4 if M0 gets heavy.

## 8. Decisions the final plan must settle, ranked

1. **Is `balance.json` the single source of truth in M0, wired into the engine via `new Engine(map, state, b)`, with the TS constant tables deleted in the same milestone?** → **Yes.** Ids stay TS tuples. Parity comes from the unchanged engine tests plus one golden seeded fight. Every plan agrees, and nothing else works until this lands.
2. **What computes the combat numbers on the balance page?** → **The real `Engine` on a fixture arena, seeded, about 200 trials, baseline vs draft on the same seeds.** Closed-form math is only for gold per kill, kills to afford and arbitrage. No analytic EV model and no `rules.ts` combat extraction. Evidence: §0.1 (1600 fights in under 1 s, grub at 83 % death).
3. **What does a save do to the running game?** → **Balance: tsx restart (SIGTERM already persists) plus a client full reload with dev auto-continue. Art and icons: client reload only.** No content-hash gate and no in-place swap. SQLite is never touched. Clamp mob HP on boot. Fresh world via `LANTERNFALL_DB`.
4. **How does the studio avoid reloading itself on save?** → **A `handleHotUpdate` filter for `content/**` in the studio's Vite config.** Schemas live in a JSON-free module, and drafts survive saves.
5. **Which constants join `progression`?** → **regen (4), block (2), unarmed attack, potion spreads (2) and cooldown, starting `fed`, assist-XP divisor, mob idle regen.** Corpse, slot and stack limits stay in code.
6. **Spell power schema.** → **Rename now, as a discriminated union:** heal has `spreadFrac`, attack has `spreadMax` and `range`. Data-driven heal branch, delete the `renew` special case.
7. **How textures reach the game.** → **`content/art/<family>/<kind>.png` via `import.meta.glob`, with the generator as fallback when the file is absent.** No manifest and no hashed names. Water excluded until the shader changes. Delete generators only once every slot has a PNG.
8. **First art milestone: icons or world textures?** → **Icons first (M2), textures right after (M3).** They share one pixel canvas, and icons prove the canvas on a trivial data path. Swap the two if the owner says ground art matters more; M3 doesn't depend on M2's palette.
9. **Write-safety level.** → **127.0.0.1 bind, Origin/Host check, fixed document allowlist, base-hash 409, temp+rename, timestamped backups in `.local/studio-backups` (keep 30).** No queue and no symlink checks. Recommend `git init`.
10. **In-studio game-look preview.** → **Not in v1.** The running game is the preview. Later, if wanted: a `WorldView` diorama mounted once, with no renderer refactor.
11. **Shared palette.** → **Yes, small and warning-only, seeded from existing colours, at the end of M2.**
12. **UI stack.** → **Vanilla TS + DOM like `main.ts`.** Preact is the only allowed addition if forms get painful.
