-- Phase 2: AI-assigned question difficulty, grounded in the source material.
-- The generation pipeline judges each question from its source chunk —
-- recalling a single stated fact is 'easy', applying or connecting ideas is
-- 'medium', multi-step reasoning or synthesis is 'hard' — and the lesson UI
-- shows the tag. Existing rows default to 'medium' so nothing breaks.
-- No RLS change: questions already inherit their course's visibility policies.
alter table public.questions
  add column difficulty text not null default 'medium'
  check (difficulty in ('easy', 'medium', 'hard'));

-- clone_course copies an explicit question column list, so the new difficulty
-- column must be added there too — otherwise a cloned course would silently
-- reset every question to the 'medium' default. Fix-forward (the original
-- migration is merged and immutable): replace the function, adding difficulty
-- to both the insert column list and the select. Body is otherwise unchanged.
create or replace function public.clone_course(source_course uuid)
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
        (course_id, node_id, position, kind, difficulty, prompt, options,
         answer, verified)
      select new_course, new_node, position, kind, difficulty, prompt, options,
             answer, verified
      from questions
      where node_id = node.id;
    end loop;
  end loop;

  return new_course;
end;
$$;
