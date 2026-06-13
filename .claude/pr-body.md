Fix mixed-language course generation: detect a foreign language leaking into a course's questions, not just a wholly wrong-language answer.

**Goal (restated):** an English (or any non-Vietnamese) course must never contain stray Vietnamese in a question/option/answer — the reported "Vietnamese in an English international-investment course" bug. Acceptable only when the course's own language is that language.

**Root cause:** the generation post-check `matchesOutputLanguage` (in `generate-course/pipeline.ts`) only verified that Vietnamese was *present* when the course language *was* Vietnamese. For every other language it returned `true` unconditionally, so a Vietnamese phrase copied from source material into an English course was never detected and the existing one-time re-ask never fired.

**Fix:** make the check bidirectional. Vietnamese is still the only language with a character set we can detect reliably, so it is the only one policed — but now both ways: a Vietnamese course must contain Vietnamese, and a non-Vietnamese course must *not*. A mismatch triggers the same single re-ask already in `chatInLanguage`. The detection set is narrowed to characters unique to Vietnamese (`đ ơ ư` + the tonal block U+1EA0–U+1EF9); `ă â ê ô` are excluded so Romanian/French/Portuguese courses (which share those letters) are not falsely flagged. The re-ask reminder now tells the model to translate foreign phrases rather than copy them verbatim — the actual mechanism of the leak.

**Assumptions:** no schema, no migration, no app behavior change — this is generation-pipeline logic only, fully covered by the existing Vitest suite (`pipeline.test.ts`) with no Deno toolchain. Language pairs neither of which is Vietnamese (e.g. English↔French) remain undetectable by any cheap heuristic and still pass, as before; this PR fixes the one pair we can detect, which is the one you hit.

**This is Phase 1 of the agreed 7-phase roadmap** (language fix → AI difficulty → calculation questions → credits engine → theme market → pet market → homepage overhaul). One PR per phase; the rest follow after you merge this.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches (no migration in this PR)
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised (113/113; new tests: Vietnamese leak into English/French flagged, clean English/Japanese pass, shared accents ă/â/ê/ô in Romanian/French NOT flagged, real Vietnamese still accepted, English drift in a Vietnamese course still flagged, reminder says "translate")
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged (none in this PR)
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English (no migration)

## For you
**What changed:** course generation now catches a foreign language leaking *into* a course (Vietnamese inside an English course), not only a whole answer in the wrong language — it re-asks the model once to translate the stray text, using a Vietnamese-unique character set so French/Romanian/Portuguese courses aren't misflagged.
**What you do next:** review the preview, then merge — no env, secret, or dashboard action needed. To sanity-check, generate an English course from Vietnamese-language material and confirm the questions come back fully in English. (Detection relies on Vietnamese-specific characters, so an English↔French mix would not be caught — out of scope for this fix.)
**How to roll it back:** revert this PR on GitHub; `matchesOutputLanguage` returns to one-directional Vietnamese-only detection and the leak reappears. No data migration to undo.
