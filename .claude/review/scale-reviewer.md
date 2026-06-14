# scale-reviewer verdict — delete-account

**Verdict: PASS.** No scale findings.

- The function issues exactly one `admin.auth.admin.deleteUser(userId)` call; no
  loop, no per-row fetch, no N+1. Child rows go via the DB cascade, not app code.
- Idempotent: a not-found error is treated as success; the client does one
  invoke with no retry loop, and the UI blocks a second in-flight call.
- The cascade is 2–3 levels (auth.users → courses → chapters → nodes →
  questions; plus materials/mock_tests/progress/saves), runs in one transaction,
  and every participating FK column is indexed (`courses_owner_id_idx`,
  `mock_tests_owner_id_idx`, `saved_courses_course_id_idx`, …). No batching
  needed at this app's scale.
