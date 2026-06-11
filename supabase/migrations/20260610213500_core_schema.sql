-- Core schema for the study-app skeleton: courses generated from uploaded
-- materials, broken into chapters -> nodes (lessons) -> questions, plus
-- per-user progress, mock tests, and saving of public courses.
--
-- Design note: nodes and questions carry a denormalized course_id so that
-- (a) RLS checks are a single lookup instead of a 2-3 table join, and
-- (b) a whole course's content loads in one query per table (no N+1).

-- ---------------------------------------------------------------------------
-- courses: one per upload project; owner-scoped, optionally shared as public.
-- ---------------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  output_language text not null,
  visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  created_at timestamptz not null default now()
);

create index courses_owner_id_idx on public.courses (owner_id);
-- Partial index backs the Explore page (only public rows are ever listed).
create index courses_public_idx on public.courses (created_at desc)
  where visibility = 'public';

alter table public.courses enable row level security;

-- Helpers shared by every content table's policies. SECURITY DEFINER so the
-- lookup on courses is not itself re-filtered by RLS.
create function public.can_view_course(course uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from courses c
    where c.id = course
      and (c.visibility = 'public' or c.owner_id = (select auth.uid()))
  );
$$;

create function public.owns_course(course uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from courses c
    where c.id = course and c.owner_id = (select auth.uid())
  );
$$;

create policy "courses: owner or public can read" on public.courses
  for select using (owner_id = (select auth.uid()) or visibility = 'public');
create policy "courses: owner inserts" on public.courses
  for insert with check (owner_id = (select auth.uid()));
create policy "courses: owner updates" on public.courses
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "courses: owner deletes" on public.courses
  for delete using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- course_materials: metadata for the files uploaded once per course.
-- The bytes live in the private 'course-materials' storage bucket.
-- ---------------------------------------------------------------------------
create table public.course_materials (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (course_id, storage_path)
);

create index course_materials_course_id_idx
  on public.course_materials (course_id);
-- owner_id is an RLS-filtered column; index it like any other filter.
create index course_materials_owner_id_idx
  on public.course_materials (owner_id);

alter table public.course_materials enable row level security;

-- with check also requires owning the course, so a material row can never be
-- attached to someone else's course (the AI pipeline later reads by course).
create policy "materials: owner only" on public.course_materials
  for all using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid()) and public.owns_course(course_id)
  );

-- ---------------------------------------------------------------------------
-- chapters: ordered sections the AI splits a course into.
-- ---------------------------------------------------------------------------
create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  position integer not null,
  title text not null,
  summary text not null default '',
  created_at timestamptz not null default now(),
  unique (course_id, position)
);

create index chapters_course_id_idx on public.chapters (course_id);

alter table public.chapters enable row level security;

create policy "chapters: visible with course" on public.chapters
  for select using (public.can_view_course(course_id));
create policy "chapters: course owner writes" on public.chapters
  for insert with check (public.owns_course(course_id));
create policy "chapters: course owner updates" on public.chapters
  for update using (public.owns_course(course_id))
  with check (public.owns_course(course_id));
create policy "chapters: course owner deletes" on public.chapters
  for delete using (public.owns_course(course_id));

-- ---------------------------------------------------------------------------
-- nodes: the lessons on a chapter's path (Duolingo-style stops).
-- ---------------------------------------------------------------------------
create table public.nodes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  position integer not null,
  title text not null,
  created_at timestamptz not null default now(),
  unique (chapter_id, position)
);

create index nodes_course_id_idx on public.nodes (course_id);
create index nodes_chapter_id_idx on public.nodes (chapter_id);

alter table public.nodes enable row level security;

create policy "nodes: visible with course" on public.nodes
  for select using (public.can_view_course(course_id));
create policy "nodes: course owner writes" on public.nodes
  for insert with check (public.owns_course(course_id));
create policy "nodes: course owner updates" on public.nodes
  for update using (public.owns_course(course_id))
  with check (public.owns_course(course_id));
