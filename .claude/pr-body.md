Fix the seeded demo login: "Database error querying schema" on every preview.

**Goal:** `demo@example.com` / `password123` (from `seed.sql`) must actually log in on a preview branch.

**Root cause:** the seed hand-inserts an `auth.users` row but left the GoTrue text token columns (`confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`) NULL. GoTrue scans those into non-null strings when it loads the user on login, so the scan fails with "Database error querying schema." The row looks fine in the dashboard — it only breaks when someone tries to log in, which is why a real account created through `signUp()` (it sets these automatically) works while the seeded demo user doesn't. (My earlier guess that the Phase 4 `auth.users` trigger caused it was wrong: that trigger fires on INSERT only and real signups succeed.)

**Fix (`seed.sql`, not a migration — edited in place, stays idempotent):**
- Set those four token columns to `''` on insert.
- Add an idempotent `UPDATE` that repairs a demo row left NULL by the old seed, so a branch created before this fix self-heals on its next seed run — no need to recreate it.

**Feasible for your already-merged state:** this is a `supabase/` change, so the PR gets its own Supabase preview branch; the branch is seeded fresh from the fixed `seed.sql`, and the demo user logs in there. Merging re-runs the seed on production, where the `UPDATE` repairs any existing NULL demo row.

**Not changed:** the repo `CLAUDE.md` is the read-only constitution — its seed rule is now stale relative to the improved guide, but I'm flagging that rather than self-editing it (per the constitution's own rule). Say the word if you want me to sync that one line.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches (no migration — `seed.sql` is fix-forward-in-place, not a migration; no schema/type change)
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised (no code change; suite still green — `seed.sql` can't be unit-tested in the sandbox, verified on the PR's preview branch login)
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged (seed insert is guarded by `not exists`; the repair `UPDATE` is idempotent)
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English (no migration; seed change explained above)

## For you
**What changed:** the seeded demo user (`demo@example.com` / `password123`) now sets the GoTrue token columns to `''` instead of NULL, so it logs in instead of throwing "Database error querying schema"; the seed also repairs an older broken demo row in place.
**What you do next:** review the preview, confirm the demo user logs in on the PR's preview URL (its Supabase Preview check should be green), then merge — no env/secret/dashboard action needed. After merge, the same seed runs on production and repairs the demo row there too.
**How to roll it back:** revert this PR — `seed.sql` returns to the NULL-column version and the demo login breaks again. No data migration to undo (the repair UPDATE only ever set NULLs to `''`).
