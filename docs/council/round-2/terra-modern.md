# Terra 6.1 — round 2, modern revision

Configuration: max reasoning, priority service. Read-only cross-check with no-C++ and gameplay/map priorities.

## Cross-check and recommendation

Choose **a small custom TypeScript game simulation, Three.js, and Colyseus**. Colyseus supplies rooms and authoritative state synchronization; it does **not** supply the requested combat, inventory, NPCs or difficulty. Keep gameplay independent of the renderer, run it on the server, and persist character and item changes in SQLite initially. [Colyseus documentation](https://docs.colyseus.io/)

This is a judgment about the *small requested slice*, not a claim that custom code is generally cheaper:

- **RPGJS v5 is substantial reuse.** Its [item manager](https://github.com/RSamaium/RPG-JS/blob/v5/packages/server/src/Player/ItemManager.ts) implements inventory, equipment and transactions; its [battle AI](https://github.com/RSamaium/RPG-JS/blob/v5/packages/action-battle/src/ai.server.ts) has pursuit, defeat rewards and world drops. But its inventory is organized around item quantities, its combat is action/hitbox oriented, and its [movement](https://github.com/RSamaium/RPG-JS/blob/v5/packages/common/src/movement/MovementManager.ts) uses its physics engine. The [client engine](https://github.com/RSamaium/RPG-JS/blob/v5/packages/client/src/RpgClientEngine.ts) is coupled to CanvasEngine and Pixi. Nested movable containers, corpse looting, discrete floor-aware tiles and a Three.js client would still need substantial adaptation. This assessment is from the current v5 source, not older RPGJS documentation.
- **Kaetram is a real game implementation**, with [combat](https://github.com/Kaetram/Kaetram-Open/blob/develop/packages/server/src/game/entity/character/combat/combat.ts), [mob aggression and drops](https://github.com/Kaetram/Kaetram-Open/blob/develop/packages/server/src/game/entity/character/mob/mob.ts), [slot containers](https://github.com/Kaetram/Kaetram-Open/blob/develop/packages/server/src/game/entity/character/player/containers/container.ts), [NPC dialogue](https://github.com/Kaetram/Kaetram-Open/blob/develop/packages/server/src/game/entity/npc/npc.ts), and movement handlers. Its server also assumes its own [two-dimensional map and world model](https://github.com/Kaetram/Kaetram-Open/blob/develop/packages/server/src/game/map/map.ts), data and packets. Its repository says the open version has not been updated for years. It is valuable reference code, but extracting it does not obviously save the required floor, container and rule work. [Repository](https://github.com/Kaetram/Kaetram-Open)
- Reconsider RPGJS only if the first spike shows that its server can accommodate those interactions with less code than the custom simulation. Neither route has been benchmarked or built here.

Both round-one reports correctly separated gameplay from native protocol compatibility. Their generic-fixture and broad map-clearance gates conflict with the corrected request: **Thais and its connected encounter area belong in the first slice.**

## Thais baseline

Use the community [Tibia71.otbm](https://github.com/bradleyworkman/Tibia-7.1-map/blob/main/Tibia71.otbm), plus its [spawn](https://github.com/bradleyworkman/Tibia-7.1-map/blob/main/Tibia74-spawns.xml) and [house](https://github.com/bradleyworkman/Tibia-7.1-map/blob/main/Tibia74-houses.xml) XML, as the initial import candidate. The author describes it as a **7.1 reconstruction made from a 7.4 map**, still in 7.4 OTBM format, with deliberate removals and acknowledged inaccuracies. It is not a 7.6 map. The spawn file places Quentin at `(32369, 32239, 7)` and a rat group around `(32368, 32216, 8)`; the actual walkable route and entrance still need verification from the OTBM. [Map notes](https://github.com/bradleyworkman/Tibia-7.1-map)

Use the TypeScript [OTBM reader](https://github.com/V0RT4C/ot-otbm) to parse the map into a project-owned JSON schema: coordinates, floor, ordered tile items, attributes and house metadata. Import the XML separately. The reader says it supports OTBM versions through 3, but some stack/fluid attributes require corresponding OTB item definitions; verify the candidate’s compatibility and do not silently turn unknown IDs into walkable ground. Supply or author an ID-to-blocking/interaction/visual mapping, stair links, roof groups, NPC dialogue, item definitions and monster behavior.

The deliverable is **the city inside its gates and harbor**, including recognizable streets, temple, depot, merchant and visible buildings, plus the **depot-area sewer grate and one connected rat-filled sewer section**. Bound other exits; open the temple, depot, merchant and selected interiors initially, with other doors visibly closed. Confirm the grate-to-rat connection during import rather than assuming it from coordinates.

Use [historical 7.5 and 7.7 floor images](https://github.com/tibiamaps/tibia-historical-map-data) for comparison, including the 7.7 folder as requested. The repository states that its 7.7 images were generated from leaked official files; record that origin. These images and the [current minimap/pathfinding data](https://github.com/tibiamaps/tibia-map-data) are reference layers, not playable maps: they do not supply tile stacks, complete interiors, interactions or spawn definitions. The exact 7.6 differences remain unverified. Retain applicable notices for reused code and data.

Represent each tile as `(x, y, floor)`. Stairs and grates have explicit source/destination links; collision, projectile blocking and visibility are separate. Hide a building’s connected roof when its interior is entered, restore it on exit, and prevent picking hidden floors. Underground view exposes the active floor and its intended openings, not the entire surface above.

## Behavior and difficulty acceptance

All numbers below are **provisional, 7.6-inspired tuning**, not historical formulas.

| Area | Initial rule and observable check |
|---|---|
| Start | Level 8 knight, 100 HP, sword and shield skill 10, basic sword/shield/armor, backpack, 30 gold, two food and one healing potion. Temple → merchant → sewer is navigable. |
| Movement and threat | Player moves one tile per 0.35 s; rat follows at 0.6 s/tile, detects within four tiles and returns after eight tiles from spawn. Occupied tiles block movement; a retreat through the grate works. Validate the 8-tile leash against the imported route. |
| Combat | Targeted adjacent attacks every 2 s; starter sword deals **0–7 after mitigation**. Rats have 20 HP and deal 0–4; a spider has 22 HP and deals 0–5. A single rat is manageable; standing against three can kill an unprepared player. No level scaling. |
| Resources | Food provides 1 HP every 4 s for 40 s and cannot stack durations; a 25-gold potion restores 20 HP with a 10 s cooldown. No free passive healing outside food. Ten-rat expeditions should make spending visible, not yield unlimited emergency healing. |
| Loot and progression | Rat: 5 XP and 1–4 gold, with food occasionally; spider: 8 XP and a sellable drop. First level requires 100 XP; 40 landed sword hits raise sword skill by one. Merchant keyword chat supports buying food/potions and selling the drop. |
| Containers and death | Open corpses, transfer stacks into a backpack nested inside another container, equip, sell and store. On death, lose 10% of progress toward the next level and leave the backpack and carried gold in a recoverable corpse for 15 minutes; retain worn starter equipment and respawn at the temple. This avoids a permanent soft lock while making recovery consequential. |
| Authority | Two clients see the same fight; invalid movement, remote item use and duplicate loot claims fail. Restart/reconnect preserves committed inventory, XP and death state. |

Playtest several fresh runs: isolate one rat, intentionally pull three, retreat at low health, exhaust food, die and recover the corpse. Record HP lost, trip profit, deaths and time to level; adjust the provisional values before adding content. Exclude PvP, other vocations, full quests and the wider world from this slice.

## Visual default and spike

Choose **Electron** for the later desktop wrapper and **stylized animated 3D actors** as the initial actor pipeline. The inspected reference calls for a steep elevated view, textured ground, deep occlusion, layered foliage and warm directional light—not merely pixelated cubes.

The smallest validation spike is one imported Thais street/merchant frontage, the actual sewer connection, one stair or grate, one rat and one corpse, viewed in two browser clients. Verify tile blocking, roof/floor visibility, attack/retreat, nested loot ownership and reconnect; inspect the moving actor’s silhouette and pixel stability against the reference. If map parsing or RPGJS adaptation fails, record the precise gap before expanding.

No edits, installs, builds, downloaded-code execution or deployment were performed.
