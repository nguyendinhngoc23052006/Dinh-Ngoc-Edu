# Architecture

A study app: upload a subject's materials once, pick an output language, and
the AI generates a Duolingo-style course (chapters → lesson nodes → verified
questions) that later also feeds user-built mock tests. Courses are private to
their owner unless shared as public; public courses can be saved by others.

## AI pipeline (`supabase/functions/generate-course`)

`createCourse` leaves the course in `pending` status; the frontend then
invokes the `generate-course` Edge Function, which **atomically claims**
`pending`/`failed` (or a `processing` run stale for 15+ minutes) into
`processing` — so spammed or concurrent invocations can never run two
pipelines for one course. It answers 202 immediately and works in the
background (`EdgeRuntime.waitUntil`, self-imposed 6-minute budget) while
CoursePage polls the status (one PK lookup per tick, 10-minute give-up):

1. **Extract** — downloads the course's materials from storage and pulls
   plain text out of txt/md (direct), pdf (`unpdf`), docx/pptx (`fflate`
   unzip + XML strip).
2. **Chunk** — slices the text into ~6k-char chunks on paragraph boundaries
   (`pipeline.ts`, pure and unit-tested).
3. **Syllabus** — one AI call returns a strict-JSON chapter/node outline;
   each node names the chunk it came from.
4. **Questions** — one AI call **per chapter** (not per node — a full course
   stays within free-tier request limits) writes mcq/mcq_multi/fill_blank
   questions for every lesson in that chapter, each tagged with its
   `node_index`, in the course's output language.
5. **Enforce + verify** — malformed questions are dropped
   (`validateChapterQuestions`), and a question is marked `verified` only
   when its correct answer literally appears in the source chunk.
6. **Finish** — status flips to `ready`, or `failed` with the reason in
   `courses.generation_error` (owner sees it + a Retry button).

The function runs with the **caller's JWT** — RLS owner policies authorize
every write, so it can only ever fill courses the caller owns. Re-invoking on
a `ready` course is a no-op; re-invoking after a failure wipes the partial
content and regenerates. AI access goes through an OpenAI-compatible chat
completions endpoint configured by Edge Function secrets: `AI_API_KEY`
(required), `AI_BASE_URL` + `AI_MODEL` (default: Gemini free tier).

## Routes

| Route | Page | Access |
| --- | --- | --- |
| `/` | `LandingPage` — upload form works for guests; submission is stashed in memory (`lib/pendingCourse`) across the login bounce | public |
| `/login` | `LoginPage` — Google OAuth + email sign-in / sign-up | public |
| `/dashboard` | `DashboardPage` — own + saved courses with per-course progress bars | logged in |
| `/explore` | `ExplorePage` — public courses, save action | logged in |
| `/courses/new` | `NewCoursePage` — one-time upload + language, kicks off generation | logged in |
| `/courses/:courseId` | `CoursePage` — chapter/node map; owner: visibility + rename/delete + retry-generation; logged-in visitor: save/clone; guest: read-only with login CTA | public (RLS hides private courses) |
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
  status (pending/processing/ready/failed) + generation_error/started_at.
  RLS: owner full access, public readable.
- `course_materials` — metadata for files uploaded once per course; bytes in
  the private `course-materials` storage bucket under
  `<user_id>/<course_id>/<ascii-safe name>` (storage keys reject non-ASCII,
  so the key is sanitized + hashed; the original name stays in `file_name`).
  Owner-only.
- `chapters` → `nodes` → `questions` — the generated course content.
  `nodes`/`questions` carry a denormalized `course_id` so RLS is one lookup
  and a course loads in one query per table. Readable when the course is
  visible; writable by the course owner.
- `node_progress` — per-user completed lessons (PK user+node, idempotent
  upsert).
- `mock_tests` — per-user, references a viewable course + chosen
  `chapter_ids` and a `question_count`; questions are pulled live from the
  course content (the generated course is the source of truth) and randomly
  sampled to the requested length. Results break down per chapter.
- `saved_courses` — per-user bookmark of a viewable (public) course.

Two `security definer` helpers — `can_view_course`, `owns_course` — back the
content tables' policies. A third, `clone_course(uuid)`, deep-copies a
viewable course (chapters/nodes/questions, fresh ids) into the caller's
account so the copy survives the original being deleted or made private.

## Conventions

- Lists are paginated (`PAGE_SIZE` 20) or capped; filtered/joined columns are
  indexed.
- Writes that can repeat (save course, complete node, re-upload material) are
  idempotent upserts.
- Every data-backed view renders loading / empty / error (via `useAsync`).
- Services validate input before any network call and throw `Error` with a
  human-readable message; pages render it in the error state.
- `vercel.json` rewrites every non-file route to `index.html` — the SPA
  router owns the URL space, so a hard reload on a deep link never 404s.
