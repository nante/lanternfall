# Mechanics council, round 2 (opus)

**Score: 7.5 / 10**

I checked all ten consensus items against my round-1 notes and the code. `npm test` passes (47/47) and `tsc --noEmit` is clean. The movement, melee, XP-split, death, regen, food-cap and skill-constant formulas match the consensus and 7.6. One example: a level 1 hero on grass gets 1000·150/220 → 700 ms, and 2050 ms on a diagonal. The armour roll matches 7.6 for every armour above 1. Two things block.

## Blocking

### B1. The weapon-defense fallback does nothing: no weapon has `defense`

- Where: `content/balance.json:77,86,95,104` (cudgel, shortsword, hatchet, blade), read at `packages/game/src/engine.ts:568-570`.
- Problem: `guard = shield ?? weapon` and then `baseDef = def.defense ?? 0`. No weapon defines `defense`, so a hero without a shield never blocks. That includes every new hero, because the starter kit has no shield. Half of consensus item 3 never runs.
- Fix: give each weapon a `defense` in `balance.json`, using our own numbers in the 7.6 range where light weapons sit near their attack and heavier ones lower. For example: cudgel 7, shortsword 10, hatchet 8, blade 12. Then add one test: a hero with a cudgel and no shield, in defensive mode against rats, records at least one `block` effect over 20 s.

### B2. Players can still attack from a protection zone for one tick, and Ember never checks the zone

- Where: `packages/game/src/engine.ts:432` (the zone check), `:439-458` (the step), `:459` (the melee swing), `:345-347` (Ember in `cast`).
- Problem 1 (melee): the zone check runs before the step. A hero who steps into the shrine or vault this tick and ends next to the target still swings from inside the zone in the same tick.
- Problem 2 (Ember): the attack branch of `cast` has no zone check. If a cast arrives after that step and before the next tick, Ember lands from inside the zone. The creature can never retaliate, because monsters ignore players in a zone.
- Fix:
  - Melee: add `&& !this.geo.pz(p)` to the condition at `:459`, or move the `:432` check below the movement block.
  - Ember: in `cast`, before the range check at `:347`, add `if (this.geo.pz(p)) throw new GameError('You may not attack from a protection zone.');`.
  - Test: put a hero in the zone with `p.target` already set to an adjacent rat, then check that neither `tick()` nor `cast ember` changes the rat's HP.

## Non-blocking notes

1. **Armour 1 rolls 0 or 1.** `armorRoll` at `engine.ts:531` returns `random(a)` when `a < 2`. In 7.6, any armour from 1 to 3 always takes off exactly 1 (Nostalrius: `else if (armor > 0) --damage`). This matters for rats (armour 1) and for heroes wearing only a cap or boots. Fix: `if (a <= 0) return 0; if (a <= 3) return 1;`. Armour 2 and 3 already give 1, and larger values already match.
2. **Look adds "a" before the last corpse stage.** `describe` at `engine.ts:516` produces "You see a remains of a gutter rat." Drop `remains` from the list of names that get "a"/"an" in front.
3. **Look has no range or floor check for creatures and players** (`engine.ts:499-505`). Looking up an id works at any distance and on any floor. For a player, it also tells you their level. Apply the same `distance(p, actor) <= 8` check (which also requires the same floor) to creatures and players that tile looks already use at `:507`.
4. **The shield test can't fail the way its name says** (`tests/engine.test.ts:313-322`). It allows up to 4 tries over a 2 s span that can cross into a second block window, and it never checks that blocks happen at all. The code trains shielding on every block chance taken, not only on a successful block, which matches consensus item 3, so the test name ("only trains on a block") is wrong. The zone test (`:356`) is named "creatures never enter" but nothing in it checks that. Fix: pin one block window, assert at least one `block` effect and no more than `blocksPerTurn` tries, and add a check that a rat pathing toward a hero in the shrine never stands on a zone tile.
5. **Chase can walk the hero into a zone.** The chase spots at `engine.ts:435-437` can include zone tiles next to a creature at the zone's edge. The hero steps in and loses the target, with an error notice. Fix: also filter the spots with `!this.geo.pz(q)`.
