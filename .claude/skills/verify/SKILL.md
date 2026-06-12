---
name: verify
description: Walk the human through checking the current PR's preview. Use when a PR is ready for review or when asked to verify.
---

# /verify

Prepare the human to review the current PR's preview deployment. This skill is
**read-only**: read code, run reviewer agents, inspect deployments and logs — never
edit files, push commits, re-deploy, merge, or change any data. Findings are reported;
fixes are a separate task.

## Step 1 — Identify the PR and summarize what changed

Find the open PR for the current `claude/…` branch. Read its diff and write one
plain-English sentence per change — what it does for the user, not which files moved.
If the PR has a migration, restate in plain English what the migration does to the data.

## Step 2 — Run the three reviewers

Launch `security-reviewer`, `code-reviewer`, and `scale-reviewer` on the branch diff,
in parallel (they are read-only). Report their findings verbatim under a "Reviewer
findings" heading, ordered worst-first. Do not soften or summarize away a finding;
do not fix anything.

## Step 3 — Confirm the preview hits its own branch DB

Before telling the human to click anything, verify the preview deployment is wired to
the PR's own Supabase preview branch, not production:

- The PR's **Supabase Preview** check is green — *skipped* means no preview branch was
  created and the preview has NO database credentials.
- The preview page renders the app, not the "This deployment failed to start /
  missing Supabase config" text. Either failure → route the human to the connection
  fix: relink Supabase↔Vercel, then **close and reopen the PR** (env sync fires only
  at PR-open).
- The client reads `VITE_SUPABASE_URL` from env (never hardcoded) — confirm in code.
- Confirm the preview deployment's env points at the preview branch's URL (project ref
  differs from production's).
- Remember a preview branch starts empty (own Auth/Storage): note what must be seeded
  for the walkthrough (a login user, sample rows) and whether `seed.sql` covers it.

If the preview is pointed at the production DB, **stop here and report it** — that is
the first thing the human must know, and nothing should be clicked until it's fixed.

## Step 4 — Exercise happy AND unhappy paths

From the diff, list the user-visible flows this PR touches. For each, plan both sides:

- **Happy:** the flow with valid input and an authorized user.
- **Unhappy:** empty state (no data yet — a fresh preview gives this for free), invalid
  input, unauthorized/logged-out access, and a repeated action (refresh + resubmit —
  no double effect).

## Step 5 — Hand over the walkthrough

End with a numbered checklist for the human, one line each in plain English, in three
columns of meaning:

- **What to click:** the exact path, starting from the preview URL ("open /, log in as
  the seed user, press 'Add'…").
- **What should happen:** the visible result if the PR is correct.
- **What means broken:** the symptom that should stop the merge ("a blank page here
  means…", "if you see another user's rows, stop — RLS is broken").

Order the checklist so the destructive-if-wrong checks (auth, RLS, money) come first.
Close with one line: merge if all pass; if any fail, reply with the step number.
