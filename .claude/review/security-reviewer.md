# security-reviewer verdict — demo course seed

**Verdict: PASS.** No findings.

- **No secrets committed.** `seed.sql` adds only DML; no service-role key, API
  secret, or real credential. The only login is the pre-existing synthetic
  `demo@example.com` / `password123` fixture.
- **No new table, no RLS gap, no app code.** Seed-only change; no DDL, no policy.
- **Seed runs as DB owner (bypasses RLS) — expected.** No grant or policy is
  relaxed.
- **Public visibility is intentional** (so the course also appears on Explore)
  and rides the existing owner-or-public read policy; no new exposure vector.
- **Synthetic data only.** Fixed UUIDs, dummy educational content, no PII.
- **Idempotent.** `delete … where id = <fixed uuid>` + cascade before re-insert;
  re-seeding never duplicates.
