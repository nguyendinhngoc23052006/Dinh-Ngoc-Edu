Harden the testing system per the updated pipeline: typed mocks, sibling-test review flag, and a coverage signal in CI.

**Assumptions:** rules-and-tooling change only — no schema, no app behavior change, no migration. No new lesson (the typed-mocks rule lives in the constitution, which this PR's predecessor already synced).

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches (no migration in this PR)
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised (coverage run verified locally: 103/103 passing with summary output)
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged (none in this PR)
- [x] no avoidable debt; memory updated and pruned (no new lesson — rule recorded in the constitution)
- [x] migrations explained in plain English (no migration)

## For you
**What changed:** CLAUDE.md and the `/test` skill now require every mock to be typed with the generated row types from `src/types`, so schema drift fails `typecheck` instead of passing silently, and tests to be named after the path they guard. The code-reviewer agent now flags any changed `src/services` file without a sibling test change in the same diff. The CI `tests` job runs with Vitest coverage and prints the text summary into the GitHub job summary — a review-time signal, never a threshold gate (`@vitest/coverage-v8` is the one new dev dependency, lockfile committed).
**What you do next:** review and merge — no env, secret, or dashboard action needed. Named next task (deliberately not here): a standalone refactor PR extracting pure helpers from the Edge Functions so a `deno test` CI `functions` job can cover them.
**How to roll it back:** revert this PR on GitHub; the untyped-mock rules and plain test job return.
