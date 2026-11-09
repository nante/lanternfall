# Opus 5.5 — round 3

Configuration: medium effort. Scoped modern tile-RPG mechanics plan; no target-map identity or recreation context supplied.

# Round 3 design proposal: playable slice first

**Recommendation:** build the playable end-to-end slice first. A map with walking and server authority comes first, then one hunt, loot and trade loop. Ordering ten systems before transport hides integration bugs until the end. No concrete reason was found to choose that order.

## 1. Modules and boundaries

```
shared/   types, defs (items, creatures, NPC scripts), Command union, view DTOs
sim/      World state + rules. Pure TS, no Colyseus/Three/SQLite imports.
  map.ts        floors, tiles, transitions, LOS/visibility
  items.ts      item store, container tree ops, decay
  move.ts       timed steps, A* path, transitions
  combat.ts     targeting, hit/dmg, XP/skills, death
  npc.ts        keyword matcher, trade, depot access
  tick.ts       applies queued commands + timers in order, emits events
server/   Colyseus room: decode → enqueue → tick → per-client view projection
persist/  better-sqlite3: load, flush(dirtySet), immediate commits
client/   Three.js renderer, input → Command, interpolation only
```

Rule: `sim/` owns all game rules. The client predicts nothing beyond animating the step the server confirmed. Colyseus carries **view projections**: what one client can see on its visible floors. It does not carry the domain model. Use Colyseus 0.16 `StateView` filtering or plain messages. Don't mirror the whole `World` into a Schema.

**Map model**
- `Pos = {x, y, z}`.
- Each tile has independent flags: `blocksWalk`, `blocksProjectile`, `blocksSight`, plus `roofGroup?: id` (display only).
- `Transition = {from: Pos, to: Pos, kind: 'stairs' | 'ladder' | 'hole' | 'rope'}`, explicit, with a trigger on step or on use.
- Visibility rule: the client hides floors above z while the player stands under a roof group. The server sends floors z−1..z+1 inside the view rectangle.

**Commands** (each carries a client `seq` for dedupe):

```ts
type Command =
 | {t:'walk', dir:Dir} | {t:'path', to:Pos} | {t:'stop'}
 | {t:'look', ref:ThingRef}
 | {t:'use', item:ItemRef, on?:ThingRef}        // open container, eat, ladder, door, rope
 | {t:'target', id:EntityId|null} | {t:'mode', stance:'off'|'bal'|'def', chase:boolean}
 | {t:'move', item:ItemRef, to:SlotRef, count:number} // move, split, equip, depot
 | {t:'say', text:string, to?:EntityId}         // NPC keywords incl. trade/depot

type SlotRef = {kind:'inv'|'equip'|'container'|'tile', id:string, slot?:number}
type ItemRef = {id:ItemId, from:SlotRef, ver:number}  // expected location + version
```

Equip, split and depot transfers are all `move`. Opening a container is `use`. Five verbs cover the core commands.

## 2. Playable increments

1. **Walk slice.** One two-floor map: town street, house with roof, stairs to the upper floor, a hole down. Includes the Colyseus room, timed walk and click-path, transitions, roof hiding and `look`. Two browser clients see each other move. Position is saved on logout. *Exit test:* two players walk, take stairs, and see each other appear on the right floor.
2. **Items and persistence.** Backpack with a nested bag, ground items, move/split/equip, food via `use`, weight and capacity, decay, SQLite flush plus restart. *Exit test:* run `kill -9` at random moments while moving items, restart, and check that no id appears twice and every item has a parent.
3. **Hunt loop.** Three monster tiers, targeting, melee plus one distance weapon (LOS uses `blocksProjectile`), XP, levels, skills, corpse loot with an owner window, death and temple respawn. A seeded Monte-Carlo calibration script covers §5.
4. **Town loop.** Keyword NPC (`hi` / `trade` / `buy 5 meat` / `yes`), sell loot, depot locker, then buy gear and return to the hunt. Player-to-player trade is deferred. The same transaction path handles it later.

## 3. Item invariants

- **Identity.** Every non-stack item and every stack has a server-generated `ItemId` (ULID). Clients never mint ids. Splitting creates a new id and decrements the source in the same tick. Merging deletes the source id.
- **Single parent.** The item table has one `parent_kind` / `parent_id` / `slot` per row. If the in-memory tree mirrors that rule, an item cannot be in two places in storage. Duplication becomes a schema violation instead of a logic bug.
- **Tree.** No cycles: a container cannot go into itself or any descendant. Nesting depth stops at 8 or less. Per-container slot limits apply. Carried weight is summed over the whole tree against player capacity.
- **Stacks.** Merge only when the def is the same and the attributes are equal. Counts stay between 1 and 100.
- **Move validation.** `from` and `ver` must match current state. If they don't, the move is rejected and the client resyncs. This is what settles concurrent looting.
- **Expiry, two kinds.**
  - `expiresAt` (absolute server time) for ground items and corpses.
  - `remainingMs` that drains only while the item is in a consuming state, e.g. an equipped timed ring. Stored on flush, so logout pauses it.
  - On load, anything with `expiresAt < now` is deleted. A corpse's contents expire with it.
- **Death.** One function, `applyDeath(player)`, computes the XP/skill loss, picks the items lost, creates a corpse container (`ownerId`, `ownerUntil`, `expiresAt`), reparents the lost items into it, and moves the player to the temple. It **commits immediately**, as one transaction.

