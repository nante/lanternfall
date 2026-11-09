# Round 3 synthesis — decisions for the final phase

All three members agree on the modern TypeScript domain, Three.js renderer, Colyseus synchronization, SQLite and early playable increments. The full reports remain proposals/evidence; this synthesis resolves their differences.

## Locked for the final plan

- No C++ or legacy protocol. One TypeScript rules implementation; no engine extraction or duplicate offline/online simulations. Electron is the later desktop client wrapper.
- First playable is imported Thais: temple, Sam/Frodo/Xodet, personal depot and connected sewer circuit. City exteriors and five selected interiors; one knight, twelve portable item types, six rats/two cave rats/two rotworms. PvP, housing, boats, crafting and broad quest/vocation/world expansion are outside the first build.
- Use the pinned 7.1 reconstruction as a concrete starting topology, with a versioned overlay for slice-relevant era differences. Do not call it an exact 7.6 map. Source inspection now identifies depot `(32341,32225,7)`, grate `(32370,32213,7)` over ladder1386, and a connected underground route toward grate `(32339,32183,7)`. Sol's conditional flood-fill found926 cells, not an observed gameplay traversal.
- Source rotworms are outside this connected sewer. Two in-circuit rotworms at proposed source rat tiles `(32351,32189,8)` and `(32338,32189,8)` are an explicit authored v0 encounter overlay, not claimed historical spawns.
- Load the matching OTB catalog BEFORE decoding version0 OTBM item/count/subtype fields. Preserve raw source data and map IDs to semantic definitions/new art. Unknown behavior must be resolved on the route; unknown art may use placeholders. Do not open blocked tiles by guessing.
- Initial 3D actors and modular textured city kit, orthographic low-resolution rendering with stable pixels, readable unpixelated UI, warm directional/cool ambient lighting. Art quality gets checked during movement.
- Difficulty starts from Sol's coherent baseline: level8,185HP/35mana,skills20,attack10/defense8/armor4; 2s attack cadence and normal cubic XP (4200→6400). Keep difficulty data separate and provisional. Use cheap slow food, expensive emergency fluid, no level scaling and a genuinely riskier two-rotworm pull. Do not make rats unusually lethal or use debug-fast XP as normal progression.
- Death removes5%totalXP (level loss possible), drops carried backpack/contents/currency, retains worn combat gear for recovery. Choose deterministic prototype loss over random per-item loss and over Terra's XP-debt alternative. Corpse ownership2min, expiry15min wallclock including downtime. Combat disconnect lock60s. These are v0 simplifications, not verified historical formulas.
- SQLite: use staged dynamic-state updates with one room/writer. Commit the consistent dynamic state, revision and durable action receipts before publishing critical outcomes. Static terrain is excluded. Pin one small exact strategy in the candidate plan; don't promise sub-ms commits or rely on in-memory sequence numbers after restart.

## Rejected scope growth and unsupported claims

No ranged combat/archer, rings, DCO/SBOM/legal audit or second map editor in the first loop. No generic map in place of Thais. No claims of tested packet/runtime/performance behavior. Use current pinned Colyseus APIs rather than the scoped report's unverified0.16 reference. A client displays only its permitted views; don't expose adjacent floors merely by a fixed z±1 rule.

## Planning versus execution

Map/catalog/flood-fill facts are read-only source/data inspection. Combat budgets are analytical estimates, not played/measured outcomes. No importer, game, server or Electron build has run. Final-phase checks should make this plan implementable and internally consistent without reopening the user's settled scope.
