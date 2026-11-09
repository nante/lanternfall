# Sol 6.1 — round 1

Configuration: xhigh reasoning, priority service. Read-only independent research and planning.

I recommend **TypeScript + Three.js/WebGL2, an authoritative TypeScript server, and Electron for the first desktop release**. This offers the shortest credible browser-first path while keeping gameplay independent of rendering. Exact Thais remains the requested destination; map provenance is an unresolved delivery gate.

I read the brief and inspected the reference image. The architecture below is a proposal, not a tested performance or licensing conclusion. Research was read-only.

**The upstream evidence changes what should be reused.**

- **TFS:** inspected source headers identify GPL-2.0; release 1.6 explicitly targets protocol 13.10. Its dependency manifest includes a pinned vcpkg baseline, but that establishes neither security nor 7.6 fidelity. Treat it as a substantial modern server requiring a downgrade project, not a ready-made 7.6 foundation. [Source header](https://raw.githubusercontent.com/otland/forgottenserver/master/src/game.cpp), [release](https://github.com/otland/forgottenserver/releases), [manifest](https://raw.githubusercontent.com/otland/forgottenserver/master/vcpkg.json).
- **OTClient:** its MIT code license is useful evidence for possible code reuse; its README separately requires users to supply SPR/DAT files. Those files receive no demonstrated rights from the client license. Porting this native client would also leave the new rendering direction unresolved. [License](https://github.com/edubart/otclient/blob/master/LICENSE), [README](https://github.com/edubart/otclient).
- **OTSharp:** the repository advertises 7.6, but documents connections, walking, talking, channels and events—not a complete combat, economy and persistence implementation. GPL-2.0 is present; completeness, dependency health and buildability remain unverified. [README](https://raw.githubusercontent.com/Ezzz-dev/OTSharp/master/README.md), [license](https://github.com/Ezzz-dev/OTSharp/blob/master/LICENSE).
- **Original OTServ:** archived and explicitly targets 8.7. Reject as a drop-in solution. [Repository and README](https://github.com/opentibia/server).

GPL reuse requires an explicit compliance decision, especially if distributing a server or browser-delivered derivative. Translation into TypeScript does not erase copied-code obligations. Code licenses also do not establish rights to maps, dialogue, sprites or sounds. [TFS license](https://github.com/otland/forgottenserver/blob/master/LICENSE).

A material current finding: a June 2026 notice published by GitHub, submitted on CipSoft’s behalf, alleges that named 7.7 repositories derive from unlawfully obtained proprietary server material. That is a claimant’s allegation, not a court ruling or a finding against all OpenTibia projects; it nevertheless makes leaked-source ancestry a concrete exclusion criterion. [Published notice](https://github.com/github/dmca/blob/master/2026/06/2026-06-16-tibia.md).

**Thais provenance remains unresolved.** I found repositories asserting licenses, but no verified rights chain for a complete, accurate 7.6 Thais map. For example, a community 7.1 reconstruction carries MIT, while TibiaMaps publishes MIT-labelled contemporary minimap/pathfinding images and markers. Neither establishes an authorized, complete 7.6 playable world containing item stacks, interiors, triggers and historical spawns. A maintainer’s license cannot establish ownership of underlying third-party material. [7.1 reconstruction](https://github.com/bradleyworkman/Tibia-7.1-map), [TibiaMaps data](https://github.com/tibiamaps/tibia-map-data).

Therefore preserve two separate tracks: a provenance-reviewed exact Thais deliverable, and an explicitly labelled original development map. The latter can unblock engineering; accepting it as the shipped replacement requires a scope decision. Redrawing Thais with new textures does not itself resolve map rights. This report does not certify licensing.

**The stack decision is about iteration and content production, not language prestige.**

| Candidate | Advantages | Costs and decision |
|---|---|---|
| **TS + Three.js** | Direct browser integration; precise rendering control; shared gameplay modules and tooling | Must build map tools, networking and gameplay systems. **Primary choice.** Current WebGLRenderer requires WebGL2. |
| **Rust/WASM + Three.js** | One Rust simulation could run natively on the server and as WASM for local preview/prediction | Adds bindings, serialization and another toolchain without evidence of a CPU bottleneck. **Defer**, then replace a measured subsystem rather than maintain duplicate simulations. |
| **Godot 4 + GDScript** | Strong scene editor, animation tools and native desktop exports; plausible faster content iteration | Browser export uses Compatibility/WebGL2; current documentation excludes C# web export. Threaded builds require isolation headers; single-threaded export is supported. **Strong runner-up**, especially with experienced Godot artists. |

These capabilities are upstream facts; the productivity ranking is my judgment. [Three.js renderer](https://threejs.org/docs/pages/WebGLRenderer.html), [Rust/JS bindings](https://wasm-bindgen.github.io/wasm-bindgen/), [Godot web constraints](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html).

Use Vite, Three.js, ordinary HTML/CSS interface panels, a supported Node LTS server and SQLite initially. Keep dependencies few and pin the selected versions after reviewing their manifests and advisories. Node’s current release table lists supported LTS lines; an old tutorial’s runtime should not determine the baseline. [Node release policy](https://nodejs.org/en/about/previous-releases).

**Recreating gameplay and supporting native clients are different products.**

The primary plan recreates documented 7.6 movement, progression, combat and interaction using a new versioned WebSocket protocol. It does **not** promise connection to legacy clients or servers.

Browsers cannot directly open ordinary TCP sockets; WASM does not bypass that limitation. Native compatibility would require an audited legacy server/client implementation plus a restricted WSS-to-TCP gateway or an adapted server transport. Handshake, framing, opcodes, item identities, floor visibility and movement semantics would all need conformance checks. A gateway solves transport, not fidelity or asset rights. [Emscripten networking documentation](https://emscripten.org/docs/porting/networking.html).

Do not take on that second product unless native interoperability is an explicit requirement.

**The visual pipeline should begin with art direction and temporal stability.**

The inspected image shows steep elevated viewing, readable silhouettes, dense ground texture, substantial occlusion, long shadows and warm highlights against cool shade. It does not establish its engine or production method.

Start with a fixed-azimuth orthographic camera, textured low-poly buildings/terrain, and stylized animated 3D actors. Compare one actor against a directional sprite impostor before committing: sprites offer authored silhouettes, but complicate lighting, shadows and intersections.

Render the world into a fixed low-resolution target—initially 640×360—then enlarge with nearest sampling at integer scale. Draw readable interface text separately. Three.js supplies the [orthographic camera](https://threejs.org/docs/pages/OrthographicCamera.html) and [render-target mechanism](https://threejs.org/manual/pages/rendertargets.html); visual quality still depends on authored assets.

Establish shared texel density, deliberate pixel clusters, limited material palettes and silhouette budgets. Use warm directional light, cool ambient shade, restrained fog and baked contact detail. Prefer alpha-tested vegetation over layered transparency.

Quantize camera translation in camera space and stabilize shadow projections. Keep simulation coordinates continuous where needed; snap presentation only. Avoid temporal dithering and uncontrolled subpixel camera easing. Verify walking, diagonal movement, foliage, roof transitions and window resizing in motion: a convincing still image is insufficient.

**World topology must drive both simulation and presentation.**

Use integer `(x, y, floor)` cells with explicit movement blockers, item stacks, doors, protection zones, room/roof groups and floor-transition links. Keep visual height separate from logical floor identifiers.

Run server-side grid pathfinding with specified diagonal costs and corner rules. Stairs, ladders and holes are explicit links, not inferred mesh slopes. Distinguish movement collision, projectile obstruction and visibility.

Use depth testing for ordinary geometry. Hide connected roof groups when entering their interior; cut away camera-facing walls selectively while retaining collision. Picking must respect the displayed floor and reject hidden upper-floor targets.

Proposed final boundary: the walled city, accessible interiors and enumerated connected cellars/sewers, with explicit gate boundaries. Historical coordinates, included underground areas and any adjacent hunting pocket require a versioned scope manifest; they are not yet verified.

**Build multiplayer authority into the first playable loop.**

Separate `simulation`, `content`, `protocol`, `server` and `client`. The simulation owns movement timing, combat, inventory and progression; it imports neither Three.js nor database APIs. Local preview runs that same implementation with an in-memory adapter. The online server remains authoritative.

Clients send sequenced intentions, never damage, loot or position outcomes. The server validates movement cadence, range, floor, inventory ownership and cooldowns. Start with a proposed 20 Hz scheduler and interpolate rendering; this is an engineering setting, not an asserted historical Tibia rate. Add nearby-interest snapshots, bounded command queues, reconnect resynchronization and input acknowledgement.

Persist character position, stats, skills, equipment, containers, currency and quest flags. Commit ownership/economy changes atomically before acknowledging success; checkpoint less critical state with a declared recovery window. Include schema versions and restart recovery. Browser storage holds preferences/cache, not authoritative online saves.

First loop: spawn → obtain equipment through original NPC dialogue → travel to a bounded hunting area → target/attack → loot a corpse → equip/store/sell → improve → repeat. Include keyboard and click movement, chat-focus handling, inspect/use, one vocation, two enemy types, one healing action, death/corpse/temple return and saving. Death penalties must be explicitly provisional until researched.

Later fidelity work includes all vocations, spell/rune systems, skills, containers/capacity, trading, protection/PvP rules, NPC schedules and Thais quests. The slice is not completion of the full goal.

Author geometry in Blender; export glTF with a documented scale/pivot convention. Maintain separate map topology, spawn/NPC definitions and visual placements, joined by stable IDs. Record creator, license, source and modifications for every asset. Build a small floor-aware placement tool only after the schema survives the first loop.

**Stage delivery around observable exits.**

| Stage | Exit criteria |
|---|---|
| Scope/provenance | Boundary and fidelity manifests; every proposed imported file classified; exact Thais rights/version gaps named |
| Rendering/topology spike | One street, interior, upper floor and stair; correct occlusion/picking; moving reference comparison; proposed 60 fps target measured on named hardware/browser |
| Online loop | Two browser clients complete the loop together; invalid movement and simultaneous loot claims cannot bypass authority |
| Persistence | Restart/reconnect restores committed inventory and progress; interrupted transactions produce no duplication |
| Thais expansion | Every included floor, portal, NPC and quest checked against the approved manifest; missing fidelity explicitly recorded |
| Desktop | Windows/macOS packages complete the same loop, reconnect and survive resize/fullscreen; distribution signing/notarization validated |

Prefer Electron initially because it bundles Chromium, reducing rendering-engine variation, at the cost of footprint and runtime maintenance. Keep Node integration disabled in the renderer and expose minimal desktop APIs. Tauri remains viable, but its Windows WebView2/macOS WKWebView split requires separate graphics validation; Rust packaging does not require Rust gameplay. [Electron](https://www.electronjs.org/docs/latest), [security](https://www.electronjs.org/docs/latest/tutorial/security), [Tauri webviews](https://v2.tauri.app/reference/webview-versions/), [signing](https://www.electronjs.org/docs/latest/tutorial/code-signing).

The largest risks are map rights/history, art-production throughput, undocumented 7.6 behavior, temporal pixel instability and persistence exploits—not demonstrated TypeScript performance limits.

Round 2 should challenge these five claims:

1. Can exact 7.6 Thais obtain a defensible provenance chain and precise boundary?
2. Is native protocol interoperability actually required?
3. Does Three.js iteration outweigh Godot’s editor advantage for this team?
4. Can the proposed moving visual pipeline match the reference on target hardware?
5. Which historical rules define acceptance, and which slice deviations are explicitly temporary?
