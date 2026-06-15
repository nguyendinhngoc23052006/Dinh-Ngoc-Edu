# Deploy & operations runbook

How this app ships, what it needs to run, and how to undo a bad change. Pair
with [`ARCHITECTURE.md`](ARCHITECTURE.md) for what the code does.

## The four moving parts

| Part | Role |
| --- | --- |
| **GitHub** | Source of truth + gates. CI (`ci.yml`, `e2e.yml`) must pass; `main` is protected. |
| **Supabase** | Postgres + Auth + Storage + Edge Functions. Schema is **only** the migration files in `supabase/migrations/` — merging a PR is what applies them. |
| **Vercel** | Builds and hosts the SPA. Each PR gets a preview deployment; `main` is production. |
| **AI provider** | An OpenAI-compatible chat endpoint (default: Gemini free tier) used by `generate-course`. |

## Release flow

1. Branch off `main`, open **one** PR back into `main`.
2. The PR gets a Vercel **preview** + a Supabase **preview branch** (an
   isolated DB instance). Only *new* migration files run on it — never edit a
   merged migration; fix forward with a new one.
3. Review the preview, confirm CI is green.
4. **Merge.** Merging applies any new migrations to production and Vercel
   deploys `main`. Only the human merges and deploys — agents never do.

## Environment variables

The browser client reads Supabase config through a two-prefix fallback
(`src/lib/supabaseClient.ts`), so the same build works in both places:

| Variable | Where it's set | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Vercel **Production** (set by hand) | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Vercel **Production** (set by hand) | Publishable key only — never a secret |
| `NEXT_PUBLIC_SUPABASE_URL` | Injected into **previews** by the Supabase→Vercel integration | Fallback for previews |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Injected into **previews** | Fallback for previews |

Setting production vars — click-path: **Vercel → the project → Settings →
Environment Variables → add `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` scoped to Production → redeploy.** Mirror any
change in `.env.example` and in `vite.config.ts`'s `envPrefix` if the prefixes
ever change (move all of it in one PR).

## Edge Function secrets (server-only)

Edge Functions read secrets from `Deno.env` — never committed, never sent to
the browser. Required by `generate-course`:

| Secret | Required | Default |
| --- | --- | --- |
| `AI_API_KEY` | yes | — |
| `AI_BASE_URL` | no | Gemini free-tier endpoint |
| `AI_MODEL` | no | Gemini free-tier model |

Setting them — click-path: **Supabase → the project → Edge Functions →
Secrets (or `npx supabase secrets set AI_API_KEY=…`).** Deployed functions:
`generate-course`, `extract-material`, `complete-lesson`, `delete-account`.

## Health check & uptime monitor

- **`/health`** is a permanent Vercel Edge Function (`api/health.ts`) reached
  through the `vercel.json` rewrite. It makes one round-trip to Supabase Auth
  and returns plain-text `ok` (200) when the deployed app can reach its
  database, or a 503 otherwise. **Never remove or rename it** — the uptime
  workflow greps for that exact response. Uses only public env, no secret.
- **`uptime.yml`** runs every 30 minutes (and on demand), probes
  `${PRODUCTION_URL}/health`, and opens/updates a GitHub issue labelled
  `uptime` when it fails. It needs a repo **variable** `PRODUCTION_URL`.

  Setting it — click-path: **GitHub → repo → Settings → Secrets and variables
  → Actions → Variables → add `PRODUCTION_URL` = your production origin** (no
  trailing slash needed). If unset, the workflow exits green and monitors
  nothing.

Manual probe: `curl -s https://<production-origin>/health` → expect `ok`.



## Rolling back

Pick the smallest undo that fixes the problem:

- **Bad frontend / Edge Function deploy:** Vercel → the project →
  Deployments → pick the last good one → **Instant Rollback** (Promote to
  Production). No code change, takes effect immediately.
- **Bad merged PR (code):** revert the merge commit with a new PR into
  `main` (`git revert -m 1 <merge-sha>`), let CI run, merge. The revert
  redeploys automatically.
- **Bad migration:** migrations are **fix-forward** — never edit, rename, or
  re-timestamp a merged one. Add a *new* migration that undoes the damage
  (e.g. `DROP`/`ALTER` to reverse it) and merge it. The first migration is the
  immutable baseline; production history always equals the repo.
- **Leaked or rotated secret:** rotate it at the provider, then update the
  Supabase Edge Function secret (or Vercel var) — no redeploy of code needed
  for Edge secrets; redeploy for Vercel build-time vars.
