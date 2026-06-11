-- MVP feature support on top of the core schema:
-- 1. courses.status gains 'pending' (initial state): the generate-course
--    function atomically claims pending/failed -> processing, so spammed or
--    concurrent invocations can never run two AI pipelines for one course.
-- 2. courses.generation_error — why the AI pipeline failed, shown to the owner.
-- 3. mock_tests.question_count — how many questions the user asked for.
-- 4. clone_course() — deep-copies a viewable course into the caller's account.

alter table public.courses
  add column generation_error text;

-- When the pipeline claimed the course; lets a crashed run be re-claimed
-- after a staleness window instead of blocking the course forever.
alter table public.courses
  add column generation_started_at timestamptz;

alter table public.courses
  drop constraint courses_status_check;
alter table public.courses
  add constraint courses_status_check
    check (status in ('pending', 'processing', 'ready', 'failed'));
alter table public.courses
  alter column status set default 'pending';

-- Pre-pipeline rows sat in 'processing' (the old default) with no run ever
-- started; move them to the new initial state so they are claimable.
update public.courses set status = 'pending' where status = 'processing';

alter table public.mock_tests
  add column question_count integer not null default 20
    check (question_count between 1 and 100);

-- Deep-copy a course the caller can view (their own, or a public one) into a
-- new private course they own: chapters, nodes, and questions get fresh ids,
-- so the clone is fully independent of the original. SECURITY DEFINER writes
-- bypass RLS, which is why the function re-checks visibility itself first.
-- Loops are fine here: content is capped at generation time (~8 chapters,
-- ~5 nodes each), and it all runs server-side in one RPC.
create function public.clone_course(source_course uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := (select auth.uid());
  new_course uuid;
  chapter record;
  node record;
  new_chapter uuid;
  new_node uuid;
begin
  if caller is null then
    raise exception 'You must be logged in.';
  end if;
  if not public.can_view_course(source_course) then
    raise exception 'Course not found.';
  end if;

  insert into courses (owner_id, title, output_language, visibility, status)
  select caller, title, output_language, 'private', status
  from courses
  where id = source_course
  returning id into new_course;

  for chapter in
    select * from chapters where course_id = source_course order by position
  loop
    insert into chapters (course_id, position, title, summary)
    values (new_course, chapter.position, chapter.title, chapter.summary)
    returning id into new_chapter;

    for node in
      select * from nodes where chapter_id = chapter.id order by position
    loop
      insert into nodes (course_id, chapter_id, position, title)
      values (new_course, new_chapter, node.position, node.title)
      returning id into new_node;

      insert into questions
        (course_id, node_id, position, kind, prompt, options, answer, verified)
      select new_course, new_node, position, kind, prompt, options, answer,
             verified
      from questions
      where node_id = node.id;
    end loop;
  end loop;

  return new_course;
end;
$$;

-- EXECUTE on functions defaults to PUBLIC, so revoking only from anon would
-- be a no-op; revoke from everyone, then grant back to logged-in users.
revoke execute on function public.clone_course(uuid) from public;
grant execute on function public.clone_course(uuid) to authenticated;
