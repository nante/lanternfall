# Sol 6.1 — round 3

Configuration: xhigh reasoning, priority service. Revised playable Thais implementation plan.

Select the existing TypeScript/Three.js/Colyseus/SQLite direction and build **one complete Thais expedition**. Networking belongs in the first playable, but the milestones are walking, buying supplies, hunting, looting and returning.

**Map import and bounded content**

Pin the map to `783c717ccf50987d18f9c06763c2c427c83d7345`. Its author describes a 7.1 reconstruction stored in 7.4 OTBM format; it is a starting topology, not exact 7.6. [Source notes](https://github.com/bradleyworkman/Tibia-7.1-map/blob/783c717ccf50987d18f9c06763c2c427c83d7345/readme.md)

Keep x **32250–32420**, y **32090–32310**: a 171×221 surface rectangle. Retain floors 0–6 for buildings and occlusion, surface 7, and the selected connected sewer component on 8. Cap routes crossing the boundary. Initially open five interiors: temple, Sam, Frodo, Xodet and ground-floor depot. Other buildings remain recognizable exterior scenery with closed entrances.

My read-only binary inspection found:

- OTBM version 0, item version 1/1; all source IDs in this crop occur in RME’s 740 catalog.
- Temple `(32369,32241,7)` reaches Sam’s neighborhood directly. Frodo becomes reachable when ordinary doors can open; treating closed doors as permanent walls disconnects him.
- Depot locker `(32341,32225,7)` has depot ID 2; its southern adjacent tile is reachable.
- Grate `(32370,32213,7)`, source ID **430**, sits over ladder **1386**. Rat spawn `(32368,32216,8)` is five cardinal steps underground.
- A conditional cardinal flood-fill finds a **926-cell sewer component**, including the northern grate `(32339,32183,7)`. It does **not** reach the source’s northern rotworm pocket.

These are data/topology findings, not observed gameplay.

Load `items.otb` **before decoding items**. Pin RME’s catalog revision `8dbc487ef27983ec566456541858dfdca05c5328`. Implement version-0 subtype consumption immediately after each item ID, including compact tile items: count for stackables, fluid subtype for fluid/splash groups. Do not trust the candidate parser’s ambiguous-attribute fallback. RME’s reader explicitly handles this older encoding. [Reader implementation](https://github.com/hampusborgos/rme/blob/master/source/iomap_otbm.cpp)

Import server ID, client ID, group, flags, ground speed, capacity and available attributes. Preserve ordered stacks, nested items, house/depot IDs, action/unique IDs and destinations. Catalog flags distinguish movement, projectile and pathfinding blocking; they do not implement interactions. [Catalog definitions](https://github.com/hampusborgos/rme/blob/master/source/items.h)

Use explicit mappings such as:

- `407 → floor.blackMarble → original texture`
- `1036/1037 → structural wall → original wall geometry`
- `430 → usable sewer grate → authored transition`
- `1386 → ladder → explicit return destination`
- `2589/2591 + depotId → personal depot access`

Keep source IDs as provenance, separate from runtime item-instance IDs. Author door pairs, transition destinations and portable-item statistics in overrides. Missing art may use conspicuous placeholders; unresolved behavior must block affected routes rather than silently opening walls. Retain applicable source notices.

**The first expedition and interface**

Bound content to **one knight, three creature definitions, ten concurrent monsters, four NPCs, twelve portable item types, one personal depot and two sewer entrances**.

NPCs: Quentin for temple conversation, Sam for equipment/bags, Frodo for food, Xodet for fluids. Use original dialogue. Portable types: two swords, shield, armor, helmet, boots, backpack, pouch, gold, food, life fluid and sellable trophy. Backpack has 20 slots, pouch eight; stacks cap at 100 and carried capacity starts at 300 weight units.

The circuit is:

**Temple → supplies → depot → grate `(32370,32213)` → rat encounter → optional northern hunt → exit `(32339,32183)` → sell/store.**

Place six rats near the entry route, two cave rats in an optional branch, and two individually approachable rotworms on source rat tiles around `(32351,32189,8)` and `(32338,32189,8)`. The rotworms are **authored encounter placements**, not imported historical spawns. Ordinary trips kill four rats and optionally one isolated rotworm; intentionally collecting both rotworms creates the danger scenario.

Controls and feedback:

- Arrow keys/numpad issue timed steps; clicking walkable ground queues a visible route. New manual input cancels it.
- Right-click opens Look/Use/Open/Attack actions. Clicking a creature selects it; Attack explicitly starts targeting. Escape cancels targeting/walking.
- Enter focuses chat and suppresses movement shortcuts. NPC `hi`, `trade`, `buy`, `sell`, `yes` interactions expose prices before confirmation.
- Containers open as stable panels with parent navigation. Dragging moves items; Shift-drag requests a quantity. Equipment slots show valid destinations.
- Moving out of reach closes corpse/depot access. Failed transfers leave the item in its original slot and explain why.
- Picking uses the displayed logical floor. Roof cutaways never expose selectable hidden-floor objects.
- Show HP, mana, food time, capacity, target, combat lock and server-confirmed action failures. Opening UI never pauses combat.

Use original textured geometry and rigged actors, an elevated orthographic camera, stable low-resolution world rendering, warm directional light/cool shade and roof cutaways. Render interface text separately. Avoid ornamental motion on inventory operations; ownership confirmation must remain immediate and legible.

**Difficulty: explicit provisional rules**

Use level **8**, **185 HP/35 mana**, sword/shield skills **20**, attack **10**, shield defense **8**, total armor **4**, 60 gold, two food and one fluid.

The researched templates are limited: contemporary OpenTibia definitions give rat **20 HP/5 XP** and rotworm **65 HP/40 XP**. These support reference values, not historical combat fidelity. [Rat](https://github.com/otland/forgottenserver/blob/v1.6/data/monster/monsters/rat.xml), [rotworm](https://github.com/otland/forgottenserver/blob/v1.6/data/monster/monsters/rotworm.xml)

Everything below is provisional tuning:

- Cardinal movement: 400 ms on ground speed 100, multiplied by catalog ground cost; diagonal steps cost three cardinal steps. Occupied tiles and corner cutting block movement.
- Adjacent melee attacks every two seconds. Player raw damage is uniform integer `0…attack+floor(sword/5)`. Subtract uniform enemy armor absorption.
- Rat/cave-rat/rotworm armor maxima: **1/2/4**; raw attacks: **0–8/0–14/0–20**. Cave rats have 30 HP/10 XP.
- Player armor absorbs `0…4`; shield absorbs `0…floor(defense×shieldSkill/40)`, against at most two attackers per cycle.
- Aggro requires same-floor sight within seven tiles. Monsters pursue through valid topology, cannot use ladders, and do not heal when the player retreats. Start movement at 600 ms/tile; respawn after 60 seconds only without nearby players.
- Food costs 2 gold and adds 120 fed seconds, capped at 20 minutes. While fed: 1 HP and 1 mana per six seconds. Heal restores 30 HP for 20 mana; life fluid restores 40 HP for 20 gold. Both use a two-second healing cooldown.
- Rat gold is uniform 1–3; cave-rat gold 2–6; rotworm gold 6–14 plus a 20% trophy chance, sold for 10 gold.

Analytically, including misses and overkill, expected kill times are approximately **7.4/11.2/26.1 seconds**; expected incoming damage is **4.9/21.2/85.8 HP**. Rats are instructional. Two simultaneously tanked rotworms cost roughly **258 HP** before both die: isolation, retreat and supplies matter.

A three-minute four-rat/one-rotworm budget yields about **20 gold** and **106 damage**. Sustained fed regeneration plus mana healing covers approximately 75 HP; remaining fluid consumption costs about 15 gold, with three gold of food. That is roughly break-even. Repeated face-tanking should lose money; safe rat trips finance mistakes.

Keep the cubic XP template `100×(L³−6L²+17L−12)/6`: level 8→9 requires **2,200 XP**, equivalent to 440 rats or 55 rotworms. [Formula reference](https://github.com/otland/forgottenserver/blob/v1.6/src/player.h) Sword advancement requires `ceil(200×1.1^(skill−20))` qualifying hits; shielding uses the same curve with at most two eligible defensive events per cycle. Reject 100-XP levels and flat 40-hit skills. Debug acceleration must be a separate configuration.

Death removes 5% accumulated XP and skill-training totals, permits level loss, and leaves backpack/carried gold in a 15-minute corpse. Retain worn combat equipment so recovery remains possible. Disconnecting leaves the character vulnerable for a 60-second combat lock.

**Authority, implementation order and observable exits**

Use one server simulation and one SQLite writer. At each 100-ms tick, derive the next dynamic state, commit it transactionally with revision and command-sequence results, then publish it through Colyseus. Persist players, item ownership, monsters, corpses and timers together. Static terrain stays outside the snapshot. On commit uncertainty, stop and reload; never continue from an unconfirmed live mutation. Duplicate commands return their committed result.

Implement sequentially:

1. `tools/import-map/{otb,otbm,convert}.ts`, `content/thais/{scope,source-map,links}.json`, client `WorldView.ts`, server `TownRoom.ts`: render and walk the actual circuit. Exit: manually traverse both grates, open Frodo’s door and access the depot; verify collisions, roofs and picking.
2. `packages/game/{commands,items,npc,combat}.ts`, client `InteractionController.ts`/container panels: complete supply→rat→nested-loot→trade. Exit: two clients contest one corpse item; exactly one succeeds.
3. `rules.ts`, `progression.ts`, `death.ts`, server `store.ts`: add the harder hunt and durable consequences. Exit: observe isolated/paired rotworms, exhaustion, death/recovery, restart, retry and disconnect without duplicated rewards or restored consumed supplies.
4. Replace route placeholders with original art and verify moving silhouettes, shadows and cutaways. Electron follows the stable browser loop.

Final-phase decisions: ratify the authored rotworm placements; choose whether corpse expiry continues during server shutdown—I recommend wall-clock expiry.

**No edits, installs, builds or gameplay tests were run.**
