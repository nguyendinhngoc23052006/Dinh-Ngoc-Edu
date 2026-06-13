-- Phase 3: calculation questions. A 'calc' question stores a formula and its
-- variables in the new `calc` jsonb column; the lesson UI rolls fresh random
-- values each time it is shown, fills them into the prompt, and computes the
-- expected answer — so one question gives endless practice. mcq/fill_blank rows
-- are untouched; calc rows keep options = [] and answer = {}.
alter table public.questions
  drop constraint questions_kind_check,
  add constraint questions_kind_check
    check (kind in ('mcq', 'fill_blank', 'mcq_multi', 'calc'));

alter table public.questions
  add column calc jsonb;

-- clone_course copies an explicit question column list (see the difficulty
-- migration), so the new `calc` column must be added there too — otherwise a
-- cloned course would drop every calc spec. Fix-forward replacement; the body
-- is unchanged except for adding calc to the insert list and the select.
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
         answer, verified, calc)
      select new_course, new_node, position, kind, difficulty, prompt, options,
             answer, verified, calc
      from questions
      where node_id = node.id;
    end loop;
  end loop;

  return new_course;
end;
$$;
