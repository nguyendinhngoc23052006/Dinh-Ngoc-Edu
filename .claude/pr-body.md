Test the Edge Function file-extraction logic via Vitest, with no Deno toolchain or separate CI job.

**Assumptions:** the extraction logic already lived in a pure helper (`_shared/extract.ts`), so no refactor of `index.ts` was needed — only test coverage plus the Vitest aliasing that lets it run. No schema, no app behavior change, no migration.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches (no migration in this PR)
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised (110/110; new tests cover txt/md/docx/pptx happy paths AND unsupported type, zip bomb, ordered slides, non-slide entries, unreadable PDF)
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged (none in this PR)
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English (no migration)

## For you
**What changed:** the Edge Function file-extraction logic (`supabase/functions/_shared/extract.ts` — pdf/docx/pptx/txt/md parsing plus the zip-bomb guard) now has Vitest coverage; the Deno `npm:` specifiers it imports are aliased to the same pinned packages in `vite.config.ts` (`fflate`, `unpdf` added as dev-only mirror deps, kept in lockstep with the `npm:` versions) so the existing `tests` CI job runs them — no Deno toolchain, no separate `functions` job. The seven new cases pin: txt/md decode, unsupported-type rejection, docx text, numeric-ordered pptx slides, non-slide entries ignored, the zip-bomb cap, and the unreadable-PDF guidance message.
**What you do next:** review and merge — no env, secret, or dashboard action needed. (The `generate-course/pipeline.ts` helpers already had their own Vitest suite; this closes the remaining gap, `_shared/extract.ts`.)
**How to roll it back:** revert this PR on GitHub; the dev mirror deps and the new test file go away, the functions stay untested.
