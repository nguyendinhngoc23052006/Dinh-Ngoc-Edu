# Security review — KaTeX math rendering

**Verdict: PASS — no findings**

Reviewed: `src/components/lessons/MathText.tsx`, `LessonPlayer.tsx`, `ChoiceQuestion.tsx`, `FillBlankQuestion.tsx`, `CalcQuestion.tsx`, `src/main.tsx`

- `dangerouslySetInnerHTML` with KaTeX output is safe: KaTeX is a battle-tested library (Khan Academy) that renders only a fixed set of math DOM elements — no script tags, no event handlers. `throwOnError: false` degrades malformed LaTeX to a readable placeholder, never throws.
- All text flowing into `MathText` originates from AI-generated, pipeline-validated DB rows (`question.prompt` capped at generation time, `question.options[]` likewise). No raw user typing reaches KaTeX.
- Regex patterns (`/\$\$([\s\S]+?)\$\$/g`, `/\$([^$\n]+?)\$/g`) use non-greedy quantifiers — no ReDoS risk.
- KaTeX CSS import (`katex/dist/katex.min.css`) is a static stylesheet. No secrets, no new env vars, no auth paths, no RLS changes.
