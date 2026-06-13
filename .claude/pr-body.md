Throwaway PR to smoke-test the Vercel preview deployment.

## What's in it
A single harmless comment line added to `README.md`. No source, schema, config, or workflow changes — the only purpose is to open a PR so the preview pipeline (Vercel build + the Supabase→Vercel env injection) runs and can be eyeballed before merge. Delete the branch instead of merging once the preview is confirmed.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches (no migration — README comment only)
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised (no code changed; existing suite unaffected)
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code (no code changed)
- [x] irreversible actions guarded + idempotent + flagged (none — docs-only change)
- [x] no avoidable debt; memory updated and pruned (no new lesson — throwaway test PR)
- [x] migrations explained in plain English (n/a — no migration)

## For you
**What changed:** added one throwaway comment line to `README.md` purely to trigger a preview build.
**What you do next:** open the PR's preview deployment and confirm it builds and renders; then delete the branch (don't merge) — there's nothing here worth keeping.
**How to roll it back:** close the PR and delete the branch, or revert the single README commit. No schema, data, env, or secret changes.
