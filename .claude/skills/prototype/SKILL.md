---
name: prototype
description: Lay out a new project's structure from a plain-English description. Use when asked to prototype, scaffold features, or set up project structure.
---

# /prototype <description>

Build a navigable project skeleton from the user's plain-English description, following the
"Designing structure on request" rules in CLAUDE.md. The deliverable is a baseline the user
can click through — never finished features.

## Step 1 — Plan first, show before building

Enter plan mode. From the description, lay out:

- **Screens/routes:** every page the description implies, with its route path.
- **Core entities:** the tables, their key columns, and how they relate.
- **Folders:** only the feature/domain folders THIS project needs (a CRM → `contacts`,
  `deals`, `reminders`; a game → `game/{loop,scenes,entities}`). Omit everything else.

Present this layout to the user and get approval before creating any file. Ask ONE question
first only if the task crosses a CLAUDE.md line (>5 files is expected here and pre-approved
by the plan; a new dependency or external service is not — ask).

## Step 2 — Build the approved skeleton

- Routes + placeholder components for every screen; each data-backed view renders real
  **loading, empty, and error states** (and partial where lists paginate).
- Every folder gets a real, used starter file — never empty folders or `.gitkeep` shells.
- Components render UI only; all data access and validation goes in `src/services/`.
- All reads go through `src/lib/supabaseClient.ts` (publishable key with anon fallback,
  `VITE_` prefix, nothing hardcoded).
- Keep files to one responsibility, ~200 lines.

## Step 3 — Schema and types

- **ONE migration** in `supabase/migrations/` (`YYYYMMDDHHMMSS_description.sql`, UTC,
  timestamped later than the newest existing file) creating the core tables.
- Every table: `enable row level security` + policies so a user touches only their own
  rows (owner column referencing `auth.users`, policies for select/insert/update/delete).
- Index every column the skeleton filters or joins on; queries paginate/limit.
- Matching types in `src/types/` — keep them in lockstep with the migration.

## Step 4 — Record and verify

- Record the layout in `docs/ARCHITECTURE.md` (folders, routes, tables, how they connect).
- Mocked unit tests for anything testable (no real DB); `npm test`, `npm run lint`,
  `npm run typecheck` all green before the PR.

## Step 5 — Ship

ONE PR into `main` from a `claude/…` branch, with the completed `## Self-check` checklist
and the `## For you` block (what changed / what you do next / how to roll it back), per
CLAUDE.md. The migration is explained in plain English. Never merge it yourself.

## Boundaries

- Skeleton, not features: placeholder content is fine; business logic is not.
- Nothing speculative: no folder, helper, or config without a concrete user in the skeleton.
- No new dependencies unless the user's description names one.
