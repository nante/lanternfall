# Sol 6.1 — round 2, modern revision

Configuration: xhigh reasoning, priority service. Read-only cross-check with no-C++ and gameplay/map priorities.

Choose **a focused TypeScript simulation + Three.js, with Colyseus for synchronization, SQLite for saves, and Electron for desktop**. The reuse worth taking is map data and small libraries. Neither inspected RPG engine supplies the requested interaction model without substantial replacement.

I read both proposals, the corrected brief and restart instructions, and inspected the reference image. **This was source/data inspection only:** no engines, downloaded code, builds, gameplay tests or benchmarks were run.

**Objections to round 1**

Both proposals preserve useful boundaries: one authoritative simulation, presentation separate from rules, atomic item transfers, explicit floors. But they postpone Thais behind an excessive clearance process, leave difficulty largely unspecified, and recommend custom gameplay without comparing existing TS systems. Sol leaves actors undecided; Terra leaves desktop rendering split across webviews. Resolve those decisions now. The first scene and gameplay loop must use Thais.

**What the engines actually save**

RPGJS’s current `v5` branch has genuine gameplay systems—not merely networking. Its inspected client manifest is 5.4.0. However, the client uses CanvasEngine/Pixi, and its action-battle defaults include combos, charged attacks, dodge invulnerability and knockback. Its server is separately packaged; replacing the renderer is possible, but requires replacing scene/UI/visual integration rather than changing one renderer setting. [Client dependencies](https://github.com/RSamaium/RPG-JS/blob/v5/packages/client/package.json), [client integration](https://github.com/RSamaium/RPG-JS/blob/v5/packages/client/src/RpgClientEngine.ts), [battle system](https://github.com/RSamaium/RPG-JS/blob/v5/docs/guide/battle-ai.md).

| Required mechanics | RPGJS v5 | Kaetram | Decision |
|---|---|---|---|
| Tile movement; use/inspect | Tile-route helpers, collision, event/item hooks | Grid movement, collision, object interaction | Useful foundations; custom timed occupancy and ordered tile stacks still needed |
| Nested containers | Inventory merges matching item IDs | Fixed slot containers; serialized items contain no child containers | Implement instance ownership and nesting |
| NPC chat/trade | Dialogue/shop APIs, buy/sell | Dialogue arrays and stocked stores | Supplies commerce scaffolding; keyword conversation remains custom |
| Target combat; aggro/retreat | Damage/skills and substantial action AI | Target combat, aggression, pursuit and return behavior | Kaetram is closer; neither supplies the requested rules unchanged |
| Resources/progression | HP/SP, consumables, classes/XP | HP/mana, consumables, skills/XP | Existing systems, different balance and progression assumptions |
| Death/save | Death hooks and configurable snapshot storage | Death/respawn and MongoDB-backed players | Corpse ownership, penalties and atomic recovery still need implementation |

Evidence: RPGJS [movement](https://github.com/RSamaium/RPG-JS/blob/v5/packages/server/src/Player/MoveManager.ts), [inventory](https://github.com/RSamaium/RPG-JS/blob/v5/packages/server/src/Player/ItemManager.ts), [saving](https://github.com/RSamaium/RPG-JS/blob/v5/docs/guide/save-load.md); Kaetram [item shape](https://github.com/Kaetram/Kaetram-Open/blob/develop/packages/common/types/item.d.ts), [combat](https://github.com/Kaetram/Kaetram-Open/blob/develop/packages/server/src/game/entity/character/combat/combat.ts), [stores](https://github.com/Kaetram/Kaetram-Open/blob/develop/packages/server/src/controllers/stores.ts), [player](https://github.com/Kaetram/Kaetram-Open/blob/develop/packages/server/src/game/entity/character/player/player.ts).

Kaetram also needs world-model surgery: its map indexes `(x,y)` with plateau metadata, while its renderer uses multiple canvases and sprite layers. This does not supply overlapping Tibia floors. Its aggression implementation suppresses ordinary aggression when player level exceeds three times monster level—an explicit mismatch with persistent old-school danger. [Map](https://github.com/Kaetram/Kaetram-Open/blob/develop/packages/server/src/game/map/map.ts), [renderer](https://github.com/Kaetram/Kaetram-Open/blob/develop/packages/client/src/renderer/renderer.ts), [aggression](https://github.com/Kaetram/Kaetram-Open/blob/develop/packages/server/src/game/entity/character/mob/mob.ts).

My judgment: adopting either whole engine would save generic RPG features while forcing replacement of central world, inventory and presentation assumptions. Build the bounded domain directly. Colyseus saves room lifecycle and state synchronization; **it supplies none of these gameplay rules**. [Colyseus state model](https://docs.colyseus.io/state).

**Concrete Thais route**

Use Bradley Workman’s reconstruction, pinned at `783c717`, as the initial **7.1-layout baseline**, explicitly not exact 7.6. I inspected its binary with a small original, in-memory reader:

- `Tibia71.otbm`: 48,421,761 bytes; OTBM version 0; declared dimensions 65,000²; item version 1/1.
- Town 2: **Thais temple `(32369,32241,7)`**.
- Actual world tiles span floors 0–15. Start with bounds **x=32250–32420, y=32090–32310**, retaining upper floors 0–6, surface 7, and selected connected sewer areas on 8. Raw tile presence does not establish walkability.
- Spawn XML places Sam at `(32360,32199,7)`, Frodo at `(32356,32209,7)`, Quentin at `(32369,32239,7)`, and rats around `(32338,32189,8)`. These provide concrete anchors; ladder connectivity still needs verification. [Map and XML files](https://github.com/bradleyworkman/Tibia-7.1-map/tree/783c717ccf50987d18f9c06763c2c427c83d7345).

Translate OTBM area origins plus tile offsets into absolute coordinates. Preserve ground, ordered item children, nested contents, flags, action/unique IDs and destinations. Start from the dependency-free TypeScript [OTBM reader](https://github.com/V0RT4C/ot-otbm), but validate version-0 subtype handling; its documented count/fluid ambiguity requires item metadata. I inspected RME’s [`data/740/items.otb`](https://github.com/hampusborgos/rme/tree/master/data/740): its version is 1/1/1, matching the map’s major/minor; catalog entries identify ground 407, framework walls 1036/1037 and ladder 1386. Map these source IDs to new semantic definitions and original meshes. Matching versions alone do not prove every item works.

Gaps are explicit: the reconstruction removed mailboxes, quest/level doors, bridges and later buildings, changed elevations and protection zones, and acknowledges uncertain vegetation. Its 7.4-named spawn/house metadata also needs checking against the edited layout. Restore only slice-relevant 7.6 differences initially; author NPC behavior and transition rules. [Reconstruction change list](https://github.com/bradleyworkman/Tibia-7.1-map/blob/main/readme.md).

Other candidates: TibiaMaps contains floor PNGs, pathfinding images and markers, useful for orientation but lacking item stacks and interactions. Brunowots contains an actual 94 MB `global.otbm`; its inspected header is version 1/item version 2/7, and its README identifies an altered 8.0 world with custom Thais commerce. Neither is a better historical baseline. [TibiaMaps format](https://github.com/tibiamaps/tibia-map-data), [8.0 candidate](https://github.com/Brunowots/RealMap-Global-8.0-TFS1.2).

Keep source handling practical: retain applicable notices—RPGJS and the selected parser/map repository carry MIT notices; Kaetram uses MPL-2.0—and record imported data and modifications. Avoid acknowledged commercial-source leaks. Repository notices do not establish ownership of every underlying asset; use original graphics and dialogue. This requires a concise source record, not an extended licensing project.

**First playable and visual pipeline**

Temple → inspect/open/equip → keyword conversation and supplies → sewer rats near Sam’s neighborhood → target, fight, retreat, heal → open corpse → bag-within-backpack transfers → sell/store → reconnect.

Bound content to one knight, rat/cave-rat/rotworm, roughly twelve portable item types, and four NPC roles: Quentin, Sam, Frodo and a supplies merchant. Keep one sewer circuit and one harder encounter pocket; exclude PvP, housing, boats, crafting and full quests.

Choose **rigged low-poly 3D actors with hand-painted pixel textures**, glTF export, and idle/walk/attack/death clips. Test the first actor on the imported temple street. Fixed elevated orthographic rendering, coherent texture density, warm directional shadows, cool shade and roof cutaways address the reference; pixelated cubes do not. Use Electron with isolated, sandboxed rendering and Node integration disabled. [Electron guidance](https://www.electronjs.org/docs/latest/tutorial/security).

**Difficulty: starting assumptions, not researched 7.6 formulas**

- Knight level 8: 185 HP/35 mana, sword/shield skills 20; weapon attack 10, shield defense 8, armor 4.
- Cardinal steps 400 ms; diagonals 1,200 ms; occupied tiles block; melee cadence 2 seconds.
- Player damage rolls 0–`attack + floor(skill/5)` before armor. Armor absorbs 0–armor; shield absorbs 0–`floor(defense×skill/40)`, against at most two attackers per cycle.
- Rat/cave-rat/rotworm: HP 20/30/65; raw attacks 0–8/14/28; XP 5/10/40. No level scaling.
- Aggro within seven tiles, same floor; blocked pursuit respects topology. Retreating or changing floors does not refill enemies.
- Food grants slow regeneration; healing spends finite mana or carried fluids. Initially: heal 30 HP/20 mana; fluid 40 HP/30 gold.
- Death drops backpack/currency and removes 5% accumulated XP; respawn at temple. Progression and skill gains persist.

Playtest acceptance: one rat teaches targeting; a solo rotworm consumes meaningful health; two punish commitment; low-health retreat succeeds with positioning; exhausted supplies force returning; corpse recovery carries risk.

Implement in order: **map import/catalog → timed movement/transitions → item ownership/containers → combat/NPC loop → transactional saves**. Require verified temple–shop–sewer connectivity, correct roof/picking behavior, container-cycle rejection, one winner for simultaneous loot, and reconnect/restart without duplication. These are pending acceptance checks, not demonstrated results.
