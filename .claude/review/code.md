# Code Review — Generation Hardening

**Verdict: FLAG (blockers resolved)**

## Findings (all resolved before commit)

### RESOLVED BLOCKER — `buildNodeQuestionsPrompt` untested
The function was exported and used in the critical third-retry path but had no test coverage. Fixed: added `describe('buildNodeQuestionsPrompt', ...)` block to `pipeline.test.ts` covering title inclusion, double-quote sanitisation (injection guard), source chunk embedding, and out-of-range chunk_index fallback.

### RESOLVED BLOCKER — `force=true` branch of `startGeneration` untested
The new `force` parameter path in `generationService.ts` had no test. Fixed: added `'invokes with force:true when the flag is set'` test to `generationService.test.ts`.

## Passing checks
- Single responsibility per function: PASS — `buildNodeQuestionsPrompt` handles only one node; chapter-level vs node-level prompts remain separate.
- No speculative abstraction: PASS — third-retry loop is inline, not extracted prematurely.
- Error propagation: PASS — `ensureTime(deadline)` outside the try/catch propagates correctly; AbortError preserves `{ cause: err }`.
- `force` guard: PASS — strict `=== true` equality prevents type coercion attacks.
- Existing style matched: PASS — new code follows the same `void run(...)` pattern in `CoursePage.tsx`.
- No unused exports or dead code introduced: PASS.
