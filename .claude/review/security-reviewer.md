# security-reviewer verdict — align model-tier dispatch rule to the hierarchy model

**Verdict: APPROVE.** No security findings.

Documentation-only diff: `CLAUDE.md` (Agents model-tier wording, a new Self-check box,
the Supabase `seed.sql` bullet) and `.claude/agents/researcher.md` (tier prose).

- **No new table / no migration** in this diff — RLS check not applicable.
- **No secret in client code.** The enriched seed bullet describes GoTrue auth-user
  seeding (`''`-not-NULL token columns, self-healing UPDATE) for preview/local `seed.sql`
  only — it never directs committing a service-role or real secret, and does not touch
  the publishable-key-only-in-browser rule.
- **No `src/services/` input path changed** — server-side validation check not applicable.
- **No auth/money/PII/upload logic changed** — the seed guidance opens no new attack
  surface; the `researcher.md` tier change touches no data path.
