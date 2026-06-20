# Security Review — 2026-06-20 (generate-course: cost + completion + quality overhaul)

## Verdict: PASS

### What was checked

- `supabase/functions/generate-course/pipeline.ts` — constants raised (`QUESTIONS_PER_NODE` 6→10, `MIN_QUESTIONS_PER_NODE` 4→6, `NODES_PER_BATCH` 4→5, `MAX_QUESTIONS_PER_NODE` 12→15), `buildBatchQuestionsPrompt` refactored to stable-prefix layout (source + format-spec + few-shot FIRST, variable ask LAST) for Gemini implicit caching, NEW `buildDeltaRetryPrompt(node, existingQuestions, needed, chunks, lang)` replacing `buildNodeRetryPrompt`, `buildQuestionsSchema` accepts `minItems` override for the delta retry.
- `supabase/functions/generate-course/index.ts` — `generateChapter()` helper extracted, outer pipeline runs all chapters in PARALLEL via `Promise.all`, soft-keep semantics (whatever the primary returned is kept, even below MIN), delta-retry tops up the missing count, 40%-empty fail gate removed (partial → `ready` + banner), thinking budgets cut (primary 4096→1024, retry 4096→512, syllabus 1024→512), inter-call 4 s `delay()` removed.
- `src/pages/CoursePage.tsx` — empty-lessons banner now shows exact counts.
- `pipeline.test.ts` — new `buildDeltaRetryPrompt` describe (8 tests incl. sanitisation), stable-prefix structure describe (2 tests), `minItems` schema override test.
- Grepped `src/` for `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `service_role` — zero matches.
- No new migration in this diff; RLS check not applicable.

### Findings

No security findings.

### Verified as secure

1. **Secret exposure unchanged.** `AI_API_KEY` read exclusively via `Deno.env.get` (index.ts:483). Zero matches in `src/`. Nothing hardcoded.
2. **`force` parameter trust boundary.** Owner check (`course.owner_id === userData.user.id`, index.ts:124) precedes the `force` branch; RLS on the claim UPDATE additionally gates the write. A non-owner cannot force-rebuild another user's course.
3. **`claimable` string interpolated into `.or()`** is constructed from the server-side-read `course.status` only — values are `'pending,failed'` or `'pending,failed,ready'`, never caller-supplied. `staleBefore` is `Date.now()`-derived server-side.
4. **AI-output validation unchanged and sufficient.** `validateQuestion` field-picks into new typed objects — the new `rationale` CoT field is silently dropped. Length caps preserved (prompt ≤ 1000, options/accepted ≤ 300). `generation_error` sliced to 500 chars and shown owner-only.
5. **Prompt-injection sanitisation intact in the new builder.** `buildDeltaRetryPrompt` sanitises AI-generated node title (`safeTitle` with `.replace(/"/g, "'").replace(/[\r\n]+/g, ' ')`, pipeline.ts:513) and squashes newlines on echoed existing prompts (`.replace(/[\r\n]+/g, ' ').slice(0, 200)`, pipeline.ts:516). Coverage in pipeline.test.ts sanitisation tests.
6. **Parallel chapter tasks share no mutable state across invocations.** Each `generateChapter` receives value-typed primitives and a `supabase` client; all writes key on the chapter/node IDs that task just inserted. The atomic claim fires once before `Promise.all` (index.ts:154-173) — no second claim per task, no race.
7. **Partial-completion `ready` flip does not bypass auth.** The new path (`status → ready` even with some empty nodes, index.ts:268-271) runs inside `generate()` with the caller's JWT-scoped client; the RLS `owner updates` policy governs the UPDATE.
8. **`ensureTime(deadline)` coverage.** Called before syllabus, syllabus re-ask, each chapter's primary, and each delta retry. Parallel tasks share `deadline` from outer scope and each call `ensureTime` independently — no task can silently outlive the pipeline budget.
9. **`minItems` schema override is not a trust boundary.** Caller passes `needed = MIN_QUESTIONS_PER_NODE - have` where `have = bucket[i].length` (server-computed). No user input reaches that integer.

### Memory candidates

- A `force` parameter accepted from the request body is not a trust-boundary violation when the ownership check (RLS `.eq('owner_id', uid)`) is enforced before the `force` branch — flag only if user-controlled input reaches the query filter itself.
- Partial-completion `ready` flips on background jobs are safe when the supabase client is JWT-scoped and the RLS `owner updates` policy governs the flip — the risk to check is privilege escalation, not the status value itself.
- When echoing prior AI output back into a retry prompt, sanitisation depends on **interpolation context**, not just the data origin: a value inserted into a quoted-string position needs both quote-replace AND newline-squash; a value inserted into a plain numbered-list position only needs newline-squash. The pattern at `buildDeltaRetryPrompt`'s `existingList` is correct because it is a list item, not a JSON string value.
