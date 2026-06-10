# code-reviewer memory

One lesson per line, newest last. Pruned to stay well under 200 lines; revert a lesson
when the change that taught it is reverted. The agent is read-only — the orchestrator
commits entries from the agent's "Memory candidates" report section.

- The ~200-line file limit is a smell threshold, not a hard rule — flag as warn with a suggested split, blocker only when responsibilities are clearly mixed.
