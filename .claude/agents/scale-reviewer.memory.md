# scale-reviewer memory

One lesson per line, newest last. Pruned to stay well under 200 lines; revert a lesson
when the change that taught it is reverted. The agent is read-only — the orchestrator
commits entries from the agent's "Memory candidates" report section.

- Postgres indexes foreign-key *referenced* columns automatically (the PK) but NOT the referencing column — always check the FK column itself has an index.
