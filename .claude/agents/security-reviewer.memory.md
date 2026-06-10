# security-reviewer memory

One lesson per line, newest last. Pruned to stay well under 200 lines; revert a lesson
when the change that taught it is reverted. The agent is read-only — the orchestrator
commits entries from the agent's "Memory candidates" report section.

- The Supabase key is read publishable-first with `VITE_SUPABASE_ANON_KEY` fallback (Vercel integration injects the ANON name) — the fallback is intentional, not a finding.
