# Move the new renderer into the main game (Feature playbook)

- [x] 1. `how` over the affected subsystem. skip: read the call sites directly (main.ts, preview.ts, studio/textures.ts, lab) — the seam is one class, `WorldView`.
- [x] 2. `architect` for parallel design exploration. skip: one real fork (replace vs keep both behind a flag), settled by migrate-callers-then-delete; no panel.
- [x] 3. Throughput checkpoint
  - Blocking first steps: baseline shots of the main client on the old renderer (scratchpad/port/before-*.png); 84 tests green.
  - Independent workstreams: n/a — one coupled change (move files, fix imports, wire main.ts).
  - Shared mutable state: the working tree is uncommitted and the renderer is untracked, so no worktree can hold it. One delegate holds the checkout; I do not write until it returns.
  - Smallest safe decomposition: one owner. Units inside: (a) move + imports + lab, (b) main.ts clock and zoom stops, (c) ground texture slots for Studio, (d) docs paths.
- [x] 4. Delegate code-writing (pstack:poteto-agent, opus), then review the diff. Review found: setWorld ran before update (light field one view late) — swapped; previews opened at 05:00 dawn — previews now open at midday.
- [x] 5. Verify on the matching surface: real client previews (square, meadow, undercroft) 0 console errors; live join as LookCheck (spawned 22,22 in the shrine, clock live, no served world → fallback); `-` key → scenery in preview; lab verify 0 / dark probe 0 / bench 0.6 ms; 84 tests; tsc clean; build ok (delegate).
- [x] 6. Rebase into small, ordered commits. skip: user said do not commit unless asked.
- [x] 7. `interrogate` if contested. skip unless review finds a contested call.
- [x] 8. Opening a PR. skip: no commits without the user's word.
