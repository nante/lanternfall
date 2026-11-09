# Terra 6.1 — round 1

Configuration: max reasoning, priority service. Read-only independent research and planning.

## Recommendation

Build a **TypeScript browser client with Three.js and a TypeScript authoritative server**, using one shared simulation implementation. Package the same client for Windows and macOS with Tauri after testing both webviews. Start with a small multiplayer-capable vertical slice; expand toward Thais and 7.6 fidelity only as the necessary map rights and historical evidence are established.

**The central gate is the map.** I did not find a verifiably licensed 7.6 Thais map in the sources reviewed. A test scene can prove rendering and gameplay, but it cannot satisfy the requested Thais setting. Do not import, recreate for distribution, or represent a Thais map as cleared until its provenance and intended use have been reviewed. This is a research finding, not a legal certification.

## Stack and reuse

| Option | Assessment |
|---|---|
| **TypeScript + Three.js** | Recommended. One language supports the browser client, game rules, and Node server. Three.js provides an [orthographic camera](https://threejs.org/docs/pages/OrthographicCamera.html), depth-tested 3D, and [render targets](https://threejs.org/manual/pages/rendertargets.html). Its current WebGL renderer requires [WebGL 2](https://threejs.org/docs/pages/WebGLRenderer.html). |
| **Rust + Bevy** | Credible if the team prefers Rust or later profiling identifies a bottleneck. Bevy supports browser WASM rendering as well as native targets, but a web deployment still needs browser-specific integration and performance testing. Rust does not solve the art or rights problems. [Bevy web rendering](https://bevy.org/news/bevy-webgpu/). |
| **Godot** | Viable editor-centric alternative with web and desktop exports. Its web export uses WebAssembly and WebGL 2; Godot 4 C# projects cannot currently export to web, and threaded exports have additional hosting requirements. [Godot web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html). |
| **PixiJS** | Strong for a sprite-led 2D game, but matching the reference’s architectural depth, vegetation, and shadows would require more custom layering and lighting. [PixiJS renderers](https://pixijs.com/guides/components/renderers/). |

Tauri is the first desktop candidate: it uses **WebView2 on Windows and WKWebView on macOS**, so the same client must be tested in both, especially for WebGL and input. Electron embeds Chromium and is a fallback if consistent rendering proves more valuable than its larger packaged runtime. [Tauri webviews](https://v2.tauri.app/reference/webview-versions/), [Electron](https://www.electronjs.org/docs/latest/).

For the simulation, I recommend **independent implementation first**, driven by documented behavioral fixtures. This avoids committing the new architecture to a legacy server before its fidelity and provenance are known, but it requires substantial game-rules work.

Licensed OpenTibia code remains a possible alternative:

- [The Forgotten Server](https://github.com/otland/forgottenserver) has substantial C++ server machinery; its source headers identify GPL-2.0, while its v1.6 release identifies protocol **13.10**, not 7.6. Adapting it would still require a browser transport, a 7.6 rules audit, and license compliance. [Source header](https://github.com/otland/forgottenserver/blob/master/src/server.h), [releases](https://github.com/otland/forgottenserver/releases).
- [OTSharp](https://github.com/Ezzz-dev/OTSharp) describes itself as a 7.6 C# server, but its published feature list is limited. One inspected source file specifies GPL version 2 or later; completeness, security, buildability, and rights to any accompanying data remain unverified. [Source file](https://github.com/Ezzz-dev/OTSharp/blob/master/GameServer/Protocol/ProtocolGame.cs).
- Original [OTClient code is MIT-licensed](https://github.com/edubart/otclient/blob/master/LICENSE), with notice requirements. Its README says users must supply SPR/DAT files separately; the code license does not establish rights to those files. [OTClient README](https://github.com/edubart/otclient).

GPL reuse needs review of the exact files, dependencies, modifications, and distribution model. Distribution obligations and network-only operation are distinct questions; do not assume either that a server’s license automatically covers the client or that packaging a modified server creates no obligations. [GPLv2 text](https://github.com/otland/forgottenserver/blob/master/LICENSE), [GNU license FAQ](https://www.gnu.org/licenses/gpl-faq.en.html).

## Fidelity, protocol, and rights

**Gameplay fidelity is the initial target; legacy protocol compatibility is a separate, deferred feature.** A browser uses a WebSocket API rather than opening the old client’s raw TCP connection. The new client can speak a versioned WebSocket protocol to the authoritative server. If legacy-client interoperability becomes a requirement, specify and test a separate protocol adapter or gateway. [MDN WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API).

“7.6” needs an evidence ledger, not a label applied to plausible rules. CipSoft’s [December 2005 update](https://www.tibia.com/news/?id=355&subtopic=newsarchive) confirms, for example, a magic rebalance and the introduction of wands and rods. It does **not** establish all combat formulas, cooldowns, floor visibility, NPC dialogue, or death penalties. Record each slice rule with its source, expected behavior, and confidence; mark provisional values as such. Obtain a lawful historical reference or other reliable primary evidence for comparison before claiming exact fidelity.

Treat map layout, names, sprites, sounds, text, and server code as **separate rights questions**. Keep a provenance record for each imported or commissioned asset. Public availability, an OpenTibia server license, or an artist’s new visual treatment does not itself establish permission for a recognizable Thais reconstruction. The official [Tibia legal-documents index](https://www.tibia.com/support/?page=view&subtopic=legaldocuments) was inaccessible to the research tool, so its current terms were not verified here. A rights-holder permission or appropriately qualified legal review is a gate for a distributable Thais build.

## Visual and asset pipeline

The supplied reference shows a steep, elevated view with **fine textured ground, chunky silhouettes, layered foliage, deep cool shadows, warm highlights, and long directional shadows**. It does not prove a particular engine or projection. The medieval treatment should preserve those qualities without importing its modern vehicles or props.

1. **Art test:** commission or create a small original street, wall, tree, character, and two-floor building. Author deliberately shaped low-poly meshes with hand-painted pixel textures; use layered, alpha-cutout cards for fine foliage and directional character sprites. Avoid cube-built voxel terrain.
2. **World representation:** keep gameplay tiles and floors separate from render meshes. Export buildings and terrain as glTF, texture atlases as PNG, and per-object metadata for tile footprint, pivot, floor, occluder group, and collision. Author reusable wall, roof, ground, and vegetation pieces with coherent texel density.
3. **Rendering:** use a fixed elevated orthographic camera initially; tune angle and framing against the image. Render the world into a low-resolution target—start testing at approximately **640×360**, not as a fixed final specification—and upscale with nearest-neighbor filtering and integer scaling where feasible. Keep interface text at display resolution. Align camera movement to the render pixel grid and check character movement for jitter.
4. **Depth and lighting:** use geometry and depth testing for walls, roofs, and terrain; place characters at their tile foot position with consistent depth. Prefer cutout foliage over blended transparency where it works, because overlapping transparent objects have sorting limitations. Prototype long warm directional light, cool ambient shade, subtle haze, baked static shadows, and a compatible dynamic shadow for moving actors. [Three.js transparency tradeoffs](https://threejs.org/manual/pages/transparency.html).
5. **Acceptance:** review stills **and movement**: walking behind a tree, entering a building, climbing stairs, and crossing a shadow. Check silhouettes, texture stability, occlusion, and readability at actual desktop browser sizes. A pixelation filter on generic 3D geometry is insufficient.

## Playable slice and system boundaries

Assume a bounded, historically verified portion of Thais containing a temple or respawn point, a merchant, an accessible two-floor building, and one nearby low-level encounter area. The exact locations and content depend on the map-rights and historical-reference gates. Until then, use an explicitly labeled **synthetic test fixture**, not a substitute Thais map.

The first repeatable loop is: enter the world, navigate to an encounter, fight a basic creature, loot its corpse, return to a merchant, sell an item, save, and reconnect. A death returns the character to the designated respawn point with a documented provisional penalty. The slice should support two simultaneous browser clients even if its first art preview is local.

The authoritative server owns tile occupancy, movement timing, collision, combat, random outcomes, inventory, NPC transactions, death, and persistence. The client sends intents and displays acknowledged state; movement interpolation may hide latency, but corrections follow server results. Local preview runs the **same simulation core** through a local adapter; it is a development convenience, not the multiplayer product.

Key complexities to design explicitly:

- **Floors and stairs:** tile coordinates include floor; stairs have explicit source and destination rules. Roof and upper-floor hiding follow building/floor metadata, with a reversible rule when leaving. Verify the historical rule separately.
- **Tile stacks and items:** model ordered ground, fixtures, creatures, and movable items. Resolve clicks and interactions consistently when objects overlap; inventory supports equipment, containers, stack counts, capacity, and validated transfers.
- **NPCs and combat:** start with keyword-based conversation and one buy/sell flow, plus one creature’s target, attack, death, corpse, and loot behavior. Treat formulas and timing as provisional until evidenced.
- **Persistence and reconnect:** store character position, health, inventory, and relevant world changes; make trade, loot, death, and item movement atomic. Sequence commands, reject duplicates, and resynchronize from authoritative state after reconnect. A local SQLite-backed Node server is sufficient for the first shared slice; public authentication, operations, and scale are later work.

## Milestones and checks

1. **Evidence and rights gate.** Establish the intended Thais footprint, map provenance, reference access, and a small rule ledger. Produce a dependency and asset-license inventory. **Check:** every proposed imported map or asset has an identifiable rights basis; unresolved entries remain blocked.
2. **Visual and spatial prototype.** Build the synthetic two-floor fixture and original art test. **Check:** browser frame stability on representative Windows/macOS hardware; readable figures, roof hiding, stair transitions, tile picking, and occlusion. This milestone does not claim a Thais recreation.
3. **Authoritative playable loop.** Add the single TypeScript simulation, WebSocket transport, creature, inventory, NPC transaction, death, and SQLite persistence. **Check:** two clients see the same movement and combat; invalid moves and out-of-range actions are rejected; simultaneous loot cannot duplicate items; disconnect/reconnect and server restart preserve committed state.
4. **Approved Thais slice and desktop proof.** Integrate only cleared map/content, compare the scene and selected behaviors with historical references, and package test builds for both desktop platforms. **Check:** the loop works in browser, Windows WebView2, and macOS WKWebView; record fidelity gaps and rendering differences.
5. **Expand deliberately.** Add more Thais locations, NPCs, monsters, spells, and historical mechanics only against documented fixtures. Full-world content, exact 7.6 protocol, PvP balance, large-scale hosting, and production accounts are **non-goals for the first slice**.

As a planning assumption, a polished slice is likely **months rather than days** for a small team with engineering and dedicated art capacity; map clearance and historical evidence can dominate the schedule. No reliable estimate is possible yet for a complete Thais recreation.

## Strongest cross-checks for round 2

- Find an actual Thais map candidate with a traceable grant covering the intended reconstruction and distribution; challenge whether a grant covers derivative visual work and names.
- Compare 7.6 movement, floor visibility, NPC interaction, combat timing, and death against lawful period-specific evidence—not merely modern TFS behavior.
- Independently audit the exact licenses and provenance of any OpenTibia code or data proposed for reuse, including whether a gateway or desktop bundle changes distribution obligations.
- Prototype the proposed render target, cutout foliage, shadowing, and roof hiding in both desktop webviews; verify that the visual target remains readable during movement.
- Challenge whether one shared TypeScript simulation and SQLite transaction model handle reconnects, concurrent loot, and the intended two-client slice without a second rules implementation.
