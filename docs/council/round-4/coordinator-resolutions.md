# Final-phase resolutions in progress

To be applied to the final plan when all final-phase findings have been collected. These are small implementation-rule corrections, not a new architecture or scope.

## Opus final check

- Accept that first death at4200XP means3990XP/level7. Do not add a4200XP floor that removes the selected level-loss consequence. Define HP/mana for all levels: HP=`145+5*min(L,8)+15*max(0,L-8)`; mana=`5*(L-1)` for this knight slice. Thus level7=180/30,level8=185/35,level9=200/40. Respawn at temple at recomputed full maxima. Clamp to level1/0XP.
- Define skill loss as5%total cumulative training tries (not only this level's progress), recompute from the selected threshold curve, minimum skill10. No artificial skill20 floor. Eligible sword tries require a valid live adjacent attack; zero mitigated damage still counts, empty-air/out-of-range commands do not. Shield training is capped at two valid hostile attack events per cycle.
- System roots(player slots,ground,depot,corpse) do not count toward portable-container nesting depth. Moving a backpack from player to corpse cannot increase the counted depth; death corpses accept all transferred contents regardless of ordinary container slot limits.
- Explicit enemy attack cadence2s,600ms movement, no immediate HP reset on floor changes; specify lost-target/return behavior and healing/attack cooldown independence. These lock calibration assumptions, not historical fidelity.
- Add concrete shop prices and a no-profit NPC arbitrage check; use unlimited listed basic stock to avoid building a restock subsystem for the first loop. The full plan already contains creature gold/trophy drops; Opus's scoped prompt did not include those details.
- Recovery satchel is bound, zero-value, non-saleable/non-tradable, cannot enter another player's ownership/depot, at most one per owner across the world; cannot serve as a sellable death-farming reward.
- Preserve durable outcomes/HP/resources over restart. Define reboot versus ordinary socket loss explicitly; do not justify a reboot policy by assuming players can never trigger server bugs. Never replay offline damage for server downtime.
- Dequeue-time session fencing, durable epoch bump and receipt IDs must be explicit. Ordered sequences reject gaps/resync; split/merge receipts identify created/destroyed instances.
- Simulation time does not catch up with an unbounded burst after a blocking commit. Log overruns and benchmark. Game timers use simulation time; corpse protection/expiry use wall-clock. Verify fullfsync/checkpoint settings on macOS against SQLite docs rather than claiming unconditional physical durability.

No build, map import or gameplay execution is implied by these corrections. Remaining members may identify further small gaps.
