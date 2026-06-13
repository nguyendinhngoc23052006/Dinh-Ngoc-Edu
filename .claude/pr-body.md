# Tiered agent orchestration + enforced reviews + intent-addressed CRUD

Governance-only change (no application code, migrations, or SQL). It makes three things real that the pipeline previously only described:

1. **Model tiers by capability, never by name.** The orchestrator runs the most capable tier and dispatches work down: reviewers on the mid tier, a new `researcher` worker on the fastest tier. No model name is stored anywhere — the tier is resolved to the current model at dispatch — so a changed model lineup needs zero edits.
2. **Reviews are enforced, not hoped.** The orchestrator records each reviewer's verdict to `.claude/review/<agent>.md`, and the Stop hook now requires all three present and refreshed every PR, plus a floor guard that fails if any reviewer agent file is deleted.
3. **Structural changes are intent-addressed and confirm-gated.** A resolve→confirm protocol (defined once in `CLAUDE.md`) means "add/update/delete the X whose job is …" resolves to the exact named file and confirms before deleting — so a CRUD request can't take out the wrong component.

> ⚠ **Constitution change — review carefully.** This PR edits `CLAUDE.md` (opening line, one new Self-check box, the "Agents, plugins, MCP" section). I am proposing it via this PR for your review and merge — I did not self-edit-and-merge. The `CLAUDE.md` and `stop-check.sh` changes are coupled on purpose: shipping the enforcing hook without the constitution rule that creates the artifacts would block every future PR.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches  *(no migration in this PR)*
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised  *(193 tests pass; the new hook was exercised live — it correctly blocked while `.claude/review/*` was absent, then passed once the verdicts existed)*
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code  *(no client/env code touched)*
- [x] irreversible actions guarded + idempotent + flagged  *(none in this PR)*
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English  *(no migration)*
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR  *(all three: no findings)*

## For you
**What changed:**
- `CLAUDE.md` (constitution): orchestrator is now "orchestrator and final writer"; the Agents section gains capability-tier roles, the `researcher` worker, and the intent-resolve→confirm CRUD protocol; one new Self-check box.
- `.claude/hooks/stop-check.sh`: now also requires the three `.claude/review/*` verdicts refreshed this task, and fails if any reviewer agent file is missing (the floor).
- `.claude/agents/researcher.md` (+ empty memory sidecar): new read-only, fastest-tier worker that reads/drafts and returns text, never commits.
- The three reviewer agents each gained one sentence: the orchestrator records their verdict to `.claude/review/<name>.md`.
- `.claude/review/{security,code,scale}-reviewer.md`: this PR's verdicts (all clean).
- `MEMORY.md`: the agent-roster and Stop-hook lines updated to match.
- (Your standalone `pipeline.md` guide was updated in parallel and handed back in chat — it lives in no repo, so it is not in this PR.)

**What you do next:** review the preview and the constitution diff above, then merge. No env/secret/dashboard action is needed.

**How to roll it back:** revert this PR in Git (GitHub → this PR → **Revert**, merge the revert) — it restores the previous `CLAUDE.md`, hook, agents, and memory in one step. Nothing here touches production data or deploys.
