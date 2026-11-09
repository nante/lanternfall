# Lanternfall Studio — round 4 final plan sign-off (Sol)

## 1. Score: 9/10

The plan is buildable and keeps the agreed scope. Its required balance injection, JSON-free Studio imports, explicit save/reload/Continue loop, incremental PNG overrides and real-Engine worker simulation fit the inspected code. All seven balance sections, all supported texture slots and the simulator's place after the art milestones are settled majority decisions; none needs reopening.

Sign-off needs one correction to an acceptance check, not a redesign.

## 2. Blocking issue

### B1 — M1's competing-save check requires incompatible outcomes

**Location:** `FINAL-PLAN.md:101`, “Rejected writes”.

The check says two tabs saving at once must produce one success and one conflict, but also says they “all leave the file untouched and keep the draft.” A successful changed save must replace the file and advance that tab's baseline. No implementation can satisfy both assertions literally. The round-3 plans correctly require rejected requests to preserve the last valid document, which includes the winning save.

**Exact fix:** replace that acceptance bullet with these two:

- **Rejected writes:** invalid numbers, unknown IDs and stale revisions leave the target's current bytes unchanged and retain the requesting tab's draft.
- **Competing writes:** two different drafts saved against the same revision yield one success and one 409. The target contains the winner's bytes; `.previous` contains the bytes from before that successful save. The rejected request changes neither file and retains the losing tab's draft. The successful tab adopts the returned revision and saved baseline.

No other blocking issue found against the inspected baseline code.

## 3. Non-blocking notes

1. **Keep the detailed round-3 validation contract behind “full validation”.** In particular, preserve the progression termination checks in `round-3/sol.md` §3, fixed spell ID/kind combinations, starter compatibility and existing count/corpse limits. The original `model.ts` progression helpers contain unbounded loops; merely checking that edited coefficients are finite is insufficient. Do not introduce a gameplay level cap to simplify validation. This is existing boundary work, not a new tuning feature.

2. **Carry forward the simulator's measurement definitions.** `Engine.kill()` immediately restores HP, and retained effects are positional and repeated across ticks. Detect death through `deaths`; sum newly observed incoming hit effects once, using pre-terminal-tick positions; label this gross incoming rolled damage, including overkill, rather than net HP lost. Use nonzero uint32 seeds, distinguish raw skill counters from displayed levels, and exclude generated UUIDs from repeatability comparisons. These details are already specified in the Sol/Terra round-3 plans and need no combat observer or additional policy.

3. **State texture opacity explicitly.** Icon PNGs permit alpha 0 or 255; ground/wall/roof PNGs should require alpha 255 everywhere, as all three round-3 plans specify. “Partial alpha” alone leaves fully transparent texture pixels ambiguous. `groundAtlas()` copies RGB only and the existing wall/roof materials are opaque. Fully decode PNGs server-side before publishing; an invalid present override should produce a visible error, while only an absent override selects the generator.

## Review evidence and limits

Read `FINAL-PLAN.md`, all three round-3 plans, the Studio brief, balance/icon exports, Engine/model/world code, client HUD/icon/texture/render integration, server persistence/shutdown, Vite configuration, Electron entry and existing tests. The inspected source supports the chosen spell-power formulas, 27-icon count, texture dimensions and two-tile ground scale.

`npm run typecheck` and all nine existing tests passed during this review. Source files then began changing concurrently: a subsequent read found new M0 modules and removed legacy model exports. These checks describe the baseline observed during review, not verification of the ongoing implementation. I did not run the game, Studio, a build or Electron, or touch SQLite. Only this report was written.
