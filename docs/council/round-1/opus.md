# Opus 5.5 — round 1

Configuration: medium effort. Read-only scoped OpenTibia source research; no project-recreation context supplied.

# Round 1 research report: OpenTibia server source for classic-era (7.4–7.72) gameplay

I checked everything below on 2026-11-09 against the primary GitHub repos (repo metadata, LICENSE files, source headers, `definitions.h`/`core.hpp`, READMEs, CI runs). Nothing was downloaded or executed.

## Source / compatibility / license table

| Project (primary URL) | Protocol actually in code | License evidence | Activity / build evidence | Verdict |
|---|---|---|---|---|
| **TFS** — github.com/otland/forgottenserver | `CLIENT_VERSION_MIN/MAX = 1310/1311` ("13.10") in `src/definitions.h` | LICENSE is GPLv2. Current headers say "governed by the GPL-2.0 License" with no "or later". The v1.2 headers say "either version 2… or (at your option) any later version". Old code is v2+, new code reads as v2-only, so treat the whole as **GPL-2.0-only**. | Last release v1.6 (2024-06-05). Last code commit 2026-08-30. CI on master is green, but the recent runs are only vcpkg-baseline updates. | Best-maintained engine, but wrong era. Classic play needs a protocol downgrade. |
| **Nekiro TFS 1.5 downgrades** — github.com/nekiro/TFS-1.5-Downgrades (branches `7.72`, `8.0`, `8.60`) | `7.72` branch: MIN 760 / MAX 772. Login always calls `RSA_decrypt`. | Headers are GPLv2-or-later; branch has a LICENSE file. GitHub detects no license on the default branch. | **Archived.** README says "project is discontinued… not fully featured… datapack is not included". Last commit 2022-05-02. Has Travis/AppVeyor/Docker configs; I did not verify a build. | Most practical GPL base for 7.72 if forking a C++ engine. |
| **OTHire** — github.com/Ezzz-dev/OTHire | 7.72 (README) | LICENSE file is **GPLv3**, but source headers say GPLv2-or-later. Ambiguous; safest to treat as GPLv3. | Last push 2020-12. README links to a Travis badge for a fork (TwistedScorpio/OTHire), and Travis is defunct. Dockerfile exists. The repo ships Windows DLLs and an `.exe`. | Usable with caution. GPLv3 code can't be merged into GPLv2-only TFS master. |
| **OTServ** — github.com/opentibia/server | README: "targeted towards Tibia 8.7" | GPLv2-or-later headers, GPLv2 LICENSE | **Archived** 2018. Badge points to Travis-ci.org. | Historical upstream only. |
| **Avesta** (re-upload) — github.com/Podkal/Avesta-1 | Folders for 7.4, 7.6, 7.7 ("OTServ_SVN 0.6.3") | Headers GPLv2-or-later. No LICENSE file. Unofficial mirror, so provenance is unclear. Ships `items.otb`. | Last push 2016 | The only 7.4/7.6 C++ engine I found with traceable GPL headers. Needs provenance work before any use. |
| **Canary** — github.com/opentibiabr/canary | `CLIENT_VERSION = 1525` | GPL-2.0 (GitHub detection) | Active (2026-11-05) | Modern only. Not classic. |
| **SenjaEngine** — github.com/V0RT4C/SenjaEngine | 7.4–7.72 goal, raw TCP. README says WebSocket is "will be implemented". | **No license** | 2022, "in its very infancy" | Not reusable. Design reference only. |
| **Inconcessus html5-tibia-engine/client** | 7.4-style, WebSocket with HMAC login token | **No license** | 2023 | Not reusable. |
| **Gravak** — github.com/pedrogiampietro/gravak | 7.4, Node, WebSocket | README badge says "MIT", but there's no LICENSE file and the README says "See individual files". GitHub says it's not a fork, yet its file layout closely matches Inconcessus. | 2026-07 | **Ambiguous.** Exclude until provenance is resolved. |
| **OTClient Redemption** — github.com/opentibiabr/otclient | README: 7.6 ~ 15.25 | **MIT** (LICENSE text; GitHub shows NOASSERTION) | Active, CI | Client side. The CMake build already detects Emscripten/WASM. The browser fork github.com/OTArchive/otclient is archived. |
| **otclient-web** — github.com/davideluque/otclient-web | 7.6, TypeScript | MIT | Active (2026-11) | Reference for a browser 7.6 client. It ships a Node WebSocket↔TCP bridge (`proxy/server.ts`) and requires user-supplied `.dat`/`.spr`. |

**Excluded (leaked CipSoft provenance, stated by the projects themselves):**
- **Nostalrius** (github.com/Ezzz-dev/Nostalrius): archived, no license. Its repo description says it is "based on The Forgotten Server 1.2 and CipSoft file".
- **SabrehavenServer**: README says it "uses original cipsoft resources which were leaked". It also commits RSA private keys.
- Anything derived from either of these, or from other leaked 7.7 server files.

## Engine code vs. everything else

A repo's GPL or MIT license covers only what its contributors could license. Each data layer needs its own provenance:

