create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Learner' check (char_length(display_name) between 1 and 80),
  skill_level text not null default 'beginner' check (skill_level in ('beginner', 'intermediate', 'advanced')),
  preferred_language text not null default 'javascript' check (char_length(preferred_language) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  programming_language text not null,
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  content text not null default '',
  topic text not null,
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  lesson_order integer not null check (lesson_order > 0),
  estimated_minutes integer not null default 10 check (estimated_minutes > 0),
  created_at timestamptz not null default now(),
  unique (course_id, lesson_order)
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  title text not null,
  instructions text not null,
  programming_language text not null,
  starter_code text not null default '',
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  topic text not null,
  learning_objective text not null default '',
  created_at timestamptz not null default now()
);

create table public.exercise_test_cases (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  input jsonb not null default '[]'::jsonb,
  expected_output text not null,
  visible_to_student boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  status text not null default 'started' check (status in ('started', 'completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, lesson_id),
  check ((status = 'completed' and completed_at is not null) or status = 'started')
);

create table public.coding_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid references public.exercises (id) on delete set null,
  exercise_title text not null default 'Coding attempt',
  topic text,
  submitted_code text not null default '',
  programming_language text not null,
  execution_status text not null check (execution_status in ('accepted', 'wrong_answer', 'compile_error', 'runtime_error', 'time_limit', 'infrastructure_error')),
  passed_tests integer not null default 0 check (passed_tests >= 0),
  total_tests integer not null default 0 check (total_tests >= 0),
  feedback text,
  created_at timestamptz not null default now(),
  check (passed_tests <= total_tests)
);

create table public.error_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  coding_attempt_id uuid references public.coding_attempts (id) on delete set null,
  error_type text not null,
  topic text,
  error_message text not null,
  explanation text,
  correction_summary text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  score integer not null check (score >= 0),
  total_questions integer not null check (total_questions > 0),
  completed_at timestamptz not null default now(),
  check (score <= total_questions)
);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) <= 12000),
  related_language text,
  created_at timestamptz not null default now()
);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid references public.lessons (id) on delete cascade,
  exercise_id uuid references public.exercises (id) on delete cascade,
  reason text not null,
  status text not null default 'new' check (status in ('new', 'viewed', 'completed', 'dismissed')),
  created_at timestamptz not null default now(),
  check (num_nonnulls(lesson_id, exercise_id) = 1)
);

create index lessons_course_order_idx on public.lessons (course_id, lesson_order);
create index exercises_lesson_idx on public.exercises (lesson_id);
create index exercise_test_cases_exercise_idx on public.exercise_test_cases (exercise_id);
create index lesson_progress_user_status_idx on public.lesson_progress (user_id, status);
create index coding_attempts_user_created_idx on public.coding_attempts (user_id, created_at desc);
create index coding_attempts_exercise_idx on public.coding_attempts (exercise_id);
create index error_history_user_created_idx on public.error_history (user_id, created_at desc);
create index error_history_user_topic_resolved_idx on public.error_history (user_id, topic, resolved);
create index quiz_attempts_user_completed_idx on public.quiz_attempts (user_id, completed_at desc);
create index ai_conversations_user_updated_idx on public.ai_conversations (user_id, updated_at desc);
create index ai_messages_conversation_created_idx on public.ai_messages (conversation_id, created_at);
create index recommendations_user_status_idx on public.recommendations (user_id, status);

create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'Learner'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_test_cases enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.coding_attempts enable row level security;
alter table public.error_history enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.recommendations enable row level security;

grant select on public.courses, public.lessons, public.exercises to anon, authenticated;
grant select on public.exercise_test_cases to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.lesson_progress, public.coding_attempts, public.error_history,
  public.quiz_attempts, public.ai_conversations, public.ai_messages, public.recommendations to authenticated;

