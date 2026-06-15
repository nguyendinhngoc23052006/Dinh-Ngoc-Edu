# Phase 4 (component/hook tests) + Phase 5 (docs/runbook)

Closes the last two post-MVP roadmap items in one PR.

**Phase 4 — the project's first React component & hook tests.** All 246
existing suites covered `src/services`, `src/lib`, and `supabase/functions`;
there were zero tests that render a component. This adds that layer with React
Testing Library + happy-dom (dev-only, pinned), wired so the existing
node-environment service/lib suites are untouched.

**Phase 5 — docs.** The README was a one-line stub; it's now a real overview +
quickstart, and a new `docs/RUNBOOK.md` documents deploy flow, env/secret
click-paths, the `/health` + uptime monitor, and rollback.

## What's in the diff

### Phase 4 — tests
- **New dev deps** (`package.json` + lockfile): `@testing-library/react`,
  `@testing-library/user-event`, `happy-dom` — all pinned, dev-only.
- **`src/test/setup.ts`** — `afterEach(cleanup)`; a no-op for the node-env
  suites that also load it, so it's safe globally.
- **`vite.config.ts`** — one line: `setupFiles: ['src/test/setup.ts']`.
  Component/hook suites opt into a DOM with a `// @vitest-environment happy-dom`
  docblock, so the service/lib suites keep running in the default node env.
- **8 new suites (23 tests)**: `ChoiceQuestion`, `FillBlankQuestion`,
  `CalcQuestion`, `ConfirmDialog`, `CourseCard`, `DeleteAccountCard`, and the
  `useAsync` hook. Happy and unhappy paths each: disabled-until-valid,
  submit payloads, Enter-to-submit, Escape/backdrop/busy on the dialog,
  conditional progress bar, and the irreversible delete-account flow
  (success → navigate home; failure → error shown, no navigation). Tests use
  plain DOM assertions (no jest-dom dependency) and the existing
  `supabaseClient` mock convention.

### Phase 5 — docs
- **`README.md`** — overview, local-dev quickstart, the two-prefix env
  fallback, scripts table, testing model, CI workflows. Links to ARCHITECTURE
  and the new RUNBOOK.
- **`docs/RUNBOOK.md`** — the four parts (GitHub/Supabase/Vercel/AI), release
  flow, production env vars + Edge Function secrets with click-paths,
  `/health` + `uptime.yml` (needs the `PRODUCTION_URL` repo variable), and a
  rollback section (Vercel Instant Rollback, revert PR, fix-forward
  migrations, secret rotation).

## Notes / debt
- Pre-existing dev-only `node-tar` advisories already in the lockfile — **not**
  introduced here (production `npm audit` is clean). Left as-is; out of scope.
- happy-dom is the project's first DOM test env (the one question I asked).

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

(No migration and no new irreversible *code* in this PR — the delete-account
path is pre-existing and only newly *tested* here; migration/RLS boxes true by
absence. Gates run green locally: `lint`, `typecheck`, `test` 269, `e2e` 3.
Reviewers ran on Sonnet, one tier below this Opus session.)

## For you
**What changed:** the app now has React component + hook tests (its first), and
the README/runbook are real docs instead of a stub.

**What you do next:** review the preview, then merge. One manual action that is
**not** in this PR: confirm the `e2e` check is listed under **required checks**
in the GitHub ruleset (**repo → Settings → Rules/Branches → the `main`
ruleset → require the `e2e` status check**) so #42's gate is enforced. The
uptime monitor also needs a repo **variable** `PRODUCTION_URL` (**repo →
Settings → Secrets and variables → Actions → Variables**) — see
`docs/RUNBOOK.md`.

**How to roll it back:** revert this PR. It's test files + a vitest setup line +
dev-only deps + docs — no runtime/app code, no migration, no schema. Reverting
removes the new suites and restores the stub README with zero production impact.
