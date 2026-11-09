# Issues to settle when consolidating round 3

These are coordinator objections to the first returned report, not reasons to expand scope.

1. Do not assume a synchronous SQLite commit is sub-millisecond. It can block the server tick; measure actual commit time. No performance result exists yet.
2. In-memory per-player sequence deduplication is insufficient after a server restart. A critical action committed before its acknowledgement needs either a durable action receipt tied to an authenticated player/session epoch or a reconnect policy that never blindly resends that action. Pin down the chosen strategy.
3. A single-parent row does not by itself prove global consistency. Validate parent existence, unique slots, acyclic ownership, counts and capacity; invalid source/version commands must leave state unchanged.
4. Critical transactions must not save just the beneficiary inventory while leaving old source-world state in storage. Creature death/loot creation, corpse state, item moves, XP and respawn state must share a consistent persistence point. Decide a small explicit strategy rather than saying 'atomic' as a substitute for the write set.
5. Different durability classes must not mix stale fields: an immediate economy commit followed by a movement checkpoint must not restore an older inventory. Publish state only after a successful critical commit; a failed commit cannot leave the live world pretending an item moved.
6. Pin the actual Colyseus version/API at implementation. The currently inspected docs are v0.18; the scoped report's reference to 0.16 StateView is not a verified API/version choice.
7. Keep imported source topology in the project JSON schema; no need to introduce a second Tiled authoring pipeline merely because a scoped delegate suggested it without map context.
8. Keep initial melee-only scope. Distance weapons, rings and broad vocation support proposed in the scoped report are unnecessary for the first loop.
9. Difficulty outcomes are hypotheses. Check kill time/incoming damage, risk under multi-pulls, resource sustainability and XP pacing with the selected baseline. Do not state 'dies in ten seconds' or a precise death rate until arithmetic/scenarios support it.
10. One ordinary rat can be easy at level 8. Risk belongs in a harder encounter/pull and resource/corpse recovery decisions; don't distort every enemy to force danger.

All round-3 outputs remain proposals until the full synthesis and final phase.
