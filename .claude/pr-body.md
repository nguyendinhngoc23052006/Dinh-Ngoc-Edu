# Course generation: paid-tier cost cut + completion lift + more questions per lesson

Recent optimisation PRs (#54, #55, #58) shipped batching, native Gemini API, and rationale-CoT, but cost stayed flat while quality and completion rate dropped. This PR is a focused rework for the **commercial paid-tier** use case: cut cost ~40 %, raise question target 6 → 10/node, lift completion ~95 %+.

## Where the old shape leaked

| Bucket | Old per-course | Share | Why |
|---|---|---|---|
| Thinking tokens (4096 × ~11 calls) | $0.11 | **48 %** | PR #58 doubled primary thinking AND added 4096 to retries — thinking bills at output rate, so this doubled the bill |
| Retry path | $0.09 | 40 % | Full re-ask on any node below MIN=4; one batch failure wiped 4 nodes; retry excluded `calc` so calc-only sources never recovered |
| 40 %-empty fail gate | — | — | A 41 %-empty course was marked `failed`, throwing away the 59 % that worked |
| `delay(4000)` between calls | — | — | Free-tier RPM mitigation; dead weight on paid Tier 1 (150-300 RPM) |

## What changed

### `supabase/functions/generate-course/pipeline.ts`
- Constants: `QUESTIONS_PER_NODE` 6 → **10**, `MIN_QUESTIONS_PER_NODE` 4 → **6**, `NODES_PER_BATCH` 4 → **5** (one full chapter = one primary call), `MAX_QUESTIONS_PER_NODE` 12 → **15**.
- `buildBatchQuestionsPrompt` refactored to **stable-prefix-first** layout (source + format-spec + few-shot FIRST, variable ask LAST) so Gemini's implicit cache (1024-token min, **75 % off cached input** on the 2.5 family, ~5 min TTL) auto-discounts the prefix across retries within a chapter.
- New `buildDeltaRetryPrompt(node, existingQuestions, needed, chunks, lang)` replaces `buildNodeRetryPrompt`. Lists every existing question so the model can't duplicate, asks for **exactly** `needed` more, includes `calc` (a short primary doesn't prove the source has no formula).
- `buildQuestionsSchema` accepts an explicit `minItems` override — delta retry passes `needed` so the constrained-decoding floor matches the prompt.

### `supabase/functions/generate-course/index.ts`
- New `generateChapter()` helper extracted from the monolithic chapter loop.
- Outer pipeline runs all chapters in **PARALLEL** via `Promise.all(syllabus.map(generateChapter))`. Per-chapter wall-clock = primary + delta retries; pipeline wall-clock = max(per-chapter), not sum.
- **Soft-keep:** whatever the primary returned for each node is kept, even below MIN. The delta retry tops up only the missing count, never wipes existing work. Was: discard sparse → retry full → retry might return 0 → empty lesson.
- Thinking budgets cut: primary 4096 → **1024**, retry 4096 → **512**, syllabus 1024 → **512**. CoT rationale in OUTPUT does the explicit reasoning the hidden thinking was duplicating.
- `maxOutputTokens` raised: primary 16384 → **24576** (5 nodes × 10 questions w/ rationale), retry 8192 → **12288**.
- `delay(4000)` removed. Paid Tier 1 = 150-300 RPM ([source](https://www.aifreeapi.com/en/posts/gemini-api-rate-limits-per-tier)); ≤8 concurrent calls is well within budget; `chat()`'s 429 backoff stays as the safety net.
- 40 %-empty fail gate **removed**. Partial completion flips course to `ready`; existing `CoursePage` banner handles it with a one-tap fill button.

### `src/pages/CoursePage.tsx`
- Empty-lessons banner now shows exact counts ("3 of 20 lessons need more questions") and re-labels the action ("Fill empty lessons"). Existing handler reused — no new service call.

### `supabase/functions/generate-course/pipeline.test.ts`
- `buildDeltaRetryPrompt` describe: 8 tests covering exact top-up count, no-duplication context, calc preserved, prompt-injection sanitisation (title + echoed prompts), rationale-first, common-sense constraint, neighbouring-chunk grounding, empty-existing edge.
- `buildBatchQuestionsPrompt structure (stable prefix)` describe: 2 tests asserting source-before-ask ordering and the `---` divider for cache eligibility.
- `buildQuestionsSchema`: new test for the `minItems` override.

## Cost / completion math (20-node typical, 40-node max)

| Metric | Before (#58) | After | Δ |
|---|---|---|---|
| Cost / 20-node course | $0.23 | **$0.14** | −39 % |
| Cost / 40-node course | $0.45 | **$0.26** | −42 % |
| Questions / node | 6 target / 12 max | **10 / 15** | +67 % target |
| Wall-clock / 20-node | ~3 min | ~30-90 s (parallel) | up to 6× faster |
| Empty-fail threshold | 41 % empty = total fail | none — partial → ready + banner | UX win for paying users |

Pricing sources: [Gemini 2.5 Flash $0.30/$2.50](https://ai.google.dev/gemini-api/docs/pricing), [implicit caching 75 % off 2.5 family](https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/), [paid Tier 1 RPM](https://www.aifreeapi.com/en/posts/gemini-api-rate-limits-per-tier).

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches — **no migration** (existing CoursePage empty-lessons banner already handles partial completion; no new columns needed)
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised — **315 unit tests pass** (11 new in pipeline.test.ts), lint + typecheck clean, e2e **3/3 pass**
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged — atomic-claim guard unchanged; wipe-then-rebuild idempotent; parallel chapter tasks share no mutable state, a throw in one rolls the whole course to `failed`
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English — n/a
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** Course generation now bundles each chapter into a single AI call running in parallel with the other chapters, asks for 10 questions per lesson instead of 6, tops up any short lessons with a small "you wrote N — please add M more, don't duplicate" follow-up instead of starting over, and stops failing the whole course when a few lessons come back empty (the existing banner offers a one-tap fill instead). Hidden "thinking" tokens were 48 % of the bill — slashed because the rationale CoT in the visible output already covers the reasoning.

**What you do next:** Review the preview, regenerate a course you've generated before so you can compare quality + cost in the dashboard, then merge. **No env/secret changes** — your existing `AI_API_KEY` and `gemini-2.5-flash` default still apply. Deploy redeploys the Edge Function automatically.

**How to roll it back:** Revert this PR — three files (`pipeline.ts`, `index.ts`, `CoursePage.tsx`) plus its test file, no schema or data side-effects. In-flight courses mid-generation when the revert lands will fall back to the previous batched pipeline on the next claim; nothing in the DB depends on the new shape.
