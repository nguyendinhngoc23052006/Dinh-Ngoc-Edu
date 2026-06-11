# Architecture

A study app: upload a subject's materials once, pick an output language, and
the AI generates a Duolingo-style course (chapters → lesson nodes → verified
questions) that later also feeds user-built mock tests. Courses are private to
their owner unless shared as public; public courses can be saved by others.

The AI generation pipeline itself is **not built yet** — `createCourse` leaves
the course in `processing` status and a later feature (a Supabase Edge
Function) will scan the uploaded materials and write chapters/nodes/questions.

## Routes

| Route | Page | Access |
| --- | --- | --- |
| `/` | `LandingPage` — preview + login funnel | public |
| `/login` | `LoginPage` — email sign-in / sign-up | public |
| `/dashboard` | `DashboardPage` — own + saved courses | logged in |
| `/explore` | `ExplorePage` — public courses, save action | logged in |
| `/courses/new` | `NewCoursePage` — one-time upload + language | logged in |
| `/courses/:courseId` | `CoursePage` — chapter/node map, visibility toggle (owner) or save (visitor) | logged in |
| `/courses/:courseId/nodes/:nodeId` | `LessonPage` — question player, records progress | logged in |
| `/courses/:courseId/mock-tests/new` | `NewMockTestPage` — pick chapters | logged in |
| `/mock-tests/:testId` | `MockTestPage` — exam mode, score at end | logged in |

Routing is `react-router-dom`; logged-in routes sit behind
`components/auth/RequireAuth`.

## Folders

```
src/pages/          one component per route (thin; uses hooks + components)
src/components/
  layout/           AppLayout: header nav + outlet
  auth/             LoginForm, RequireAuth
  courses/          CourseCard, CourseMap, UploadForm, VisibilityToggle
  lessons/          LessonPlayer, ChoiceQuestion (mcq + mcq_multi), FillBlankQuestion
  mock-tests/       ChapterPicker, MockTestRunner
src/hooks/          useAuth (session), useAsync (loading/empty/error contract)
src/services/       all data access + validation (auth, course, savedCourse,
                    material, lesson incl. pure gradeQuestion, progress, mockTest)
src/lib/            supabaseClient (the only createClient call)
src/types/          database.ts — row types mirroring the migration
src/test/           supabaseMock — chainable client stand-in for unit tests
```

Components never query Supabase directly; pages call `src/services/*`, which
all go through `src/lib/supabaseClient.ts`.

## Tables (see `supabase/migrations/20260610213500_core_schema.sql`)

- `courses` — owner, title, output_language, visibility (private/public),
  status (processing/ready/failed). RLS: owner full access, public readable.
- `course_materials` — metadata for files uploaded once per course; bytes in
  the private `course-materials` storage bucket under
  `<user_id>/<course_id>/<file>`. Owner-only.
- `chapters` → `nodes` → `questions` — the generated course content.
  `nodes`/`questions` carry a denormalized `course_id` so RLS is one lookup
  and a course loads in one query per table. Readable when the course is
  visible; writable by the course owner.
- `node_progress` — per-user completed lessons (PK user+node, idempotent
  upsert).
- `mock_tests` — per-user, references a viewable course + chosen
  `chapter_ids`; questions are pulled live from the course content (the
  generated course is the source of truth).
- `saved_courses` — per-user bookmark of a viewable (public) course.

Two `security definer` helpers — `can_view_course`, `owns_course` — back the
content tables' policies.

## Conventions

- Lists are paginated (`PAGE_SIZE` 20) or capped; filtered/joined columns are
  indexed.
- Writes that can repeat (save course, complete node, re-upload material) are
  idempotent upserts.
- Every data-backed view renders loading / empty / error (via `useAsync`).
- Services validate input before any network call and throw `Error` with a
  human-readable message; pages render it in the error state.
