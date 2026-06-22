Replace ESLint + Prettier with Biome, and switch CI runners to Depot.

Biome replaces two separate tools with one binary that is ~10–25× faster in CI. Depot replaces GitHub's default runners with up to 3× faster build execution and 10× faster cache I/O.

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
**What changed:** ESLint + Prettier removed; Biome 1.9.4 installed (`biome check .` = lint, `biome check --write .` = fix). Pre-existing patterns that Biome flags but ESLint didn't (KaTeX dangerouslySetInnerHTML, numerical parameter assigns, etc.) have targeted `biome-ignore` comments with explanations. Both `ci.yml` and `e2e.yml` now use `runs-on: depot-ubuntu-latest` for faster builds.

**What you do next:** Two things before merging — both are yours to do:
1. **depot.dev → Sign up → Install the Depot GitHub App for this repository.** (If you skip this, CI will fail with "depot-ubuntu-latest" runner not found.)
2. **Confirm Depot is installed**, then merge.

**How to roll it back:** Revert this PR. To restore ESLint + Prettier, the old `eslint.config.js`, `.prettierrc`, `.prettierignore` and their devDependencies are in the git history. To restore GitHub runners, change `depot-ubuntu-latest` back to `ubuntu-latest` in both workflow files.

no new lesson — all suppressions documented in MEMORY.md under Biome suppression format entry.
