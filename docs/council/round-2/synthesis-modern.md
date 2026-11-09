# Completed cross-check — current modern direction

All three modern-revision reports are complete. The earlier C++ pass was abandoned after user steering and does not define the plan.

## Decisions to carry into round 3

1. TypeScript owns gameplay. Three.js/WebGL2 owns presentation. Colyseus handles room/session/state synchronization, not RPG rules. SQLite is the first authoritative persistence store. Electron is the selected later desktop wrapper; do not maintain competing wrappers. No C++, native 7.x protocol, raw TCP proxy, or Rust gameplay layer.
2. Write a small, purpose-built gameplay domain instead of extracting an entire RPGJS/Kaetram engine. Cross-check found concrete coupling: RPGJS's pixel physics/action combat, flat inventory and Pixi/CanvasEngine; Kaetram's 2D floors, protocol-emitting domain objects and MongoDB assumptions. Use small libraries where useful; do not copy code merely to claim reuse.
3. 'Backbone' means interactions and difficulty. First playable uses recognizable Thais, not a random fixture. Render and walk there early, then extend one real hunt/loot/trade/recovery loop. Reject a schedule that implements ten invisible systems before any usable game.
4. Actual map baseline: `bradleyworkman/Tibia-7.1-map` at `783c717ccf50987d18f9c06763c2c427c83d7345`, `Tibia71.otbm` plus spawn/house XML. Sol inspected the binary: version 0, 48,421,761 bytes, item major/minor 1/1; town 2 temple `(32369,32241,7)`. Proposed initial crop x 32250–32420 and y 32090–32310, with upper floors and selected connected sewer area. These are source-inspection findings, not a proven traversable game map.
5. Import using a small TypeScript tool based on `V0RT4C/ot-otbm`, explicitly checking version 0 and subtype handling. RME `data/740/items.otb` is a catalog lead with matching version fields, not automatic semantic compatibility. Preserve source item IDs, tile stacks, metadata, floors and destinations. Map them to gameplay definitions and original visuals; do not require Tibia SPR/DAT in the runtime.
6. The candidate is a 7.1 reconstruction in a 7.4 format, not exact 7.6. Patch slice-relevant layout differences pragmatically and record them. Minimap PNGs provide orientation, not containers, doors or floor links. Verify actual city/temple/depot/shop/sewer connections; do not guess the grate from spawn proximity.
7. Initial art: stylized rigged low-poly 3D actors, hand-painted pixel textures, orthographic camera, stable low-resolution render, warm light/cool shade, long shadows and floor/roof cutaways. Test in motion, not just a screenshot.

## Issues round 3 must resolve

- **Difficulty conflicts:** Terra proposed 100 HP, 100 XP to first level and 40 hits per skill. Sol proposed 185 HP/35 mana for level 8 and different combat/death rules. Neither report demonstrated historical formulas. Do not combine these incompatible defaults. Favor one coherent old-school baseline and normal progression; fast debug progression must be separate. A rat should be a trivial/learning enemy for a competent level-8 knight, not artificially dangerous just to manufacture difficulty. A harder creature/overpull should create actual risk.
- **Don't invent fidelity:** label provisional rates/formulas. Rat/cave-rat/rotworm HP/XP are candidate templates, not a whole verified 7.6 ruleset. Specify one baseline, resource costs, a meaningful but recoverable death consequence, and playtest scenarios that can falsify the tuning.
- **Map catalog gap:** decide how OTB attributes yield blocking, ground speed, stack/count/fluid semantics and source-ID translations. Distinguish unknown art (placeholder okay) from unknown behavior (must be resolved on active routes). Missing metadata must not silently open walls.
- **Transactional state:** design how live simulation mutations, SQLite commits, inventory transfers, death/corpse ownership and expiry remain consistent. A database transaction existing somewhere does not prove no duplication on crash.
- **Early vertical slice:** make each stage playable: map/walk/floors first; one monster/loot/NPC next; then resource/progression/death/save. Add server authority early enough that transport does not require a second simulation.
- **Interaction UI:** explicitly support inspect/use, target, timed click/keyboard walking, chat focus, opening containers, moving/splitting stacks, equip/trade/depot and floor-aware picking. Avoid turning old-school interaction into a generic action RPG.
- **Scope:** one knight; a small creature/item set; selected NPC roles and sewer circuit. Thais city footprint is first, but full housing/quests/PvP/boat travel/world expansion are later. Define what 'Thais playable' actually includes.

## Evidence and limits

Raw reports link inspected sources. Coordinator verified the map repository README and parser documentation. No source build, import execution, running game, performance test or desktop package was produced during these research rounds. Source/license bookkeeping stays short as requested.
