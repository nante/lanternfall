# Coordinator checks after the first two reports

Checked on 2026-11-09. These are research observations, not an implementation result.

- [TFS release 1.6](https://github.com/otland/forgottenserver/releases) explicitly identifies protocol 13.10. Modern upstream is not evidence of 7.6 fidelity.
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) requires WebGL2; WebGL1 support was removed in r163. The compatibility matrix must test actual WebGL2 support rather than assume any browser/webview works.
- [Three.js RenderPixelatedPass](https://threejs.org/docs/pages/RenderPixelatedPass.html) and [texture filtering](https://threejs.org/docs/pages/Texture.html) provide rendering mechanisms. They do not provide the authored art, stable camera/shadows, building cutaways, or production pipeline needed to match the reference.
- [Tauri webviews](https://v2.tauri.app/reference/webview-versions/) differ across Windows and macOS. [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) include native platform dependencies and Rust. A Rust packaging shell does not require Rust game logic.
- [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security) describes its bundled runtime and recommends isolation and limited renderer privileges. Chromium consistency trades against package footprint and ongoing runtime updates. This is a real round-2 decision, not grounds to maintain two wrappers indefinitely.
- The [June 2026 notice published by GitHub](https://github.com/github/dmca/blob/master/2026/06/2026-06-16-tibia.md) alleges that named 7.7 repositories derive from unlawfully obtained proprietary source. It is a claimant's notice, not a court judgment or a finding that all OpenTibia implementations are infringing. Exclude the named leaked-source lineage from proposed foundations; continue investigating independently authored licensed engines.

## Local toolchain inventory

Read-only inspection found Node v26.12.1, npm 11.20.0, rustc/cargo 1.88.0, and git. `pnpm` was not found on PATH. No project dependencies were installed and no game/server code was downloaded or executed. Installed versions do not establish the eventual pinned supported toolchain.

## Cross-check targets identified so far

1. Select one first desktop wrapper using an explicit cross-platform graphics proof and fallback trigger: Electron consistency versus Tauri footprint.
2. Resolve actor pipeline: Sol proposes stylized 3D actors with one sprite comparison; Terra favors directional sprites. Avoid funding both full art pipelines.
3. Independent TypeScript simulation is a development-cost choice, not a free path to full 7.6 fidelity. Evaluate licensed classic-server alternatives before committing.
4. Separate local preview, two-client development multiplayer, and production public hosting. Persist authoritative inventory and item ownership atomically.
5. A development fixture must not be labelled the completed Thais map. Preserve exact Thais as the intended map target and track source/version/rights gaps separately.

The source-research member receives only code/license/compatibility extracts during cross-checks, without target-map or recreation context.
