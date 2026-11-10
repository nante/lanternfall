# Visuals council: process

Requested 2026-11-09: two planning rounds, then building.

| Member | Provider | Model ID | Options | Passes per round |
| --- | --- | --- | --- | --- |
| Opus medium | Claude | `claude-opus-5-5` | `effort=medium` | 1 |
| Opus xhigh | Claude | `claude-opus-5-5` | `effort=xhigh` | 1 |
| Terra A | Codex | `gpt-6.1-terra` | `reasoningEffort=max`, `serviceTier=priority` | 2 (`.pass1.md`, then final) |
| Terra B | Codex | `gpt-6.1-terra` | `reasoningEffort=max`, `serviceTier=priority` | 2 (`.pass1.md`, then final) |

"Fast" for Terra resolves to the Codex `priority` service tier; the catalog exposes no other fast option for Terra.

- Round 1: independent proposals from `BRIEF.md` → `round-1/<member>.md`.
- Round 2: each member reads all round-1 reports and the coordinator's synthesis, then writes a revised plan → `round-2/<member>.md`.
- Coordinator merges round 2 into `BUILD-PLAN.md`, then building starts.

Members are read-only except for their own report files.

## Build and review

- Building: coordinator (Opus) built P1 and P3 and integration; an Opus xhigh delegate built P2 figures and feel; Terra built `light.ts` and the P4 rule (before the change below).
- Review round 1: Opus medium 7, Opus xhigh 6, Terra A 5.5, Terra B 6 (`review/round-1/`). Fixes: `review/round-1/fixes.md`; the rule fixes were done by Terra.
- 2026-11-10: the user switched all delegated work to Claude Opus only, effort chosen per task (medium by default). Codex seats are dropped from round 2 on.
- Review round 2: Opus medium and Opus high (`review/round-2/`).
