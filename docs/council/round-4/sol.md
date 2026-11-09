# Sol 6.1 — round 4

Configuration: xhigh reasoning, priority service. Final consolidated build-plan check.

**Verdict: ready to implement.** The consolidated plan satisfies the corrected request: actual Thais comes first, interactions and difficulty define the backbone, and the sewer hunt includes an explicit authored rotworm overlay. It avoids unsupported 7.6 fidelity claims. Unrun acceptance checks are implementation work, not planning blockers.

No material architecture, source-selection or persistence contradiction found. Three small clarifications should accompany implementation, ranked by consequence:

1. **Normalize movement cost explicitly — “Difficulty configuration v0,” [line 81](/Users/kubawiszniewski/Personal/game/docs/BUILD-PLAN.md:81).**  
   “Multiply by catalog ground cost” is ambiguous because the catalog stores values such as **100**, not **1**. Write `cardinalMs = 400 × groundSpeed / 100`, with diagonal duration three times that. The inspected catalog confirms speed100 for ground407. This prevents a literal implementation from producing 40-second steps. [Pinned catalog](https://raw.githubusercontent.com/hampusborgos/rme/8dbc487ef27983ec566456541858dfdca05c5328/data/740/items.otb).

2. **Finish the death/logout transitions — “Difficulty configuration v0,” [lines 97–99](/Users/kubawiszniewski/Personal/game/docs/BUILD-PLAN.md:97).**  
   Corpse creation, losses and disconnect vulnerability are specified, but post-death HP/mana and removal of a safely logged-out entity remain implicit. Smallest correction: explicitly define temple respawn with full recalculated HP/mana as a provisional rule; persist that transition alongside the corpse and losses. A disconnected character remains simulated through combat lock, then leaves the active world while its saved player record remains. Reconnecting before removal reattaches to that same character.

3. **Connect healing rules to executable inputs — “Interactions,” [line 63](/Users/kubawiszniewski/Personal/game/docs/BUILD-PLAN.md:63), and “Healing,” [line 87](/Users/kubawiszniewski/Personal/game/docs/BUILD-PLAN.md:87).**  
   Food/fluid consumption and the healing spell need named command paths. Keep the existing scope: food and fluid use the existing **Use** action; `exura` entered through chat invokes the provisional healing spell. Apply resource consumption and cooldown server-side. No additional interface system is necessary.

The authority design addresses the coordinator’s substantive objections: one ordered writer, staged candidate state, one transaction containing the complete dynamic snapshot and durable receipts, publication only after commit, and reload/resynchronization on uncertainty. It covers both sides of item transfers and creature death/reward creation. WAL plus `synchronous=FULL` is consistent with SQLite’s documented durability model; commit latency remains unmeasured. [SQLite documentation](https://www.sqlite.org/pragma.html#pragma_synchronous).

Source inspection supports the plan’s qualified claims:

- The map author explicitly describes a **7.1 reconstruction in 7.4 OTBM format**, matching the plan’s attribution. [Pinned source notes](https://raw.githubusercontent.com/bradleyworkman/Tibia-7.1-map/783c717ccf50987d18f9c06763c2c427c83d7345/readme.md).
- Independently inspected catalog entries match the cited ground407, walls1036/1037, grate430, ladder1386 and lockers2589/2591.
- The cited contemporary templates confirm rat20HP/5XP and rotworm65HP/40XP; they do not establish historical combat fidelity. [Rat](https://raw.githubusercontent.com/otland/forgottenserver/v1.6/data/monster/monsters/rat.xml), [rotworm](https://raw.githubusercontent.com/otland/forgottenserver/v1.6/data/monster/monsters/rotworm.xml).
- Analytical recomputation reproduces approximately **7.4/11.2/26.1 seconds** and **4.9/21.2/85.8 HP** under the stated stationary, equal-swing assumptions. Attack scheduling, pursuit, healing and positioning can change played outcomes.
- Route coordinates and the conditional926-cell result remain the recorded round-3 source inspection; I did not independently repeat that flood-fill or traverse a running game.

**Final implementation sequence:**

1. Pin dependencies; implement catalog-first version0 import and the semantic overlay. Resolve both sewer links, doors, depot and floor visibility.
2. Deliver the two-client Thais walk. Verify actual collision, return tiles and picking before adding encounters.
3. Within increment2, establish item ownership and the snapshot/receipt commit boundary **before** exposing trade, loot and depot mutations. Complete the rat supply–hunt–return–reconnect loop.
4. Add harder encounters, food/healing, progression, death and logout transitions. Exercise contested loot, interrupted acknowledgements, restart recovery and corpse expiry; then play the provisional balance scenarios.
5. Complete the original art treatment and Electron packaging against that working loop.

No files were changed. No game, importer, database fault scenario or desktop build was executed.