create policy "Students read their own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Students update their own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Students insert their own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Anyone reads published courses" on public.courses for select to anon, authenticated using (published);
create policy "Anyone reads lessons in published courses" on public.lessons for select to anon, authenticated using (exists (select 1 from public.courses c where c.id = course_id and c.published));
create policy "Anyone reads exercises in published courses" on public.exercises for select to anon, authenticated using (exists (select 1 from public.lessons l join public.courses c on c.id = l.course_id where l.id = lesson_id and c.published));
create policy "Students read visible test cases" on public.exercise_test_cases for select to authenticated using (visible_to_student and exists (select 1 from public.exercises e join public.lessons l on l.id = e.lesson_id join public.courses c on c.id = l.course_id where e.id = exercise_id and c.published));

create policy "Students manage their lesson progress" on public.lesson_progress for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Students manage their coding attempts" on public.coding_attempts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Students manage their error history" on public.error_history for all to authenticated
using (
  (select auth.uid()) = user_id
  and (coding_attempt_id is null or exists (
    select 1 from public.coding_attempts a
    where a.id = coding_attempt_id and a.user_id = (select auth.uid())
  ))
)
with check (
  (select auth.uid()) = user_id
  and (coding_attempt_id is null or exists (
    select 1 from public.coding_attempts a
    where a.id = coding_attempt_id and a.user_id = (select auth.uid())
  ))
);
create policy "Students manage their quiz attempts" on public.quiz_attempts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Students manage their conversations" on public.ai_conversations for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Students manage their messages" on public.ai_messages for all to authenticated using ((select auth.uid()) = user_id and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))) with check ((select auth.uid()) = user_id and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));
create policy "Students manage their recommendations" on public.recommendations for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into public.courses (id, title, description, programming_language, difficulty, published)
values ('8e1fb77d-c8d6-4b13-b326-450743aa4c13', 'JavaScript, from the ground up', 'A practical introduction to reading, writing, and reasoning about JavaScript.', 'javascript', 'beginner', true)
on conflict (id) do nothing;

insert into public.lessons (id, course_id, title, content, topic, difficulty, lesson_order, estimated_minutes) values
('c6231034-0705-42ed-872a-bad7c0080a01', '8e1fb77d-c8d6-4b13-b326-450743aa4c13', 'Variables and values', 'A variable is a named place to keep a value. Use const when it will not be reassigned, and console.log to inspect it.', 'Fundamentals', 'beginner', 1, 8),
('c6231034-0705-42ed-872a-bad7c0080a02', '8e1fb77d-c8d6-4b13-b326-450743aa4c13', 'Make a decision', 'Use if and else blocks to choose which instructions should run.', 'Conditionals', 'beginner', 2, 10),
('c6231034-0705-42ed-872a-bad7c0080a03', '8e1fb77d-c8d6-4b13-b326-450743aa4c13', 'Repeat with loops', 'A for loop repeats a block while its condition remains true.', 'Loops', 'beginner', 3, 12),
('c6231034-0705-42ed-872a-bad7c0080a04', '8e1fb77d-c8d6-4b13-b326-450743aa4c13', 'Bundle work into a function', 'Functions package reusable instructions and return results to their callers.', 'Functions', 'beginner', 4, 14),
('c6231034-0705-42ed-872a-bad7c0080a05', '8e1fb77d-c8d6-4b13-b326-450743aa4c13', 'Work with a list', 'Arrays store ordered values. Their index starts at zero.', 'Arrays', 'beginner', 5, 11),
('c6231034-0705-42ed-872a-bad7c0080a06', '8e1fb77d-c8d6-4b13-b326-450743aa4c13', 'Combine values with operators', 'Arithmetic operators calculate new values from existing ones.', 'Operators', 'beginner', 6, 8),
('c6231034-0705-42ed-872a-bad7c0080a07', '8e1fb77d-c8d6-4b13-b326-450743aa4c13', 'Describe a thing with an object', 'Objects group related values under named properties.', 'Objects', 'intermediate', 7, 13),
('c6231034-0705-42ed-872a-bad7c0080a08', '8e1fb77d-c8d6-4b13-b326-450743aa4c13', 'Find an off-by-one bug', 'Trace loop boundaries to locate an off-by-one error.', 'Debugging', 'advanced', 8, 15)
on conflict (id) do nothing;

