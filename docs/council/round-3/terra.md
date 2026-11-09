# Terra 6.1 — round 3

Configuration: max reasoning, priority service. Revised gameplay, Thais and difficulty plan.

## Selected plan

Build one small, server-authoritative TypeScript game domain, presented in Three.js/WebGL2 and synchronized through Colyseus. SQLite owns durable world state; Electron packages the same client later. Colyseus supplies rooms and synchronization, not combat, inventory, NPCs or progression.

The first product is a **playable Thais trip**: temple → Sam’s shop → depot → a verified sewer entrance and rat area → fight or retreat → loot → sell or store → reconnect. The initial city footprint includes recognizable streets, gates, harbor and selected interiors; inaccessible exits and unopened buildings are visibly closed. One connected sewer section and one harder pocket are in scope. Housing, quests, PvP, boats, crafting, other vocations and the wider world are out.

### Map and art

Use [Tibia71.otbm at `783c717`](https://github.com/bradleyworkman/Tibia-7.1-map/tree/783c717ccf50987d18f9c06763c2c427c83d7345), its spawn and house XML, and the RME 740 item catalog as the import candidate. This is a **7.1 reconstruction in a 7.4-era format, not a 7.6 map**; its author describes deliberate removals and uncertain reconstruction. RME distinguishes its 7.40 and 7.60 catalog versions, so matching header fields alone do not establish matching semantics. [Map notes](https://github.com/bradleyworkman/Tibia-7.1-map), [RME client mappings](https://github.com/hampusborgos/rme/blob/master/data/clients.xml).

- Start with the proposed crop `x=32250–32420, y=32090–32310`, surface 7, relevant upper floors and connected underground tiles. Verify the actual city boundary before fixing the crop. Round 2 identified temple `(32369,32241,7)`, Sam `(32360,32199,7)`, and a candidate rat group `(32368,32216,8)`. These are anchors, **not a verified route**.
- Use a TypeScript importer based on [ot-otbm](https://github.com/V0RT4C/ot-otbm); verify OTBM version 0 and catalog major/minor `1/1`, pin and hash inputs, and cross-check representative decoded tiles. Preserve absolute coordinates, floors, ground, ordered item stacks, nested contents, flags, house IDs, action/unique IDs and destinations.
- Join **source server item IDs** to project-owned semantic IDs; retain client IDs only as provenance, not as runtime art. Decode catalog groups and flags for collision, missile blocking, movement, pickup, stackability and floor changes; read ground speed and subtype data where present. The parser explicitly warns that stack counts and fluid types require catalog context. [Parser limitations](https://github.com/V0RT4C/ot-otbm), [RME item loading](https://github.com/hampusborgos/rme/blob/master/source/items.cpp).
- Classify every item on the active route and reachable adjoining tiles. Unknown art gets a labeled placeholder; unknown behavior blocks the tile and fails route acceptance until resolved. Catalog flags are evidence, not a substitute for authored doors, containers and transition rules.
- Build a floor-aware route graph, locate the depot and a real grate/ladder connection, and verify both directions in game. Record coordinates and compare the temple, shop, depot and entrance with available period references. Patch only slice-relevant era gaps in a versioned overlay with reasons and confidence; do not invent an entrance from nearby spawn coordinates.
- Store roof groups, interior membership, visible floors, openings and explicit transition destinations separately from collision. Hide the current interior’s roof, restore it on exit, and restrict picking to visible floors.

Choose **rigged low-poly 3D actors**, glTF and hand-painted pixel textures, with idle, walk, attack and death clips. Use a steep orthographic camera, stable low-resolution world rendering and nearest upscale; keep UI text at display resolution. Match the reference through textured ground, shaped silhouettes, layered foliage, warm directional light and cool shadows. Judge walking, occlusion and stairs in motion, not a still image.

## Exact initial contents and tuning

All numbers below are **provisional design values**, not claimed historical formulas. The official 7.6 announcement confirms a magic rebalance and faster mana regeneration, but does not establish these calculations. [CipSoft’s 7.6 announcement](https://www.tibia.com/news/?id=355&subtopic=newsarchive).

- **Player:** one level-8 knight; 185 HP, 35 mana, sword/shield skills 20; sword attack 10, shield defense 8, armor 4. Start with 60 gold, two bread and one healing flask.
- **Ten portable item types:** sword, shield, armor, backpack, bag, gold, bread, healing flask, rat tail and rotworm shell. Corpses are world containers. Quentin serves the temple, Sam equips and buys trophies, Frodo sells supplies, and an authored depot clerk provides storage.
- **Movement:** cardinal step 400 ms, diagonal 1,200 ms; occupied tiles and corners block. Same-floor aggro within seven tiles; rat/cave-rat/rotworm steps take 600/500/500 ms. Melee attacks occur every two seconds. No level scaling.
- **Combat:** player damage is uniformly `0–14` against these unarmored initial creatures. Rat/cave-rat/rotworm have `20/30/65` HP and raw damage `0–8/0–14/0–28`; each incoming hit subtracts independent `0–4` armor and `0–4` shield rolls, floored at zero. Shield applies to at most two attackers per attack cycle.
- **Resources and rewards:** bread costs 4 gold and supplies 1 HP per 4 seconds plus 1 mana per 8 seconds for 40 seconds; durations do not stack or refresh early. A flask costs 30 gold and heals 40 HP; a spell costs 20 mana and heals 30 HP. Both share a 10-second healing cooldown. Each use consumes one item or mana. Rat/cave-rat/rotworm award `5/10/40` XP and `1–4/4–8/8–16` gold; a rotworm shell sells for 12 gold. No food drops.
- **Progression:** start at 4,200 XP; provisionally require 6,400 for level 9. Sword skill 20→21 takes 1,000 eligible damaging strikes, with later thresholds increasing; neither this curve nor the XP thresholds claim exact 7.6 fidelity. Debug acceleration is separate and disabled for normal play.

With aligned attacks and no movement, those rolls imply approximately **3.5/4.9/9.9 player hits** per rat/cave rat/rotworm and **3/15/93 HP** taken respectively. Two rotworms can inflict roughly 185 HP by the first kill and more while the second survives: standing still is plausibly fatal, while a clear straight retreat is faster than pursuit. Timing and variance require playtesting.

Ten rats yield about 25 gold and cost about 33 HP: four bread cost 16 gold and 160 seconds, leaving roughly 9 gold before other expenses. Four cave rats roughly break even on six bread; a rotworm’s roughly 24-gold average proceeds do not cover ten bread. These are tuning estimates, not measured outcomes.

Floor changes do not refill enemies. After returning home and ten seconds without combat, an injured enemy regenerates 2 HP per second; its HP and respawn timer survive restart. This makes repeated floor-peeking costly in time and resources, rather than a free reset. Bread and spell regeneration remain deliberately slow and paid for.

On death, keep equipped starter gear, leave the backpack and carried contents in a corpse, and add **5% of current total XP as debt** paid before further XP gains: 210 XP initially, equivalent to 42 rats. The corpse is owner-only for two minutes, then lootable by others, and expires after 30 minutes including downtime; expiry destroys remaining contents atomically. Respawn at the temple with an empty replacement bag only if needed.

## Interaction, authority and recovery

Keyboard and click-to-walk issue timed movement intentions. Provide floor-aware inspect/use and target selection, chat focus that suppresses movement keys, keyword NPC trade, open container windows, drag/drop, stack splitting, equip and depot transfer. The server checks session, sequence, range, floor, visibility, cooldown, destination, price, stock, capacity and ownership.

Every item instance has one stable ID and exactly one location: tile, equipment slot or container slot. Enforce stack limits, quantities, slot/weight limits, legal equipment and acyclic nesting; splitting creates an instance and merging conserves quantity. Corpse creation, loot, trade and death transfer all affected ownership together.

Use one room and one SQLite writer initially. For each changed simulation tick, stage effects without publishing them, commit affected player, enemy, item, corpse, timer and command-result records in **one transaction**, then apply and broadcast the committed state. Persist command IDs so retries return the prior result. On failed or uncertain commit, stop the room and reload from SQLite before accepting commands. Use WAL with `synchronous=FULL` initially; measure its cost rather than weakening durability speculatively. [SQLite durability guidance](https://www.sqlite.org/pragma.html#pragma_synchronous).

Combat locks logout for 30 seconds after combat; disconnect leaves the character vulnerable until safely unlocked or dead. Freeze combat-lock time during server downtime, restore the character and enemy state on restart, then resume simulation. Corpse expiry uses persisted wall-clock deadlines and is processed before reconnect.

## Milestones and acceptance

| Increment | Executable exit |
|---|---|
| **1. Thais walk** | Import and classify the route; two clients walk temple → Sam → depot → verified sewer and back. Walls block, transitions work both ways, roofs hide correctly, and hidden floors cannot be picked. |
| **2. One durable trip** | Add rat, NPC supplies, containers, loot, death and SQLite sequencing. Buy, fight, loot, sell/store and reconnect in the actual slice. |
| **3. Difficulty and recovery** | Add cave rat and rotworm, food, healing, progression and debt. Measure isolated fights, two-rotworm overpull, clear-path retreat, ten-rat trip costs and floor-peeking. Adjust values if the intended outcomes fail. |
| **4. Presentation and packaging** | Replace placeholders with the reusable Thais kit; review moving silhouettes, foliage, shadows and floor cutaways. Later, test the same loop in browser and Electron on Windows and macOS. |

High-value failure checks: reject container cycles and remote use; race two clients for one stack and award it once; interrupt a transfer before and after commit; restart during combat and after corpse expiry; reconnect during combat without invulnerability or duplicated rewards.

**First implementation tasks:** inspect and hash the pinned inputs; implement version-0 decoding and the catalog classification report; identify and annotate the actual depot-to-sewer route; then render that route with one rigged actor and authoritative timed movement.

**Round 4 decisions:** confirm the verified route and its era patches, tune combat and economy from recorded play sessions, and settle remaining historical progression/death differences using better evidence. Retain applicable notices and source records, use original art and dialogue, and avoid known commercial-source leaks.

This was read-only planning: I inspected the supplied image and source material and calculated the estimates; no files were written, and no importer, game, build, install, deployment or downloaded code was executed.
