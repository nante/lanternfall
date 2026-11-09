# Mechanics council, round 3 (Terra)

**Score: 8/10.** The listed combat, logout, pile, defence, Look and timing fixes are in place. `npm test` passes 56/56 and `npm run typecheck` passes. I reviewed the client animation and logout handling in code; I did not run a browser. The directory is not a Git checkout, so this is a review of the current files rather than a diff.

## Blocking issue

**Automatic chase paths can keep moving after they should stop.** In `packages/game/src/engine.ts:444-449`, reaching melee range stops *replanning* but does not clear an existing automatic path before it executes. In a normal pursuit on the shipped map, the hero reached `(58,48,1)`, adjacent to a rat at `(57,47,1)`, with four path steps left; subsequent ticks moved the hero to `(57,48)`, `(56,48)` and `(55,48)` while fighting. Separately, `dead()` clears a damage contributor's target at `:403` without clearing their automatic route; the anti-lure despawn does the same at `:564`. I reproduced this by killing a rat with Ember during a chase: the target became null, but the hero continued along the remaining route. This can carry a player past a fight or toward danger after the target is gone.

**Fix:** Before executing movement, clear a non-manual chase path when the live target is already within melee range. Whenever an attack target is cleared by death, despawn or a protection-zone check, also clear its non-manual chase path at that point; preserve explicitly requested manual routes. Test both a moving creature reaching melee range and a ranged kill while chasing, asserting the hero stops and the path is empty.

## Notes

1. **A blocked chase reroute does not preserve PZ avoidance.** The initial chase path excludes PZ tiles at `packages/game/src/engine.ts:445-447`, but the obstacle reroute at `:464` avoids only occupied tiles. Include `!p.manual && this.geo.pz(q)` in the reroute's avoid predicate. This is a code-path gap; I did not reproduce a PZ-crossing reroute on the current town map.
2. **Floor changes can animate as ordinary steps.** `apps/client/src/render/view.ts:300-302,326-336` changes floors without resetting the actor's interpolation. For example, using the hatch from `(65,47,0)` lands at `(64,48,1)`; because the positions are less than three tiles apart, the renderer starts a diagonal interpolation on the new floor. On an actor's floor change, snap its position and target to the new tile and clear its interpolation state. This observation is from code inspection, not a browser run.
