---
name: revert
description: Route the human to the right undo for a bad change. Use when something broke after a merge or when asked to revert.
---

# /revert

Something merged is wrong. Find what kind of damage it is, then route the human to the
right undo. **You draft and guide; the human executes.** Never merge, never push to
`main`, never run anything against production yourself — every undo below ends with
either a PR the human merges or a dashboard click-path the human performs.

## Step 1 — Diagnose: code, schema, data, or money?

Read the suspect PR's diff (usually the most recent merge into `main`) and ask the human
what symptom they see. Classify the damage — a PR can cause more than one kind; handle
each, **money first, then data, then schema, then code** (least reversible first):

- **Code** — wrong behavior, broken UI, bad deploy; the database is intact.
- **Schema** — a migration changed tables/columns/policies and that change is the problem.
- **Data** — rows were lost or corrupted (a destructive migration or bad write); reversing
  the schema won't bring the rows back.
- **Money** — a charge fired that shouldn't have.

## Step 2 — Route to the undo

### Code → Vercel Instant Rollback, or a Revert PR
- **Fastest (minutes, no commit):** Vercel dashboard → project → **Deployments → previous
  production deployment → ⋯ → Instant Rollback**. Stops the bleeding; the bad code is
  still on `main`.
- **Durable:** draft a revert of the bad merge on a fresh `claude/…` branch (GitHub's
  "Revert" button or `git revert -m 1 <merge-sha>`), open the PR, and tell the human to
  merge it. If they used Instant Rollback first, the revert PR is still required — `main`
  must match production again.

### Schema → a reversing-migration PR (fix-forward, never edit history)
- Never edit, rename, or delete the merged migration file — write a **new** migration
  (UTC timestamp later than the newest) that reverses the change: drop what it added,
  re-add what it dropped, restore the previous policies.
- If the bad migration also reverted code expectations, revert that code in the same PR
  so schema, code, and `src/types` agree again.
- Warn before drafting: if the migration **dropped or rewrote data**, a reversing
  migration restores the shape, not the rows — that part is a data problem (next route).

### Data → guide PITR (point-in-time recovery)
- Establish the timestamp just **before** the damage (the bad merge/deploy time is the
  upper bound).
- Guide the human: Supabase dashboard → project → **Database → Backups →
  Point in Time → choose the timestamp → restore**. State clearly that PITR rewinds the
  WHOLE database to that moment — writes after it are lost — so they should do it soon
  and confirm the timestamp against when real user writes resumed.
- If only a few rows are affected and recent writes matter, say so: a targeted fix may
  beat a full rewind — but the human decides; never run data-changing SQL yourself.

### Money → the provider's undo
- Route to the payment provider's reversal for the situation: **refund** a captured
  charge, **void** an uncaptured authorization, **cancel** a subscription — via the
  provider dashboard (click-path) or a drafted server-side call the human triggers.
- Also stop the cause: if the charging code is still live, pair this with the Code route
  so it can't fire again. Check idempotency records to list exactly which charges need
  undoing — never guess.

## Step 3 — Hand over

End with a short numbered action list for the human: each step is one undo, in the order
above, marked **[you click]** (dashboard action) or **[you merge]** (a PR you drafted,
with its link). Close by stating what is NOT recoverable, if anything, in one sentence.
