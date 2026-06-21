# Scale review — KaTeX math rendering

**Verdict: PASS — one known tradeoff documented; memoization finding fixed pre-push**

Reviewed: `src/components/lessons/MathText.tsx`, `ChoiceQuestion.tsx`, `CalcQuestion.tsx`

- **Fixed:** `MathText` is now wrapped in `memo()` — KaTeX `renderToString` is skipped on re-renders where the `text` prop is unchanged (e.g., `selected` toggles in `ChoiceQuestion`).
- **Known tradeoff — bundle size:** KaTeX (~100 kB minified) is not tree-shakeable and always bundles. Acceptable: math rendering is the core use case for STEM courses; the tradeoff is deliberate. Dynamic import would add complexity for marginal UX gain; deferred if Lighthouse budget becomes a concern.
- Regex split is O(n) over question text (<500 chars) — not a scale concern.
- No new queries, N+1 patterns, or unbounded operations.
