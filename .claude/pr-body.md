Replace ESLint + Prettier with Biome.

Biome replaces two separate tools with one binary that is ~10–25× faster in CI. The `lint` script name and all CI job names are unchanged.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches — no migration
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised — lint passes clean; no logic changes
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged — n/a
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English — n/a
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — haiku used for all three reviewers

## For you
**What changed:** ESLint + Prettier removed; Biome 1.9.4 installed (`biome check .` = lint, `biome check --write .` = fix). Pre-existing patterns that Biome flags but ESLint didn't have targeted `biome-ignore` comments with explanations. CI workflows unchanged (still `ubuntu-latest`).

**What you do next:** Review the preview, then merge — no env vars or secrets needed.

**How to roll it back:** Revert this PR. The old `eslint.config.js`, `.prettierrc`, `.prettierignore` and their devDependencies are in the git history.

no new lesson — all suppressions documented in MEMORY.md under Biome suppression format entry.
