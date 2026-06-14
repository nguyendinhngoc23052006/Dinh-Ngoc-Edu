# Align the model-tier dispatch rule to the hierarchy model

The constitution and the `researcher` agent still carried the **legacy** "reviewers = mid
tier, researcher = fastest tier" framing, which had drifted behind the pipeline guide's
hierarchy model. This PR makes the repo state the rule the way the guide (and the human's
UI model pick) actually work: **tier is a hierarchy resolved live at dispatch, never a
stored name** — the orchestrator's tier is the session model the human picks; every agent
below runs a model strictly lower than its parent (reviewers one below the orchestrator,
`researcher` one below the reviewers); and **`model` must be passed explicitly on every
dispatch, because omitting it inherits the parent's top tier** (the PR #33 failure mode).

## What's in the diff
- **`CLAUDE.md` — Agents section:** replaced the "mid/fastest tier" wording with the
  hierarchy-relative rule + the explicit-dispatch rule ("omitting `model` inherits your
  tier").
- **`CLAUDE.md` — Self-check:** added a checklist item — "every subagent dispatched on a
  model below the orchestrator's, never inherited". The Stop hook greps for any unticked
  box and the heading only — no count is hardcoded, so the addition needs no hook change.
- **`CLAUDE.md` — Supabase seed bullet:** absorbed the field-learned GoTrue lesson already
  in `MEMORY.md:14` (token columns `''` not NULL, self-healing `UPDATE`, `provider_id`,
  "`seed.sql` is NOT a migration — fix forward in place").
- **`.claude/agents/researcher.md`:** prose updated from "fastest tier" to "one tier below
  the reviewers … `model` passed explicitly," staying model-name-free.
- **`MEMORY.md:8`:** corrected the stale tier fact in place (hierarchy + the PR #33 gotcha).
- **`.claude/review/*.md`:** refreshed all three reviewer verdicts for this diff.

Deliberately NOT changed: agent frontmatter stays model-less (storing a name is the very
thing the rule forbids); `stop-check.sh` is count-agnostic; `CLAUDE.md`'s `/health` line
stays "uptime workflow" because this repo has no `canary.yml`.

A matching one-line cleanup was made to the human's external pipeline guide (line 502,
"fastest-tier `researcher`" → "one tier below the reviewers") — that file lives in no repo,
so it is not part of this diff.

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

(Boxes that have no surface this PR — migration, RLS, src/types, irreversible actions,
env/secret — are ticked as "nothing to do": this is a documentation-only change, no SQL,
no application code, no secrets.)

## For you
**What changed:** the repo's constitution, `researcher` agent, and repo memory now state
the model-tier rule as a *hierarchy resolved at dispatch* (orchestrator = your UI pick;
each agent a model below its parent; always pass `model` explicitly) instead of the old
fixed "mid/fastest tier" labels; the Supabase seed bullet absorbed the GoTrue
`''`-not-NULL lesson; and a Self-check box was added for the dispatch rule.

**What you do next:** review the preview and merge — no env/secret/dashboard action needed
(documentation-only). Your external pipeline guide was edited separately and is attached in
chat.

**How to roll it back:** revert this PR's single commit (GitHub → the PR → **Revert**), or
locally `git revert <sha>`. No schema or data to undo.
