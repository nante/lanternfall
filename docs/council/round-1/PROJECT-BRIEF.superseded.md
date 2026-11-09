# Browser-first Thais project — planning brief

Date: 2026-11-09. This is a new project at `/Users/kubawiszniewski/Personal/game`.

## User correction after round 1 — takes precedence

The user explicitly said to stop spending so much effort on licensing, because most content will change, and to get a backbone in place. The coordinator's initial brief over-weighted provenance and steered the council toward an unnecessary full rewrite. Correct that in rounds 2–4:

- Prioritize reusing a functioning OpenTibia server and its mature gameplay systems, with a custom browser renderer and an incremental route to the target experience.
- Compare the real cost of C++ classic-server reuse, a WebSocket/native protocol bridge, item-identity mapping, and an independent TypeScript simulation. Do not default to reimplementing every RPG system.
- Limit source checks to a short, practical check of the chosen upstream license and known leaked commercial-source ancestry; preserve required notices. Do not create a broad licensing audit, legal-review prerequisite, SBOM bureaucracy, or a stop-work gate for all development.
- Separate unknown provenance from proven infringement. Do not blanket-label names, stats, every data file, or all classic-server distributions as tainted without file-level evidence.
- The requested destination remains 7.6-style gameplay in Thais. New art will replace the old treatment. A small development fixture can prove the backbone, but do not quietly ship it as the complete Thais map.
- Deliver a concrete plan to boot a server, connect browser players, walk on a map, interact/fight/loot/save using existing mechanics, and replace graphics through a separate renderer. Fix fidelity gaps after this backbone exists.
- This correction supersedes any earlier suggestion to stop engineering pending legal review. Do not claim changing graphics automatically grants rights, but do not let speculative rights questions dominate the build plan.

## User goal

Rebuild the Tibia 7.6 play experience with new pixel-art, 2.5D graphics. Scope the world to Thais for now. It must run in a browser, with a credible route to a Windows PC and macOS desktop app. Choose the stack based on the actual requirements, including TypeScript versus Rust. This phase is planning, not a claim of a finished game.

Reference image (local, inspect it):
`/Users/kubawiszniewski/.t3/userdata/attachments/d5b26058-b698-4c01-97dc-f6116fb0d494-f897ae7b-01f0-4db2-8b3a-cf77d249e75d.png`

Visible direction: elevated, near-orthographic camera; chunky, stable pixel silhouettes; textured ground; real depth and occlusion; long directional shadows; cool blue/green shade against warm golden highlights; restrained atmospheric haze; detailed vegetation and readable figures. Translate this treatment into a medieval town. Do not assume the screenshot proves a particular engine, exact projection, or asset workflow. The modern props in the image are not part of the game brief.

## Scope and uncertainties to resolve

- Distinguish recreating 7.6 gameplay from speaking the legacy 7.6 protocol. Browser raw TCP is unavailable; do not silently assume an old native client runs in a browser.
- Thais is the requested map target, not the full world. Determine whether there is a verifiably licensed Thais map. Server code licenses do not establish rights to world data, sprites, sounds, dialogue, or leaked commercial source.
- Do not download or run untrusted old server executables or source distributions. Research source licenses and dependency health using primary sources.
- Prefer a small, playable vertical slice with a realistic route to multiplayer and persistence, rather than claiming a full MMORPG can be rebuilt immediately.
- Define initial boundaries, floors/roofs/stairs, input, collision/pathfinding, NPC interaction, combat/loot/inventory, death, saving, and the first repeatable gameplay loop. Separate required first-slice behavior from later fidelity work.
- State assumptions about single-player/local preview and authoritative multiplayer. Do not silently replace an online RPG with only an offline scene.
- Evaluate true 3D low-resolution rendering versus flat sprites. Match the supplied image rather than merely applying a pixelation shader to generic geometry.
- Evaluate TypeScript + Three.js (or alternatives), a reusable simulation/server boundary, and Tauri/Electron desktop packaging. Rust is an option, not a requirement. Avoid building two simulations without a clear need.
- Use focused verification of behavior and rendering. No blanket unit-test targets, needless frameworks, speculative infrastructure, deployment, or account setup.

## Council process

Four explicit rounds:
1. Independent research and proposed plans.
2. Cross-check the proposals and evidence; name objections and agreements.
3. Revised planning incorporating both rounds.
4. A final concrete build plan, with choices, dependencies, acceptance checks, unresolved gates, and the first implementation tasks.

Members: Claude Opus 5.5 medium (scoped legal OpenTibia-source research only); GPT Sol 6.1 xhigh; GPT Terra 6.1 max, priority service. Each round uses fresh, read-only delegate tasks. The coordinator records results and resolves disagreements. This is planning, not a scored code review; do not fabricate review scores.

## Initial verified leads (not a reuse approval)

- TFS official repository: https://github.com/otland/forgottenserver ; source headers identify GPL-2.0. Releases describe v1.6 as protocol 13.10, not 7.6: https://github.com/otland/forgottenserver/releases . Verify exact license and version before reuse.
- Original OTClient code license is MIT: https://github.com/edubart/otclient/blob/master/LICENSE . Its README says users supply their own SPR/DAT files: https://github.com/edubart/otclient . The code license does not license those files.
- A 7.6-specific research lead: https://github.com/Ezzz-dev/OTSharp . README advertises 7.6 and a limited feature list; GitHub reports GPL-2.0. This does not establish completeness, buildability, or asset rights.
- Archived OTServ explicitly targets 8.7 and is not a drop-in 7.6 choice: https://github.com/opentibia/server .
- Three.js supports orthographic cameras and render targets: https://threejs.org/docs/pages/OrthographicCamera.html ; https://threejs.org/manual/pages/rendertargets.html . These are building blocks, not proof of visual quality or performance.
- Tauri uses system webviews, including WKWebView on macOS and WebView2 on Windows, so both paths need validation: https://v2.tauri.app/reference/webview-versions/ .

All research must distinguish repository statements, inspected source evidence, inferences, and unverified assumptions. Link evidence. Do not let public availability stand in for a license.
