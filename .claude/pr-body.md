Redesign the Stop hook to verify a committed artifact instead of GitHub, teach /verify the integration's health signs, and sync CLAUDE.md to the current pipeline revision.

**Assumptions:** the constitution edits were pre-approved in chat (the human directed this sync); no schema or app code changes, so no migration and no preview-behavior change.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches (no migration in this PR)
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised (hook tested both: compliant file passes, missing/unticked blocks, Q&A passthrough passes)
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged (none in this PR)
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English (no migration)

## For you
**What changed:** the Stop hook now verifies the committed `.claude/pr-body.md` with git and the filesystem only, so it works identically in cloud sandboxes (no more `gh`-unavailable false blocks) while still hard-blocking a task that lacks the ticked Self-check; pure Q&A sessions (no commits ahead of main, clean tree) pass automatically. `/verify` now also checks the PR's "Supabase Preview" check isn't *skipped* and that the preview renders instead of the missing-config error, routing to the close/reopen remedy. CLAUDE.md is synced to the current pipeline revision (visible-error rule, preview-applies-only-NEW-migrations clause, workflow-jobs CI wording, agent/skill-removal rule, and the pr-body.md rule this hook enforces). MEMORY.md lessons updated to match.
**What you do next:** review and merge — no env, secret, or dashboard action needed.
**How to roll it back:** revert this PR on GitHub; the old hook behavior (gh-based, false-blocking in cloud) returns.
