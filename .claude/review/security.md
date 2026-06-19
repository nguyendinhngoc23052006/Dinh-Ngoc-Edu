# Security Review — Generation Hardening

**Verdict: PASS**

## Findings

### FIXED — `pipeline.ts` `buildNodeQuestionsPrompt()` — AI-generated title in double-quoted prompt
The AI-generated `node.title` was interpolated unescaped inside a double-quoted instruction segment. A title containing `"` or a prompt-injection phrase could distort the next AI call's instruction boundary. Fixed: `node.title.replace(/"/g, "'")` applied before interpolation.

### FIXED — Regenerating a public course resets student progress without warning
An owner regenerating a public course wipes all chapters/nodes/questions via CASCADE, resetting progress rows for any students studying that course. Fixed: `handleRegenerate` in `CoursePage.tsx` now shows a `window.confirm` dialog when `course.visibility === 'public'`, making the consequence explicit and requiring deliberate confirmation before proceeding.

## Passing checks
- `force=true` cross-owner: PASS — 404 guard at `index.ts:91` + RLS on the atomic claim UPDATE; attacker cannot reach the wipe path for a course they don't own.
- AbortController timing: PASS — 30 s timeout is server-side only; no timing oracle visible to callers who already have a 202.
- Unvalidated input: PASS — `force` is `=== true` strict equality; `courseId` is type-checked; `output_language` is read from DB, not request body.
- No secrets in client code: PASS — `AI_API_KEY` only in `Deno.env.get()` inside the Edge Function.
- No new tables without RLS: PASS — no migration.
