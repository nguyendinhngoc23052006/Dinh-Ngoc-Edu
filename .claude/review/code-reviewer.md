# Code review — generation cost/quality fixes

**Verdict: PASS — one low-priority note**

Reviewed: `supabase/functions/generate-course/pipeline.ts`, `index.ts`, `pipeline.test.ts`

- `mapConcurrent`: index ordering preserved via `const i = next++` before await; error propagation correct (chapter `.catch` at call site); `Math.min(limit, items.length)` handles oversized limit. No dedicated unit test — acceptable; covered end-to-end via `generate()`; edge-case unit test owed as standalone refactor.
- `NODE_QUESTIONS_SCHEMA` required expansion: correct; `FEW_SHOT_EXAMPLE` updated to show `accepted:[]` on mcq and `options:[],correct_indexes:[]` on fill_blank, consistent with new required list.
- `detectFormulas` narrowing: false-positive removal intentional; tests updated to match; true-positive signals (signal 1/2/4/5) unchanged.
- Thinking budget reductions: config values only, no logic change.
- `chatInLanguage` spread `{ ...opts, thinkingBudget: 0 }`: correct — all other opts preserved, only thinking disabled for correction pass.
