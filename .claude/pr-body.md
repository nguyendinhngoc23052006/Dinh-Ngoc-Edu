# Generation: fix source quality, boilerplate stripping, and coverage gaps

Follow-up to PR #62 (cost/reliability). Question counts are now correct but course content was wrong — generated from document metadata instead of actual subject matter. This PR fixes the source quality and coverage problems.

## Root causes

**Source quality — "questions about the downloader's email":** Studocu PDFs (and any platform download) embed metadata on the first pages — downloader name, email, URLs, disclaimers — as real text. `chunkText` faithfully included these as chunks. The syllabus builder was told to "cover every chunk", so it created lessons for the metadata chunks. AI generated 6 valid questions per lesson — just about the wrong content.

**Coverage gaps — "important topics missing":** With 6000-char chunks capped at 30, source material beyond 180k chars was silently dropped. The syllabus only required 60% of chunks to have lessons (40% could be skipped with no re-ask). The syllabus prompt showed only the first 1500/6000 chars (25%) of each chunk, so the AI couldn't see topics buried deeper in each chunk.

## What changed

### `pipeline.ts`
- **`stripBoilerplate(text): string`** — two-pass boilerplate stripper called at the start of `chunkText`. Pass 1 identifies lines that repeat 3+ times (running headers/footers). Pass 2 strips pattern-matched lines: standalone page numbers, TOC entries (`Chapter 3 ..... 45`), copyright/legal, download attribution (`Downloaded by`, `Uploaded by`, `Shared with`), platform names (Studocu, CourseHero, Scribd, Academia.edu, ResearchGate), ISBN/publication metadata, watermark-only lines, bare email addresses, URL-dominant short lines. Collapses blank line runs after stripping. Idempotent.
- **`isEducationalChunk(chunk): boolean`** — secondary gate after splitting: rejects chunks with < 30 words (too thin for 4–6 questions) or word diversity < 0.35 (boilerplate repeats the same terms). Applied before `slice(0, maxChunks)` so boilerplate doesn't consume coverage slots.
- **`chunkText` defaults**: `maxChars 6000 → 4000`, `maxChunks 30 → 50`. Smaller chunks = more focused lessons. 50 × 4000 = 200k chars exactly matches `MAX_SOURCE_CHARS` — no source content silently dropped.
- **`MAX_CHAPTERS`: 8 → 10**. New lesson ceiling: 10 × 5 = 50, matching 50-chunk max for 1:1 coverage.
- **`validateSyllabusQuality` minNodes floor**: `Math.floor(chunkCount * 0.6)` → `chunkCount`. Every chunk must have a lesson; the 40%-skip window is closed. Re-ask fires if any chunk is uncovered or lesson count is under floor.
- **Syllabus excerpt**: 1500 → 2000 chars per chunk. With 4000-char chunks, this is 50% visibility (was 25%) — AI sees the majority of each chunk when designing the syllabus.

### `index.ts`
- **`CHAPTER_CONCURRENCY`: 3 → 4**. New wall-time: `ceil(10/4)×5×35 s + 30 s = 555 s < 600 s` — same margin as before.

### `pipeline.test.ts`
- New suites: `stripBoilerplate` (11 tests — removes boilerplate, preserves academic content mentioning URLs), `isEducationalChunk` (4 tests).
- `chunkText` tests rewritten with realistic educational content (toy strings like `'aaaa'` now correctly get filtered by `isEducationalChunk`).
- `validateSyllabusQuality` "too few lessons" test updated for 100% floor (was 60%).

### `src/components/courses/UploadForm.tsx` + `MaterialsManager.tsx`
- Added note: scanned PDFs and handwritten notes are not supported; open in Google Docs and export as PDF first.
- GitHub issue #64 tracks OCR support for image-based PDFs.

### Math rendering (KaTeX)
- **`src/components/lessons/MathText.tsx`** (new) — `memo`-wrapped component that splits on `$$...$$` (display) then `$...$` (inline), renders each math segment via `katex.renderToString({ throwOnError: false })` + `dangerouslySetInnerHTML`, plain-text segments as-is. Malformed LaTeX degrades to readable placeholder text.
- **`ChoiceQuestion`, `FillBlankQuestion`, `CalcQuestion`, `LessonPlayer`** — `{question.prompt}` / `{option}` / `{instance.prompt}` all replaced with `<MathText>`. `LessonPlayer` feedback section (post-answer view) also updated.
- **`src/main.tsx`** — `import 'katex/dist/katex.min.css'`

## Known tradeoffs
- Syllabus call input tokens ~2.2× more (50×2000 excerpts vs 30×1500). Syllabus is one call per generation; acceptable for significantly better topic coverage.
- KaTeX (~100 kB) is not tree-shakeable and always bundles. Acceptable for a math-heavy educational app; dynamic import deferred unless Lighthouse becomes a constraint.
- Pre-existing N+1: `nodes.credit_prize` updated in a loop in `generateChapter`. Not introduced here; tracked as tech-debt.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches — no migration (no schema change)
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised — 387 tests pass, lint and typecheck clean
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged — n/a
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English — n/a
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** Source text is stripped of platform boilerplate and low-quality chunks, so AI generates questions about the actual subject matter. Coverage raised to 100% of chunks with up to 50 lessons. LaTeX math in question text and options now renders properly (KaTeX) — previously showed raw `$...$` syntax.

**What you do next:** Re-upload a Studocu PDF and generate a fresh course — verify lessons cover real topics and math formulas display correctly. Merge when satisfied. No env/secret changes needed.

**How to roll it back:** Revert this PR. Nine files changed (`pipeline.ts`, `index.ts`, `pipeline.test.ts`, two UI upload components, `MathText.tsx` new, three question components, `main.tsx`). No DB schema, no migration, no data side-effects.
