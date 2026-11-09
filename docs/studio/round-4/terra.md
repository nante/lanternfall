# Lanternfall Studio — round 4 review (Terra)

**Score: 7/10.** The plan has a coherent scope, a sensible engine seam and useful milestone checks. I would sign off after the corrections below. They preserve the majority decisions.

## Blocking issues

1. **Progression validation is not specified tightly enough for the editable XP curve.** The plan says invalid data cannot be saved, but does not define the constraints needed by the unbounded `level`, `skillFrom` and `magicFrom` loops in `packages/game/src/model.ts:79–86`. A zero XP curve or zero skill threshold can hang those loops. While this review was underway, `packages/game/src/content-schema.ts` appeared; it checks XP thresholds only through level 400. That still accepts `[1, -1800, 1050000]`, whose thresholds rise in that range but later decrease (the threshold at `n=600` is 9,999 lower than at `n=599`).

   **Fix:** Specify finite, safe bounds, positive threshold bases and divisors, and growth factors greater than 1. For `xpCurve = [a,b,c]`, require `a > 0` and validate the unfloored consecutive difference `a*n² + (a + 2*b/3)*n + (a+b+c)/3 >= 1` for all nonnegative integer `n`, by checking zero and the nonnegative integer neighbors of its vertex. Reject invalid drafts before both Save and simulation, and validate at game load. This retains the current curve without imposing a new level cap. See the fuller constraints in `round-3/sol.md:102–104`.

2. **Duplicate loot rows are specified as warnings but the newly present schema rejects them.** `FINAL-PLAN.md:55` says duplicate loot rows do not block saving; `packages/game/src/content-schema.ts` currently adds a validation issue for each duplicate. That would make a valid-warning case fail M1's save contract.

   **Fix:** Remove the duplicate-loot validation error and report it through the warning path. Preserve the rows and their independent roll order; continue enforcing valid item references, probabilities and corpse capacity.

3. **The texture alpha contract permits images the renderer cannot represent.** M2 rejects *partial* alpha, and the texture import only requires exact dimensions, so a PNG containing fully transparent pixels is not excluded. The existing ground shader samples only RGB (`apps/client/src/render/terrain.ts:99`), and wall/roof materials are opaque. Such pixels will not have the transparency shown in the Studio preview. Both full-texture round-3 plans require opaque PNGs.

   **Fix:** Require alpha 255 for every pixel of ground, wall and roof PNGs; explicitly reject alpha 0 as well as partial alpha in M2. Keep alpha 0 or 255 for **icons**, where transparency is supported. Do not alter the renderer's transparency behavior.

4. **The write acceptance check contradicts itself, and new texture files have no previous bytes.** M1 says two simultaneous saves yield one success and one conflict while *all* leave the file untouched (`FINAL-PLAN.md:101`). The successful save necessarily changes it. Decision 8 also requires a previous-byte backup for every write, but M2 explicitly starts with absent override files.

   **Fix:** Say that every **rejected** write leaves the target as it was immediately before that request and preserves its draft; in the two-tab test exactly one write updates the target, the other gets 409, and the backup contains the pre-success bytes. For a previously absent art slot, use an explicit absent revision and no previous-byte backup; on replacement or removal, back up the existing bytes before rename or deletion.

5. **“Saved world never touched” contradicts the required restart and persistence.** Decision 7 says the saved world is never touched, but M1 requires Ctrl+C to save it. The current server already writes on startup and SIGTERM and clears transient connection/target fields on restart (`apps/server/src/index.ts:22–30,64`).

   **Fix:** State that Studio never directly edits, resets, clamps or migrates the saved world; normal server persistence and existing restart cleanup continue. Use a disposable `LANTERNFALL_DB` for acceptance checks. This keeps the no-clamp majority decision intact.

6. **Fixed regen wording conflicts with editable progression.** Decision 5 says regen rules stay fixed, while Decision 1 makes all progression values editable. The existing JSON contains `regenMs`, and the engine currently hard-codes the corresponding 3,000 ms interval (`engine.ts` tick); similarly, `shieldSkillBase` is in progression even though the block formula remains fixed.

   **Fix:** Specify that regen **amounts**, the block formula and potion spreads remain fixed, while existing `regenMs` and `shieldSkillBase` are read from progression by every relevant Engine and client/simulator consumer. Include them in M0 parity and snapshot-isolation checks.

7. **The JSON import graph is internally contradictory.** The architecture calls `default-balance.ts` the “only file that imports JSON” while also specifying an `icons.ts` JSON wrapper. Putting icons in the server-imported default loader to satisfy the first statement would bring icons into the server graph and undermine the promised no-server-restart icon save.

   **Fix:** Say `default-balance.ts` is the only runtime loader of **balance.json**; the client-only `icons.ts` imports `icons.json` separately. Neither loader is imported transitively by Studio, Engine, schemas or simulator. Verify that icon saves leave the server running and another dirty Studio draft intact.

## Non-blocking notes

- M0's “creature attack or spell power reaches both the server and the HUD” is ambiguous: the current HUD does not display those definition values, although it displays server-generated hit/ember effects. Check changed attack/power through controlled combat effects, and use a directly displayed field such as creature HP, spell mana or max HP for independent server/client definition parity.
- Define simulator damage as gross incoming hit effects, count each effect ID once including the fatal tick, detect death by the deaths counter, and normalize UUIDs when comparing seeded runs. The engine restores HP on death and retains effects for 1.6 seconds; final HP alone is not damage taken.
- For “kills to afford,” show N/A for items no merchant sells or when ideal cash per kill is zero; label the result an ideal budget ratio, not an expected random stopping time. Several current loot items have `buy: 0` but are not purchasable.
- The strict TypeScript project will also need PNG decoder declarations, such as `@types/pngjs`, and the workspace/dependency change reflected in `package-lock.json`. For the desktop check, rebuild after saving art: Electron loads the built client, not the live Studio files.

Review was read-only apart from this report. The new schema noted above appeared during the review; the rest of the findings refer to the plan and the game code inspected at that time. No game, build or tests were run.
