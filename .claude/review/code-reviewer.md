# code-reviewer verdict — demo course seed

**Verdict: PASS.** No code-quality findings on the seed diff.

- All NOT NULL columns supplied; schema defaults cover the rest.
- All CHECK constraints satisfied: `status='ready'`, `visibility='public'`, all
  `kind` values valid (mcq, fill_blank, mcq_multi, calc — calc allowed since
  `20260613050000_calc_questions.sql`), all `difficulty` values valid (easy,
  medium, hard), `credit_prize` values (10, 10, 15) all `>= 0`.
- No UNIQUE violations: chapter positions (1,2) distinct within the course; node
  positions distinct within each chapter; question positions (1,2) distinct
  within each node.
- `answer` jsonb matches each kind: mcq/mcq_multi → `correct_indexes` (every
  index valid into its 4-element options array), fill_blank → `accepted`, calc →
  `{}` with `options=[]` and a well-formed calc spec in the `calc` column.
- `delete from courses where id = <fixed uuid>` + `on delete cascade` makes the
  whole block idempotent on re-seed.
