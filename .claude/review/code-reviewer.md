# code-reviewer verdict — Phase 4 component/hook tests + Phase 5 docs

**Verdict: PASS** (one WARN fixed before commit; one non-blocking note left).

Reviewed: src/test/setup.ts, vite.config.ts setupFiles addition, package.json
new dev deps, src/components/lessons/{ChoiceQuestion,FillBlankQuestion,
CalcQuestion}.test.tsx, src/components/ui/ConfirmDialog.test.tsx,
src/components/courses/CourseCard.test.tsx,
src/components/settings/DeleteAccountCard.test.tsx, src/hooks/useAsync.test.tsx,
README.md, docs/RUNBOOK.md.

FIXED — ConfirmDialog.test.tsx — the "backdrop clicks cancel" test asserted
only the negative (card click does not cancel) and never clicked the backdrop.
Now clicks `.modal-overlay` and asserts onCancel fires, plus keeps the card
stopPropagation negative case.

NOTE (left, not a violation) — the `checkButton()` one-liner repeats across
the three lesson test files; CLAUDE.md forbids abstracting until a second real
use within a caller, and each is a single per-file caller. Extract to a shared
helper only if a fourth lesson test appears.

All other checks passed: no jest-dom matchers, environment docblocks match
existing style, mock convention matches authService.test.ts, no Supabase in
components, happy and unhappy paths in every suite, no over-mocking, files
under 80 lines, deps pinned and dev-only, README/RUNBOOK internal links valid.
