# Visuals build: council review brief

The four prototypes in `docs/visuals/BUILD-PLAN.md` are built. This round reviews them. You are reviewing, not building: read-only on the repository except your own report file.

## What to read

1. `docs/visuals/BRIEF.md` (the user's request and references, `docs/visuals/reference/`), then `docs/visuals/BUILD-PLAN.md` (the decisions and each prototype's acceptance checks).
2. `.audit/visuals-build.todo.md` (the coordinator's trail and measured evidence).
3. The shots in `docs/visuals/shots/` (13 named views, captured in real time at 1200×700). Open them.
4. The code:
   - The renderer fork, `apps/client/proto/_next/`. The coordinator wrote `view.ts`, `stops.ts`, `palette.ts`, `clock-style.ts`, `ground-art.ts`, `tufts.ts`, `lightfield.ts`, `wisps.ts`, `sky.ts`, `farland.ts`, `spire.ts`, `trees.ts` and `shades.ts`. An Opus delegate wrote `figures/`, `actor-layer.ts`, `feel.ts` and `particles.ts`.
   - The lab, `apps/client/proto/lab/`: `main.ts`, `harness.ts`, `tabs/`, `eval.mjs`, `shots.mjs`.
   - The rules: `packages/game/src/light.ts`, the darkness hooks in `packages/game/src/engine.ts` (see `git diff packages/game content/balance.json`), `tests/light.test.ts` and `tests/darkness.test.ts`.

## How to look at it live

The client dev server runs on :4173 (do not start, stop or restart any server). Open `http://127.0.0.1:4173/proto/lab/?<query>`. Each named shot's query is in `apps/client/proto/lab/shots.mjs`.

To capture your own shots in real time: `node apps/client/proto/lab/eval.mjs '<query>' 'shot:<your temp dir>/x.png' 5000 1200 700`. The same script evaluates lab probes in the page: `labVerify()` (field vs rule), `labBench()` (frame time), `labDarkCheck(15000)` (picture vs server under darkness). Write shots only to your own temp directory. Note: `shoot.sh` uses virtual time, which freezes animation and timing, so prefer `eval.mjs`.

## What to judge

1. **Against the user's request.** Mystical, magical, fable-like; light that means something, frightening without it; day and night; stunning and grand; pixel art with feel and weight; the zoom continuum (flat → almost 2D → scenery). Does what you see deliver it? Where does it fall short?
2. **Against BUILD-PLAN.** Does each prototype meet its acceptance checks? Is any check unproven or weaker than claimed?
3. **Correctness.** Bugs in the rule (`light.ts`, engine hooks), in the field (`lightfield.ts`), in camera stops and picking, in figures, feel and timing honesty, in the lab. Server truth: can the picture ever show more than the server sent, or show a hit before its effect?
4. **Code quality.** Is it a sound base to migrate from (the plan's "production migration is a diff of `_next/` against `src/render/`")? Name concrete structural problems, not style nits.

## Scope rule

Review what was planned. Do not propose new features, systems or prototypes. A finding must be a defect, an unmet acceptance check, a risk to migration, or a change with a high return on the user's stated goals that stays inside the plan. Rank findings most severe first and keep the list short.

## Output

A report with:
- a **score out of 10**;
- a one-paragraph verdict;
- ranked findings, each with `path:line`, what is wrong, why it matters and the smallest fix;
- what you verified yourself (commands, shots) and what you did not.

## Round 2

Round 1's four reports are in `review/round-1/` and every fix is listed, with where and how it was checked, in `review/round-1/fixes.md`. Shots in `docs/visuals/shots/` were recaptured after the fixes. New lab probes: `labFloorTrip()` (surface → undercroft → surface field check) and `labDarkCheck(ms)` now walks a scripted square and reads the field back from the GPU.

In round 2: check each fix against its finding (does it hold, live and in code?), look for anything the fixes broke, then score the build again out of 10. Keep the scope rule. Members are Claude Opus only from this round on (the user dropped the Codex seats).
