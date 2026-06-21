Rename every user-visible and config reference from "Last Minute Self Learning" / `last-minute-self-learning` to **Dinh Ngoc Edu** / `dinh-ngoc-edu`. No logic changes.

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

## For you
**What changed:** Renamed the project from "Last Minute Self Learning" to "Dinh Ngoc Edu" across supabase/config.toml (project_id label), package.json + package-lock.json (name field), index.html (page title), AppLayout.tsx (nav brand), LandingPage.tsx (hero kicker), README.md (H1), docs/ARCHITECTURE.md (H1), and MEMORY.md (rename record).
**What you do next:** Review the preview, then merge — no env or secret changes needed.
**How to roll it back:** Revert this PR; all changes are display strings and local metadata with no database or infrastructure impact.
