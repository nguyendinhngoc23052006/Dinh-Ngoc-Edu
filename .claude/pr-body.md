Two operational fixes, requested together and shipped as one PR on the single branch I'm allowed to push.

## What's in it
1. **Fix the broken "Finish lesson" button.** Pressing *Finish lesson* failed with **"Failed to send a request to the Edge Function"** at any score. Root cause: the `complete-lesson` Edge Function was never declared in `supabase/config.toml`, and the Supabase→GitHub integration deploys **only declared functions** — so the function existed in the repo but was never deployed to the project. Invoking a non-existent function returns a CORS-less error the browser reports as `FunctionsFetchError`. The function code was already correct; the fix is a one-block `[functions.complete-lesson]` declaration (matching the two existing functions, `verify_jwt = true`). On this PR's preview branch the function deploys, so the fix is testable before merge; on merge it deploys to production.
2. **Add the production uptime monitor (pipeline step 8.4).** A permanent `GET /health` endpoint plus `.github/workflows/uptime.yml`:
   - Because this is a Vite SPA (no server routes), `/health` is a **Vercel Edge Function** at `api/health.ts`, reached via a new `vercel.json` rewrite (`/health → /api/health`, placed before the catch-all). It makes one round-trip to Supabase Auth (`/auth/v1/health`, no app tables) and returns the plain text `ok` — so the monitor checks the real app→database path on your Vercel domain, exactly as the guide specifies.
   - `uptime.yml` runs every 30 minutes, reads the `PRODUCTION_URL` Actions variable, **no-ops (stays green) when it's unset**, and otherwise fetches `${PRODUCTION_URL}/health` and opens — or updates, never duplicates — an issue titled `uptime: /health failing`.
   - `tsconfig.json` now includes `api/` so the new endpoint is typechecked; the endpoint reads the public Production env via the same two-prefix fallback as the browser client (no secret).

This branch was rebased onto current `main` (PR #24's seeded-login fix), so it merges cleanly.

## Constitution
At your request, this PR also adds the guide's `/health`-protection rule to the repo `CLAUDE.md` under **## Quality gate** — `/health is a permanent route; never remove or rename it — the uptime workflow depends on it` — bringing the repo constitution in line with the canonical version in the pipeline guide.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches (no migration in this PR — config + workflow + endpoint only)
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised (153 tests pass; `/health` returns `ok` on a reachable DB and `503` when config is missing or Supabase is unreachable; `uptime.yml` no-ops on unset `PRODUCTION_URL` and de-dupes the issue)
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code (`/health` uses the public publishable key only)
- [x] irreversible actions guarded + idempotent + flagged (the monitor only opens/updates a single issue, never duplicates; no state-changing app action added)
- [x] no avoidable debt; memory updated and pruned (supabase/CLAUDE.md gets the function-declaration rule; MEMORY.md gets the `/health` Edge-Function pattern)
- [x] migrations explained in plain English (n/a — no migration)

## For you
**What changed:** finishing a lesson works again (the credit-awarding Edge Function is now actually deployed), production gains a 30-minute uptime check that files a GitHub issue if the live site can't reach its database, and the repo `CLAUDE.md` now protects `/health`.
**What you do next:** review the preview, then merge. To confirm fix #1 on the preview, generate a course and press *Finish lesson* — it should no longer error. For the monitor to run against production, set the Actions variable **Settings → Secrets and variables → Actions → Variables → New repository variable** → name `PRODUCTION_URL`, value your production URL (until then the workflow stays green and idle, by design). After merge you can also trigger it manually via **Actions → uptime → Run workflow**.
**How to roll it back:** revert this PR on GitHub. Removing the `[functions.complete-lesson]` block stops the function deploying again; deleting `api/health.ts`, the `vercel.json` rewrite line, and `uptime.yml` removes the monitor; the `CLAUDE.md` line drops with the revert. No schema or data changes, so nothing to un-migrate.
