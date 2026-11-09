# Thais browser game — current brief

Updated 2026-11-09 after the user's corrections. This file supersedes the assumptions in the preserved round-1 reports and abandoned C++ cross-check.

## What the user wants

Build a new project at `/Users/kubawiszniewski/Personal/game`: the Tibia 7.6 play experience, starting with the **Thais map**, in a new 2.5D pixel-art style. Runnable in a browser and convertible to a Windows/macOS application.

The user clarified that **backbone means in-game interactions and difficulty, plus Thais**. It does not mean a legacy server engine, a transport layer, or an infrastructure project.

Hard constraints:

- **No C++. Use something modern.** Default to TypeScript for browser and gameplay code. Compare an existing modern TS RPG engine versus a small custom TS simulation with reusable libraries. Do not revive C++ classic servers, legacy TCP proxies, RSA/XTEA compatibility, or native 7.x client support.
- Prioritize playable interactions and difficulty: deliberate tile movement, blocking and positioning; inspect/use/open; inventory, nested containers and loot; NPC chat/trade; combat and enemy pursuit; health/mana/resources; skills/XP/progression; danger and death; save/reconnect. Scope a small coherent subset first, not a claim of a full MMORPG.
- **Thais is required from the start.** Research a concrete map-data route (community OTBM/JSON sources and a TS importer, or a faithful authored layout based on map reference). A random village or generic development fixture does not satisfy the request. Separate source era/differences from exact-7.6 claims, but do not turn map uncertainty into months of preliminary process.
- Keep source/license checks concise and practical. Retain applicable open-source notices and avoid known commercial-source leaks. No broad legal audit, lawyer prerequisite, blanket claim all names/data are tainted, or stop-work gate for ordinary development. Updating graphics does not automatically change rights, but this is not the focus of this project phase.
- Reuse code when it actually saves gameplay work. Do not confuse a multiplayer framework with implemented combat, NPCs or inventory. Evaluate actual modules and rendering coupling before recommending a whole engine fork.
- Browser-first, desktop later via one chosen wrapper. Rust can be a wrapper/tool if useful; a Rust/WASM gameplay rewrite needs a concrete benefit. No dual simulation implementations.

## Reference art

Image: `/Users/kubawiszniewski/.t3/userdata/attachments/d5b26058-b698-4c01-97dc-f6116fb0d494-f897ae7b-01f0-4db2-8b3a-cf77d249e75d.png`

Visible qualities: steep elevated view, chunky but detailed pixel silhouettes, fine textured ground, actual depth/occlusion, layered foliage, long directional shadows, warm golden light against cool blue/green shade, restrained haze and readable figures. Translate into a medieval Thais. The modern props are not requested. The image does not prove an engine or exact projection. Applying pixelation to generic cubes is insufficient.

Candidate direction: Three.js/WebGL2, orthographic 3D scene with textured low-poly geometry, stable low-resolution rendering and nearest upscale, separate readable interface. Choose one actor pipeline after one small readability experiment.

## Gameplay and difficulty acceptance

Define a playable loop inside Thais: temple/respawn → town/NPC supplies → a specific sewer or bounded encounter route → attack/retreat/heal → corpse/container loot → equip/sell/store → save/reconnect. Include movement, stairs/floors/roof visibility and authoritative item ownership. Keep city and connected starter underground areas explicit; do not expand to the whole Tibia world.

Difficulty must have concrete tunable rules and checks. Record initial player level/equipment, enemies, combat cadence/damage ranges, attack/defense/skills, movement and aggro, healing/food/resource cost, XP/loot rates and death consequences. Values may begin as clearly labelled 7.6-inspired approximations. Do not invent exact historical formulas. Do not add level scaling, generous auto-healing or modern convenience changes that erase deliberate old-school risk without a reason.

For the first slice, choose a minimal vocation/enemy/item/NPC set and explicit exclusions. Modern implementation does not mean modernizing the requested difficulty away.

## Council sequence and access

All four planning phases are complete: (1) research and proposed plans, (2) cross-check, (3) revised plans using both, (4) one final build plan. Round 2's C++ direction was superseded by the user and its cross-check restarted under these constraints. The result is `docs/BUILD-PLAN.md`; raw reports are historical proposals. No game implementation is implied by completed planning.

Members remain Opus 5.5 medium, Sol 6.1 xhigh, Terra 6.1 max/priority. Fresh read-only tasks per phase. No implementation or performance result is implied by the plans.

Opus only receives a scoped public OpenTibia/modern tile-RPG source/mechanics research task. It does not receive this file, target-map identity, screenshot or recreation intent. Sol and Terra receive full context. No further subdelegation.

Modern research leads (unselected, verify current APIs/source):

- https://github.com/RSamaium/RPG-JS — TypeScript RPG/MMORPG engine with gameplay systems; investigate Three.js renderer replacement cost and current v5 versus older documentation.
- https://github.com/Kaetram/Kaetram-Open — TypeScript MMORPG lead; verify repository availability, exact license and gameplay/server coupling. Do not infer rights or current functionality from a fork's README.
- https://github.com/colyseus/colyseus and https://docs.colyseus.io/ — authoritative state synchronization/framework; not ready-made Tibia mechanics.
- https://github.com/bradleyworkman/Tibia-7.1-map — a concrete older community map lead; investigate real file format/Thais coverage and era gaps, do not pretend 7.1 is 7.6.
- https://github.com/tibiamaps/tibia-map-data — contemporary minimap/pathfinding data; not equivalent to a playable OTBM map with floors/item stacks/NPCs.
- https://github.com/edubart/otclient — MIT native client source may document interactions; not the implementation language or legacy protocol target.

Keep proposals focused on getting a recognizable, playable Thais slice with satisfying interactions and appropriate risk. Name the smallest first implementation tasks and observable acceptance checks.
