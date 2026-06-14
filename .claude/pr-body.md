# Seed a ready-made course for the demo account

A preview branch is a fresh, isolated database that starts empty and is only
populated by `seed.sql`. The demo account could log in, but with no courses,
lessons, or mock tests there was nothing to click into — most of the app was
unreachable in a preview. This seeds one complete, public, already-generated
course owned by the demo user so the whole learning loop is explorable on a
fresh preview: dashboard, course map, the three lessons, Explore, save/clone,
and the mock-test builder.

## What's in the diff (`supabase/seed.sql` only)
- A public `'ready'` course **"Photosynthesis Crash Course"** owned by the fixed
  demo user id, with 2 chapters, 3 lessons, and 6 questions.
- The questions cover **all four kinds** — mcq, mcq_multi, fill_blank, and a
  **calc** question — so every lesson UI is exercised, and the calc question also
  demonstrates the calc-in-mock-test fix that just merged.
- Lessons carry a `credit_prize` (10/10/15), so finishing one flawlessly also
  exercises the credit award.

## Idempotency & correctness
- `delete from courses where id = <fixed course uuid>` runs first; the course's
  `on delete cascade` wipes its chapters/nodes/questions (and any demo progress
  or mock tests on it) before the re-insert, so re-seeding never duplicates —
  the same delete-then-insert pattern the existing pet seed uses.
- Verified by hand and by the code reviewer against the live schema: every NOT
  NULL column supplied, all CHECK domains satisfied (status, visibility, kind
  incl. `calc`, difficulty, credit_prize ≥ 0), no duplicate positions within any
  chapter/node, `answer` jsonb shaped per kind with valid `correct_indexes`, and
  a well-formed calc spec (`molecules * 8`, always an integer answer).

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

(No migration in this PR — it's a `seed.sql`-only change, which is not a
migration and is fixed forward in place. No new table, no RLS surface, no
`src/types` change. The 207 existing tests / lint / typecheck stay green;
seed.sql is not covered by unit tests, so its correctness was verified against
the schema by hand and by the code reviewer. Reviewers ran on Sonnet, one tier
below this Opus session — all three PASS.)

## For you
**What changed:** the demo account now starts with a real, public course
("Photosynthesis Crash Course") containing chapters, lessons of every question
type, and a mock-test-ready set — so you can actually open and use the app in
the preview instead of staring at empty lists.

**What you do next:** review this PR's preview. It gets a brand-new branch DB, so
the updated seed runs on creation and the course will be there. Log in as
`demo@example.com` / `password123`, open the Dashboard or Explore, click into the
course, take a lesson (finish one with no mistakes to see the credit award), and
build a mock test to see the calc question render correctly. Then merge.

**How to roll it back:** revert this PR. On a database that already seeded it,
`delete from courses where id = 'c0000000-0000-0000-0000-000000000001';` removes
the course and all its content via cascade.
