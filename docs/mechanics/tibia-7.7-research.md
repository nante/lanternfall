# Tibia 7.7 mechanics: research from GitHub sources

Status: in progress. Sections are filled in order A, B, then 1-12, then the comparison table.

Scope: rules, numbers and client behaviour of the 7.7 era (mid-2006), studied from open reimplementations and documentation on GitHub. Described in our own words. No code, data, names, maps, sprites or text from those projects is copied here or into the repo. Lanternfall stays its own world.

Earlier work this extends: `docs/mechanics/round-1..3/*.md` (7.6 movement, melee, defence, death, regen, skills, PZ, already adopted in `content/balance.json`), and `docs/PLAYTEST-2026-11-10.md` (what Lanternfall gets wrong today).

## Sources

(filled below)

## A. Items and inventory

(pending)

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
- **Look** sends only position, item type and stack index; the server writes the sentence, which comes back as a green info message (B8). Looking at a tile with zero light that is not adjacent to you is answered by the client itself with a "you can't see anything" line, no server round trip. [P/src/MapWindow.cpp#L286](https://github.com/Coldensjo/Patella/blob/main/src/MapWindow.cpp#L286)
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
  - status lines ("you are exhausted", "there is no way", "you cannot carry more"): bottom centre, white, 5 s; most also go to the console, one type is bar-only.
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
- E5: combat produces no console lines in 7.7 either (damage is floating numbers only); only the server's own lines (look, "you are exhausted", advances) reach the console. Loot-of-corpse console lines are a later addition as far as I could tell (not confirmed).
- A1/H8: speech boxes over heads with the timing above, private tabs, `*name*` addressing.