- **SPR/DAT (sprites, client object data):** CipSoft client files. None of the credible repos ship them, and otclient-web explicitly says they're "not included". A custom game needs **original art and its own object format**.
- **items.otb / items.xml:** item IDs and attributes mirror CipSoft client IDs and stats. Nekiro's 7.72 branch ships a 209 KB `items.otb` and a 455 KB `items.xml`; Avesta ships `items.otb`. Treat these as third-party-derived, not GPL-clean.
- **Maps (`.otbm`):** the RL-map packs are excluded. Nekiro's `world.otbm` is a 22 KB stub. Build your own map.
- **Monsters, NPC dialogue, spells, quests:** names, stats, formulas and dialogue lines in `data/` are mostly transcriptions of Tibia content. Gravak advertises "1170+ Monsters" and Avesta lists Tibia-specific features. Treat all of this as tainted and rewrite it.
- **Sounds/music:** none of the server repos I surveyed ship any. Gravak's client claims an audio system, but I didn't check its sources.
- **Generic mechanics** (tile grid, turn-based movement speed, the idea of skill progression) aren't copied expression. Exact formulas and data tables need care.

## Engine reuse vs. independent mechanics for a browser client

- **Browsers can't open raw TCP.** All the C++ engines speak raw TCP on 7171/7172. You have two choices:
  - Run a WebSocket↔TCP bridge (otclient-web's approach). It's an extra hop and an extra service, and RSA/XTEA must run in browser JavaScript, with the RSA private key held server-side.
  - Patch WebSocket framing into the engine's networking (Boost.Asio for TFS).

  Inconcessus, Gravak and Senja's plan all show the alternative: native WebSocket from the start.
- **A custom client doesn't need Tibia-protocol compatibility.** If you're writing your own client, wire compatibility with 7.x clients buys little, and the 7.x protocol carries legacy constraints (stackpos quirks; Redemption needs feature flags for 7.72 walking and stackpos).
- **GPL scope:** GPLv2/v3 obligations attach when you distribute the server binary. Neither license covers network use (that's AGPL). A separately written client talking over a socket can keep its own license. GPLv2-only TFS is incompatible with GPLv3-only code and with Apache-2.0 dependencies.
- **Assessment:** forking nekiro 7.72 or TFS gets you working mechanics (combat, containers, scripting) fastest, but you inherit a C++ GPL codebase, a raw-TCP protocol, and a tainted `data/` directory you'd have to replace anyway. An independent TypeScript or Go server with native WebSocket and original data is cleaner for a browser-first custom game. Use GPL engines only as behavioural documentation, and don't copy their code into a differently licensed project.

## Ranked recommendation

1. **Independent server with native WebSocket and 100% original data and assets.** Optionally pair it with an MIT browser client built from scratch, or adapt the MIT code in otclient-web or OTClient Redemption with attribution kept.
2. **Fork nekiro TFS-1.5 `7.72` (GPLv2+)**, keep only `src/`, discard `data/`, and add a WebSocket transport. Accept GPL for the server.
3. **Fork TFS master (GPL-2.0-only)** and downgrade or replace the protocol. Best maintenance, but the most porting work.
4. OTHire (licence ambiguous, dormant) or Avesta (unofficial mirror). Only after provenance is resolved.
5. Exclude: Nostalrius, Sabrehaven and their derivatives; SenjaEngine, Inconcessus and Gravak (no clear license); RL-map and asset packs.

## Code-reuse / provenance process

- Pin every upstream at a commit SHA. Keep upstream code in a separate directory or subtree with its LICENSE and headers untouched.
- Run ScanCode or REUSE-lint and keep an SPDX SBOM per file. Record the original source of every data and asset file.
- Engine code and content live in separate trees. The content tree accepts only original or explicitly licensed work, with a recorded author and license.
- Use DCO or a CLA for contributions. Contributors who have seen the leaked CipSoft source don't write mechanics code (clean-room rule).
- Re-scan in CI, and fail the build on an unknown license or a known-tainted hash (e.g. CipSoft `.spr`/`.dat`).

## Unknowns

- Whether nekiro's 7.72 branch actually accepts 7.60 clients, since its login always requires RSA. I believe 7.4/7.6 logins weren't encrypted, but I haven't confirmed it.
- Whether the TFS relicensing from "or later" to "GPL-2.0" had all contributors' consent. This matters little, because v2+ code can be used under v2.
- OTHire's LICENSE (GPLv3) conflicts with its headers (v2+).
- Gravak's lineage and its claimed MIT license.
- Whether Avesta's mirror matches the original OTServ SVN.
- Whether any engine builds today on a current toolchain. Only TFS has recent green CI, and those runs are vcpkg updates.

## Concrete checks for round 2

1. Build TFS master and nekiro 7.72 in an isolated container and record compiler and dependency versions. Running code is out of scope for round 1, so this needs approval.
2. Read the git log and blame for TFS's 2023 header-change commit, and run a license scan across all three C++ trees.
3. Grep each `data/` tree for CipSoft-derived names and IDs, and list which files you'd keep.
4. Diff Gravak against Inconcessus to settle whether it's derived.
5. Prototype a WebSocket↔TCP bridge round-trip using otclient-web's `proxy/server.ts` as reference, against a mock server. That repo includes `mockOtServer.ts` for this.
6. Look at the history of the 7.x protocol crypto (when RSA and XTEA were introduced) in OTClient Redemption's feature table.
