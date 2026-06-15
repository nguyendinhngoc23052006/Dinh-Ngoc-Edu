# Sync the constitution Self-check with the corrected pipeline guide

A one-line follow-up to the E2E gate PR. The pipeline guide's canonical
constitution was corrected (guide PR #3) to list `e2e` in the Self-check's
"green" gates line, matching the script-names line right below it and the
required checks in step 9. This brings the app's `CLAUDE.md` back in step with
the guide.

## What's in the diff
- **`CLAUDE.md` (constitution)** — Self-check line
  `tests/lint/typecheck green` → `tests/lint/typecheck/e2e green`. **Docs-only**,
  no code/migration/secret touched. After this, the app's constitution is
  character-for-character identical to the guide's canonical step-3 `CLAUDE.md`.

## Flag
- This edits the read-only constitution, so it rides this branch for **your**
  review/merge — not self-merged. It's a pure text sync to the now-merged guide.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

(No migration, no irreversible action — N/A and true by absence. All four gates
run green locally: `lint`, `typecheck`, `test` 244, `e2e` 3. Reviewers ran on
Sonnet, one tier below this Opus session — all three PASS. **No new lesson** —
the E2E gate is already recorded in `MEMORY.md`; this is a consistency sync.)

## For you
**What changed:** the constitution's Self-check now lists `e2e` alongside
`tests/lint/typecheck` as a gate that must be green, matching the corrected guide.

**What you do next:** review, then merge. No env or dashboard changes.

**How to roll it back:** revert this PR — it's a single documentation line.
