# scale-reviewer memory

One lesson per line, newest last. Pruned to stay well under 200 lines; revert a lesson
when the change that taught it is reverted. The agent is read-only — the orchestrator
commits entries from the agent's "Memory candidates" report section.

- Postgres indexes foreign-key *referenced* columns automatically (the PK) but NOT the referencing column — always check the FK column itself has an index.
- On a junction/progress table, the composite PK only indexes its leading column — check the second column's FK cascade path separately (caught node_progress.node_id).
- A column used in an RLS `using` clause is a filtered column and needs an index just like an `.eq()` (caught course_materials.owner_id).
- "Disabled while busy" guards double-click but not retry-after-partial-failure — create-parent-then-upload-children flows need a resumable id or upsert to be idempotent.
- This repo's convention is a named MAX_* limit on every content read — a content query without one is a regression signal (caught getMockTestQuestions' nodes query).
