# Tibia 7.7 mechanics: research from GitHub sources

Status: complete (11 November 2026). Sections A and B first (items, HUD), then 1-12, then a comparison table and open questions.

Scope: rules, numbers and client behaviour of the 7.7 era (mid-2006), studied from open reimplementations and documentation on GitHub. Described in our own words. No code, data, names, maps, sprites or text from those projects is copied here or into the repo. Lanternfall stays its own world.

Earlier work this extends: `docs/mechanics/round-1..3/*.md` (7.6 movement, melee, defence, death, regen, skills, PZ, already adopted in `content/balance.json`), and `docs/PLAYTEST-2026-11-10.md` (what Lanternfall gets wrong today).

## Sources

All on GitHub, read through `gh` on 11 November 2026. Nothing was copied into the repo.

| Short | Repository | What it is | Used for |
|---|---|---|---|
| P | [Coldensjo/Patella](https://github.com/Coldensjo/Patella) | Reconstruction of the 7.72 Windows client (June 2006 build), checked against the binary | Section B, light rendering, client pathing |
| ROTS | [Emilianenko/RealOTS-Reverse-Engineering-Server](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server) | Reverse engineering of the 7.7 game server (incomplete; no monsters or NPCs) | Items, combat, light, chat, trade, PZ, timers |
| NOST | [Ezzz-dev/Nostalrius](https://github.com/Ezzz-dev/Nostalrius) | 7.7 clone on TFS 1.2 using the era's data files | Item statistics, monsters, spawns, NPC behaviour, loot, vocations, config |
| (earlier) | [Ezzz-dev/OTHire](https://github.com/Ezzz-dev/OTHire), [tibiantis-notes](https://github.com/tibiantis-notes/tibiantis-notes.github.io) | 7.72 server; 7.4 research notes | Cited in the round-1 docs; not re-read here |

Also found but not used: Patella-Modern and Patella-Plus (later forks), YurOTS (2005 server, its own formulas), Avesta (7.4-7.7 server), gravak (HTML5 7.4 client). A decompiled 7.7 server repository found by name returned "blocked (DMCA, June 2026)" and was not used. No general web search was used, except one TibiaWiki page on the 7.8 update (item hotkeys) cited in B6.

Trust order when sources disagree: P (client logic) and ROTS (server logic) over NOST (engine is TFS with 7.7 rules patched in) over community notes.

## A. Items and inventory

Sources for this section:
- **ROTS** = [Emilianenko/RealOTS-Reverse-Engineering-Server](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server), a reverse engineering of the 7.7 CipSoft game server (credited to the Nostalrius author). Incomplete in places, but where it exists it is the original logic. Links `ROTS/<file>#L<n>`.
- **NOST** = [Ezzz-dev/Nostalrius](https://github.com/Ezzz-dev/Nostalrius), a 7.7 clone on TFS 1.2 that loads the era's own item, monster and spell data. Its engine is TFS with 7.7 rules patched in; where NOST and ROTS disagree I trust ROTS.
- The item numbers below are **statistics I computed** from NOST `data/items/items.srv` (the era's item definition file, 23k lines): ranges and medians per category, not individual items. Weights there are in hundredths of an ounce; I give ounces.

### A1. Equipment slots

Ten slots ([ROTS/src/player.cpp#L614-L662](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/player.cpp#L614); layout in B2): head, neck (amulet), backpack (one container), body (armour), two hands, legs, feet, ring, and an extra "belt" slot that holds ammunition or anything.

Slot rules, server-side:
- Each worn item names one body position; it fits only that slot. Head, neck, backpack, body, legs, feet, ring are strict.
- **Hands accept any takeable item**: a weapon, a shield, a torch, a stack of food, a rune, a rope. Both hands are general-purpose holders, which is how torches and runes were "held".
- Rules across the two hands: at most one weapon and at most one shield; a two-handed item needs both hands free and blocks the other hand .
- The belt slot accepts anything (in practice arrows/bolts for bows, which read ammo from there).
- Equipping refuses if the hand/slot holds something else that is not the same stackable kind (then the client must swap).
- Light from an item counts only while it is in one of these ten slots, not inside a container (A9).

### A2. Item categories met in the first hours, with typical numbers

Weapons. Each melee weapon has attack, defence and weight; a few have a level or vocation requirement. Computed over all 84 melee weapons in the data:

| Class | One-handed, low tier | Mid tier | High tier | Two-handed |
|---|---|---|---|---|
| Sword | atk 7-12, def 5-11, 4-35 oz | atk 14-26, def 10-23, 18-50 oz | atk 35-48, def 20-35, 23-150 oz | atk 26-55, def 23-40, 52-180 oz |
| Axe | atk 7-16, def 4-8, 10-41 oz | atk 20-35, def 10-21, 45-90 oz | atk 38-50, def 16-30 | atk 18-52, def 7-25, 50-110 oz |
| Club | atk 6-14, def 3-9, 21-41 oz | atk 16-28, def 10-15, 38-68 oz | atk 36-50, def 12-35 | atk 8-50; some staffs have def above atk (def 25-45) |

Patterns worth keeping:
- Defence of a one-handed weapon is roughly 0.5-0.9 of its attack for swords, 0.3-0.6 for axes; clubs sit between. Swords are the light, defensive line, axes the heavy, offensive one, clubs the cheap, heavy one.
- Weight grows with tier but not strictly: a top-tier sword can weigh less than a mid-tier axe.
- Two-handed weapons buy about +25-50% attack over the best one-hander of the tier at the cost of the shield (which is worth 14-40 defence).
- Bare hands use fist fighting with attack 7 (round-1 doc).

Distance weapons ([NOST items.srv statistics]):
- Thrown weapons: attack 10-35, range 7 tiles, and a break chance per throw of 3-10% (a few always break); weights 0.8-20 oz.
- Bows and crossbows are two-handed, range 7, and need matching ammunition in the belt slot. Arrows attack ~25 (special ones lower attack but add an effect), bolts 30-40. Ammunition is always consumed on use (some is left on the ground under the target in practice; not confirmed in code).
- Wands and rods (mage weapons, new in 7.6/7.7): level 7 to 33, mana per shot 2-13, damage roughly 13 +-5 at the bottom to 65 +-9 at the top, range 1-4 tiles. Every one of them also gives a small light (level 2-3).

Shields: 37 in the data, defence 14 to 40, weights 26-84 oz (most 40-70 oz). The weakest shield (14) already beats the weapon defence of every low-tier weapon, which is why a shield is the first purchase.

Armour pieces (armour value, weight):

| Slot | Count | Armour range | Weight range | Notes |
|---|---|---|---|---|
| Head | 37 | 1-12 | 7-52 oz | 1-2 for cloth/leather, 4-7 for metal, 8-12 top |
| Body | 28 | 1-17 | 9-130 oz | clothing 1-2 (9-32 oz); leather/scale 4-8 (60-100 oz); plate 9-17 (80-130 oz) |
| Legs | 12 | 1-10 | 18-70 oz | |
| Feet | 5 | 1-4 | 9-31 oz | few boots exist; most give 1-2 |
| Neck | 2 | 1-2 | 2-6 oz | amulets are mostly for effects, not armour |

Total armour of a fresh character is about 3-5 (cloth head, body, legs, feet); a mid-level fighter has 15-25; armour reduces each hit by a random amount in [floor(A/2), 2 floor(A/2) - 1] (round-1 doc 5.3).

Containers (takeable ones):
- The two "backpack slot" containers: a bag of 8 slots at 8 oz and a backpack of 20 slots at 18 oz. Plus a dozen other takeable containers: 5-slot pouches and baskets (6-10 oz), 10-slot boxes (18-35 oz), 15-slot crates (80-120 oz), and very heavy chests and coffins (100-1500 oz, effectively furniture).
- Fixed (unmovable) containers: 4-30 slots (the depot locker is 30). [NOST items.srv]
- **No nesting depth limit.** A container refuses only itself or one of its own ancestors, and refuses more items than its slot count. Each nested container costs one slot of its parent and its full weight. [ROTS/src/item.cpp#L788-L833](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/item.cpp#L788)

Food: 39 kinds, all stackable but three. Nutrition is in units of 12 s: from 1 (12 s, fruit-size, 0.1-0.2 oz) through 8-10 (96-120 s, bread or cheese-size, 0.5-5 oz) and 12-18 (2.4-3.6 min, meat or fish) up to 30-60 (6-12 min, large roasts, 20-30 oz). Fullness rule in A6.

Fluids: one vial/flask item with a fluid type (water, wine, beer, mud, blood, slime, oil, urine, milk, mana fluid, life fluid, lemonade; 12 types in the data). Drinking empties the container but **keeps it**, so it can be refilled, sold back, or used to scoop a fluid. Mana fluid restores 50-100 mana, life fluid 25-50 hit points (the potions of the era). Alcohol makes you drunk for 60 s (you stagger in random directions). Used on another player, a healing fluid works on them; other fluids splash on the ground. [NOST data/actions/scripts/misc/fluids.lua](https://github.com/Ezzz-dev/Nostalrius/blob/master/data/actions/scripts/misc/fluids.lua)

Runes: 56 kinds, every one 1.20 oz, used with a target ("use with"), usable at a distance on a creature or tile in view (the only distance-use items). A blank rune is made into a spell rune by casting a conjure spell holding it. Each carries charges (shown as "(Nx)" on look) and a magic-level requirement. [ROTS/src/item.cpp#L533](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/item.cpp#L533)

Tools: rope, shovel, pick, machete, fishing rod, knife, scythe, crowbar. All "use with" items with a fixed effect on a target tile: rope pulls you (or an item or creature) up through a rope spot from adjacent; shovel opens a loose-stone hole for 15 min-ish before it closes (not confirmed); pick opens certain walls/ground; fishing rod on water. [NOST data/actions/scripts/misc/rope.lua](https://github.com/Ezzz-dev/Nostalrius/blob/master/data/actions/scripts/misc/rope.lua), [shovel.lua](https://github.com/Ezzz-dev/Nostalrius/blob/master/data/actions/scripts/misc/shovel.lua)

Light sources: see A9.

Valuables: the coin stack (0.10 oz per coin; 100 coins of one kind per stack, three denominations at 1 / 100 / 10,000 in the era, exchanged by using a full stack), gems and small trinkets (0.1-0.5 oz, stackable). [NOST items.srv]

Creature products ("loot items" sold to NPCs): mostly stackable, light (0.1-5 oz). 81 stackable kinds in the data; weight distribution: 14 at 0.10 oz, 12 at 0.20 oz, 7 at 0.30 oz, then a long tail to 30 oz. Most stackables weigh under 1 oz; anything above 5 oz per unit is rare.

Keys and documents: keys weigh 1.00 oz and carry a 4-digit number shown on look; a door opens only with the matching number. Writable paper (scroll, letter, book) has a text length limit (512-1024 chars) and can be "write once" or rewritable; look reads short text, but a book's text is readable on look only within a distance set per item; otherwise you must use it. [ROTS/src/item.cpp#L627](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/item.cpp#L627)

### A3. Weight and capacity

- Item weight = own weight; a stack weighs per-unit weight x count; a container weighs its own weight plus everything inside, recursively. [ROTS/src/item.cpp#L664-L688](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/item.cpp#L664)
- Carried weight = sum over the ten slots (so the backpack's whole tree counts). Free capacity = capacity (oz) - carried weight. [ROTS/src/player.cpp#L541](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/player.cpp#L541)
- Capacity check happens only when something comes **from outside** the player's tree; moving inside your own tree never fails on weight. [ROTS/src/player.cpp#L606-L611](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/player.cpp#L606)
- Capacity: 400 oz at level 1, plus per level 25 (knight), 20 (paladin), 10 (mages). No vocation: **sources disagree**, NOST says +10 ([vocations.xml#L3](https://github.com/Ezzz-dev/Nostalrius/blob/master/data/XML/vocations.xml#L3)), ROTS says +5 ([ROTS/src/vocation.cpp#L37](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/vocation.cpp#L37)). Losing a level removes the gain again.
- What it means in practice: a level-8 knight (575 oz) carries a 20-slot backpack, a mid-tier set (~250-300 oz total worn) and about 250 oz of loot. Capacity, not slots, is the binding limit as soon as you carry metal armour.

### A4. Stacks

- Stack limit 100 for every stackable ("cumulative") kind; merging into a stack fills it to 100 and the remainder becomes a new stack. [ROTS/src/game.cpp#L880-L895](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L880)
- Moving part of a stack is a move with a count (B4 count dialog); dropping a stack onto the same kind merges.
- Stackables in the data: coins, food (36 of 39), runes are **not** stackable (each has charges), ammunition and thrown small weapons are, creature products are, gems are.

### A5. Containers: opening, slots, order

- Server-side capacity check is "item count >= slots" for an add to "anywhere"; nothing else limits it. [ROTS/src/item.cpp#L823](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/item.cpp#L823)
- New items go to the **front** (slot 0) of a container; so the newest item is top-left (B3).
- When you put something "into the backpack slot" or onto the minimised doll, the server searches the backpack and nested containers for room ([ROTS/src/player.cpp#L742-L830](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/player.cpp#L742)).
- Moving a container closes its open windows for anyone who can no longer reach it. [ROTS/src/game.cpp#L899](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L899)

### A6. Decay ("expire")

Each item kind can carry an expire time (seconds of real time, counted down only while the item exists in the world, ticked in 250 ms buckets) and a target kind it turns into at zero (or nothing). [ROTS/src/game.cpp#L4342-L4350](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L4342), [NOST/src/game.h#L89-L91](https://github.com/Ezzz-dev/Nostalrius/blob/master/src/game.h#L89)

- **Pausable items** come in pairs: a "lit" kind that expires and an "unlit" kind that does not; using toggles between them, and the remaining time is saved and restored across the toggle. So you can put out a torch and keep the rest of its life. [ROTS/src/game.cpp#L610-L630](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L610)
- **Corpses**: each creature's corpse is a 3-stage chain (sometimes 2). In the era's data each stage lasts **1200 s or 1800 s** (20 or 30 minutes): of 158 corpse chains, 62 are 30/30/30 min, 37 are 20/20/20 min, 39 are 30/30 min. Only the first stage (sometimes the second) is a container; later stages are remains you cannot open. 4 tiny ones last 10 s (effects). [NOST items.srv statistics]. This is much longer than Lanternfall's 5/5/1 min, and longer than many players remember; **I could not confirm** that the original server did not shorten corpse times by some other rule, since both ROTS and NOST read the number as plain seconds.
- Corpse capacity: 5 (small creatures, 43 kinds), 7, 10 (most humanoids and mid creatures, 73), 15 (large, 19). First-stage weight: median 650 oz, range 10-1500 oz. **Every corpse is movable** (none is fixed) but too heavy to pick up for most; you drag it along the floor.
- Food does not spoil in this era (no expire on food kinds).
- Light sources burn down (A9). Magic fields (fire, poison, energy on the ground) expire in seconds to minutes.
- A dead player leaves a corpse that carries a text naming the dead player and the killer, readable on look. [ROTS/src/player.cpp#L1557-L1566](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/player.cpp#L1557)

### A7. Tiles: how many items, and in what order

- Server limit: 1000 objects on a tile ([ROTS/src/tile.cpp#L57](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/tile.cpp#L57)). The client receives and draws at most 10 per tile (protocol limit; the rest are invisible until things above are moved away; not confirmed from code, well known).
- Stack order by priority ([ROTS/src/item.cpp#L972-L985](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/item.cpp#L972), creatures [ROTS/src/creature.h#L256](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/creature.h#L256)):
  0 ground, 1 ground borders ("clip"), 2 bottom things (walls, trees, pillars), 3 always-on-top things (door frames, arches), 4 creatures, 5 ordinary items.
- Inside a priority, a newly added object goes **in front of** older ones ([ROTS/src/tile.cpp#L119-L129](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/tile.cpp#L119)), so the newest loose item is on top and is what you grab, look at, or use first.
- One magic field and one liquid pool per tile: a new one replaces the old. [ROTS/src/tile.cpp#L101-L117](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/tile.cpp#L101)
- What blocks: a creature cannot enter a tile with another creature, an impassable ground, or an impassable fixed object. An impassable movable object (a chest, a large crate) cannot be pushed onto a creature, and blocks creatures where it lies. Items can always be thrown onto a tile with a creature on it (except impassable ones). [ROTS/src/tile.cpp#L18-L83](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/tile.cpp#L18)

### A8. What "look" says

Server-composed, one green line sequence ([ROTS/src/item.cpp#L461-L640](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/item.cpp#L461), [ROTS/src/game.cpp#L1958](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L1958)). In order:
1. A "you see" opening, article and name (plural with count for stacks).
2. A bracket of stats by kind: containers their slot count, weapons attack and defence, shields defence, armour its armour, keys their number.
3. Restrictions: which vocations and from which level.
4. For runes: required magic level, the spell's words, charges left. For timed items: new, or minutes of energy left. For charged items: charges left.
5. **Only if the item is within 1 tile of you**: its weight (singular or plural wording for stacks, in oz with 2 decimals) and its flavour description.
6. For written items: the text if within the item's reading distance, else a too-far line.

At a distance you get name and stats only; adjacent you also get weight and description. Looking at a dark tile beyond 1 tile is refused by the client (B5). Looking at a player gives name, level, vocation (and guild); at a creature, its name.

### A9. Light-source items

From the item data ([NOST items.srv statistics]) and the light combination rule ([ROTS/src/creature.cpp#L237-L278](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/creature.cpp#L237)):

| Source | Light level | Colour | Burn time | Weight | Notes |
|---|---|---|---|---|---|
| Torch | 7, then 6, then 5 | warm orange | 10 min at 7, 5 min at 6, 5 min at 5 (20 min lit) | 5.0 / 4.5 / 4.0 oz, getting lighter | Then a burnt stub with no light that disappears after 5 more min. Each stage has an unlit twin; using it toggles and keeps the remaining time |
| Oil lamp | 6 | warm orange | 50 min | 50 oz (heavy) | Becomes an empty lamp (refillable with oil) |
| Candlestick | 4 | warm orange | 50 min | 3 oz | Becomes a used candlestick |
| Other lanterns | 6 | orange-red | 33 min | 30 oz | |
| Wands, some rings and amulets | 1-3 | various | none (or with the item's own charge) | | Light as a side effect |
| Runes and small magic items | 1 | white | none | | Barely a glow |
| Fixed lights (wall lamps, braziers, lava, fires, magic fields) | 2-8 | white, orange, red, blue, green | none | | 260 lit kinds in the data; most fixed lights are 3-4 |

Rules:
- A creature's light = the **maximum** of its spell light (A light spell; section 9) and every item in its ten slots; colour is the per-channel maximum of those sources. A torch in the backpack gives nothing; a torch in a hand, the belt or any slot shines.
- Light level N reaches N-1 tiles out (B11 render rule); a torch at 7 lights a circle of radius about 6 tiles at diminishing strength, which is roughly the whole height of the game window (11 tiles).
- A torch's light visibly weakens over its life (7 -> 6 -> 5): you see it is running out before it does.

## B. Client and HUD of that era

Source for this whole section, unless marked: **Patella**, a reconstruction of the 7.72 Windows client (build of 8 June 2006), rewritten one source file at a time and checked against the original binary with differential tests. Repo [Coldensjo/Patella](https://github.com/Coldensjo/Patella) (MIT for its own work). Links are `P/<file>#L<n>` = `https://github.com/Coldensjo/Patella/blob/main/<file>#L<n>`. This is the strongest evidence in this document: it is the client's own logic, not a recollection. What it cannot show is anything the server decides (look text, slot rules, ranges); those are in section A and 1-12.

### B1. Layout (numbers)

| Part | Rule | Source |
|---|---|---|
| Game window | 15 x 11 tiles visible, 32 px tiles, so a 480 x 352 picture. The client keeps 18 x 14 tiles per floor (one extra row and column each side, plus one for the step in progress); the hero sits on buffer tile (8,6), so the view is centred one tile right-and-down of the buffer's top-left visible tile | [P/src/MapWindow.cpp#L9](https://github.com/Coldensjo/Patella/blob/main/src/MapWindow.cpp#L9), [P/src/Map.h#L27](https://github.com/Coldensjo/Patella/blob/main/src/Map.h#L27), [#L385](https://github.com/Coldensjo/Patella/blob/main/src/MapWindow.cpp#L385) |
| Scaling | Aspect is locked at 15:11 and centred. With stretching, the 480 x 352 picture is scaled to fit in one blit; without it, capped at 1:1 and a smaller window crops the centre. Minimum 240 x 176. 5 px frame | [P/src/MapWindow.cpp#L1613](https://github.com/Coldensjo/Patella/blob/main/src/MapWindow.cpp#L1613), [#L539](https://github.com/Coldensjo/Patella/blob/main/src/MapWindow.cpp#L539) |
| Screen split | Left: game window, a 5 px drag splitter, console under it. Right: one column 176 px wide. Minimum client area 550 x 450 | [P/src/MainWindow.cpp#L148](https://github.com/Coldensjo/Patella/blob/main/src/MainWindow.cpp#L148), [P/src/GUI.cpp#L306](https://github.com/Coldensjo/Patella/blob/main/src/GUI.cpp#L306) |
| Right column, fixed part, top to bottom | (1) minimap 117 px tall: a 106 x 106 map, zoom x1/2/4/8, floor up/down, centre button, compass rose to scroll; (2) health and mana bars, 32 px; (3) inventory doll with combat controls, 170 px (or a 64 px minimised strip); (4) a 26 px row of toggles for Skills, Battle, VIP, plus Logout | [P/src/MainWindow.cpp#L410](https://github.com/Coldensjo/Patella/blob/main/src/MainWindow.cpp#L410), [P/src/GUI.cpp#L374](https://github.com/Coldensjo/Patella/blob/main/src/GUI.cpp#L374), [P/src/ContentWindows.cpp#L250](https://github.com/Coldensjo/Patella/blob/main/src/ContentWindows.cpp#L250) |
| Right column, flexible part | Everything else stacks here as titled windows: containers, Skills, Battle list, VIP, trade. Height = window height minus the fixed part | [P/src/MainWindow.cpp#L169](https://github.com/Coldensjo/Patella/blob/main/src/MainWindow.cpp#L169) |
| Console | Under the game window, minimum 106 px, resized by the splitter. Tabs 96 x 18 along its top; the first tab is the local/default one | [P/src/ConsoleWindow.h#L260](https://github.com/Coldensjo/Patella/blob/main/src/ConsoleWindow.h#L260), [P/src/GUI.cpp#L909](https://github.com/Coldensjo/Patella/blob/main/src/GUI.cpp#L909) |

Design principles that fall out of this: the world never sits under a window (windows live only in the right column and console, never floating over the map); the world view is a fixed tile count, never more tiles for a bigger screen (so no one sees further by resizing); the right column is one vertical stack where opening a window pushes or shrinks others instead of overlapping them.

### B2. Inventory doll

- 10 slots, 34 x 34 frames, in three columns at x = 0 / 37 / 74 (px within the 108 x 163 doll). Centre column top to bottom: head, body (armour), legs, feet. Left column: neck (amulet), one hand, ring. Right column: backpack/container, the other hand, belt/ammo. The two side columns are offset half a slot down from the centre column (rows at 14, 51, 88 vs 0, 37, 74, 111). [P/src/GUI.cpp#L415](https://github.com/Coldensjo/Patella/blob/main/src/GUI.cpp#L415), [P/src/Help.cpp#L127](https://github.com/Coldensjo/Patella/blob/main/src/Help.cpp#L127)
- Empty slots show a faint placeholder silhouette of what goes there. [P/src/GUI.cpp#L455](https://github.com/Coldensjo/Patella/blob/main/src/GUI.cpp#L455)
- Under the side columns two small boxes: soul points (left) and capacity (right), label above number. [P/src/GUI.cpp#L465](https://github.com/Coldensjo/Patella/blob/main/src/GUI.cpp#L465)
- A 108 x 13 strip under the doll for status icons (B7).
- Beside the doll, a 43 px wide column of combat controls: fight mode as three radio buttons (offensive, balanced, defensive), chase vs stand as two radio buttons, a "secure mode" toggle (refuses attacks on unmarked players), then Stop, Options, Help. [P/src/ContentWindows.cpp#L1217](https://github.com/Coldensjo/Patella/blob/main/src/ContentWindows.cpp#L1217)
- The client does not check what fits a slot; it sends the move and the server refuses. The minimised doll is one drop target that means "first suitable slot". [P/src/ContentWindows.cpp#L981](https://github.com/Coldensjo/Patella/blob/main/src/ContentWindows.cpp#L981)

### B3. Container windows

- Up to 16 container windows open at once; a container holds at most 36 items client-side (the largest server container in the era was 20, a backpack; see A4). [P/src/Inventory.h#L14](https://github.com/Coldensjo/Patella/blob/main/src/Inventory.h#L14)
- Each window: icon of the container, its name, minimise, close, and an "up" arrow (shown only when the container is inside another). 4 slots per row at a 37 px pitch. Opens tall enough for its current items, can be dragged taller up to its full capacity, scrolls with a bar and the wheel. Double-clicking empty window space minimises it. [P/src/ContentWindows.cpp#L94](https://github.com/Coldensjo/Patella/blob/main/src/ContentWindows.cpp#L94), [P/src/GUI.cpp#L623](https://github.com/Coldensjo/Patella/blob/main/src/GUI.cpp#L623), [P/src/ContentWindows.cpp#L1508](https://github.com/Coldensjo/Patella/blob/main/src/ContentWindows.cpp#L1508)
- **Open rules.** Using a container on the map or doll opens it in a new window. Using a container that sits inside an open window opens it *in the same window* (the child replaces the parent; "up" goes back). The context menu offers both "open" (same window) and "open in new window". This is why a backpack of backpacks did not flood the column. [P/src/ContextMenus.cpp#L438](https://github.com/Coldensjo/Patella/blob/main/src/ContextMenus.cpp#L438), [P/src/Inventory.cpp#L258](https://github.com/Coldensjo/Patella/blob/main/src/Inventory.cpp#L258)
- **"Move up"** in the item menu moves an item into the parent container. [P/src/ContextMenus.cpp#L567](https://github.com/Coldensjo/Patella/blob/main/src/ContextMenus.cpp#L567)
- **Column packing.** A new window goes to the bottom. If it does not fit, windows from the bottom up shrink to their minimum height, and any that still do not fit are closed. Dragging a window by its title swaps it with a neighbour once they overlap by half. [P/src/DialogWindow.cpp#L14](https://github.com/Coldensjo/Patella/blob/main/src/DialogWindow.cpp#L14)
- **Out of reach.** The client never closes a window on its own: the server sends "close" when the container leaves reach (walking away from a ground bag or corpse closes it). [P/src/Communication.cpp#L1642](https://github.com/Coldensjo/Patella/blob/main/src/Communication.cpp#L1642)
- **Protocol shape.** Open = window number, container's own item, name (30 chars), capacity, has-parent flag, then the item list (replacing whatever that window showed). Then incremental add (new item goes to the *front*, slot 0), change at index, remove at index. So newest items appear top-left. [P/src/Communication.cpp#L1614](https://github.com/Coldensjo/Patella/blob/main/src/Communication.cpp#L1614)

### B4. Drag and drop, and the count dialog

- A drag starts after the pointer moves more than 3 px with the button down; the cursor changes and a white frame marks the slot under it. A press without 3 px of movement is a click. [P/src/Status.cpp#L222](https://github.com/Coldensjo/Patella/blob/main/src/Status.cpp#L222)
- Sources: the top movable thing on a map tile, a doll slot, a container slot. Targets: any of the three. All moves are one generic "move (from, to, count)" message; the server checks everything (reach, weight, slot, line of sight). [P/src/MapWindow.cpp#L107](https://github.com/Coldensjo/Patella/blob/main/src/MapWindow.cpp#L107)
- **Count dialog**: opens when the dragged thing is a stack of more than 1. Slider 1..stack (max 100), default = whole stack. Keys: up/down +-1, PgUp/PgDn +-10, Home max, End 1, digits type a number, Enter accepts, Esc cancels. Holding Ctrl while dropping moves the whole stack with no dialog; Shift moves exactly 1. [P/src/Dialogs.cpp#L1392](https://github.com/Coldensjo/Patella/blob/main/src/Dialogs.cpp#L1392), [P/src/MapWindow.cpp#L248](https://github.com/Coldensjo/Patella/blob/main/src/MapWindow.cpp#L248)
- **Pushing** a creature is the same drag: when the top movable thing of a tile is a creature (no loose item above it in the pick order), dragging it to an adjacent tile sends a move for the creature. (Inferred from the pick rule, [P/src/Map.cpp#L188](https://github.com/Coldensjo/Patella/blob/main/src/Map.cpp#L188); server rules in section 2.)

### B5. Mouse: two schemes, context menu, use-with, look

7.72 shipped both; the newer one is the default and "classic" is an option. [P/src/Preferences.cpp#L477](https://github.com/Coldensjo/Patella/blob/main/src/Preferences.cpp#L477)

| Input | Default (7.72) | Classic |
|---|---|---|
| Left click on map | walk there | walk there |
| Left drag | move item / push creature | same |
| Right click | context menu | creature: attack on/off; item: use (or enter crosshair for use-with items) |
| Shift + right (or Shift + left) | look | look |
| Ctrl + right (or Ctrl + left) | use (crosshair for use-with) | context menu |
| Alt + right (or Alt + left) | attack on/off | |
| Both buttons together | | look |

Sources: [P/src/MapWindow.cpp#L281](https://github.com/Coldensjo/Patella/blob/main/src/MapWindow.cpp#L281), [P/src/Control.cpp#L418](https://github.com/Coldensjo/Patella/blob/main/src/Control.cpp#L418). The same scheme applies on the doll and in containers ([P/src/ContentWindows.cpp#L1145](https://github.com/Coldensjo/Patella/blob/main/src/ContentWindows.cpp#L1145)).

- **Context menu** order: Look; then Open / Open in new window / Use / Use with...; Rotate (for rotatable furniture); Trade with... (offer this item to a player); Move up. On a creature: Attack / Stop attack, Follow / Stop follow. On a player add: message, invite to private chat, add to VIP, ignore, party entries; on yourself: set outfit. Copy name last. In the default scheme each entry shows its shortcut. [P/src/ContextMenus.cpp#L426](https://github.com/Coldensjo/Patella/blob/main/src/ContextMenus.cpp#L426)
- **Use-with** (runes, rope, shovel, fluids, keys): the cursor becomes a crosshair; the next left click picks the target (a map tile's top thing, a creature, a doll or container slot, or a battle-list row); right click cancels. [P/src/Control.cpp#L1045](https://github.com/Coldensjo/Patella/blob/main/src/Control.cpp#L1045), [P/src/MapWindow.cpp#L216](https://github.com/Coldensjo/Patella/blob/main/src/MapWindow.cpp#L216)
- **Look** sends only position, item type and stack index; the server writes the sentence, which comes back as a green info message (B8). Looking at a tile with zero light that is not adjacent to you is answered by the client itself with a line saying nothing can be seen, no server round trip. [P/src/MapWindow.cpp#L286](https://github.com/Coldensjo/Patella/blob/main/src/MapWindow.cpp#L286)
- Tooltips on buttons after 1 s of hover. [P/src/Control.cpp#L833](https://github.com/Coldensjo/Patella/blob/main/src/Control.cpp#L833)

### B6. Keys and hotkeys

- 36 hotkeys: F1-F12 plain, with Shift and with Ctrl. Each holds **text only** (up to 256 chars) plus an auto-send flag: either the text is sent at once (a spell's words) or put in the input line. No item hotkeys in 7.72; item hotkeys ("use X on yourself") came in 7.8 ([TibiaWiki, Updates/7.8](https://tibia.fandom.com/wiki/Updates/7.8), web). [P/src/ConsoleWindow.cpp#L1462](https://github.com/Coldensjo/Patella/blob/main/src/ConsoleWindow.cpp#L1462)
- Arrows walk one tile in four directions; the numpad corner keys (7/9/1/3 positions) walk diagonals; Ctrl+arrow turns in place; Esc stops walking and attacking. [P/src/MainWindow.cpp#L206](https://github.com/Coldensjo/Patella/blob/main/src/MainWindow.cpp#L206)
- Ctrl shortcuts: logout (L or Q), Skills/Battle/VIP windows (S/B/P), name-and-bar display cycle (N: none / bars / names and bars), remove the oldest speech box (W), fullscreen (F). Console: Tab/Shift+Tab cycle channels, a key to hide server messages. Minimap: Alt+keys zoom, change floor, scroll. [P/src/MainWindow.cpp#L438](https://github.com/Coldensjo/Patella/blob/main/src/MainWindow.cpp#L438), [P/src/ConsoleWindow.cpp#L1524](https://github.com/Coldensjo/Patella/blob/main/src/ConsoleWindow.cpp#L1524)

### B7. Status icons

One byte of flags from the server; the client draws 9 x 9 icons, 10 px apart, under the doll, in a fixed order: poisoned, burning, magic shield, paralysed, the hero's own skull state, **in fight** (logout blocked), drunk, electrified, hasted. There is no protection-zone icon in 7.72 (it came later). [P/src/ContentWindows.cpp#L861](https://github.com/Coldensjo/Patella/blob/main/src/ContentWindows.cpp#L861), [P/src/Creatures.cpp#L295](https://github.com/Coldensjo/Patella/blob/main/src/Creatures.cpp#L295)

### B8. Console, message types, speech over heads

- **Channels**: the first tab is local talk plus server messages. There is no separate server-log tab in 7.72: server messages appear in the default tab and are copied into any other tab whose "show server messages" toggle is on. Private conversations open as tabs (one per partner); server channels (the list comes from the server: in this era typically game chat, trade, help, guild) open from a channel list dialog. Each tab keeps 1000 lines with an `hh:mm` stamp. An inactive tab with unread lines turns red and flashes once. [P/src/Talk.cpp#L706](https://github.com/Coldensjo/Patella/blob/main/src/Talk.cpp#L706), [P/src/ConsoleWindow.cpp#L858](https://github.com/Coldensjo/Patella/blob/main/src/ConsoleWindow.cpp#L858)
- **Colours** (identical in console and on the map), [P/src/Talk.cpp#L94](https://github.com/Coldensjo/Patella/blob/main/src/Talk.cpp#L94):

| Message | Colour |
|---|---|
| Say, whisper, yell, channel talk | yellow |
| Private message received | light cyan |
| Your own private message echoed | light blue-violet |
| Creature (monster) speech | orange |
| Look results, info | green |
| Status lines, level/skill advances, events | white |
| Warnings, staff broadcasts | light red |

- **Where messages appear over the game window** ([P/src/MapWindow.cpp#L1418](https://github.com/Coldensjo/Patella/blob/main/src/MapWindow.cpp#L1418), [P/src/Talk.cpp#L386](https://github.com/Coldensjo/Patella/blob/main/src/Talk.cpp#L386)):
  - look/info: centred just above the middle of the view; a new one replaces the old;
  - advances and warnings: centred just below the middle;
  - private messages: centred at one quarter of the view's height from the top;
  - status lines (exhausted, no way through, too heavy): bottom centre, white, 5 s; most also go to the console, one type is bar-only.
- **Speech boxes over heads** ([P/src/Talk.cpp#L223](https://github.com/Coldensjo/Patella/blob/main/src/Talk.cpp#L223)):
  - a header line with the speaker's name and the verb (says / whispers / yells), then the text;
  - wrap at 40 characters, at most 10 lines;
  - lifetime 3 s + 50 ms per character (a 40-character line stays 5 s); event and warning boxes twice that;
  - at most 10 boxes on screen, the oldest is dropped;
  - a creature saying more on the same tile appends lines to its open box instead of making a new one;
  - boxes are centred over the speaker's tile, follow the walk, are pushed apart pixel by pixel to keep a 10 px gap, and are kept inside the view ([P/src/MapWindow.cpp#L1355](https://github.com/Coldensjo/Patella/blob/main/src/MapWindow.cpp#L1355)).
- **Input line**: up/down recall sent lines (no duplicates). `*name* text` sends a private message and leaves `*name* ` in the line for the reply. Prefixes switch volume to whisper / yell / say; a volume button does the same and resets after each line. The client refuses to send a line containing the account's password. [P/src/ConsoleWindow.cpp#L1915](https://github.com/Coldensjo/Patella/blob/main/src/ConsoleWindow.cpp#L1915)

### B9. Battle list, skills, VIP

- **Battle list**: every creature on your floor within +-7 x +-5 tiles (your screen) that you can see, in the order they appeared (no sort). Row 22 px: small outfit picture, skull/party marks, name (truncated, full on hover), a thin health bar. Red frame = your attack target, green = follow target, white = hover. Left click toggles attack, Shift+click looks, right click opens the creature menu. [P/src/Creatures.cpp#L939](https://github.com/Coldensjo/Patella/blob/main/src/Creatures.cpp#L939), [P/src/ContentWindows.cpp#L2095](https://github.com/Coldensjo/Patella/blob/main/src/ContentWindows.cpp#L2095)
- **Skills**: experience, level, hit points, mana, soul, capacity, magic level; a gap; fist, club, sword, axe, distance, shielding, fishing. Level, magic level and each skill can show a percent-to-next bar (toggle per line). [P/src/ContentWindows.cpp#L2005](https://github.com/Coldensjo/Patella/blob/main/src/ContentWindows.cpp#L2005)
- **VIP**: one 16 px row per friend, name green online, red offline; sorted online first, then name; double click opens a private tab. [P/src/ContentWindows.cpp#L2893](https://github.com/Coldensjo/Patella/blob/main/src/ContentWindows.cpp#L2893)

### B10. Bars, names, floating numbers

- Health and mana bars in the fixed column: 90 x 11, filled to value/max, number beside. [P/src/GUI.cpp#L577](https://github.com/Coldensjo/Patella/blob/main/src/GUI.cpp#L577)
- Over each creature: name, and under it a 27 x 4 bar (25 px fill = health% / 4). Shown only for creatures that are in the battle list (i.e. on screen and visible) and for the hero. Name and bar colour by health %: 95-100 bright green, 60-94 light green, 30-59 yellow, 10-29 light red, 4-9 red, 0-3 dark red. The colour is dimmed by the light on that creature's tile (the hero's own label is never darker than 40%), so names fade in darkness. [P/src/Creatures.cpp#L86](https://github.com/Coldensjo/Patella/blob/main/src/Creatures.cpp#L86), [P/src/MapWindow.cpp#L555](https://github.com/Coldensjo/Patella/blob/main/src/MapWindow.cpp#L555)
- **Floating numbers** (damage, heal, experience): up to 9 characters, colour chosen by the server per damage type, rise 2 px every 100 ms for 10 steps (20 px over 1 s). Several on one tile overlap; no stacking. [P/src/Map.cpp#L596](https://github.com/Coldensjo/Patella/blob/main/src/Map.cpp#L596)
- Magic effects advance one frame per 100 ms. Missiles fly for 150 ms x floor(sqrt(distance in tiles)), point in one of 8 directions, and are drawn only on your floor. [P/src/Map.cpp#L614](https://github.com/Coldensjo/Patella/blob/main/src/Map.cpp#L614)

### B11. What the client shows: floors, roofs, light

- **Floors**: above ground the client holds the 8 surface floors (sea level and up); underground it holds your floor +-2. Each floor up is drawn one tile up-and-left (the classic offset). [P/src/Map.cpp#L74](https://github.com/Coldensjo/Patella/blob/main/src/Map.cpp#L74)
- **Roofs**: floors above you are not drawn if there is a roof or wall object over you or the tiles around you (a small cross and its diagonal), so walking indoors hides the upper storeys; some objects are flagged never to hide. [P/src/MapWindow.cpp#L393](https://github.com/Coldensjo/Patella/blob/main/src/MapWindow.cpp#L393)
- **Light rendering** (the light mechanics are in section 9): the server sends world light as brightness 0-255 and a colour from a 216-colour palette (6 x 6 x 6 cube). Underground the world light is 0. Each tile starts at world colour x brightness / 255. Each light source (creature, carried item, lit object, effect) adds a cone: intensity at a tile centre = level x 32 - distance in pixels, scaled so that 160 is full colour, i.e. roughly 51 per tile of (level - distance). Sources combine by taking the brighter value per colour channel (max, not sum). Tiles without ground get 4/5. The hero always has at least a level-2 white light of its own, so you always see your own tile and its neighbours dimly. With smooth shading on, each tile's colour is interpolated across the quad between tile centres; without it, one of 8 darkness steps per tile. The world-light value fades toward a new value at 1 step per second (dusk is gradual). [P/src/MapWindow.cpp#L1295](https://github.com/Coldensjo/Patella/blob/main/src/MapWindow.cpp#L1295), [#L455](https://github.com/Coldensjo/Patella/blob/main/src/MapWindow.cpp#L455), [#L947](https://github.com/Coldensjo/Patella/blob/main/src/MapWindow.cpp#L947), [P/src/Map.cpp#L108](https://github.com/Coldensjo/Patella/blob/main/src/Map.cpp#L108)

### B12. HUD differences that matter for Lanternfall (from the playtest)

- Playtest A5/H1: right-click is the context menu (default scheme) or use/attack (classic); left is walk and drag only. Lanternfall's left-click-does-everything has no 7.7 counterpart.
- A2: a press becomes a drag only after 3 px; a drag never walks the hero.
- F9: loot and floor windows never open over the world; they stack in the right column.
- H4: the count dialog with Ctrl (all) and Shift (one) shortcuts.
- H5: many container windows, child-replaces-parent inside a window, "up" arrow.
- E5: in 7.7 outgoing hits are floating numbers only, but every hit point you lose is reported as a white status line (bottom of the view and console) naming the attacker (section 5). Look results, exhaustion and advances also reach the console. Loot-of-corpse console lines are a later addition (not confirmed which version).
- A1/H8: speech boxes over heads with the timing above, private tabs, `*name*` addressing.

## 1. Time: beat, rounds, scheduling, exhaustion

Source: ROTS [src/game.cpp#L38-L62](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L38), [#L4219-L4265](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L4219).

- The server loop runs once per **beat** (a config value; the walking formula rounds step times up to whole beats, and the round-1 doc's 50 ms rounding implies a 50 ms beat; the exact shipped value is not in the repo). Each beat: read input, advance the game, send output.
- Inside a beat, fixed sub-clocks: item decay every 250 ms (each item lands in one of 4 buckets, so it is touched once a second); creature "skills" (conditions, light, hunger, regeneration, haste, poison) every 100 ms over 10 buckets, so **each creature's timers advance once per second**; a **round** every 1000 ms (round counter, world-light update, connection checks); creature thinking about once a second.
- Each creature has a to-do queue (walk, wait, attack, use, move item). A remote action ("use the lever 5 tiles away") becomes: path there, wait 100 ms, then do it; any step that fails clears the queue. [ROTS src/creature.cpp#L610](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/creature.cpp#L610), [src/game.cpp#L1674-L1705](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L1674)
- Exhaustion groups (separate timers):

| Group | Delay | Source |
|---|---|---|
| Melee / distance / wand attack | 2000 ms between attacks | [ROTS src/combat.cpp#L811](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/combat.cpp#L811) |
| Shield/weapon defence | at most 2 defences in any 2 s window | [ROTS src/creature.cpp#L310-L320](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/creature.cpp#L310) |
| Spells: healing and support | 1000 ms | [ROTS src/game.cpp#L3478](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L3478) |
| Runes | 1000 ms, aggressive ones 2000 ms; **share the spell timer** | [ROTS src/game.cpp#L3446-L3451](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L3446) |
| Basic actions (use, move) | 200 ms; "extended" actions 1000 ms | NOST [config.lua](https://github.com/Ezzz-dev/Nostalrius/blob/master/config.lua) (`timeBetweenActions`, `timeBetweenExActions`) |
| Yell | 30 s | [ROTS src/game.cpp#L1408-L1416](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L1408) |
| Trade channel post | 2 min | [ROTS src/game.cpp#L2146-L2152](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L2146) |
| Talking (spam) | each line adds 2.5 s to a buffer; more than 7.5 s queued mutes for 5 x n^2 s (n-th mute) | [ROTS src/player.cpp#L1352-L1366](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/player.cpp#L1352) |

- Fluids (the potions of the era) are used like any item (action timer), not on the spell timer, as far as NOST shows; ROTS has no fluid code. Not confirmed.
- Idle players: warned after 15 min without action, disconnected at 16 min. [ROTS src/game.cpp#L4288-L4292](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L4288)

## 2. Movement

- **Speed** = 2 x "go strength" + 80, where go strength is 70 at level 1 and +1 per level, so speed = 220 + 2(L - 1). Haste and paralysis change go strength by a percentage for a time. Creatures carry their own go strength in their data (a small rodent 27 -> speed 134; humans and most monsters 40-100 -> 160-280). [ROTS src/creature.h#L241](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/creature.h#L241), [src/player.cpp#L1081](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/player.cpp#L1081), NOST [data/monster/rat.xml](https://github.com/Ezzz-dev/Nostalrius/blob/master/data/monster/rat.xml)
- **Step duration** = ground waypoints x 1000 / speed, x3 for a diagonal, rounded **up** to a whole beat; the time is set when you arrive, so it is the cost of the tile you stepped onto. [ROTS src/creature.cpp#L909-L943](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/creature.cpp#L909)
- **Ground waypoints** (from the item data): paved, wood, marble 100; dirt 110; rock soil 120; flowers and some grass 140; grass and gravel 150; sand 160; and slower swamp, snow and debris up to 200-250 (Lanternfall's table matches the low end). [NOST items.srv]
- **What blocks a step**: a ground that is not walkable, another creature, any fixed impassable object, a movable impassable object (large crates, chests). Creatures path around tiles flagged "avoid" (fields, holes) but players may walk on them. A player under "PZ lock" (attacked a player in the last 60 s) cannot enter a protection zone. [ROTS src/tile.cpp#L18-L55](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/tile.cpp#L18)
- **Pushing** ([ROTS src/game.cpp#L1749-L1782](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L1749), [NOST src/game.cpp#L642-L712](https://github.com/Ezzz-dev/Nostalrius/blob/master/src/game.cpp#L642)):
  - you must stand next to the creature (else you auto-walk to it first, then push);
  - destination: a tile adjacent to the creature, same floor, free of creatures and blocking things;
  - a creature still in the middle of a step cannot be pushed (the push is ignored until its step time is over), which is why "push a walking player" fails and "push a standing one" works;
  - a creature inside a PZ cannot be pushed out of it; an NPC cannot be pushed out of its wander area;
  - monsters have a "pushable" flag (small and weak ones yes, big ones no); players can always be pushed;
  - strong monsters can push weaker creatures and items out of their path (per-monster flags "can push creatures" / "can push items").
- **Floor changes**: stairs, ramps and open holes act on stepping in; ladders and grates on use; rope spots need a rope used on them; a loose-stone spot needs a shovel first. Round-1 doc covers the 2x cost of a floor-change step.
- **Auto-walk**: the client plans the path itself, only over the 18 x 14 tiles it knows, with the same 3x diagonal weighting ([Patella src/Map.cpp#L1388-L1542](https://github.com/Coldensjo/Patella/blob/main/src/Map.cpp#L1388)), and sends it as a list of directions; the server accepts at most 20 per message ([ROTS src/protocol.cpp#L219-L225](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/protocol.cpp#L219)). A path is never planned through unknown map. Esc, any arrow key, or any new click cancels it; a blocked step stops it with a no-way status line.
- Keyboard: one key press = one step; holding repeats at the step rate (B6).

## 3. Moving items

Source: [ROTS src/game.cpp#L1727-L1866](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L1727), [src/map.cpp#L340-L376](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/map.cpp#L340).

- **Reach to pick up**: you must be within 1 tile (Chebyshev) of the item and on its floor. If you are not, the server auto-walks you next to it and then performs the move: a drag from far away works in one gesture.
- **Throw**: from your position (or the item's) to any tile you can see on screen, if the straight line between them crosses no "unthrowable" tile (walls, closed doors, high objects). The line is a Bresenham-style walk; floor changes are allowed from a higher floor down (throwing onto a lower visible floor). Throw range is effectively the screen (+-7 x +-5).
- **Heavy furniture** (impassable movable things) can be moved only up to 3 tiles away and only on the same floor, and not onto a creature.
- **Using an item at a distance** (lever, door): auto-walk next to it, then use. Using an item *on* something far away (rope on a hole, shovel on a stone) first picks the tool up into your inventory, walks, then uses. [ROTS src/game.cpp#L1674-L1705](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L1674)
- **Runes** are the exception: use-with at any distance in view, needing only a clear throw line to the target.
- **Corpses**:
  - one per kill, a container on top of the tile's loose items (A7), lasting 2-3 stages of 20-30 min each in the data (A6);
  - **no ownership in 7.7**: anyone can open and loot any monster corpse at once. ROTS has no owner concept at all; NOST stores an owner because TFS does, and shows loot messages only behind a config switch that is off. Loot protection arrived in a later version (not confirmed which);
  - corpses are movable but very heavy, so you drag them along the floor; a corpse does not block walking;
  - player corpses carry who died and who killed them (A6).

## 4. Chat

Source: [ROTS src/game.cpp#L1393-L1458](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L1393), [src/channels.cpp#L64-L70](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/channels.cpp#L64).

| Kind | Who hears it | Notes |
|---|---|---|
| Say | players on the same floor within +-7 x +-5 (the screen) | |
| Whisper | full text within 1 tile; others on screen see a fixed placeholder sound | |
| Yell | same floor within 30 tiles | text forced to upper case; 30 s cooldown |
| Private message | one named player anywhere; error if offline | `*name* text`; recent recipients are tracked against spam |
| Channels | game chat, trade (one post per 2 min), real-life chat, help, tutor, guild, plus private channels a player opens and invites to | |

- **Spells are spoken**: everything you type is first tried as spell words. A cast that succeeds is said aloud (say range, yellow, over your head), so everyone around sees the words. A failed cast (no mana, exhausted, too low level) shows a puff and is not said. [ROTS src/game.cpp#L2099-L2113](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L2099)
- **NPC conversation** ([NOST src/npc.cpp#L274-L330](https://github.com/Ezzz-dev/Nostalrius/blob/master/src/npc.cpp#L274), [src/behaviourdatabase.cpp#L1129-L1290](https://github.com/Ezzz-dev/Nostalrius/blob/master/src/behaviourdatabase.cpp#L1129)):
  - NPCs hear only "say" (not whisper or yell, not channels), and only from within 3 tiles;
  - an idle NPC reacts only to a greeting; it then **focuses** that player, turns to face them and stops wandering;
  - while focused, another player's greeting gets a "busy, wait" reply and puts them in a **queue**; when the conversation ends the NPC addresses the next queued player still within 3 tiles;
  - the conversation ends on a farewell word, when the player walks more than 3 tiles away (NPC says a parting line), or after **60 s** without the player talking;
  - keywords match as **substrings** of the lower-cased message by default (so a keyword can fire inside a longer word), with an optional whole-word marker per keyword; the first matching rule wins, rules can also test vocation, level, money, item counts, quest flags and the current "topic";
  - a number in the message (first run of digits, capped at 500) is the amount for buy and sell rules.

## 5. Combat

Sources: [ROTS src/combat.cpp#L774-L995](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/combat.cpp#L774), [src/player.cpp#L1211-L1298](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/player.cpp#L1211), [src/creature.cpp#L310-L520](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/creature.cpp#L310); NOST [src/combat.cpp#L801-L818](https://github.com/Ezzz-dev/Nostalrius/blob/master/src/combat.cpp#L801), [src/monster.cpp#L82-L105](https://github.com/Ezzz-dev/Nostalrius/blob/master/src/monster.cpp#L82). Round-1 doc already has melee, defence and armour; here are the additions and confirmations.

- **Melee damage**: A = weapon attack (fist 7), adjusted by fight mode (offensive +20%, defensive -40%, integer). Damage = (5S + 50) x A x avg(two d100 rolls) / 10000. No level term. Confirmed in both ROTS and NOST.
- **Defence**: D = shield defence (or weapon defence, or 0) + 1, then fight mode (offensive -40%, defensive +80%). Anyone who is not attacking (no target, or only following) and whose attack is ready counts as defensive. With a shield, D is rolled like damage with the shielding skill: (5S + 50) x D x avg(2 d100) / 10000. **Without a shield ROTS subtracts the flat D** (no skill roll); NOST rolls it with the weapon's skill. Sources disagree; ROTS is the closer one.
- **Two defences per 2 s**: a defence can happen only if 2 s have passed since the one before last; extra hits in that window skip the defence step. [ROTS src/creature.cpp#L310-L320](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/creature.cpp#L310)
- **Armour**: random in [floor(A/2), 2 floor(A/2) - 1]. ROTS starts every player's armour at a base of 5 before adding worn armour (a naked player has armour 5); NOST does not. Not confirmed which is original.
- **Outcome effects**: damage <= 0 after defence = a "blocked" puff; <= 0 after armour = an "armour" spark; else blood (or the creature's race effect: blood, undead, poison) plus a floating number. No "miss" for melee.
- **The damaged player gets a status line** naming the hit points lost and the attacker (white, bottom of the game window, and the console). [ROTS src/creature.cpp#L486-L493](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/creature.cpp#L486) This is the era's combat log: incoming damage is logged, outgoing is not.
- **Distance**: hit test = (random below 15 x d) <= distance skill, then a flat roll of 75% (thrown) or 90% (bow/crossbow), where d = |dx| + |dy| and d <= 1 counts as 5. Damage like melee with distance skill and the ammo's or thrown item's attack. A miss lands the projectile on a random walkable tile around the target. Thrown weapons break with chance 1/(fragility + 1) per throw; ammunition is always used up. [ROTS src/combat.cpp#L868-L994](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/combat.cpp#L868)
- **Skill advancement**: every attack that rolls a skill adds 1 try only while the "learning points" counter is above 0; a damaging hit sets it to 30, every roll uses 1. So 30 blocked swings after your last real hit still train, then training stops. Shielding trains the same way, when a defence is rolled with a shield. Tries needed per level and death loss: round-1 doc.
- **Fight modes and chase**: offensive / balanced / defensive and stand / chase are two independent toggles on the doll (B2). Chase walks to adjacent; stand only swings when adjacent. A target is dropped when it is more than 8 tiles away (either axis), dies, or you enter a PZ. [ROTS src/combat.cpp#L390-L415](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/combat.cpp#L390)
- **Monster targeting** (NOST, TFS-based with 7.7 parameters, [src/monster.cpp#L920-L980](https://github.com/Ezzz-dev/Nostalrius/blob/master/src/monster.cpp#L920)): each species sets a target-change interval and chance and four weights (nearest, weakest, most damage, random). Monsters see about 9 tiles each way on their floor. A monster attacked from range while it cannot reach its target may switch to the attacker. Below its flee health it runs away and stops melee (spells still possible at a third of the normal chance). Ranged monsters keep a set distance.
- **Monster defence**: same formula as a player with a shield, using the species' defence value and its single "skill". A rodent's defence 3 with skill 15 blocks 0-1 points.
- **Damage over time**: fire damage puts on burning (value/10 per tick, 8 ticks), energy electrifies (value/20, 10 ticks), poison counts down from its value. Ticks once a second. [ROTS src/creature.cpp#L429-L445](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/creature.cpp#L429)
- **Luring**: monsters chase as far as you go on the same floor; a monster more than 50 tiles from its spawn or 2 floors away is removed (despawned) and its spawn starts its timer. NOST [config.lua](https://github.com/Ezzz-dev/Nostalrius/blob/master/config.lua) (`deSpawnRange`, `deSpawnRadius`).

## 6. Magic

- **Mana spent trains magic level**: every successful cast adds its mana cost as magic tries. Mana needed per level: round-1 doc (1600 x mult^ML). [ROTS src/magic.cpp#L588-L608](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/magic.cpp#L588)
- **Magic power**: value = (base + random(-var, var)) x (2 x level + 3 x magic level) / 100. Examples of the era's (base, variation) pairs: light heal (20, 10), stronger heal (40, 20), strongest heal (250, 50). A level 8, ML 0 character with the light heal: (20 +- 10) x 16 / 100 = 1-4 HP; a level 20, ML 10 one: (20 +- 10) x 70 / 100 = 7-21. [ROTS src/combat.cpp#L371-L388](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/combat.cpp#L371), [src/game.cpp#L3476-L3500](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L3476)
- **Requirements** checked in order: mana, soul points, level, magic level (runes), and for some spells vocation and premium. [ROTS src/magic.cpp#L560-L586](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/magic.cpp#L560)
- **Runes**: conjured by a spell while holding a blank rune (in a hand); used with a target at any visible distance with a clear line; charges per rune; aggressive runes on players need the target to be unprotected; the rune spell's magic level is required to use it, not to carry it.
- **Area shapes** ([ROTS src/combat.cpp#L236-L340](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/combat.cpp#L236)): circle of radius r around a target tile (balls and bombs); a cone in the facing direction with a length and a spread (waves, beams); custom masks (explosions, fields); a wall across the line of aim. Spells hit all creatures in the shape, players included outside PZ.
- **Magic shield**: damage goes to mana first while it lasts.

## 7. Health, mana and food

- **Regeneration** only while fed: the hunger timer counts down 1 s per second; each "secs per HP" seconds you gain 1 HP and each "secs per mana" seconds you gain mana. No-vocation 6 s/1 HP and 6 s/1 mana (NOST says 1 mana, the 2005 update gave mages 2 per 3 s). Values per vocation in NOST [vocations.xml](https://github.com/Ezzz-dev/Nostalrius/blob/master/data/XML/vocations.xml). [ROTS src/player.cpp#L40-L60](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/player.cpp#L40)
- **Food**: eating adds 12 s x nutrition to the hunger timer; refused if the timer is already above 1200 s - 12 x nutrition, i.e. the timer can reach exactly 1200 s (20 min) but not more. [ROTS src/game.cpp#L3219-L3229](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L3219)
- **Soul points**: max 100 (200 promoted), +1 per 2 min (15 s promoted); the exact condition for soul regeneration is not in ROTS. Used by conjuring. NOST vocations.xml.
- **Death and login**: you come back at the temple with full HP and mana. [ROTS src/player.cpp#L1488-L1497](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/player.cpp#L1488)

## 8. Experience

- **Level curve**: total XP for level L = (50/3)(L^3 - 6L^2 + 17L - 12). Lanternfall already matches (round-1 doc).
- **Sharing**: each attacker gets XP x their damage / total damage; damage older than the fight timeout (60 s) does not count. No party XP share in 7.7 (parties existed for marking only). NOST [src/creature.cpp#L629-L660](https://github.com/Ezzz-dev/Nostalrius/blob/master/src/creature.cpp#L629). ROTS records a list of the last 20 attackers with damage and timestamp ([src/combat.cpp#L541-L567](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/combat.cpp#L541)) but the reward step is missing.
- **Death penalty**: 10% of total XP, total skill tries and total mana spent (7% promoted); then equipment: the backpack always drops with everything in it, each other slot has a 10% chance; an amulet of loss protection (a later name; one item kind in the data) prevents item loss and is consumed; a red-skulled player drops everything. [ROTS src/player.cpp#L1557-L1610](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/player.cpp#L1557), NOST [src/player.cpp#L1559-L1577](https://github.com/Ezzz-dev/Nostalrius/blob/master/src/player.cpp#L1559). (ROTS's own drop step moves the whole inventory; it looks unfinished, NOST matches the well-known rule.)
- **Respawn**: temple of your home town, full HP and mana, no protection timer.

## 9. Light

Strongest sources: [ROTS src/game.cpp#L348-L400](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L348) (world light), [ROTS src/creature.cpp#L237-L278](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/creature.cpp#L237) (creature light), [ROTS src/magic.cpp#L656-L669](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/magic.cpp#L656) (light spells), Patella for rendering (B11).

**Day and night, from the wall clock.** The game clock is the real clock's minutes and seconds within the hour: 150 real seconds = 1 game hour, so **one real hour is one game day**, and every full real hour is game midnight. World light by game time:

| Game time | Real minutes past the hour | Brightness (of 255) | Colour |
|---|---|---|---|
| 04:00-20:00 | 10:00-50:00 | 255 | white |
| 20:00-21:00 | 50:00-52:30 | 204 | warm (reddish white) |
| 21:00-22:00 | 52:30-55:00 | 153 | warm |
| 22:00-23:00 | 55:00-57:30 | 102 | white |
| 23:00-01:00 | 57:30-02:30 | 51 | white |
| 01:00-02:00 | 02:30-05:00 | 102 | white |
| 02:00-03:00 | 05:00-07:30 | 153 | cool (bluish white) |
| 03:00-04:00 | 07:30-10:00 | 204 | cool |

Per real hour: 40 min of full day, 7.5 min of dusk steps, 5 min of deepest night (20%), and 7.5 min of dawn steps. The world is never fully dark outdoors: night is 20% brightness. The server sends the value when it changes (checked once a second) and the client fades to it at 1 unit per second, so each step blends over about 50 s.

**Underground** the client uses world light 0: only creature, item and object light shows. (B11)

**Creature light** = the brightest of: its light-spell level, and every item in its ten slots; colour is mixed per channel. A torch in a bag does nothing. The client always gives the hero a minimum light of 2 (you see your own tile and the 8 around it faintly), even in total darkness.

**Light spells** (level, total duration; the level drops by 1 at even intervals, so the circle shrinks over time; a cast replaces a weaker current light, never a stronger one):

| Spell tier | Start level | Duration | Shrinks every |
|---|---|---|---|
| Basic light | 8 | about 8.5 min | about 63 s |
| Greater light | 8 | about 17 min | about 125 s |
| Strongest light | 9 | about 33 min | about 222 s |

(light colour white; ROTS passes level and duration, and the timer counts one level per duration/level steps of 1 s.)

**Items**: torch 7 -> 6 -> 5 over 20 min (A9), lamps 6 for 50 min, candles 4 for 50 min, wands 2-3 permanent.

**Radius rule (client)**: a level-N source lights tiles up to N-1 away, falling off linearly from full colour at the centre (at level 5 or more) by about 1/5 of full per tile. Overlapping lights take the brighter value, they do not add. (B11)

**What darkness hides**: in 7.7 darkness is **only a picture**. The server still sends every creature on screen; the battle list still lists them with names and health; creature names and bars over heads are dimmed in proportion to the light on their tile. Looking at a dark tile beyond 1 tile is refused by the client. Monsters do not care about light, and nothing in the server checks light for attacks, spells or targeting. The danger of darkness in the era was not seeing the ground (holes, fields, items) and the layout, not invisible monsters.

## 10. Protection zones, logout block, PvP basics

- **Protection zone tiles** (temples, depots, houses): no attacking from or into them (target refused, current target dropped); spells and runes do no harm there; monsters do not enter. [ROTS src/combat.cpp#L428-L435](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/combat.cpp#L428)
- **In-fight / logout block**: 60 s after you attack anything or are attacked by anything (and after any aggressive rune or spell). Logout is refused while it runs, **with no exception inside a PZ** in ROTS; the block simply runs out there since nobody can attack you. The client shows it as the in-fight icon (B7). [ROTS src/player.cpp#L1395-L1437](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/player.cpp#L1395), [src/protocol.cpp#L203-L211](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/protocol.cpp#L203)
- **PZ lock**: attacking a *player* also blocks you from entering a PZ for 60 s; an unjustified kill blocks logout and PZ for 15 min (900 rounds). [ROTS src/combat.cpp#L446-L448](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/combat.cpp#L446), [src/player.cpp#L1775](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/player.cpp#L1775)
- **Closing the client** without logging out leaves the character in the world until the block ends (the connection is dropped after 60 s without a reply to pings). [ROTS src/game.cpp#L4294-L4297](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L4294)
- **Skulls**: attacking an unmarked player marks you (white skull) for 15 min; secure mode on the doll refuses such attacks. Unjustified kills: red skull at 3 per day, 5 per week, 10 per month, lasting 30 days; banishment at 6/10/20. A red skull drops everything on death. NOST [config.lua](https://github.com/Ezzz-dev/Nostalrius/blob/master/config.lua); ROTS sets a month-long red skull at [src/player.cpp#L972-L976](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/player.cpp#L972). PvP damage is halved (round-1 doc).

## 11. Creatures: spawn, respawn, loot

Source: NOST [src/spawn.cpp#L185-L290](https://github.com/Ezzz-dev/Nostalrius/blob/master/src/spawn.cpp#L185), [src/monsters.cpp#L120-L160](https://github.com/Ezzz-dev/Nostalrius/blob/master/src/monsters.cpp#L120). (ROTS has no monster code.)

- Each spawn point has a creature kind, a position and a respawn time in seconds (minimum 1 s). All spawns are filled at server start.
- When the timer is up, the creature appears **only if no player can see the spawn point** (any player whose screen covers it); if one can, the timer **restarts in full**. This is why camping a spawn on screen stops it.
- Long respawns (over 500 s) are shortened by players online: with 200-800 online, interval x 200 / (players/2 + 100); over 800, 40% of the interval; then a random time between half and the full value. Short respawns are exact. (The scaling is the original server's behaviour as reconstructed; not independently confirmed.)
- **Despawn**: a monster more than 50 tiles from its spawn or 2 floors away is removed and its spawn starts counting.
- **Loot**: each loot line has a chance out of 1000. One roll r in 0..1000: the line drops if r < chance; for a stackable line, the count is r mod (max count + 1), so the count is tied to the same roll (and can come out 0, which drops nothing). Loot goes into the corpse. Coins use the same rule. Loot is rolled per line, independently.
- Example of the era's tuning for the weakest creature (a rodent): 20 HP, 5 XP, attack 7 with skill 15, defence 3, armour 1, flees at 5 HP, never switches target, always picks the nearest; loot: a few coins 70% of the time, food 40%, a creature product 50%. NOST [data/monster/rat.xml](https://github.com/Ezzz-dev/Nostalrius/blob/master/data/monster/rat.xml)

## 12. Trading

- **NPC trade by keyword** ([NOST src/behaviourdatabase.cpp#L770-L860](https://github.com/Ezzz-dev/Nostalrius/blob/master/src/behaviourdatabase.cpp#L770)): no trade window in 7.7. You say what you want, optionally with a number ("buy 5 X" or "5 X"); the NPC states the total and asks for yes or no; "yes" completes it if you have the money (taken from your carried coins, with change given) and the capacity, "no" cancels. Selling works the same way in reverse; the NPC checks you carry the items. Amounts are capped at 500 per sentence; stackables are created in stacks of 100. Each NPC has its own buy and sell list and prices.
- **Player-to-player trade** ([ROTS src/game.cpp#L2262-L2470](https://github.com/Emilianenko/RealOTS-Reverse-Engineering-Server/blob/master/src/game.cpp#L2262)):
  - start with "trade with" on one item (a container counts with its contents, at most 100 items in total);
  - both players within 2 tiles, same floor; otherwise the other is told to come closer;
  - the other player gets a message and can answer with one item of their own;
  - both see both offers in the trade window, can look inside, and each accepts;
  - when both have accepted, the items are swapped if both have room and capacity, otherwise both get the reason;
  - any change to an offered item (moved, used, decayed) cancels the trade.

## Lanternfall today versus 7.7

Paths: `E` = packages/game/src/engine.ts, `R` = packages/game/src/rules.ts, `L` = packages/game/src/light.ts, `B` = content/balance.json, `S` = packages/game/src/content-schema.ts, `I` = packages/game/src/ids.ts, `M` = packages/game/src/model.ts. Line numbers as of commit 16728df.

| Mechanic | Lanternfall | Verdict |
|---|---|---|
| Equipment slots | 6: weapon, shield, head, body, feet, pack (`I:8`) | Different: 7.7 has 10 (adds neck, legs, ring, belt); 7.7 hands take any item |
| Light only from worn items | torch shines only in the shield slot (`L:161-170`, `E:243`) | Different: 7.7 any of the 10 slots; a torch in the pack is dark in both |
| Torch | light 6, never burns down, 4 oz (`B` items.torch) | Different: 7.7 is 7 -> 6 -> 5 over 20 min lit, can be put out and relit, burnt stub |
| Light spell | none | Missing (7.7: 8-9 levels, 8-33 min, shrinking) |
| Day length | 40 min cycle, 5 phases (`L:10-18`, `S:36`) | Different: 7.7 is 60 min tied to the real clock, 40 min full day, night at 20% |
| Night outdoors | ambient 1 of 7 (`L:40-48`) | Close: 7.7 night is 51/255 (20%) |
| Underground ambient | 0 (`L:51`) | Same |
| Light combines by max | yes (`L:152-158`) | Same |
| Hero minimum light | none (playtest A3: hero barely visible) | Missing: 7.7 client always gives the hero level 2 |
| Darkness hides creatures | server rule hides or shades them (`L:174-182`, `E:368`, `E:584`) | Different: in 7.7 darkness is visual only; creatures are always listed and targetable. A deliberate Lanternfall design, but a departure |
| Stack limit | 100 (`M:29`) | Same |
| Container nesting | depth limit (playtest D12) | Different: 7.7 has no depth limit, only no self-nesting |
| Container windows | one pack panel, pile window over the world (playtest F9, H5) | Different: 7.7 up to 16 windows stacked in the right column, child replaces parent |
| Pack slots | 16 (`B` items.pack), pouch 6 | Different: 7.7 backpack 20, bag 8 |
| Capacity | 220 + 20/level (`B:7-8`, `R:26`) | Different: 7.7 400 + 10/level (no vocation; ROTS says +5) |
| Item weights | light (cudgel 12, shortsword 16) (`B`) | Different scale: 7.7 low-tier weapons 20-40 oz, backpack 18 oz |
| Weight checks | recursive, only from outside (`E:97`, `E:147`) | Same |
| Tile item limit | 20 (`B` world.tileItemLimit) | Different: 7.7 server 1000, client shows 10 |
| Stack order on a tile | newest on top (`E:89`) | Same |
| Throw | Chebyshev 7, same floor, line of sight (`E:161-162`) | Close: 7.7 screen-wide, line not crossing unthrowable tiles, may throw down floors |
| Pick up from a distance | must be adjacent (playtest H3) | Different: 7.7 auto-walks then moves |
| Corpse stages | 300/300/60 s, hero 600/600/300 (`B` world.corpseStages) | Different: 7.7 data 20-30 min per stage |
| Corpse capacity | 12 (`E:75`) | Different: 7.7 5-15 by creature size |
| Corpse ownership | owner check (`E:82`), `lootProtectSec` 0 | Same in effect (0 s); 7.7 has none |
| Putting things into a corpse | refused (`E:130`) | Different: 7.7 corpses are ordinary containers |
| Look text | name, stats, weight always (`E:700-705`) | Different: 7.7 shows weight and description only when adjacent |
| Food cap | 1200 s (`B` world.foodCapSec, `E:465`) | Same (7.7 allows reaching exactly 1200) |
| Regeneration | 1 HP, 2 mana per 6 s while fed (`B` regenHp/regenMana, `E:579`) | Close: no-vocation mana is 1 per 6 s in NOST |
| Step time | ground x 1000 / speed, x3 diagonal, 50 ms rounding (`R:37-41`) | Same |
| Hero speed | 218 + 2L (`B`, `R:42`) | Same (= 220 + 2(L-1)) |
| Creature speed | ms per step (`R:44-48`) | Different: 7.7 creatures use the same speed formula |
| Pushing | none (playtest A6) | Missing |
| Melee formula | 7.6/7.7 formula, triangular roll, modes (`E:620-626`) | Same |
| Armour roll | [a/2, 2(a/2)-1], small armour 0..a (`E:710`) | Same for a >= 2; ROTS adds a base 5 for players |
| Two defences per 2 s | `blocksPerTurn` 2 (`B`) | Same |
| Weapon defence without shield | weapon defence rolled (round-3 fix) | Disputed: ROTS uses flat value, NOST rolls |
| Attack speed | 2000 ms (`B` attackMs) | Same |
| "Miss" on melee | effect `miss` when 0 (`E:631`) | Different: 7.7 shows block or armour, never miss |
| Incoming damage line | none in the log (playtest E5) | Missing: 7.7 tells you every HP loss and its source |
| Target drop range | on screen (`E:735`) | Close: 7.7 drops at more than 8 tiles |
| Spell exhaustion | per spell 1.5-2 s (`B` spells) | Close: 7.7 1 s heal, 2 s attack, runes share the timer |
| Magic power | base + L x perLevel + ML x perMagic (`E` cast) | Different: 7.7 (base +- var) x (2L + 3ML) / 100 |
| Chat range | 9 tiles round (`E:323`) | Different: 7.7 say = screen (+-7 x +-5); whisper and yell missing |
| NPC hearing | within 3, line of sight (`E:317`) | Same range; 7.7 also has focus, busy queue, 60 s timeout |
| NPC keywords | substring (`E` talk) | Same as 7.7 (substrings by default), playtest E2 is era-faithful |
| NPC trade | trade window chips (playtest D5, D7) | Different: 7.7 trades by sentence with amount and yes/no |
| Player trade | none | Missing |
| In-fight block | 60 s (`B` fightLockSec), logout allowed in PZ (`E:411`) | Close: ROTS has no PZ exception |
| PZ | no attack from or into, monsters stay out (`E:368`, `E:738`) | Same |
| XP share | by damage share (`E:543`) | Same |
| Death loss | 10% XP and skills, pack always, 10% per slot (`B`, `E:557-560`) | Same |
| Respawn blocking | a player within 7 tiles blocks (`E:719`) | Close: 7.7 blocks if the spawn is on any player's screen, and restarts the full timer |
| Respawn time | 45 s x 0.5-1.0 (`B` respawnMs, `E:658-661`) | Different scale: 7.7 per spawn, typically minutes |
| Loot | independent chance per line (`E:541`) | Same idea; 7.7 ties stack count to the same roll |
| Lure limit | 50 tiles (`B` world.lureLimit) | Same |
| Hotkeys | 1-7 bar, items and spells (playtest H9) | Different: 7.7 36 text-only hotkeys; item hotkeys came in 7.8 |
| Mouse | left does everything (playtest A5) | Different: 7.7 left walk/drag; right menu (default) or use/attack (classic) |

## Could not confirm

- The server **beat** value that 7.7 shipped with (step times are rounded to it; 50 ms is assumed from earlier research).
- Whether corpse stage times were really 20-30 min each in play, as the item data says.
- The 10-items-per-tile client limit (well known, not found in the code I read).
- Which version introduced corpse loot protection and loot messages (after 7.7, version unknown).
- No-vocation capacity per level (+10 in NOST, +5 in ROTS) and the base armour 5 that ROTS gives players.
- Weapon defence without a shield: flat (ROTS) or rolled with the weapon skill (NOST).
- Whether logout inside a PZ was allowed while in fight (ROTS says no).
- How fluids interacted with the spell exhaustion timer.
- Spawn interval scaling by players online (only in NOST).
- Soul point regeneration conditions; shovel hole closing time.
- The exact text of most server messages (deliberately not copied).
