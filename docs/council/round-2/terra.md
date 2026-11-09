# Terra 6.1 — round 2

Configuration: max reasoning, priority service. Read-only cross-check after the user's backbone correction.

## Recommendation

Use **Nekiro TFS 1.5’s `7.72` branch as the authoritative C++ server**, a fixed-target WebSocket↔TCP bridge, and an adapted **davideluque/otclient-web protocol/state layer** feeding a new TypeScript/Three.js renderer. This is a proposed integration, **not a proven working combination**: the client’s current login is incompatible with Nekiro’s server, and gameplay packets and item metadata still need matching.

I inspected source and the reference image. I did **not** build, run, install, or execute any downloaded code.

## Objections and corrections

| Round 1 proposal | Cross-check |
|---|---|
| Sol and Terra: independent TypeScript simulation first | This discards existing movement, combat, containers, creature AI, Lua actions/NPC infrastructure and persistence. Native protocol compatibility is useful here as an **integration seam**, even if supporting historical clients is not a product goal. A rewrite is not the shortest demonstrated path to the requested backbone. |
| Opus: discard the server’s data directory; treat names and data as categorically tainted | Unsupported as a blanket conclusion. Nekiro’s branch contains item definitions, scripts, monsters, NPC examples and a small world; assess specific material when selecting it. Keep the source check practical and preserve notices. |
| Nekiro is effectively a 7.6 server because it accepts version 760 | Its constants say **760–772**, but its login and game handlers require RSA and XTEA. The browser client’s 7.6 builders use neither. A version number passing a range check does not establish wire compatibility or 7.6 gameplay fidelity. [Version constants](https://github.com/nekiro/TFS-1.5-Downgrades/blob/7.72/src/definitions.h), [server login](https://github.com/nekiro/TFS-1.5-Downgrades/blob/7.72/src/protocollogin.cpp), [browser login](https://github.com/davideluque/otclient-web/blob/main/src/lib/net/7.6/loginProtocol.ts). |
| Sol: Electron first | Chromium consistency is useful, but it is not yet evidence that WKWebView or WebView2 fails this particular client. Start with Tauri and run one cross-platform rendering proof; switch to Electron if that proof exposes a material webview-specific failure. |
| Terra: exact Thais needs a rights gate before engineering | The first server and browser loop can proceed with a clearly labelled fixture. Track the intended Thais map’s source, historical version and scope separately; the fixture is **not** the finished map. |
| Archived means unsuitable | Nekiro is discontinued, but its age alone does not decide the outcome. Its concrete build, protocol and datapack gaps do. [Branch README](https://github.com/nekiro/TFS-1.5-Downgrades/blob/7.72/README.md). |

## Selected integration

**Server.** Pin the inspected Nekiro branch at `a4675433d0e5c0001d37d4cab1241120216597e4` for the first experiment. Its [CMake configuration](https://github.com/nekiro/TFS-1.5-Downgrades/blob/7.72/CMakeLists.txt) calls for C++17, Boost, Crypto++, fmt, PugiXML, Lua/LuaJIT and MySQL/MariaDB client libraries. The server needs a database and [schema](https://github.com/nekiro/TFS-1.5-Downgrades/blob/7.72/schema.sql), configuration, item OTB/XML, a compatible OTBM map, spawn data and the relevant monster, NPC and Lua scripts.

The repository includes examples of several of these, but its author says the downgrade is **not a download-and-run distribution** and warns monster and spell behavior may be inaccurate. Assemble the smallest compatible datapack and repair startup errors; do not assume the supplied world is a playable Thais. Nekiro’s [player save code](https://github.com/nekiro/TFS-1.5-Downgrades/blob/7.72/src/iologindata.cpp) includes a transaction for player data and items, but that does not prove crash-safe atomicity across every trade or world change.

**Bridge.** A fixed-target binary WS↔TCP proxy is the smallest *transport* route: `/login` and `/game` connect only to configured server ports, carrying the native bytes. The upstream [proxy](https://github.com/davideluque/otclient-web/blob/main/proxy/server.ts) does that; it forwards TCP chunks, while [Connection.ts](https://github.com/davideluque/otclient-web/blob/main/src/lib/net/common/Connection.ts) buffers and extracts little-endian length-prefixed packets. TCP reads and WebSocket messages must not be assumed to align with native packets.

For the first local proof, bind privately. For any non-local use, put the bridge behind HTTPS/WSS and access control, restrict origins and destinations, cap payloads/connections, and keep TCP ports private. The proxy is unauthenticated by itself and makes connections appear to come from the proxy unless IP handling is deliberately addressed.

**Protocol adaptation is the first hard blocker.** The client’s [`GameProtocol.ts`](https://github.com/davideluque/otclient-web/blob/main/src/lib/net/7.6/GameProtocol.ts) defaults to 760 without RSA or XTEA and explicitly rejects `useRSA: true`. Nekiro’s login and game handlers both decrypt RSA and enable XTEA. The client’s [`GameClient.ts`](https://github.com/davideluque/otclient-web/blob/main/src/lib/net/common/GameClient.ts) currently creates a game XTEA key after sending the game-login packet; merely flipping a flag cannot negotiate the key with this server. Implement the matching RSA blocks and **per-connection** XTEA negotiation before the encrypted responses, using the server’s configured public key; then check framing, padding and both login phases against the selected server.

Next compare opcodes and field layouts against Nekiro’s [`protocolgame.cpp`](https://github.com/nekiro/TFS-1.5-Downgrades/blob/7.72/src/protocolgame.cpp): map/floor streams, creature known/unknown forms, movement, chat, attack, containers and inventory. An unknown or wrongly sized opcode can desynchronize the rest of a packet. Advertise the chosen server protocol accurately; do not infer exact 7.6 behavior from the handshake.

**State and rendering.** Reuse selectively from `net/common/Connection.ts`, `GameClient.ts`, `PacketDispatcher.ts` and `net/7.6/` parsers/builders, adapting their layouts for this server. [`GameWorld.ts`](https://github.com/davideluque/otclient-web/blob/main/src/lib/GameWorld.ts) maintains live tiles and creatures and exposes region data, offering a seam for a Three.js renderer. It is **not entirely asset-independent**: it uses DAT attributes for stack order, and the client’s [`itemFlags.ts`](https://github.com/davideluque/otclient-web/blob/main/src/lib/net/common/itemFlags.ts) needs item metadata to know whether an item on the wire has an extra count/subtype byte.

Introduce a small metadata adapter keyed by **client item ID**, derived consistently from the selected server’s item catalog. It must cover wire flags and stack ordering, then map those IDs to new render assets and pivots. Nekiro’s [`NetworkMessage::addItem`](https://github.com/nekiro/TFS-1.5-Downgrades/blob/7.72/src/networkmessage.cpp) writes the client ID and conditionally writes a count. A wrong flag shifts subsequent parsing; unknown fixture IDs should fail visibly. New graphics do not remove this protocol metadata requirement. The web client currently expects user-supplied DAT/SPR files; replace that dependency incrementally with matching project metadata and original placeholder assets. [Client README](https://github.com/davideluque/otclient-web/blob/main/README.md).

## Alternatives

- **OTHire:** a credible fallback if Nekiro’s actual startup or gameplay gaps prove worse. It identifies itself as 7.72 and ships a MySQL schema, world and content; its [Dockerfile](https://github.com/Ezzz-dev/OTHire/blob/master/Dockerfile) describes an autotools/Lua/Boost/MySQL-family build. Its [login code](https://github.com/Ezzz-dev/OTHire/blob/master/source/protocollogin.cpp) rejects `<=760` and requires RSA, and its game login enables XTEA. It is **not** a drop-in fix for the browser client. Compare observed boot and loop blockers before switching engines.
- **Fresh TypeScript simulation:** would need authoritative tile stacks, collision and floor transitions; movement timing and pathfinding; creature AI, combat and death; containers, item ownership and loot; NPC scripting/trade; accounts, saves, reconnect and concurrent-action handling. A WebSocket protocol would be simpler, but these systems and their 7.6 corrections would still need implementation and verification. Reconsider only if the chosen C++ backbone cannot pass the early loop after targeted fixes.
- **Semantic gateway or server WebSocket rewrite:** potentially useful later for a cleaner custom protocol. Both add translation or server changes before the native path is proven. Neither eliminates state, item identity or gameplay work.
- **TFS master:** maintained, but its [v1.6 release](https://github.com/otland/forgottenserver/releases) targets 13.10; downgrading it is a larger initial project.

The selected Nekiro source headers state GPL-2.0-or-later; otclient-web carries MIT. Retain applicable notices and exclude known leaked commercial-source lineages. These code licenses do not themselves establish rights to a particular map or asset; no broad scan or legal-review process is a prerequisite for the fixture. [Nekiro header](https://github.com/nekiro/TFS-1.5-Downgrades/blob/7.72/src/definitions.h), [client license](https://github.com/davideluque/otclient-web/blob/main/LICENSE).

## Backbone acceptance sequence

1. **Boot:** build the pinned source locally with documented dependencies; initialize a development database and minimal compatible map/items/scripts. Confirm a character and one creature load. Record missing datapack pieces and any source fixes.
2. **Connect:** adapt RSA/XTEA and packet layouts; obtain a character list, enter the game through the fixed bridge, and decode a map and creature without packet drift. Exercise fragmented and combined TCP frames.
3. **Play with two browser clients:** show authoritative movement and collision, a floor transition, chat/NPC interaction, combat, death/corpse, container opening and loot transfer. Both clients must observe consistent results; rejected actions must not change server state.
4. **Save and reconnect:** move an item into inventory, save/logout, reconnect and restart the server; verify the committed character position, health and nested inventory. Test simultaneous loot claims and record crash/recovery limitations rather than assuming all economy operations are atomic.
5. **Replace presentation:** feed the live state into a small Three.js scene with placeholder assets and the item-ID adapter. Keep the server’s fixture as the gameplay source of truth. Then expand toward a versioned Thais map and correct observed 7.6 fidelity gaps.

For desktop, test that same moving scene in **Tauri first**, on macOS WKWebView and Windows WebView2, including WebGL2, input, resize and reconnect. If a reproducible platform-specific rendering or input failure remains after a focused fix while the same scene passes in Chromium, use **Electron** as the single wrapper instead. [Tauri webviews](https://v2.tauri.app/reference/webview-versions/).

For actors, start with **stylized low-poly 3D** so the actor shares scene lighting and shadows. Run one small comparison: the same character walking behind a tree and into a two-floor building, once as 3D and once as a four-direction sprite, at the intended low-resolution scale. Select sprites only if they materially improve silhouette readability or temporal stability without unacceptable occlusion/shadow artifacts. That experiment chooses one production pipeline; it does not require two complete art sets.
