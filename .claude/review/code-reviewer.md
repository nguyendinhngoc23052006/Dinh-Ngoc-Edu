# code-reviewer verdict — align model-tier dispatch rule to the hierarchy model

**Verdict: APPROVE.** One WARN raised, consciously declined with rationale below.

Documentation-only diff: `CLAUDE.md` and `.claude/agents/researcher.md`. No source files
changed, so the "changed service file needs a sibling test" rule does not apply (confirmed).

- **Cross-file consistency holds.** The new tier rule in `CLAUDE.md` ("reviewers one tier
  below you, the `researcher` one tier below them; pass `model` explicitly — omitting
  inherits your tier") now agrees with `researcher.md` ("one tier below the reviewers …
  passing `model` explicitly"). The opening "lesser-tier worker agents" line is unaffected.
- **Stop hook unaffected.** The added Self-check item is a standard `- [ ]` checkbox; the
  hook greps for any unticked box and a `## Self-check` heading — no count or text is
  hardcoded, so the addition is safe.
- **Seed bullet introduces no contradiction** — "fix it forward by editing in place"
  agrees with the existing "`seed.sql` is NOT a migration" stance.

**WARN (declined):** the new box "every subagent dispatched on a model below the
orchestrator's — never inherited" is a looser lower-bound than the full ladder in the rule
(reviewers one below, researcher two below) — it would pass even if the researcher ran at
the reviewer tier. Declined on purpose: the checkbox is a terse attestation against the
real failure mode (*inheriting* = silently running at the top tier, the PR #33 bug); the
exact ladder lives in the rule at the Agents section. Tightening only the box would also
re-introduce guide↔repo drift, which is exactly what this PR removes.