insert into public.exercises (id, lesson_id, title, instructions, programming_language, starter_code, difficulty, topic, learning_objective) values
('bd35ffcb-6a80-4b89-a43a-4a2c01e50001', 'c6231034-0705-42ed-872a-bad7c0080a01', 'Personal greeting', 'Create a learner variable with the value Maya and print Hello, Maya!', 'javascript', 'const learner = "";\nconsole.log(`Hello, ${learner}!`);', 'beginner', 'Variables', 'Create a string variable and print it.'),
('bd35ffcb-6a80-4b89-a43a-4a2c01e50002', 'c6231034-0705-42ed-872a-bad7c0080a02', 'Pass or retry', 'Print You passed! when the score is at least 70.', 'javascript', 'const score = 82;\n// Add an if/else statement.', 'beginner', 'Conditionals', 'Choose a message using a condition.'),
('bd35ffcb-6a80-4b89-a43a-4a2c01e50003', 'c6231034-0705-42ed-872a-bad7c0080a03', 'Count to three', 'Use a loop to print 1, 2, and 3 on separate lines.', 'javascript', '// Write a for loop.', 'beginner', 'Loops', 'Repeat an instruction a known number of times.'),
('bd35ffcb-6a80-4b89-a43a-4a2c01e50004', 'c6231034-0705-42ed-872a-bad7c0080a06', 'Add two values', 'Add 7 and 8, then print the sum.', 'javascript', 'const first = 7;\nconst second = 8;\nconsole.log(first + second);', 'beginner', 'Operators', 'Combine numeric values with addition.'),
('bd35ffcb-6a80-4b89-a43a-4a2c01e50005', 'c6231034-0705-42ed-872a-bad7c0080a07', 'Read an object property', 'Print the name property from the student object.', 'javascript', 'const student = { name: "Maya", level: "beginner" };\nconsole.log(student.name);', 'intermediate', 'Objects', 'Read a named object property.'),
('bd35ffcb-6a80-4b89-a43a-4a2c01e50006', 'c6231034-0705-42ed-872a-bad7c0080a08', 'Fix the loop boundary', 'Adjust the condition so the loop prints 0, 1, and 2.', 'javascript', 'for (let count = 0; count < 2; count += 1) {\n  console.log(count);\n}', 'advanced', 'Debugging', 'Trace and correct an off-by-one bug.')
on conflict (id) do nothing;

insert into public.exercise_test_cases (id, exercise_id, input, expected_output, visible_to_student) values
('2e3528b5-75a1-4cc7-a500-4fdc7c200001', 'bd35ffcb-6a80-4b89-a43a-4a2c01e50001', '[]'::jsonb, 'Hello, Maya!', false),
('2e3528b5-75a1-4cc7-a500-4fdc7c200002', 'bd35ffcb-6a80-4b89-a43a-4a2c01e50002', '[]'::jsonb, 'You passed!', false),
('2e3528b5-75a1-4cc7-a500-4fdc7c200003', 'bd35ffcb-6a80-4b89-a43a-4a2c01e50003', '[]'::jsonb, '1' || chr(10) || '2' || chr(10) || '3', false),
('2e3528b5-75a1-4cc7-a500-4fdc7c200004', 'bd35ffcb-6a80-4b89-a43a-4a2c01e50004', '[]'::jsonb, '15', false),
('2e3528b5-75a1-4cc7-a500-4fdc7c200005', 'bd35ffcb-6a80-4b89-a43a-4a2c01e50005', '[]'::jsonb, 'Maya', false),
('2e3528b5-75a1-4cc7-a500-4fdc7c200006', 'bd35ffcb-6a80-4b89-a43a-4a2c01e50006', '[]'::jsonb, '0' || chr(10) || '1' || chr(10) || '2', false)
on conflict (id) do nothing;