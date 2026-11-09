# Thais — build plan

Status: final plan, four council phases complete. Final-phase clarifications are incorporated below. Planning only; no game has been built or run yet.

## The result we are building

A browser-playable Thais with deliberate Tibia-7.6-style interactions and difficulty, rendered as a textured, atmospheric 2.5D pixel-art world. The first useful build is a real Thais walk and interaction route; the first complete slice is a supply → hunt → loot → return → recovery loop. It is not merely an engine scaffold or a decorative village.

The user's corrections govern this plan: modern implementation, no C++; 'backbone' means in-game interactions and difficulty; Thais belongs in the first playable; source checks stay brief. The final goal remains the 7.6 experience, but the first imported map and balance configuration have explicit differences rather than a false fidelity claim.

## Stack and reuse decisions

| Part | Choice |
| --- | --- |
| Game rules | Small, purpose-built TypeScript domain, one implementation |
| Browser | Vite + Three.js WebGL2, HTML/CSS interaction panels |
| Multiplayer | Supported Node LTS + Colyseus, one authoritative town room |
| Saves | SQLite via a pinned compatible better-sqlite3 release |
| Desktop | Electron packages the same browser client; connects to the same server |
| Map tooling | Offline TypeScript OTB/OTBM/XML import to project JSON |
| Assets | Original textured modular geometry and rigged glTF actors |

Colyseus supplies synchronization and connections, not combat, inventory or difficulty. RPGJS and Kaetram have real RPG systems, but adapting their movement, floors, flat inventory, networking and renderer assumptions would replace central parts anyway. Reuse map data, the OTBM reader and small libraries; do not extract an entire engine just to say we reused one.

No C++ server, legacy TCP bridge, native 7.x-client compatibility, Rust/WASM gameplay layer, second simulation, second desktop wrapper, microservices or public deployment is part of this build. Desktop is a client conversion, not a promise of a bundled offline world server.

