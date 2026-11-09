# Mechanics council, round 3 (opus)

**Score: 8.5 / 10**

I checked every round-2 blocking item from all three reviews against the code. `npm test` passes (56/56) and `tsc --noEmit` is clean. Each fix below is in place:

- **Protection zone.** The zone check runs before movement (`engine.ts:442`) and again after movement and travel, before the swing (`:469`). The offensive branch of `cast` refuses inside a zone (`:354`). Chase spots leave out zone tiles, and the chase path avoids them (`:446-447`).
- **Stand mode** clears an automatic route (`:320`).
- **50 ms simulation.** `engine.tick(50)` runs every 50 ms with a view every 2 ticks (`index.ts:40,62`). Persistence stays at every 2 s (40 ticks). The simulator uses `TICK = 50`. A test checks the actual 450 ms gaps between steps.
- **Client step animation** goes from start to destination over one step duration, with no 1.05 factor (`view.ts:331,437`). A jump of more than 3 tiles snaps into place.
- **Logout.** An accepted logout clears `combatUntil` (`:317`). `Net.leave()` only leaves after an `ok` result (`net.ts:47-53`), and `main.ts:401` stays connected and shows a toast on rejection.
- **Full tile.** On a full tile, the amount that lands is capped at the room left in matching stacks (`:145-150`). `stackInto` then merges the new entry back, so the tile count never goes over `tileItemLimit`. This also holds for splits on the same tile.
- **Weapon defense values** are set (`balance.json`). `armorRoll(1) = 1`, and armour 2 and 3 give 1. Corpse look and creature/player look (on your screen only) are fixed. `magicNeed` is computed directly.

I found one regression-adjacent gap.

## Blocking

### B1. A chase route survives the target's death (and its anti-lure despawn)

- Where: `packages/game/src/engine.ts:403` (`dead`) and `:564` (anti-lure in `think`).
- Problem: both places set `p.target = null` but keep the automatic `p.path`. On the next tick the check at `:441` is skipped, because it only runs while `p.target` is set. The step block at `:449` then walks out the rest of the old chase. I reproduced it: a hero 4 tiles away is chasing a rat and kills it with Ember. The hero then walks all 4 tiles to the corpse. This goes against the claim that "finished/cancelled chase routes are dropped", and against terra's round-2 item 2. The route is not limited to Ember: any kill or despawn mid-chase leaves the hero walking toward where the target was.
- Fix: in both places, replace `p.target = null` with `{ p.target = null; if (!p.manual) p.path = []; }`.
  - At `:403`: `if (p.target === m.id) { p.target = null; if (!p.manual) p.path = []; }`
  - At `:564`: `if (p.target === m.id) { p.target = null; if (!p.manual) p.path = []; }`
- Don't clear every non-manual path whenever `p.target` is null. `useTile` (`:284`) sets a route without setting `manual`, so a blanket rule would cancel walks to doors and hatches.
- Test: chase a rat from 4+ tiles, kill it with Ember after the first tick, run 60 × `tick(50)`, then assert the hero has not moved and `p.path` is empty.

## Notes

1. **`leave()` timeout race** (`net.ts:51`). If the server accepts the logout after the 4 s client timeout, the server hero is already logged out but the client stays connected and acts on it. This is rare, so it doesn't block. One fix is to have a late `ok` for that request id still call `room.leave(true)`.
2. **Tests tick at 100 ms while production ticks at 50.** The `run` helper (`tests/engine.test.ts:15`) and the `tick(ms = 100)` default (`engine.ts:427`) mean most tests run at a different resolution from the server. Changing the default to 50, and `run` to match, would make the timing tests describe what players actually get.
3. **The client starts a step about one view late** (up to 100 ms), and starts it from the position already interpolated so far. This is fine for 7.6-feel walking, and I don't want it changed now. It only matters if the steps visibly stutter on long diagonal runs.
