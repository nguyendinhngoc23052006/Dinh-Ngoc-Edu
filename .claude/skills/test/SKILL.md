---
name: test
description: Design durable mocked tests for a feature or file. Use when asked to test something or when a change lacks coverage.
---

# /test <feature or file>

Design durable tests for the named feature or file. Durable means: they mock at the
boundary (no real DB, no secrets), they pin behavior the project relies on, and they run
in CI on every PR without setup.

## Step 1 — Pick the smallest meaningful unit

Read the target and its callers first. Test the smallest unit that has behavior worth
pinning — a service function, a hook, a validation rule — not the whole page. If the
target is a feature spanning several files, list the units and test each one where it
lives; don't write one mega-test.

## Step 2 — Enumerate the paths before writing code

For each unit, write down what the happy path proves AND which unhappy paths exist:

- **empty** — no rows / no input: the unit returns its empty state, not a crash.
- **invalid** — malformed or out-of-range input: rejected server-side with a clear error.
- **unauthorized** — wrong or missing user: the unit refuses; never leaks another user's rows.
- **duplicate / idempotent write** — the same write sent twice: one effect, not two.

Skip a path only when the unit genuinely cannot reach it (per the simplicity rule:
no error handling for unreachable states) — and say so in the PR instead of silently
omitting it.

## Step 3 — Write them goal-driven

- **Failing test first**: write the test, watch it fail for the right reason, then make
  it pass. If it passes immediately, it isn't testing the change.
- Mock the Supabase client (or other boundary) with Vitest mocks; never fake a DB to
  pass, never require a secret. Nothing testable may need a prod-only secret.
- **Type every mock with the generated row types from `src/types`** — a mock shaped by
  hand can drift from the real schema and keep passing; a typed mock makes schema drift
  fail `typecheck` on the same PR that changed the migration.
- Assert on behavior (return values, thrown errors, calls made), not implementation
  details that refactors would break.

## Step 4 — Name and place for the CI gate

Name files `<unit>.test.ts` and put each beside the code it tests (the existing pattern:
`src/lib/supabaseClient.ts` ↔ `src/lib/supabaseClient.test.ts`). Name each test after the
path it guards (`rejects unauthorized`, `idempotent on resubmit`) so coverage of the four
unhappy paths is greppable, not a matter of trust. Vitest picks them up via
`npm test`, which is the CI `tests` job — so every PR reruns them automatically. Don't
add config, scripts, or folders for tests.

## Step 5 — Never weaken a test to make it green

A red test means the code is wrong or the test's expectation is wrong — find out which.
Fix the code, or fix a genuinely mistaken expectation and say why in the PR. Never
loosen an assertion, delete a case, or mark it skipped to get to green. After two failed
tries at making a test pass honestly, report instead of thrashing.

## Step 6 — Ship

ONE PR into `main` from a `claude/…` branch with the completed `## Self-check` checklist
and the `## For you` block. The PR description lists every test added and **what each one
guards** — the failure it would catch, in one plain-English line per test.
