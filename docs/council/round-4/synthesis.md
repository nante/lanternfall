# Final phase — completed build plan

All three requested members returned a final check. Their verdicts concern an implementable plan, not tested software.

| Member | Final verdict as received | Coordinator action |
| --- | --- | --- |
| Opus 5.5 medium | Implementable after eight small rule clarifications | Incorporated applicable clarifications; scoped input had omitted map/loot details that already existed in the full candidate |
| Sol 6.1 xhigh | Ready to implement; three small clarifications | Normalized ground cost, completed logout/death rules and connected healing to inputs |
| Terra 6.1 max/priority | Nearly ready; small clarifications before affected systems | Specified receipts/handshake/timers, recursive access checks, kill credit and lethal outcomes; moved a small art check into the first increment |

No scores were requested or given: these were planning phases, not code reviews. No extra review pass was launched for these small corrections. The final plan incorporates them; it was not built or playtested, and delegates did not re-review the edited text.

## Final decisions

One TypeScript gameplay domain, Three.js/WebGL2 renderer, Colyseus town room, SQLite dynamic snapshot/receipts and later Electron client. No C++ or legacy protocol. Thais first, using the pinned community topology with explicit era/encounter overlays. One knight, a bounded item/NPC set, a connected sewer circuit, old-school risk and original pixel-textured 3D presentation. See [the complete plan](../../BUILD-PLAN.md).

## Corrections applied after the final checks

1. **Movement:** `400 * groundSpeed / 100` ms cardinal; diagonal duration ×3. The old wording could have been implemented as a forty-second step.
2. **Levels and skills:** first death at4,200XP means3,990XP/level7 by design. Added max-HP/mana formulas below and above8, recalculated full temple respawn, cumulative training baseline/loss rounding/minimumskill10, and exact eligibility for training events. No artificial level8/skill20 floor or XP debt.
3. **Container death transfer:** system roots do not count as portable-container nesting, so moving a valid nested pack into a corpse never breaks depth limits. Death corpse capacity cannot block the transfer.
4. **Access:** revalidate every ancestor through the accessible world/depot/corpse root for each nested operation; invalidate descendant windows if access is lost.
5. **Combat/economy:** explicit2s enemy cadence, ground-normalized pursuit, lost-target return/slow recovery, independent melee/healing deadlines, named Use/`exura` inputs, concrete basic shop prices and no NPC arbitrage. Basic listed stock is unlimited, removing an unnecessary restock subsystem.
6. **Kill credit:** one XP recipient/corpse owner by highest recorded damage, with deterministic ties; creature death/drops/XP/respawn commit together.
7. **Recovery pack:** owner-bound, zero-value, one per owner, no trade/depot and no tradable death-farming output.
8. **Logout and reboot:** ordinary/voluntary logout obeys the combat lock; after unlocking, save/remove the inactive entity. Death while disconnected resolves normally. Service reboot has a separate explicit v0 safe-disconnection policy, preserves committed HP/resources and never simulates offline attacks for downtime. It is not justified by pretending players cannot trigger faults. Corpse expiry still uses wall-clock.
9. **Receipts and epochs:** stable cross-epoch request IDs, input hashes, durable watermark/results for admitted rejected/no-op actions, old-epoch receipt resolution at reconnect, durable epoch fence checked again at dequeue, no sequence-gap buffering and no receipt pruning in this slice. Split/merge receipts include affected/new/destroyed IDs.
10. **Snapshots and clocks:** explicit positions/targets/doors/damage records and remaining action deadlines, not only HP/items. Simulation time stretches on overruns without unbounded catch-up. macOS fullfsync settings must be enabled/verified; commit timing remains to measure.
11. **Milestones:** increment1 reaches the depot; storage arrives in2. Establish ownership/durable commits before trade or loot. Damaging combat in2 includes an atomic lethal outcome/respawn; increment3 completes the selected penalties and harder recovery tests. A representative textured street/actor/motion experiment happens in1, not only at final polish.

## Council sequence accounting

1. Independent source/stack research and proposed plans — complete.
2. Cross-check — complete after restarting under the user's no-C++ and gameplay/difficulty/Thais clarification. The earlier C++ pass was superseded, not counted as another completed required phase.
3. Revised plans using both prior phases and corrections — complete.
4. Check and consolidate one final build plan — complete; small findings incorporated by the coordinator.

An additional interrupted-task notification arrived with a different task identifier after the completed round3 reports had already been collected. It does not replace the verified completed Opus report used here and did not trigger another delegate.

## Work still to execute

The implementation begins with dependency pins, catalog-first version0 OTBM import, semantic route/door/grate/depot overlay and two-client walking in real Thais. Route traversal, game builds, combat balance, durability fault scenarios, motion/art quality and Windows/macOS packages remain unrun acceptance checks. No implementation success or exact7.6 fidelity is implied by council completion.