References: [Three.js WebGL2](https://threejs.org/docs/pages/WebGLRenderer.html), [Colyseus](https://docs.colyseus.io/), [RPGJS](https://github.com/RSamaium/RPG-JS/tree/v5), [Kaetram](https://github.com/Kaetram/Kaetram-Open), [Electron](https://www.electronjs.org/docs/latest/). Pin compatible actual versions and a lockfile during setup; do not mix old and current Colyseus APIs.

## Thais first: the concrete map route

Initial input is [Tibia71.otbm and its XML at commit 783c717ccf50987d18f9c06763c2c427c83d7345](https://github.com/bradleyworkman/Tibia-7.1-map/tree/783c717ccf50987d18f9c06763c2c427c83d7345). The author calls this a **7.1 reconstruction stored in a 7.4-era format**, not a 7.6 map. Use its actual topology, patch slice-relevant differences in a versioned overlay, and retain a short gap list. Do not rename it an exact 7.6 world.

Proposed initial envelope: x32250–32420, y32090–32310; surface floor7, building floors0–6, and the selected connected sewer on8. Confirm city coverage during import; the rectangle is an import envelope, not permission to add the whole surrounding world. Preserve recognizable streets, gates, harbor and building exteriors. Open temple, Sam, Frodo, Xodet and ground-floor depot; unopened interiors and out-of-scope exits stay visibly closed.

Read-only source inspection in round3 identified:

| Anchor | Source coordinates / meaning |
| --- | --- |
| Temple | `(32369,32241,7)` |
| Sam | `(32360,32199,7)` |
| Frodo | `(32356,32209,7)`; ordinary doors must open to reach him |
| Depot | locker `(32341,32225,7)`, depot ID2 |
| South sewer entry | grate430 at `(32370,32213,7)`, ladder1386 below |
| First rat area | around `(32368,32216,8)` |
| North sewer exit | `(32339,32183,7)` |

A conditional source-data flood-fill found a 926-cell connected sewer component. This is not an observed in-game traversal. The first implementation must walk both entrances, verify their exact return tiles, open Frodo's door and reach the depot locker. Storage/retrieval arrives in increment 2. If any link differs, correct the importer/interaction overlay at its real coordinates rather than inventing a new entrance.

Load [RME740 items.otb at revision8dbc487ef27983ec566456541858dfdca05c5328](https://github.com/hampusborgos/rme/tree/8dbc487ef27983ec566456541858dfdca05c5328/data/740) before parsing the version0 map. Header major/minor1/1 matches the candidate, but headers alone are insufficient: verify catalog IDs and representative tiles. The [TS OTBM reader](https://github.com/V0RT4C/ot-otbm) is the starting library; implement/verify old count/fluid subtype consumption, including compact tile items, against [RME's reader](https://github.com/hampusborgos/rme/blob/master/source/iomap_otbm.cpp).

Preserve source server/client IDs, ground, ordered tile items, nested contents, flags, ground speed, house/depot IDs, action/unique IDs and destinations. Map source server IDs to semantic project definitions and new visuals. Examples:407 black-marble ground,1036/1037 walls,430 grate,1386 ladder,2589/2591 depot objects. Source IDs are not item-instance IDs. Runtime assets do not need Tibia SPR/DAT files.

Resolve behavior on every active route and reachable adjoining tile. Unknown art can use a placeholder; unknown collision/interaction must be resolved, not silently made walkable. Author explicit door pairs, roof/interior groups, grate/ladder links, NPC behavior and protection zones in the overlay. The imported static map and runtime dynamic doors/items are separate.

## First playable loop and contents

Temple → inspect/open/equip → Sam/Frodo/Xodet for supplies → depot → south grate → rats → optional harder northern hunt → north exit → sell/store → save/reconnect. A death adds a risky corpse-recovery trip.

Limit the slice to one knight, four NPCs, twelve portable item definitions, one personal depot and ten concurrent monsters: six rats, two cave rats, two rotworms. Portable definitions: two swords, shield, body armor, helmet, boots, backpack, pouch, gold, food, life fluid and trophy. Backpack: 20 slots; pouch: 8; stack cap: 100; provisional carried capacity: 300 weight units. Maximum nesting is eight portable-container levels. Player slots, ground, depot and corpse are system roots and do not add depth; moving a valid pack into a corpse never invalidates its nesting. A death corpse accepts all transferred contents without ordinary bag slot/weight limits. Cycles are always forbidden.

The source rotworm area is outside the selected sewer. For v0, place individually approachable rotworms on the source rat tiles near `(32351,32189,8)` and `(32338,32189,8)` after verifying the encounter space. These are **authored placements**, not claimed historical spawns. Keep a return route and test that both can actually be pulled into the danger scenario.

Interactions:

- Arrows/numpad and click-path movement, with visible queued destination; manual movement cancels the path.
- Right-click Look/Use/Open/Attack; explicit target/attack and Escape to cancel. Floors, range and visibility constrain picking and use.
- Enter focuses chat and suppresses walking keys. NPC `hi`, `trade`, `buy`, `sell`, `yes` flows show price and quantity before confirmation.
- Food and life fluids use the existing **Use** action; typing `exura` invokes the provisional self-heal. The server owns consumption and cooldowns. The healing cooldown is independent of the melee swing deadline; neither resets the other.
- Stable container panels with parent navigation, drag/drop, Shift-drag quantity, equipment validation and personal depot access. Move/split/equip/store share one ownership rule.
- Leaving reach closes access to corpses/depot. Failure leaves the item in its original slot and explains why. Opening UI does not pause combat.
- Every operation on a nested item revalidates its entire parent chain to an accessible root, including floor/reach, personal depot ownership and corpse owner/expiry. Losing root access invalidates all open descendant panels; an old panel never grants remote access.
- Visible HP, mana, food time, capacity, target and combat-lock state. Presentation reflects confirmed authority; it does not grant damage or items.

PvP, housing, boats, crafting, full quests, other vocations/ranged combat and the wider world are later scope.

## Difficulty configuration v0

These are **provisional, testable values**, not verified historical combat formulas. Rat20HP/5XP and rotworm65HP/40XP are supported by contemporary [OpenTibia creature templates](https://github.com/otland/forgottenserver/tree/v1.6/data/monster/monsters); that is limited reference evidence, not proof of7.6 fidelity. Keep every value in one versioned rules/content configuration.

| Rule | Initial value |
| --- | --- |
| Knight | level 8; 4,200 XP; 185 HP / 35 mana; sword/shield 20; attack 10, defense 8, total armor 4; 60 gold, two food, one fluid |
| Walking | `cardinalMs = 400 * groundSpeed / 100`; diagonal duration is three times cardinal; no corner cutting or occupied-tile walking |
| Melee | adjacent target; player and enemy attacks every 2 s; uniform integer player raw damage `0…attack+floor(sword/5)`; enemy armor absorbs `0…armor` |
| Enemy HP / armor / raw attack | rat: 20 / 1 / 0–8; cave rat: 30 / 2 / 0–14; rotworm: 65 / 4 / 0–20 |
| Player mitigation | armor 0–4; shield 0–`floor(defense*shieldSkill/40)`; shield covers at most two attackers per 2 s cycle |
| Threat | same-floor line of sight within 7 tiles; enemy cardinal duration `600 * groundSpeed / 100` ms; valid topology, no ladders; no HP refill on floor changes |
| Food | 2 gold adds 120 fed seconds, cap 20 min; while fed regain 1 HP and 1 mana per 6 s; no free unfed regeneration |
| Healing | spell: 30 HP / 20 mana; life fluid: 40 HP / 20 gold; shared 2 s cooldown; consumed resources never restored by reconnect |
| Rewards | rat: 5 XP, 1–3 gold; cave rat: 10 XP, 2–6 gold; rotworm: 40 XP, 6–14 gold plus 20% trophy chance worth 10 gold |
| XP | cubic template `100*(L^3-6*L^2+17*L-12)/6`; level 9 needs 6,400 XP, a 2,200 XP gap; normal rates, debug acceleration separate |
| Skills | `ceil(200*1.1^(skill-20))` tries per advancement; cumulative training starts at the sum of thresholds from skill 10 through 19; valid adjacent attacks count even if mitigated to zero, empty-air/out-of-range commands do not; shield max two eligible hostile events per cycle |
| Enemy respawn | 60 s after death, only without nearby players; deadline and exactly-once loot creation persist |

The [XP template](https://github.com/otland/forgottenserver/blob/v1.6/src/player.h) is an OpenTibia reference; damage/skill/economy settings remain our first tuning pass. For this knight, `maxHP = 145 + 5*min(L,8) + 15*max(0,L-8)` and `maxMana = 5*(L-1)`. Levels 7 / 8 / 9 therefore have 180/30, 185/35 and 200/40 HP/mana. Clamp current values on level loss; gaining a level does not refill resources. Do not scale enemies or inflate rat lethality to manufacture challenge.

NPC stock for listed basic goods is unlimited in v0; no restock subsystem is needed. Initial buy/sell gold prices: basic sword 10/3, upgraded sword 50/15, shield 10/3, body armor 20/6, helmet 5/1, boots 5/1, backpack 10/3, pouch 5/1. Food sells to the player for 2 gold, fluid for 20; merchants do not buy back consumables. Sam buys trophies for 10 and does not sell them. Reject any configured NPC price cycle that yields profit from buying and reselling without gameplay. Define item weights and equipment requirements in the same catalog before enabling purchases; validate capacity against the complete post-transaction result.

When a monster dies, award XP once to the player with the most server-recorded damage; ties use earliest contribution, then stable player ID. That player owns the corpse's protected window. Persist the damage record and resolve death, XP, drops and respawn state together. No party XP splitting in v0.

Round3's analytical estimates suggest about7/11/26seconds to kill rat/cave rat/rotworm, and about5/21/86HP lost while stationary. Two tanked rotworms should exceed the knight's185HP budget. A fed four-rat/one-rotworm trip is roughly break-even if emergency healing is needed; safe rats finance mistakes. These are hypotheses to measure with seeded scenarios and actual play, not performance/results claims.

On death: subtract `floor(0.05 * totalXP)` and `floor(0.05 * totalTrainingTries)` for each tracked skill, then recompute levels/skills. Minimum XP is 0 / level 1; minimum skill is 10. The first death at 4,200 XP gives 3,990 XP / level 7: this cost is intentional. Leave carried backpack/contents/currency in a corpse; retain worn combat gear. Respawn at the temple with full recalculated HP/mana, committing the losses, corpse and respawn together. Corpse is owner-only for 2 min, then publicly lootable, and expires after 15 min wall-clock including downtime. Expiry removes remaining contents atomically; an outage longer than the remaining lifetime can therefore lose an unrecovered corpse.

A basic recovery satchel is available only when the player has no usable pack. It is owner-bound, zero-value, non-saleable/non-tradable and cannot enter a depot or another player's ownership. At most one exists per owner across the world; it disappears if dropped except into its owner's death corpse. Reconnect never reclaims a dropped backpack or duplicates the satchel.

Combat lock lasts 60 s after the last hostile interaction and applies to voluntary logout too. Ordinary disconnect leaves the live character vulnerable; rejoin attaches to that character. Once safely unlocked, persist and remove the disconnected entity. If it dies first, execute the same death/temple transition, then remove the disconnected respawned entity. An unlocked logout never deletes the saved character record.

Service reboot is distinct: never simulate attacks for downtime. Restore committed HP/resources, positions and cooldowns; start characters without a connection inactive, and clear transient monster targets/combat locks as an explicit v0 service-restart policy. This grants no healing, rollback of death or extra rewards. Normal socket loss never triggers that policy. Do not justify it by assuming players can never trigger a server fault; adversarial crash-escape handling is not claimed solved by this prototype.

A monster losing its target, including to a floor change, returns along valid topology to its spawn while keeping HP. After 30 simulation seconds at home without combat, regenerate 1 HP per second until full; reacquisition interrupts recovery. No instant refill or teleport reset. Verify floor-peeking and two-monster pursuit in the actual circuit; treat this recovery rule as provisional rather than historical fact.

Difficulty acceptance: rats teach targeting without threatening a healthy knight; one isolated rotworm costs meaningful health; pulling both punishes commitment; a clear straight retreat works; limited mana/food/fluids matter; safe trips make modest profit; death costs real progress and recovery. Measure several fresh runs before expanding content. Keep a short list of historical differences rather than claiming exact7.6 simulation.

## Authoritative state and saving

Use one town room, one ordered command queue and one SQLite writer. A proposed 100 ms simulation tick schedules discrete deadlines. Persist changed dynamic state, including advancing active persistent timers; a fully idle world need not write merely to increment an unused tick counter. Client actions carry a stable request ID, session epoch and sequence; validate identity, payload, source/version, reach, floor, visibility, cooldown, ownership, capacity and prices server-side.

For this small slice, choose a deliberately simple **versioned dynamic-state snapshot**, excluding static terrain. Include players, item instances/parents, depots/ground items, dynamic doors, creature positions/targets/damage contributions/HP/death/respawn state, corpses, remaining movement/attack/healing/food/combat timers, XP/skills and RNG state. Restore simulation deadlines as remaining durations; apply the explicit service-reboot policy afterwards. At a changed tick:

1. Derive the candidate state and validate ownership invariants without publishing it.
2. In one SQLite transaction, write the new snapshot/revision and durable command receipts/results. Admitted rejected/no-op actions also durably advance the sequence watermark and store their result even when the world snapshot is unchanged. Use WAL and `synchronous=FULL` initially; on macOS enable/verify `fullfsync` and `checkpoint_fullfsync` too. Benchmark actual commit/tick cost; do not promise unconditional physical durability or sub-millisecond writes.
3. After commit succeeds, replace the live committed state, update filtered Colyseus views and acknowledge actions. No uncommitted item, gold, death or reward reaches clients.
4. On failure or uncertain commit, pause intake, reload the confirmed DB revision and resynchronize. Do not continue from an unconfirmed mutation.

Stable server-generated IDs, one parent/slot per item, legal counts, capacity, acyclic containers and quantity conservation are domain invariants. Death/loot creation, source corpse, inventory, XP and spawn state share the same snapshot. Split/merge/trade/depot moves cannot independently save only one side. This avoids mixing stale world state with a newer inventory.

Persist each receipt's player, stable request ID, epoch, sequence, input hash, outcome, affected/created/destroyed item IDs and world revision. Retain all admitted receipts for this slice. Reusing a request ID with different input is rejected; legitimate retries return the recorded outcome, including rejection/no-op. A sequence gap triggers resynchronization rather than buffered out-of-order execution.

On authenticated reconnect/new login, durably fence the old epoch before accepting new actions, discard its queued commands and recheck the epoch at dequeue. Resolve the client's pending stable request IDs against receipts from prior epochs before issuing new intentions; a retry keeps the same request ID even in a new epoch, so a committed buy cannot run twice after a lost acknowledgement. Commit the new epoch and sequence baseline before the first new command. Reattach to a live entity rather than loading a second copy from an old save. Process corpse expiry before reconnect. Malformed or unauthenticated packets are rejected before admission.

Movement, combat, healing, food and spawn/recovery timers use simulation time; corpse protection/expiry use wall-clock. A blocking commit overrun never creates an unbounded catch-up burst: continue from the last committed tick, stretch simulation time and log the missed budget. The next tick starts only from committed state. Measure this behavior before changing durability settings.

SQLite supplies [transaction durability mechanisms](https://www.sqlite.org/pragma.html#pragma_synchronous); this strategy is not proven until tested. Start with snapshots because the dynamic slice is small. Do not build event sourcing or normalize the whole world before profiling shows a need. Preserve map/content/rules schema versions in saves and reject incompatible loads visibly.

## Visual treatment

Fixed elevated orthographic camera; original modular walls/roofs/ground; hand-painted pixel textures; rigged low-poly actors with idle/walk/attack/death. Start testing world rendering at640×360 and integer nearest upscale with letterboxing where needed; interface text renders at display resolution. Tune density against the reference rather than treating that resolution as an artistic guarantee.

Snap presentation/camera in camera space, not authoritative positions. Stabilize shadow projections, use shaped foliage/cutout cards, warm directional light and cool ambient shade with restrained haze. Avoid generic voxel cubes, blurry scaling and temporal noise. Roof/interior groups hide the correct obstruction, preserve collision and prevent hidden-floor selection. Choose visible entity views from the actual floor/opening rules, not an automatic z±1 broadcast.

In increment 1, use one rigged actor and a representative textured street/occlusion piece to check the chosen pipeline early. The art check is movement behind foliage, entering a building, using a grate/ladder and crossing shadows in a real Thais street. Check silhouettes and pixel stability while walking and resizing. Aim for 60 fps on named test hardware; record actual results before claiming support.

## Executable build sequence

| Increment | Work | Exit that can be observed |
| --- | --- | --- |
|1 — Walk Thais | map/catalog importer, semantic overlay, one actor/camera and textured art check, timed movement, doors/floors, authoritative room | two browsers walk temple→shops→depot locker→both sewer entrances and back; walls/roofs/picking work; inventory storage is not enabled yet |
|2 — Complete a trip | item ownership and snapshot/receipt boundary first; then rat, supplies NPCs, nesting/equip, corpse loot, trade/depot and a minimal atomic lethal outcome/temple respawn | buy→fight→loot→sell/store→reconnect; two players contest one stack and exactly one wins; lethal damage cannot leave an undefined or duplicated player |
|3 — Difficulty/recovery | cave rat/rotworm overlay, food/healing, normal progression, full selected death/skill penalties, corpse recovery and combat logout | isolated/paired fights, exhaustion, retreat, death and recovery behave as configured; restart/retry never duplicates rewards |
|4 — Art and desktop | replace route placeholders with reusable city kit, refine reference treatment, package Electron | same loop in browser and Windows/macOS client; movement/resize/input/reconnect and rendering verified |

High-value checks are the actual route, one full two-client loop, container-cycle/out-of-range rejection, competing loot, interrupted commits before/after acknowledgement, combat reconnect, corpse expiry over restart, and seeded/played balance scenarios. No blanket unit-test quota. Public hosting and store publication are separate from a locally runnable game.

## First implementation tasks

Use ordinary npm workspaces: `apps/client`, `apps/server`, `packages/game`, `tools/import-map`; data in `content/thais`, original assets in `assets`. Keep systems small and specific.

1. Pin compatible Node/dependencies and create root dev/build scripts. Planned `npm run dev` starts browser and local server; this command does not exist yet.
2. `tools/import-map/{otb,otbm,convert}.ts`: fetch/hash pinned map/catalog/XML, decode version0 correctly, emit cropped topology, source inventory and unresolved-semantics report.
3. `content/thais/{scope,links,semantics,encounters}.json`: resolve the real route, door pairs, depot, both grate/ladder links and visible floor groups. Keep authored changes separate from source.
4. `packages/game/{world,commands,movement}.ts`, `apps/server/TownRoom.ts`, `apps/client/{WorldView,InputController}.ts`: walk that route with one actor in two browser clients.
5. Add item/NPC/combat modules and SQLite snapshot/receipt store as increment2, then the remaining difficulty and art work. Keep one working build at each step.

Retain applicable upstream notices and a short source/modifications record; use original graphics/dialogue and avoid known leaked commercial-source lineages. No broad licensing audit is on the critical path.

## Planning evidence and open execution checks

Council records are in `docs/council`. Round 1 researched alternatives; round 2 cross-checked under the user's modern/gameplay correction; round 3 revised the plan; round 4 checked this single consolidated plan. Small final findings have been resolved above. Opus received only generic source/mechanics context; Sol and Terra received the full target/map/reference context. No review scores were requested or fabricated. See `docs/council/round-4/synthesis.md` for verdicts and resolutions.

Map import, route traversal, version compatibility, rendering, combat tuning, commit latency and desktop packages are execution checks still to perform. Research and binary inspection do not establish a runnable game. There is no calendar estimate for the full remake before the first executable map/interaction increment.
