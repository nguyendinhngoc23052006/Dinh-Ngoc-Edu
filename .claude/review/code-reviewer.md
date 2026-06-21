# Code review — KaTeX math rendering

**Verdict: PASS — one finding fixed pre-push**

Reviewed: `src/components/lessons/MathText.tsx`, `LessonPlayer.tsx`, `ChoiceQuestion.tsx`, `FillBlankQuestion.tsx`, `CalcQuestion.tsx`, `src/main.tsx`

- **Fixed:** `LessonPlayer.tsx:116` — feedback section rendered `{question.prompt}` as plain text after answer submission. Now uses `<MathText>` so math renders consistently in the feedback view too.
- Two-pass split logic (display `$$...$$` first, inline `$...$` on remainder) is correct. Offsets reset between passes because the inline regex runs over the remainder string, not the original. Edge cases (text-only, trailing text, adjacent display+inline) all handled.
- `memo()` wrapper on `MathText` prevents re-running KaTeX when text prop is unchanged (e.g., option clicks in ChoiceQuestion that change `selected` state).
- KaTeX CSS imported at app entry point (`main.tsx`). `throwOnError: false` degrades gracefully. No duplicated logic; single responsibility component.
- All four call sites (`ChoiceQuestion`, `FillBlankQuestion`, `CalcQuestion`, `LessonPlayer`) covered.
