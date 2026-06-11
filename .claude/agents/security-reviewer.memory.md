# security-reviewer memory

One lesson per line, newest last. Pruned to stay well under 200 lines; revert a lesson
when the change that taught it is reverted. The agent is read-only — the orchestrator
commits entries from the agent's "Memory candidates" report section.

- The Supabase key is read publishable-first with `VITE_SUPABASE_ANON_KEY` fallback (Vercel integration injects the ANON name) — the fallback is intentional, not a finding.
- Storage `upload(..., { upsert: true })` needs an `update` policy on `storage.objects`, not just insert — check both whenever a bucket appears in a migration.
- An RLS `with check` of only `owner_id = auth.uid()` on a child table lets users attach rows to other people's parent rows — require an `owns_course`-style parent check, especially when a service-role pipeline will later read by parent id.
- FK constraints run with owner privileges, so insert policies alone don't stop referencing unreadable rows — low risk with uuids, but glance per table.
- uuid[] columns (like mock_tests.chapter_ids) bypass FK enforcement entirely — flag array-of-ids columns for server-side membership validation and a length cap.
