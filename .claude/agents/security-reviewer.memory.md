# security-reviewer memory

One lesson per line, newest last. Pruned to stay well under 200 lines; revert a lesson
when the change that taught it is reverted. The agent is read-only — the orchestrator
commits entries from the agent's "Memory candidates" report section.

- The Supabase key is read publishable-first with `VITE_SUPABASE_ANON_KEY` fallback (Vercel integration injects the ANON name) — the fallback is intentional, not a finding.
- Storage `upload(..., { upsert: true })` needs an `update` policy on `storage.objects`, not just insert — check both whenever a bucket appears in a migration.
- An RLS `with check` of only `owner_id = auth.uid()` on a child table lets users attach rows to other people's parent rows — require an `owns_course`-style parent check, especially when a service-role pipeline will later read by parent id.
- FK constraints run with owner privileges, so insert policies alone don't stop referencing unreadable rows — low risk with uuids, but glance per table.
- uuid[] columns (like mock_tests.chapter_ids) bypass FK enforcement entirely — flag array-of-ids columns for server-side membership validation and a length cap.
- `revoke execute ... from anon` on a function is a no-op (EXECUTE defaults to PUBLIC) — require revoke-from-PUBLIC + grant-to-authenticated, or an explicit `auth.uid()` check inside (caught in clone_course, PR #12).
- Background-pipeline Edge Functions need an atomic status claim (conditional UPDATE, check affected rows); an "already done" early-return doesn't stop spammed/concurrent runs (caught in generate-course, PR #12).
- Error columns written from raw provider responses inherit the row's select policy — check who can read diagnostics on shareable rows (generation_error was anon-visible, PR #12).
- `${window.location.origin}${path}` is only safe when `path` is forced to start with a single `/` — non-`/`-prefixed input rewrites the host; guard inside the auth service, not at call sites.
- OAuth `redirectTo`/`emailRedirectTo` silently fall back to the Site URL unless the target (incl. Vercel preview wildcards) is on Supabase's Redirect URLs allow-list — auth PRs must name that dashboard step.
- AI-output validators must length-cap every persisted string, not just titles — `validateQuestion` capped counts but not `prompt`/`options` (generate-course).
