# Build-plan direction for round 3

Superseded round-3 planning input. Follow BUILD-PLAN.md for the final plan. This draft is retained only as council context and is not an implementation result.

## Product

A browser-playable Thais with deliberate Tibia-7.6-style interactions and difficulty, presented with original 2.5D pixel art inspired by the supplied reference. One modern TypeScript simulation and Three.js renderer. First scope: city streets/landmarks, selected temple/depot/shop interiors and a connected starter sewer circuit. Full wider world is excluded.

## Selected stack

TypeScript strict, Vite, Three.js/WebGL2, a supported Node LTS server, Colyseus synchronization, SQLite persistence. Electron later packages the same client and connects to the same server. Rust and C++ are not game implementation languages. Version pins and lockfiles get chosen when implementation starts; upstream documentation version claims are not compatibility proof.

## Proposed simple repository

```
apps/client/          # Three.js world + HTML/CSS interaction panels
apps/server/          # one town room, command validation, SQLite saves
packages/game/        # world/rules/items/creatures, no rendering or DB imports
content/thais/        # cropped topology, interactions, spawns, semantic assets
tools/import-map/    # offline OTBM + item catalog + XML -> versioned JSON
assets/              # original geometry, textures, actor animations
docs/                # current plan and council evidence
```

Prefer ordinary npm workspaces and small dependencies. No generic plugin framework, event-sourcing platform, microservices, public cloud deployment, or unrelated tooling.

## Build in playable increments

1. Import Thais topology and source catalog; expose an in-game map/debug overlay. Walk temple → shop → depot → verified sewer entrance with correct collisions/floors. Add one actor, roof hiding, camera and pixel rendering during this stage.
2. One complete trip: NPC supplies, rat encounter, target combat/retreat, corpse/container loot, equip/sell/store. Server owns authoritative action outcomes. Expand to one genuinely risky enemy/pull once the basic loop works.
3. Add coherent food/healing/resource economy, normal XP/skills, death/corpse recovery and transactionally saved character/items. Validate restart, duplicate claims and disconnect during combat before treating progress as reliable.
4. Apply the reference art treatment to the reusable city kit, expand city interactions only within scope, and fix identified 7.6 layout/rule gaps. Validate desktop packaging with the same game.

Each increment must be an executable game state, not just a completed subsystem. Acceptance is observed in the browser and a few high-value state-transition scenarios. First output is a working Thais walk/interaction build; the whole scope is not promised in one scaffold.

## Round-3 deliverable

Provide a revised implementation plan using both prior rounds and the user's clarifications. Resolve map/catalog ingestion, difficulty baseline, transaction/authority boundary and interaction scope. Give concrete first tasks and exit checks. Keep license notes short; do not reopen decided language/legacy-protocol topics. Flag meaningful remaining disagreements for round 4.
