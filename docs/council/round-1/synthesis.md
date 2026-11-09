# Round 1 synthesis and round-2 correction

All three members completed independent research. Original reports are retained verbatim in this directory; their recommendations are not automatically accepted.

## Useful convergence

Browser rendering in TypeScript/Three.js is credible; gameplay and render topology must remain separate; WebSockets need a bridge or adapted transport for classic TCP servers; 7.6 gameplay is not the same requirement as native 7.6-client interoperability. A playable loop and two-client server authority are better first proof than a large decorative map. The reference calls for authored textures, lighting, silhouette and stable movement, not merely a pixel shader.

## Initial differences

Sol prefers Electron first; Terra prefers Tauri. Sol favors 3D actors with a sprite comparison, while Terra starts with directional sprites. Both initially recommended independent TypeScript simulation. Opus identified an existing classic C++ engine (Nekiro TFS 1.5 downgrade, branch 7.72) as the leading reuse option, plus MIT browser-client leads. Exact compatibility and buildability were not tested.

## User correction

The user rejected the amount of licensing attention and wants an existing backbone because much will change. The initial coordinator brief over-constrained the discussion and made a new simulation seem necessary. Rounds 2–4 must actively revisit engine reuse. Source checks will stay short and factual; retain notices and exclude known commercial leaks, without making legal review a broad development gate.

## Round 2 questions

1. Which existing classic server can provide movement, containers, combat, loot, NPCs and persistence soonest? Inspect source/build configs and name missing pieces. Do not claim a build was run.
2. Compare a fixed-target WebSocket↔TCP proxy carrying native frames with a semantic gateway/new server transport. Choose the smallest route that preserves mature server logic.
3. Can an existing MIT browser-client protocol/state layer be separated from its renderer and asset loading? Name concrete integration points and blockers.
4. Quantify (as task lists and dependencies, not invented times) what an independent simulation would have to rebuild. Is it actually the fastest backbone?
5. Resolve first wrapper and actor pipeline with one small experiment each; avoid maintaining competing production stacks.
6. Define a first runnable server/browser map slice before full Thais/art expansion, and explicitly track protocol-era and map-version differences.
7. Correct overconfident license/provenance statements from round 1. A source license is useful evidence; a blanket assertion that all data or names are tainted is not.

Opus remains a scoped OpenTibia-source/reuse researcher. It will receive only source, protocol, buildability and generic integration extracts, without the full project intent, target map, or screenshot.
