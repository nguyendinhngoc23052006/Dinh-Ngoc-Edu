-- Idempotent seed data. Preview branches start empty, so seed what a login
-- test needs: one confirmed email/password user.
--   demo@example.com / password123
--
-- The four token columns below MUST be '' and never NULL: GoTrue scans them
-- into non-null Go strings on login, so a NULL there logs in as "Database
-- error querying schema" while the row looks fine in the dashboard. (A user
-- created through signUp() gets these set automatically; a hand-inserted row
-- does not, which is why we set them explicitly.)

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'demo@example.com',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  '', '', '', ''
where not exists (
  select 1 from auth.users where email = 'demo@example.com'
);

-- Self-heal: repair a demo row left with NULL token columns by an older seed
-- (e.g. a preview branch created before this fix), so it becomes loginable
-- without recreating the branch. Idempotent — a no-op once the columns are ''.
update auth.users
set
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, '')
where email = 'demo@example.com'
  and (
    confirmation_token is null
    or recovery_token is null
    or email_change is null
    or email_change_token_new is null
  );

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true
  ),
  'email',
  now(),
  now(),
  now()
from auth.users u
where u.email = 'demo@example.com'
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

-- Load the demo account with "infinite everything" so the pet/economy system is
-- testable end to end on a fresh preview: a huge credit balance, every theme
-- owned (to switch map dimensions in Settings), a deep stockpile of every food,
-- and a ready-made menagerie — a maxed mythical companion (walking + cheering),
-- an evolving rare, and a spare egg. Every step is idempotent and keyed on the
-- fixed demo user id, whose profile + starter pet the signup trigger created.

update public.profiles
set credits = 1000000000,
    pet_enabled = true,
    pet_cheers_enabled = true,
    display_name = 'Demo Teacher'
where user_id = '00000000-0000-0000-0000-000000000001';

-- Own every theme so all map dimensions are switchable right away.
insert into public.user_cosmetics (user_id, cosmetic_id)
select '00000000-0000-0000-0000-000000000001', id
from public.cosmetics
where kind = 'theme'
on conflict (user_id, cosmetic_id) do nothing;

-- A deep stockpile of every food tier (set, not added, so re-running is idempotent).
insert into public.user_food (user_id, food_id, qty)
select '00000000-0000-0000-0000-000000000001', id, 1000000
from public.food
on conflict (user_id, food_id) do update set qty = excluded.qty;

-- A ready-made menagerie, replacing the trigger's starter egg. delete+insert is
-- idempotent in effect (the same logical set each run). Storage is full at 3, so
-- this also exercises the adopt cap and release/auto-promote.
delete from public.pets where user_id = '00000000-0000-0000-0000-000000000001';
insert into public.pets (user_id, stage, species_id, xp, is_active, hatched_at) values
  ('00000000-0000-0000-0000-000000000001', 'hatched', 'spc-kirin', 700, true, now()),
  ('00000000-0000-0000-0000-000000000001', 'hatched', 'spc-fox', 300, false, now()),
  ('00000000-0000-0000-0000-000000000001', 'egg', null, 0, false, null);

-- A ready-made, fully generated course so a fresh preview branch (which starts
-- with an empty DB) is actually explorable: the dashboard, course map, lessons,
-- Explore, save/clone and mock-test builder all have real content to open.
-- It is public, so it also shows on Explore. Delete-then-insert keyed on the
-- fixed course id is idempotent in effect; the course's `on delete cascade`
-- wipes its chapters/nodes/questions (and any demo progress/mock tests on it)
-- before the re-insert, so re-seeding never duplicates. It covers all four
-- question kinds (mcq, mcq_multi, fill_blank, calc) so every lesson UI — and
-- the calc question in a mock test — can be exercised.

delete from public.courses where id = 'c0000000-0000-0000-0000-000000000001';

insert into public.courses (id, owner_id, title, output_language, visibility, status)
values (
  'c0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Photosynthesis Crash Course',
  'English',
  'public',
  'ready'
);

insert into public.chapters (id, course_id, position, title, summary) values
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 1,
   'Light & Energy', 'How plants capture light and turn it into chemical energy.'),
  ('c1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 2,
   'The Two Stages', 'The light-dependent reactions and the Calvin cycle.');

insert into public.nodes (id, course_id, chapter_id, position, title, credit_prize) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 1, 'Capturing Light', 10),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 2, 'Pigments', 10),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000002', 1, 'Reactions & Math', 15);

insert into public.questions
  (id, course_id, node_id, position, kind, difficulty, prompt, options, answer, calc, verified)
values
  -- Node 1: Capturing Light
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000001', 1, 'mcq', 'easy',
   'Which organelle carries out photosynthesis?',
   '["Mitochondrion","Chloroplast","Nucleus","Ribosome"]',
   '{"correct_indexes":[1]}', null, true),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000001', 2, 'fill_blank', 'medium',
   'Photosynthesis converts light energy into ______ energy.',
   '[]', '{"accepted":["chemical"]}', null, true),
  -- Node 2: Pigments
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000002', 1, 'mcq_multi', 'medium',
   'Which of these are photosynthetic pigments? (Choose all that apply.)',
   '["Chlorophyll a","Hemoglobin","Carotenoids","Keratin"]',
   '{"correct_indexes":[0,2]}', null, true),
  ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000002', 2, 'mcq', 'easy',
   'Which color of light is reflected most by chlorophyll (making leaves look that color)?',
   '["Red","Blue","Green","Violet"]',
   '{"correct_indexes":[2]}', null, true),
  -- Node 3: Reactions & Math (includes a calc question)
  ('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000003', 1, 'fill_blank', 'medium',
   'The light-independent reactions are also known as the ______ cycle.',
   '[]', '{"accepted":["Calvin"]}', null, true),
  ('e0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000003', 2, 'calc', 'hard',
   'Calculate how many photons are needed.',
   '[]', '{}',
   '{"variables":[{"name":"molecules","min":2,"max":12,"decimals":0}],"formula":"molecules * 8","prompt_template":"About 8 photons are needed to release one O₂ molecule. How many photons are needed to release {molecules} O₂ molecules?","decimals":0,"tolerance":0}',
   true);

