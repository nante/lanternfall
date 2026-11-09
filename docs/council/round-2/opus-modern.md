# Opus 5.5 — round 2, modern revision

Configuration: medium effort. Scoped read-only modern gameplay-source research; no map identity or game-recreation context supplied.

# Research brief: reusable TS/JS code for old-school tile-RPG mechanics (round 2)

**Bottom line:** none of the three candidates can be lifted whole for these mechanics. The plan I recommend is our own small TypeScript domain layer: grid-based, independent of any renderer, and deterministic. Kaetram-Open and Inconcessus's 7.4 engine serve as design references, and only MIT-licensed RPGJS pieces get copied, after review. I read source trees and selected files through the GitHub API only. Nothing was installed, built or run, so none of the behaviour below has been tested.

## Source and module table

| Project | License / activity | Mechanics modules actually in source | Coupling |
|---|---|---|---|
| **RPGJS v5** ([RSamaium/RPG-JS@v5](https://github.com/RSamaium/RPG-JS/tree/v5)) | MIT, pushed 2026-11-03 | `packages/server/src/Player/` mixins: `ItemManager` (add/buy/sell/use/equip, hooks), `BattleManager` (formulas you can swap: `damagePhysic`/`damageSkill`/`damageCritical`/`damageGuard`/elements), `ParameterManager`, `ClassManager`, `SkillManager`, `StateManager`, `GoldManager`, `MoveManager`. `Gui/ShopGui.ts`, `SaveLoadGui`, `storage/localStorage.ts`, `Player/snapshot.ts`. `packages/action-battle/src/ai.server.ts` (about 3.6k lines: vision range, flee threshold, behaviour tree) | Movement is pixel/collider physics (`packages/physic`: AABB, sweeps, quadtree); `Move.tileX` is a helper on top of that, not the base model. Inventory is a flat list: no matches for container/weight/capacity/slot in `ItemManager`. Server depends on `@signe/room` / `@signe/sync` (its own sync, not Colyseus) and `@canvasengine/tiled`. Client is CanvasEngine `.ce` components on Pixi |
| **Kaetram-Open** ([Kaetram/Kaetram-Open@develop](https://github.com/Kaetram/Kaetram-Open/tree/develop)) | MPL-2.0. This is the original repo, not a fork; it extends BrowserQuest. Last code commit 2024-01-14, README only in 2026 | `server/src/game/entity/character/`: `combat/combat.ts`+`hit.ts`, `mob/mob.ts` (`aggroRange`, `roamDistance`, level-based aggro check, drop tables), `player/containers/{container,slot}.ts` with `impl/{inventory,bank}`, `equipment/*` (11 slots), `skills/*` (combat plus gathering/crafting), `points/{hitpoints,mana}`, `trade.ts`; `controllers/stores.ts` (NPC shops); `objects/{lootbag,chest,resource}`; `info/formulas.ts`; `common/database/mongodb/*` | Integer tile grid. Entities import `Opcodes` and packet classes and push network packets straight from game logic (e.g. `stores.ts`, `mob.ts`). Saving is MongoDB-specific. Pathfinding (A*) is on the client (`client/src/utils/pathfinder.ts`). Content comes from JSON files in `data/` |
| **Tibia74-JS-Engine ("Forby")** ([Inconcessus/Tibia74-JS-Engine](https://github.com/Inconcessus/Tibia74-JS-Engine)) | **No license file** (the GitHub license API returns 404), so it is all rights reserved by default. Pushed 2026-04 | The closest match to OpenTibia-style mechanics: `container-manager`, `base-container`, `depot`, `corpse`, `monster-behaviour`, `monster-loot-handler`, `damage-map`, `target-handler`, `world-combat-handler`, `player-combat-lock`, `npc-{conversation,trade,focus,talk-state}-handler`, `pathfinder`, `condition-manager`, `player-skills`, `item-stack`, `fluidcontainer`; data-driven `data/740/{spells,runes,conditions,actions}`; sqlite | Plain JS with a custom `ws` protocol, and OTBM/7.4 data formats run through it. **Read it to learn the patterns; do not copy any code.** |
| **Colyseus** ([colyseus/colyseus](https://github.com/colyseus/colyseus)) | MIT, active | `packages/`: core, schema/serializer, transport, presence, auth, database, room-plugins, testing | Confirms the claim: it handles rooms and state sync. No RPG mechanics modules |
| Other OpenTibia TS repos | — | [Mkalo/typescript-otserver](https://github.com/Mkalo/typescript-otserver) (MIT, last push 2017, 3 stars). Other search hits were editors, AACs, bots and C++/Lua servers | Nothing worth considering |

## The round-1 claims

1. **"TS+Three.js is the best browser-first stack."** Plausible but unproven. No candidate uses Three.js: RPGJS uses Pixi through CanvasEngine, and Kaetram and Forby use Canvas 2D. Three.js makes sense if we want a 2.5D/3D camera. For a pure top-down 2D tile view, PixiJS is the more direct choice. Either way the renderer gets written fresh.
2. **"A small independent simulation may be less work than extracting an engine."** Supported by the source. RPGJS mechanics are mixins on `RpgPlayer` that sit on its signal sync and physics. Kaetram's logic sends packets inline. Pulling a module out of either means rewriting how it talks to the rest of the system, and at that point most of the reuse value is gone.
3. **"Colyseus syncs state but has no RPG mechanics."** Confirmed. RPGJS doesn't use Colyseus anyway, so the two don't fit together.

## What can be reused

- **RPGJS (MIT; can copy with attribution):** the swappable damage-formula interface in `BattleManager`, the item hook shape (`ItemHooks`), the snapshot/serialize pattern, and the `ShopGui` buy/sell flow. Its AI vision/flee/behaviour-tree structure could be adapted, but it assumes continuous movement. Unsuitable: physics, `MoveManager`, and anything in the client.
- **Kaetram (MPL-2.0; copying is allowed, but each copied file stays MPL and its modified source must be shared):** the shape of `container.ts`/`slot.ts`, the equipment-slot split, mob aggro/roam parameters, the drop-table data format, and `stores.ts` stock/restock logic. Data/art assets have their own licenses; check them before using any.
- **Forby:** use it only as a checklist of mechanics we need to own: nested containers, depot, corpse decay, damage map for kill credit, target and combat lock, NPC focus/talk states.
- **Missing everywhere in reusable form:** nested containers with weight/capacity, a corpse as a container, the loot-ownership window, death penalties (losing xp/skills/items), soul/food/regeneration ticks, step speed tied to tile ground, rules for pushing and stacking on tiles.

## Recommendation

Build our own focused domain package (`sim/`) in TypeScript with no DOM, network or renderer imports. It runs on a fixed tick, exposes the world as a grid of tiles holding stacks of things, and accepts **commands** (move/use/attack/moveItem/talk) that emit **events**. Copy small MIT pieces from RPGJS where they fit. Use Kaetram and Forby only as design references. Put a thin transport on top later: Colyseus, or plain `ws` plus our own deltas.

## Biggest hidden coupling

**How movement and space are modelled.** RPGJS is built on pixel physics with colliders. Old-school mechanics need integer tiles where each step is timed, and everything depends on that: aggro, pathing, melee adjacency, items on the ground, corpses, stack order, line of sight. Close behind it: Kaetram's game logic emits network packets directly, so any extracted module brings the protocol with it.

## Implementation sequence

1. **Core model:** `Position`, `Tile` (ground plus a stack of things), `Thing`/`Item`/`Creature` ids, seeded RNG, fixed tick, and the command → event loop. Add golden-replay tests from the start.
2. **Movement:** step timing derived from speed and ground cost, diagonal steps, blocking/pushing, server-side A* pathing, a walk queue.
3. **Items and containers:** stackables, nested containers with capacity/weight, moving items between ground, container and equipment, then a depot.
4. **Combat:** target lock, melee/distance range checks, swappable formula interface (RPGJS-style), conditions, damage map.
5. **Monster AI:** state machine (idle → aggro → chase/attack → flee → leash/return), aggro radius plus line of sight, target switching.
6. **Death and loot:** corpse container, loot tables, ownership window, decay timers, player death penalty and respawn.
7. **NPCs:** keyword dialogue state, focus handling, a trade window over the container/currency model.
8. **Progression and resources:** xp curve, skills trained by use, hp/mana regeneration, food.
9. **Persistence:** a versioned save schema for characters and depots (SQLite or IndexedDB adapter).
10. **Renderer:** Pixi or Three.js that subscribes to events and does no game logic. A custom renderer costs about the same in every option, since every candidate's client is welded to its own stack.
11. **Transport:** add networking last.

## Behaviours we must define and tune ourselves

The values below are our own design numbers. I am not claiming any of them matches historical formulas.

- Step duration vs speed and ground; diagonal penalty; how input queuing works.
- Hit/miss/block/armour formulas; attack speed; how distance attacks fall off with range.
- Aggro radius, line-of-sight rules, target switching, chase vs flee thresholds, leash distance.
- Loot table odds, corpse decay times, length of the loot-ownership window.
- Death penalty (xp/skill loss %, chance to drop items, whether containers drop); respawn point.
- XP curve, skill-gain rate per action, regeneration and food ticks.
- Capacity/weight values, stack limits, NPC buy/sell prices and restocking.
- Spawn rates and respawn timers per monster.
- Save timing (periodic vs on-event) and handling of disconnects mid-combat.