create policy "nodes: course owner deletes" on public.nodes
  for delete using (public.owns_course(course_id));

-- ---------------------------------------------------------------------------
-- questions: a node's exercises. kind drives the UI; answer holds the key
-- (correct_indexes for mcq/mcq_multi, accepted strings for fill_blank).
-- verified = the AI checked the answer against the uploaded material.
-- ---------------------------------------------------------------------------
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  node_id uuid not null references public.nodes (id) on delete cascade,
  position integer not null,
  kind text not null check (kind in ('mcq', 'fill_blank', 'mcq_multi')),
  prompt text not null,
  options jsonb not null default '[]',
  answer jsonb not null,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (node_id, position)
);

create index questions_course_id_idx on public.questions (course_id);
create index questions_node_id_idx on public.questions (node_id);

alter table public.questions enable row level security;

create policy "questions: visible with course" on public.questions
  for select using (public.can_view_course(course_id));
create policy "questions: course owner writes" on public.questions
  for insert with check (public.owns_course(course_id));
create policy "questions: course owner updates" on public.questions
  for update using (public.owns_course(course_id))
  with check (public.owns_course(course_id));
create policy "questions: course owner deletes" on public.questions
  for delete using (public.owns_course(course_id));

-- ---------------------------------------------------------------------------
-- node_progress: which lessons a user finished. Upserts keep it idempotent.
-- ---------------------------------------------------------------------------
create table public.node_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  node_id uuid not null references public.nodes (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, node_id)
);

-- The composite PK only serves user_id-leading lookups; node-side access
-- (FK cascade from nodes) needs its own index.
create index node_progress_node_id_idx on public.node_progress (node_id);

alter table public.node_progress enable row level security;

create policy "progress: own rows only" on public.node_progress
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- mock_tests: per-user tests built from chosen chapters of a course the user
-- can view (their own, or a public one they saved).
-- ---------------------------------------------------------------------------
create table public.mock_tests (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  chapter_ids uuid[] not null,
  created_at timestamptz not null default now()
);

create index mock_tests_owner_id_idx on public.mock_tests (owner_id);
create index mock_tests_course_id_idx on public.mock_tests (course_id);

alter table public.mock_tests enable row level security;

create policy "mock tests: owner reads" on public.mock_tests
  for select using (owner_id = (select auth.uid()));
create policy "mock tests: owner inserts on viewable course" on public.mock_tests
  for insert with check (
    owner_id = (select auth.uid()) and public.can_view_course(course_id)
  );
create policy "mock tests: owner updates" on public.mock_tests
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "mock tests: owner deletes" on public.mock_tests
  for delete using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- saved_courses: a user's bookmark of someone else's public course.
-- ---------------------------------------------------------------------------
create table public.saved_courses (
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

create index saved_courses_course_id_idx on public.saved_courses (course_id);

alter table public.saved_courses enable row level security;

create policy "saved: owner reads" on public.saved_courses
  for select using (user_id = (select auth.uid()));
create policy "saved: save viewable courses" on public.saved_courses
  for insert with check (
    user_id = (select auth.uid()) and public.can_view_course(course_id)
  );
create policy "saved: owner deletes" on public.saved_courses
  for delete using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: private bucket for uploaded materials; objects live under
-- <user_id>/<course_id>/<file_name> so the first path segment scopes access.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('course-materials', 'course-materials', false)
on conflict (id) do nothing;

create policy "materials bucket: owner reads" on storage.objects
  for select to authenticated using (
    bucket_id = 'course-materials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "materials bucket: owner uploads" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'course-materials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
-- upload(..., { upsert: true }) overwrites via UPDATE, so the bucket needs an
-- update policy too, not just insert.
create policy "materials bucket: owner updates" on storage.objects
  for update to authenticated using (
    bucket_id = 'course-materials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'course-materials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "materials bucket: owner deletes" on storage.objects
  for delete to authenticated using (
    bucket_id = 'course-materials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
