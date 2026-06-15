# Dinh Ngoc Edu — last-minute self-learning

Upload a subject's materials once, pick an output language, and the app uses AI
to generate a Duolingo-style course (chapters → lesson nodes → verified
questions) that also feeds user-built mock tests. Courses are private to their
owner unless shared publicly; public courses can be saved by others. A
gamified pet companion roams the app as you make progress.

- **Stack:** React 19 + TypeScript + Vite (SPA), Supabase (Postgres + Auth +
  Storage + Edge Functions), deployed on Vercel.
- **How it fits together:** see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
  — pipeline, routes, tables, and RLS.
- **How to deploy / operate / roll back:** see
  [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

## Local development

Requires the current Node LTS (20+; the repo is built on Node 22).

```bash
npm ci                       # install pinned deps from the lockfile
cp .env.example .env.local   # then fill in your Supabase project values
npm run dev                  # Vite dev server
```

The client reads Supabase config through a two-prefix fallback so the same
build runs against a hand-set production project and the preview project the
Supabase→Vercel integration injects:

- `VITE_SUPABASE_URL` ?? `NEXT_PUBLIC_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` ?? `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ??
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The browser only ever gets the **publishable** key — never a secret. See
[`docs/RUNBOOK.md`](docs/RUNBOOK.md) for the full variable + secret list.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck then production build |
| `npm run lint` | ESLint over the repo |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit + component suites (mocked; no DB needed) |
| `npm run e2e` | Playwright smoke suite (mocked network) |
| `npm run format` | Prettier write |

`lint`, `typecheck`, `test`, and `e2e` are a CI contract — the GitHub workflows
call them by exactly those names. Don't rename one without updating the
workflow in the same change.

## Testing

- **Unit / component:** Vitest. Service and `lib` suites run in a node
  environment against `src/test/supabaseMock`; component and hook suites opt
  into a happy-dom DOM with a `// @vitest-environment happy-dom` docblock and
  render through React Testing Library. No suite touches a real database.
- **End-to-end:** Playwright with the network fully mocked
  (`e2e/_mocks.ts`), so the smoke flow runs in CI with no secrets.

## Continuous integration

- `ci.yml` — `test` (with coverage summary), `lint`, `typecheck`.
- `e2e.yml` — the Playwright `e2e` job.
- `uptime.yml` — every 30 min, probes the production `/health` endpoint and
  files an issue if it is down.
