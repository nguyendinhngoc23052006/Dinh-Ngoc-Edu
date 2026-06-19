# Generation hardening

Fixes three production bugs and significantly reduces generation failure rates across all course types.

## What changed

**Bug 1 — Regenerate after new file upload (`generationService.ts`, `CoursePage.tsx`, `index.ts`)**
The server-side guard at `index.ts:99–109` returned `{status:'ready'}` immediately for any fully-generated course, silently no-oping any regeneration attempt. Added a `force` boolean to the request body: when `true`, the guard is skipped and the existing wipe+rebuild path runs normally. Wired through `startGeneration(courseId, force?)` and added a "Regenerate course" button on the course page for 'ready' owners.

**Bug 2 — Empty lessons after generation (`index.ts`, `pipeline.ts`)**
Added a third retry level: after the existing chapter-level call and chapter re-ask both fail for a node, a single-node call via `buildNodeQuestionsPrompt` (one chunk, one lesson, no calc example) is tried for each remaining empty node. Much smaller prompt, virtually impossible to truncate. If any node is still empty after all three retries the course is marked `'failed'` with a descriptive message — eliminating the confusing "ready with empty lessons" state.

**Bug 3 — Vietnamese PDF stalls indefinitely (`index.ts`, `pipeline.ts`)**
Two fixes: (1) every `fetch()` in `chat()` now carries a 30-second `AbortController` timeout — a hanging AI endpoint throws cleanly to the outer catch, which writes `status: 'failed'`, so courses can never stay stuck in `'processing'` forever; (2) `matchesOutputLanguage()` now decodes `\uXXXX` JSON escape sequences before testing for Vietnamese characters, eliminating the false-negative that caused a language retry to fire on every AI call for Vietnamese courses.

**Token / quality improvements (`pipeline.ts`, `index.ts`)**
- Syllabus excerpt reduced from 1800 → 600 chars per chunk: saves ~10 000 input tokens on the syllabus call; topic-identification needs a hint, not full content.
- `max_tokens` raised from 8192 → 16 384: comfortable headroom for verbose questions and non-Latin scripts.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches — no migration
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised — 277 tests pass
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged — `force=true` still goes through atomic claim; no double-billing. **Abuse case:** owner regenerating a public course wipes all chapters/nodes/questions via CASCADE and resets any students' progress rows — this is the owner's prerogative; students who need a stable version should clone. Documented in `.claude/review/security.md`.
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English — N/A
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** Generation is now significantly more reliable — Vietnamese courses stop stalling, empty lessons trigger a proper retry cascade before failing cleanly, and owners can rebuild a complete course after uploading new materials.
**What you do next:** Review the preview, then merge. No env/secret changes needed.
**How to roll it back:** Revert this PR; all changes are in application code with no schema or data side-effects.