## 4. Commit strategy (no event sourcing)

- **One room per process for the slice.** Commands from all clients go into one queue, and the tick (proposed 50 ms) applies them in order. JS is single-threaded, so there is no in-process race. Two players clicking the same corpse item in the same tick are handled in order. The second fails the `from`/`ver` check and receives `"You cannot take this."`
- **Dirty-set flush.** Every mutation marks rows dirty: items, player row, skills. Once per second, `flush()` writes the whole dirty set in **one** SQLite transaction (WAL mode, `synchronous=NORMAL`). Each committed state is therefore a consistent snapshot of the whole world, ground and corpses included.
- **Immediate commit** before the result is sent to the client for: NPC trade, depot transfers, death and logout. better-sqlite3 is synchronous and sub-millisecond for these, so the tick does not stall in practice.

**Crash timing**

| Crash point | Result |
|---|---|
| Between flushes | World reverts up to 1 s for everyone. Loot picked up in that window goes back to the corpse, and the corpse is restored too. Nothing is duplicated. The player and their items come from the same snapshot. |
| During the transaction | SQLite atomicity: all or nothing. |
| After an immediate commit, before the client ack | The trade or death is durable. The client reconnects, sees the new state, and the server ignores the replayed `seq`. |
| Gold debited without the item credited | Impossible: both rows are in one transaction. |

**Reconnect**
- A session token maps to `playerId`.
- If the live entity still exists (logout grace or combat lock, proposed 60 s after the last hit), the new socket **reattaches** to it.
- The server loads a player from SQLite only when no live entity exists.
- A second login kicks the older socket.
- The server keeps the last applied `seq` per player, so resent commands are no-ops.

These rules close the "relog to duplicate" and "reconnect during loot" holes.

## 5. Difficulty baseline (provisional, not historical)

**XP curve:** cubic, `XP(L) = 50/3·(L³ − 6L² + 17L − 12)`.
- Level 8 = 4,200 XP; level 9 = 6,400.
- The 8→9 gap is 2,200 XP. That replaces the "100 XP per level" figure.

**HP:** `145 + 5L` up to level 8 (185 at level 8). After that, +15/level for knights. Use 185, not 100: a 100 HP level-8 character would make trivial mobs look dangerous.

**Melee:**
- `max = 0.085·skill·weaponAtk·stanceMul + L/5`.
- Damage is uniform from 0 to max, minus armor drawn uniformly from 0 to armor.
- Level 8 knight, skill 40, attack-14 sword, balanced stance: max ≈ 49, mean ≈ 25 before armor.

**Skill tries:** `tries(n→n+1) = 50·1.1^(n−10)`.
- 40→41 ≈ 870 hits, about 30 minutes of steady 2 s swings. Slow, deliberate, old-school.

**Death:**
- Lose 10% of total XP. At 5,000 XP the character drops to 4,500 and stays level 8.
- Each equipped and container item has a 10% loss chance (proposal).
- At about 2,000 XP/h for a level-8 hunt, that is roughly 15 minutes to recover the XP. Gear loss is the real sting.

**Regen:** fed knight regains 1 HP per 6 s. Food caps at about 20 minutes. Low regen keeps potions and retreat meaningful.

**Calibration scenarios** (seeded sim, 10k runs each). If a target misses, tune the numbers and leave the formulas alone.

1. **Rat** (HP 20, max hit 8) vs level-8 knight in starter armor 10: dies in 1–2 hits. Knight loses under 3% HP per kill and never dies in the sim.
2. **Mid-tier** (HP 60, max 25, armor 6) one at a time: about 4 kills before a needed rest at 50% HP. Sustainable with food.
3. **Same mid-tier, three at once:** at least 30% death rate if the knight doesn't retreat within 20 s. This is the deliberate-risk scenario.
4. **Dangerous** (HP 150, max 60): solo death within about 10 s without retreat. Made to be avoided at level 8.
5. **Archer** across a wall: zero hits when `blocksProjectile` is set, even if sight is open.

## 6. Source reuse note

- **RPGJS (MIT, github.com/RSamaium/RPG-JS):** look at its hook and formula shapes and its snapshot patterns. Copy small pure helpers only, with attribution.
- **Kaetram (github.com/Kaetram/Kaetram-Open):** reference only. Check its license before copying any line.
- **Colyseus (docs.colyseus.io):** take the room and `StateView` patterns from the docs.
- Nothing above has been built or tested yet.

## 7. Assumptions round 4 must lock

1. Tick length (50 ms?) and step timing formula: ground cost and speed, plus diagonal multiplier (proposed ×2).
2. Flush interval (1 s) and the exact list of immediate-commit events.
3. Whether ground and corpse items persist (proposed: yes, with `expiresAt`).
4. One room per process for the slice; how multi-map handoff works later.
5. XP curve, HP/mana/capacity per vocation, the melee formula, the death penalty and item-loss chances.
6. Logout combat lock and grace duration; PvP off for the slice?
7. Corpse owner-protection window and corpse expiry times.
8. Map authoring format (Tiled JSON with custom properties for the flags and transitions?) and the data format for item and NPC definitions.
9. Container depth and slot limits, and stack maximum.
