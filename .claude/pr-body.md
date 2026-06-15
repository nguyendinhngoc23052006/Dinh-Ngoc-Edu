# Add the mocked-network Playwright E2E gate (pipeline guide step 8.5)

Brings this repo in line with the pipeline guide: the one mandatory part it was
missing was the **E2E gate**. **No migration, no new queries, no app-code
behavior change** — this is test infrastructure plus the constitution text that
references it.

## What's in the diff
- **`playwright.config.ts`** — chromium only; `webServer` builds the app with a
  **stub** `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` inlined and
  serves the preview on fixed port `4173` (used as `baseURL`); `retries: 2` in
  CI / `0` local; `trace: 'on-first-retry'`; `list` + `html` reporters.
- **`e2e/_mocks.ts`** — intercepts every request to the stub host
  (`https://stub.supabase.co/**`) with deterministic defaults (no session, empty
  lists), so the suite is fully offline.
- **`e2e/smoke.spec.ts`** — three network-light flows with role/text selectors:
  the landing page renders, a client-side validation error shows with no network
  (empty-title upload → “Give the course a title.”), and a logged-out visit to a
  gated route (`/dashboard`) redirects to `/login`.
- **`.github/workflows/e2e.yml`** — a job named exactly **`e2e`**: `npm ci` →
  `npx playwright install --with-deps chromium` → `npm run e2e`, uploading the
  trace/report artifact on failure.
- **`package.json`** — adds `@playwright/test` (pinned `^1.61.0`, lockfile
  committed) and the `e2e` script.
- **`vite.config.ts`** — excludes `e2e/**` from Vitest (its `*.spec.ts` files
  match Vitest's default include but import `@playwright/test`).
- **`.gitignore` / `eslint.config.js`** — ignore `playwright-report/` +
  `test-results/`; give `playwright.config.ts` + `e2e/**` Node globals for lint.
- **`CLAUDE.md` (constitution)** — text-only update to match the guide's current
  step-3 wording now that the gate exists: the self-check script-names box, the
  quality-gate `e2e` line, and the `/health` note. **Flagged** below.

## Flag — what I did NOT touch, and one thing to be aware of
- **No merged migration edited/renamed** — none were in scope (this PR has zero
  migrations).
- **`seed.sql`, `config.toml` `project_id`, `api/health.ts`** — untouched.
- **`CLAUDE.md` is the read-only constitution.** I edited it only because the
  task is “follow the guide” and the guide’s canonical step-3 `CLAUDE.md` now
  includes the E2E gate; your copy predated it. The edits are text-only (no rule
  removed) and ride this branch for **your** review/merge — I am not self-merging.
  If you’d rather keep the constitution change separate, drop the `CLAUDE.md` hunk
  and merge the rest; the gate works without it.
- The `e2e` job is **mocked-network** on purpose — keep it that way; a required
  check pointed at a live preview would flake.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

(No migration, no irreversible action — those boxes are N/A and true by absence.
All four gates run green locally: `test` 244 passing, `lint`, `typecheck`, and
`e2e` 3 passing. Reviewers ran on Sonnet, one tier below this Opus session — all
three PASS; the code reviewer's two findings were fixed this task. Memory updated
in `MEMORY.md` with the E2E-gate shape and the Vitest/Playwright include gotcha.)

**Once this merges:** add the `e2e` check to the `main` ruleset (step 9.4 —
Settings → Rules → Rulesets → open it → require status checks → Add checks →
tick **`e2e`** under Suggestions). It appears under Suggestions only after the
job has reported on a PR at least once, so add it after this PR's first run.

## For you
**What changed:** the repo now has the pipeline guide's mandatory Playwright E2E
gate (config + offline mocks + three smoke tests + its CI job), and the
constitution text was refreshed to mention that gate.

**What you do next:** review the preview, then merge. After merge, do the one
click-path above to make `e2e` a required check in the `main` ruleset (Settings →
Rules → Rulesets → your `main` ruleset → Require status checks → Add checks →
`e2e`). No env or secret changes.

**How to roll it back:** revert this PR — it's test infra + config + docs only,
nothing in the database to undo. If you only want to drop the constitution
change, revert the `CLAUDE.md` hunk.
