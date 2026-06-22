Add Dependabot auto-merge workflow.

Patch-level Dependabot PRs now self-merge once CI passes, removing the need to manually review and approve dependency bumps that carry no breaking changes.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches — no migration
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised — workflow-only addition, no logic changes
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged — `gh pr merge --auto` is idempotent; patch-only scope
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English — n/a
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — haiku used for all three reviewers

## For you
**What changed:** `.github/workflows/dependabot-auto-merge.yml` added — triggered on `pull_request_target`, actor-gated to `dependabot[bot]`, merges patch updates automatically with `gh pr merge --auto --squash` once CI passes.
**What you do next:** Review the diff and merge — then two manual clicks in GitHub: (1) **Settings → General → Allow auto-merge** (toggle ON); (2) **Settings → Rules → your `main` ruleset → Bypass list → Add bypass → Integration → Dependabot → Pull requests only**. These are dashboard settings the workflow requires but that can't be committed.
**How to roll it back:** Delete `.github/workflows/dependabot-auto-merge.yml` and revert the bypass list entry in the ruleset.
