Throwaway PR to smoke-test the Vercel preview deployment **and** the seeded login.

## What's in it
1. A harmless comment line in `README.md`.
2. A no-op migration (`select 1;`) under `supabase/migrations/`. This second file is the important one: the Supabase→GitHub integration's "Supabase changes only" option **skips preview-branch creation for any PR that doesn't touch `supabase/`** — and with no branch, `seed.sql` never runs, so the `demo@example.com / password123` login is never created and the preview can't be logged into. Touching `supabase/` forces the branch + seed.

Preview login created by the seed: **demo@example.com / password123**.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches (one no-op migration `20260613132810`, latest timestamp; creates no table, so no RLS/types change)
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised (no code changed; migration is `select 1;`)
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code (no code changed)
- [x] irreversible actions guarded + idempotent + flagged (none — no-op migration + docs comment)
- [x] no avoidable debt; memory updated and pruned (no new lesson — the "Supabase changes only skips branch creation" gotcha is already in MEMORY.md)
- [x] migrations explained in plain English (the migration does nothing — `select 1;` — it exists only to trigger preview-branch creation so the seed runs)

## For you
**What changed:** a throwaway README comment plus a no-op migration whose sole job is to make Supabase cut a preview branch and run the seed, so the preview has a login.
**What you do next:** open the PR's preview deployment, sign in with **demo@example.com / password123**, confirm it builds and renders; then delete the branch (don't merge) — there's nothing here worth keeping.
**How to roll it back:** close the PR and delete the branch, or revert the two commits. The migration creates nothing, so there's no schema or data to un-migrate.
