Sync edu repo to the guide's updated Vite "set it up" section. The guide was updated so that step 6.7 configures the Supabase→Vercel integration to inject `VITE_`-named vars into previews (matching production), eliminating the need for the `NEXT_PUBLIC_` fallback chain. This PR applies that change across every file in the env-var contract.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY ?? VITE_SUPABASE_ANON_KEY`; `envPrefix: ['VITE_']`; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** Removed the `NEXT_PUBLIC_` two-prefix fallback across the entire env-var contract — `CLAUDE.md` (architecture rule, self-check item, memory example), `vite.config.ts` (envPrefix), `src/lib/supabaseClient.ts`, `src/vite-env.d.ts`, `api/health.ts`, `src/CLAUDE.md`, `README.md`, `docs/RUNBOOK.md`, and `MEMORY.md` — now all consistently use `VITE_` only, matching the guide after step 6.7 configures the integration prefix.
**What you do next:** confirm the Supabase→Vercel integration prefix is set to `VITE_` in your dashboard (Supabase → project → Settings → Integrations → Vercel → Manage → Prefix = `VITE_`), then review and merge.
**How to roll it back:** revert this PR's merge commit — that restores the two-prefix fallback chain across all files.
