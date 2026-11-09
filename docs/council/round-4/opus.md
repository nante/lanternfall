# Opus 5.5 — round 4

Configuration: medium effort. Final scoped mechanics-plan check. No map identity or recreation context supplied. The scoped input omitted detailed map/loot tables already present in the full candidate, so not every request for those details is a full-plan omission.

# Review: modern tile-RPG mechanics and build plan (final)

**Verdict:** This is an implementable plan, not tested software. The architecture holds together. Eight small decisions need locking first. Two of them, items 1 and 2 below, are real contradictions or exploits. The rest are values or rules the plan depends on but never states.

## Must fix before coding

**1. Death breaks the starting profile.**
- A new character has exactly 4200 XP. Losing 5% (210 XP) drops them to 3990, which is level 7 (level 7 starts at 2600). So the first death always costs a level.
- The plan has no level 1–7 stats table, and no rule for HP/mana when a level is lost.
- **Smallest fix:** either set an XP floor at 4200 for this slice, or add a per-level HP/mana table and clamp current HP/mana to the new maximum on level loss.
- Skill loss has the same gap. Say whether the 5% comes from total skill tries or from progress within the current level, and set the floor at skill 20.

**2. Container depth limit can block corpse creation.**
- A pack nested 8 deep under the player becomes 9 deep once it sits inside a corpse. The death transfer must never fail.
- **Fix:** count depth from the root container. Player slots, corpse, depot and ground tile all count as roots. Moving a pack between roots never changes the depth inside it.
- The corpse has no capacity limit for this transfer. The death transfer and corpse creation happen in the same transaction as the death itself.

**3. Retreat and difficulty depend on numbers the plan leaves out.** Lock these before increment 3:
- **Monster attack interval.** My estimates below assume 2s.
- **Monster move speed against the player's 400ms per tile.** This decides whether "clear retreat possible" is true at all.
- **Leash and reset rule.** Suggested: a monster that loses its target, including when the target changes floor, walks back to spawn. It keeps its current HP and heals only at a stated slow rate. This also covers the "floor peeking" rule.
- **Whether healing delays the next melee swing.** The plan says only that the spell and fluid share a 2s cooldown.

**4. Loot and NPC prices are missing.**
- The rat→loot→trade loop can't be tuned without drop tables and gold amounts.
- Add one invariant: no NPC buys any item for more than any NPC sells it. This blocks buy-low/sell-high loops, including NPC stock restocking.

**5. The recovery satchel can be farmed.**
- Make it bound to the player and worth 0 gold.
- Allow at most one per player across inventory, depot and ground.
- It can't be traded or stored in the depot.
- It disappears if dropped, except into the owner's own corpse.

**6. Server restart and the combat lock.**
- With the remaining lock "frozen" across downtime, a player can be reloaded into the world without a connected client and die because the server crashed.
- **Fix:** on boot, clear combat locks and reset monster aggro. Players can't trigger a crash, so this doesn't create an escape exploit.
- Keep the wall-clock corpse expiry, but write down that a crash lasting over 15 minutes loses the corpse. That is a product decision, not an accident.

**7. Tick deadline and clocks.**
- better-sqlite3 commits block the event loop. Lock the rule for a commit that runs past 100ms. Suggested: tick N+1 always starts from committed state N, game time stretches rather than ticks being merged, and every miss is logged.
- Say which timers count in ticks (combat, regen, cooldowns) and which in wall time (corpse windows, food cap).
- On macOS, `synchronous=FULL` alone doesn't guarantee data is on disk. Set `PRAGMA fullfsync=ON` and `checkpoint_fullfsync=ON` on the dev machine or production host, or record that macOS isn't the durability target.

**8. Session fencing at dequeue time.**
- Commit the session epoch bump before the new socket's first command is accepted.
- Also check the epoch when a command leaves the queue, not only when it enters. Commands from the old socket that are already queued must be dropped.
- Commands are applied strictly in seq order. A gap in seq means a resync, not a buffer.
- A split or merge records the new or destroyed item IDs in its receipt.

## Difficulty check

These are analytical estimates only. They assume a 2s monster attack, no miss chance, and that armor and shield rolls add together.

| Fight | Player damage per hit | Kill time | Damage taken |
|---|---|---|---|
| Rat | about 6.5 | about 6s | about 1.3 per hit, about 4 HP per rat. Easy, as intended. |
| Cave rat | — | about 10s | about 19 HP |
| Rotworm | about 5.3 (rotworm armor averages 2) | about 25s | about 6.6 per hit, about 80 HP |

- **One rotworm** costs about 43% of 185 HP. That is about 2 fluids (40 gold), or about 8 minutes of regen from food. "Resource cost" holds, but whether a rotworm pays for itself depends on its loot (item 4). Full regen from food takes about 18 minutes, so heal items carry the loop. That's acceptable, but it's the economy's main lever.
- **Two rotworms** deal about 165 damage before the first one dies, and about 245 in total. That kills the player without heals. "Dangerous" is accurate, possibly lethal. Retreat has to really work (item 3).
- **Progress rate:** 2200 XP is 55 rotworms or 440 rats. Skill 20→21 takes 200 tries, about 400s of swinging, if one swing gives one try. Lock what earns a try: swings for melee, blocked hits for shield.
- The "two attackers per cycle" shield cap means two rotworms are both fully shielded. Only a third attacker gets past the shield. That's fine, just be aware of it.

## Minor items to state (no redesign)

- Respawn point and HP/mana on respawn. Suggested: temple, full HP and mana.
- Corpse public window: after 2 minutes, other players can loot it. That's fine without PvP, but say so in-game.
- Writing a complete snapshot every tick is acceptable for this world size. Commit latency is listed to measure, and that's enough.

## Readiness

Ready to implement once items 1–8 are written into the design doc. Each is a one-line rule or a small value table. None reopens the stack, the authority model or the scope. Increments 1–2 (town walk, two clients, the supply→combat→loot→trade loop) can start now, provided items 2, 4, 7 and 8 are locked first. Items 1, 3, 5 and 6 must be locked before the progression/death increment. All tuning above still needs seeded simulation and playtesting.
