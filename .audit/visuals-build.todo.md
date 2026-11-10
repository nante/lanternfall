# Visuals build (docs/visuals/BUILD-PLAN.md)

Playbook: Prototype
- [x] 1. Scope the decision the prototype exists to make. (BUILD-PLAN decisions 2, 3, 4, 5, 6, 10: each prototype tab answers one.)
- [x] 2. Gather references when the design space is open. (docs/visuals/reference, two council rounds.)
- [x] 3. Build throwaway in an isolated scratch dir, separate from production source. (apps/client/proto/, nothing in src/ imports it.)
- [x] 4. When comparing alternatives, build them behind one switcher, each variant labeled. (lab tabs + picker, URL state.)
- [x] 5. Verify on the matching surface. (headless Chrome shots of lab URLs.)
- [ ] 6. Present alternatives, tradeoffs, and a recommendation.

Task
- [x] Terra: light.ts + tests (delegated; 70 tests pass)
- [x] A1 fork src/render -> proto/_next, fix imports
- [x] A2 lab page + harness exposing Engine + shoot script
- [x] A3 stops.ts pixel lock (Close/Play)
- [x] A4 palette + LUT (art)
- [x] A5 ground 32/unit, grass tufts (art)
- [x] B1 lightfield.ts on light.ts
- [x] B2 clock-style keyframes, night floor (art)
- [x] B3 wisps, lantern breath, lamp flames, windows (art)
- [x] P2 figures (Opus delegate) + feel; scenery bake + self floor added by coordinator
- [x] P3 scenery stop, sky, farland, spire, trees, clouds, water, lookout (art) — second bake pitch waits on P2
- [x] P4 darkness rule (Terra; 82 tests pass; view() +0.36 ms/tick at 16 heroes) + shades view (mine)
- [x] council review round 1: 7 / 6 / 5.5 / 6; fixes in docs/visuals/review/round-1/fixes.md
- [ ] council review round 2 (Opus medium + Opus high; user switched to Opus only)

Evidence so far
- verify (field vs lightGrid over whole 84x68 floor): 0 mismatches at market night, undercroft+torch, shrine blue hour, meadow night+torch, meadow noon, gate golden.
- pixel lock exact at 1280x720, 1920x1080, 2560x1440 at DPR 1 and 2 (k = 2,5,4,7,5,10).
- bench (frame()+gl.finish, headless Chrome on Metal, this Mac): 0.7 ms median at 1920x1080 night with 25 sources; 0.8 ms at 2560x1440@2.
- found: production ground shader double-decodes the sRGB atlas (toLinear on an SRGB texture); fixed in fork only.
- darkness agreement probe (client lightLevel vs server full/shade, 250 ms samples): 0 disagreements in undercroft and meadow, with and without torch.
- TODO after P2: self outline in total dark (actor-layer), second bake pitch for Scenery.
- after cleanup: verify 0 mismatches (3 scenes); bench night 0.6 ms, scenery 0.9 ms median at 1920x1080; 82 tests pass.
- after round-1 fixes: 85 tests; verify 0 (3 scenes); floor trip 0; walking GPU dark probe 0/0 (2 scenes); bench 0.7 / 0.9 ms.
