# Code review — source quality + coverage fixes

**Verdict: PASS — no findings**

Reviewed: `supabase/functions/generate-course/pipeline.ts`, `index.ts`, `pipeline.test.ts`, `src/components/courses/UploadForm.tsx`, `MaterialsManager.tsx`

- `stripBoilerplate` two-pass logic is correct: pass 1 builds a frequency Map over trimmed lines (O(n)); pass 2 applies structural regexes per line; blank lines are preserved through filtering and collapsed at the end. Idempotent — stripping already-clean text returns the same text.
- `isEducationalChunk` word-count and diversity thresholds are intentional: < 30 words is too thin for 4–6 grounded questions; diversity < 0.35 catches boilerplate URL/header repetition. Applied BEFORE `.slice(0, maxChunks)` deliberately — boilerplate chunks must not consume coverage slots.
- `chunkText` now calls `stripBoilerplate` first, then splits; no off-by-one risk since `stripBoilerplate` preserves `\n\n` paragraph boundaries and normalises `\r\n`.
- `MAX_CHAPTERS` 8→10 and `validateSyllabusQuality` minNodes 100% floor are consistent (10×5 = 50 lessons = 50 chunks max).
- Tests: 11 `stripBoilerplate` cases (including false-positive guard for academic text mentioning a URL); 4 `isEducationalChunk` cases; 7 `chunkText` cases rewritten with realistic educational content; `validateSyllabusQuality` test updated for new floor. 387 tests pass, lint and typecheck clean.
- No duplication; no components doing data access; no oversized files.
