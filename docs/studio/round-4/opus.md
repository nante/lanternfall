# Round 4 sign-off: FINAL-PLAN.md (opus)

I read `FINAL-PLAN.md`, all three round-3 plans and the code. I checked the plan against the pre-migration code first. During the review, M0 files appeared in `packages/game/src/` (`ids.ts`, `rules.ts`, `content-schema.ts`, `default-balance.ts`, `icon-svg.ts`, timestamped 16:45–16:46), and I checked those as well. Apart from this file, nothing in the repo was changed.

What I verified:
- `content/icons.json` rasterises pixel-identical to the rect runs in `apps/client/src/icons.ts` for all 27 icons. It uses at most 4 colours and only the symbols `.1234`.
- The `balance.json` sections match the old `model.ts` tables and the `engine.ts` literals. Spell power with `base/perLevel/perMagic/spread` reproduces today's numbers exactly, because `random(power*0.25)` equals `random(power/4)` after `Math.floor`.
- The `tsx watch` loader reports every imported file as a dependency, JSON included.

## 1. Score: 8/10

The plan is tight and buildable. It matches the code, and its scope stays within what the round-3 majority agreed. It has two defects, both in acceptance checks or in a sentence a builder will take literally. The one about the server's import graph is already happening in the M0 code.

## 2. Blocking issues

### B1. The server's import graph includes `icons.json`, so an icon save restarts the server. That fails M1.

- **What the plan says:** "default-balance.ts (only file that imports JSON; used by server + client)". The build took this literally: `packages/game/src/default-balance.ts:2-3` imports both `balance.json` and `icons.json`, and `apps/server/src/index.ts:12` imports that module.
- **Why it breaks M1:** `tsx watch` restarts on any file in its dependency graph. An icon save therefore restarts the server. That contradicts Decision 6 ("Art and icon saves only reload the client") and the M1 check "without a server restart".
- **Fix (Architecture line):** "`default-balance.ts` imports only `balance.json`, and the server imports only that. `icons.json` is imported only by client code (`apps/client/src/icons.ts`). The server's import graph must contain no `icons.json` and no PNGs."
- **Moving the check:** the "every referenced icon exists" cross-check (`missingIcons`) moves to the client icon module and to the Studio save validation. The server never needs icons.
- **New M1 pass check:** "after an icon save, the server log shows no restart (`world_ready` not re-emitted)."

### B2. The M0 and M1 HUD checks name values the HUD never shows.

- **The gap:** the HUD has no display of creature attack or spell power. What it does show:
  - creature name and max HP (`view.ts:290`);
  - spell mana and unlock level (`main.ts:323,397`);
  - item attack, defense, armor, heal, mana and slots, plus price (`main.ts:430,487`).
- **Where the change came from:** Sol's round-3 check said "spell power/creature **HP**/progression field". The merge changed it to "creature attack or spell power", which makes the HUD half of the check impossible to pass.
- **Fix, M0:** "a changed creature **max HP**, spell **mana cost** and item **attack** reach both the server (engine behaviour) and the HUD (nameplate bar, hotbar, item tooltip)."
- **Fix, M1:** "change an item's price and a creature's attack, save, restart and Continue. The new price shows in the trade panel and is charged. The creature's hits reflect the new attack (or a seeded fight differs). A changed creature max HP shows in its nameplate bar."

Nothing else is blocking. The spell-power formula, the parity captures, the per-instance engine rules, the Studio isolation, the texture slots and their sizes, and the simulator stop conditions are all consistent with the code.

## 3. Non-blocking notes

1. **Engine argument order.** The plan says `new Engine(map, state, balance)`. The code now has `constructor(map, balance, state = emptyState())` (`engine.ts:22`), which is the better order because `state` is optional. Edit Decision 2 and the Architecture line to match the code rather than changing the code.
2. **Define "damage taken" in the simulator.** HP change is the wrong measure, because regen, level-up refills and death revival all change HP. Use the definition both Opus and Sol gave in round 3: gross incoming `hit` damage, read from `engine.effects` through an id cursor every tick (effects are pruned after 1.6 s), with the fatal tick included.
3. **The Studio's "changed on disk" notice needs a watcher.** `content/` is outside the Studio's Vite root and not in its module graph, so the `hotUpdate` hook never fires for those files. Add `server.watcher.add(<repo>/content)`. Then the swallow is a one-line filter.
4. **Textures in Electron.** Import the PNG overrides with `import.meta.glob(..., { eager: true, query: '?inline', import: 'default' })` so they are always data URLs. Vite's default only inlines files under 4 KB, and a noisy 48×48 can exceed that. Reading an image loaded over `file://` back from a canvas depends on Electron's file-protocol privileges, while data URLs always work. That keeps the M2 Electron check from failing on a texture that happens to be larger. Separately, Decision 5's "regen stays fixed" means the regen amounts (`1+L/4`, `2+L/3`). `regenMs` is already in `balance.json` and is editable. Say that in one clause so nobody removes the field.
5. **The icon alphabet is not the majority answer, but it does no harm.** Opus and Terra chose `1`–`9`, at most 9 colours. Sol chose 35 colours with uppercase symbols. The plan has 35 with lowercase. The current icons only use `1`–`4`, so parity is unaffected. This is not a reason to reopen the decision, but don't build UI for more than 9 colours until an icon needs them.
