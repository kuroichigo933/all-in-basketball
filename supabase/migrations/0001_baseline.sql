-- ============================================================
-- 0001 baseline — full schema, idempotent.
-- Safe to run on an empty project (provisions everything) and on an
-- already-populated one (guards make every statement a no-op if the object
-- already exists). Ported from supabase/schema.sql.
-- ============================================================

-- ---------- Enums ----------
do $$ begin create type user_role as enum ('player', 'parent', 'coach'); exception when duplicate_object then null; end $$;
do $$ begin create type tier as enum ('free', 'member', 'allin'); exception when duplicate_object then null; end $$;
do $$ begin create type review_status as enum ('pending', 'in_review', 'complete'); exception when duplicate_object then null; end $$;
do $$ begin create type booking_status as enum ('requested', 'confirmed', 'completed', 'cancelled'); exception when duplicate_object then null; end $$;

-- ---------- Profiles ----------
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  role user_role not null default 'player',
  full_name text not null default '',
  tier tier not null default 'free',
  onboarded boolean not null default false,
  age_group text,
  position text,
  skill_level text,
  goals text[],
  created_at timestamptz not null default now()
);

-- auto-create profile on signup
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  insert into user_stats (user_id) values (new.id);
  return new;
end; $$;

-- ---------- Parent <-> child ----------
create table if not exists parent_links (
  parent_id uuid not null references profiles on delete cascade,
  child_id uuid not null references profiles on delete cascade,
  invite_code text unique,
  accepted boolean not null default false,
  primary key (parent_id, child_id)
);

-- ---------- Billing ----------
create table if not exists subscriptions (
  user_id uuid primary key references profiles on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan tier not null default 'free',
  status text not null default 'inactive',
  current_period_end timestamptz
);

create table if not exists review_credits (
  user_id uuid primary key references profiles on delete cascade,
  balance int not null default 0
);

-- ---------- Content: drills & programs ----------
create table if not exists drills (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null,
  skill_level text not null default 'all',
  duration_seconds int not null default 60,
  video_url text not null,
  thumbnail_url text,
  tier_required tier not null default 'member',
  created_at timestamptz not null default now()
);

create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  skill_level text not null default 'all',
  focus text not null default 'shooting',
  weeks int not null default 4,
  cover_url text,
  tier_required tier not null default 'member',
  created_at timestamptz not null default now()
);

create table if not exists program_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs on delete cascade,
  day_number int not null,
  title text not null,
  unique (program_id, day_number)
);

create table if not exists program_day_drills (
  id uuid primary key default gen_random_uuid(),
  program_day_id uuid not null references program_days on delete cascade,
  drill_id uuid not null references drills on delete cascade,
  sort int not null default 0,
  work_seconds int not null default 60,
  rest_seconds int not null default 20,
  reps_label text,
  audio_cue text
);

create table if not exists program_enrollments (
  user_id uuid not null references profiles on delete cascade,
  program_id uuid not null references programs on delete cascade,
  current_day int not null default 1,
  started_at timestamptz not null default now(),
  primary key (user_id, program_id)
);

-- ---------- Activity, streaks, gamification ----------
create table if not exists workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  program_day_id uuid references program_days on delete set null,
  duration_seconds int not null default 0,
  completed_at timestamptz not null default now()
);

create table if not exists shot_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists shot_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references shot_sessions on delete cascade,
  zone text not null,
  makes int not null default 0,
  attempts int not null default 0
);

create table if not exists user_stats (
  user_id uuid primary key references profiles on delete cascade,
  xp int not null default 0,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_activity_date date
);

create table if not exists badges (
  code text primary key,
  name text not null,
  description text not null,
  icon text not null default '🏀'
);

create table if not exists user_badges (
  user_id uuid not null references profiles on delete cascade,
  badge_code text not null references badges on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_code)
);

-- streak + xp updater, called after any logged activity
create or replace function bump_activity(p_user uuid, p_xp int) returns void
language plpgsql security definer set search_path = public as $$
declare s user_stats%rowtype;
begin
  select * into s from user_stats where user_id = p_user for update;
  if s.last_activity_date = current_date then
    update user_stats set xp = xp + p_xp where user_id = p_user;
  elsif s.last_activity_date = current_date - 1 then
    update user_stats set xp = xp + p_xp, current_streak = current_streak + 1,
      longest_streak = greatest(longest_streak, current_streak + 1),
      last_activity_date = current_date where user_id = p_user;
  else
    update user_stats set xp = xp + p_xp, current_streak = 1,
      longest_streak = greatest(longest_streak, 1),
      last_activity_date = current_date where user_id = p_user;
  end if;
end; $$;

-- ---------- Shot review (premium) ----------
create table if not exists review_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  video_path text not null,         -- Google Drive file ID of the uploaded clip
  focus text not null default 'shooting form',
  notes text not null default '',
  status review_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists review_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references review_submissions on delete cascade,
  coach_id uuid not null references profiles on delete cascade,
  body text not null,
  video_path text,
  created_at timestamptz not null default now()
);

-- ---------- 1:1 booking ----------
create table if not exists session_types (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  duration_minutes int not null default 60,
  price_cents int not null default 8000,
  active boolean not null default true
);

create table if not exists availability_slots (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  booked boolean not null default false
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references availability_slots on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  session_type_id uuid not null references session_types,
  status booking_status not null default 'requested',
  note text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- Completed drills ----------
create table if not exists completed_drills (
  user_id uuid not null references profiles on delete cascade,
  drill_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, drill_id)
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles enable row level security;
alter table parent_links enable row level security;
alter table subscriptions enable row level security;
alter table review_credits enable row level security;
alter table drills enable row level security;
alter table programs enable row level security;
alter table program_days enable row level security;
alter table program_day_drills enable row level security;
alter table program_enrollments enable row level security;
alter table workout_logs enable row level security;
alter table shot_sessions enable row level security;
alter table shot_logs enable row level security;
alter table user_stats enable row level security;
alter table badges enable row level security;
alter table user_badges enable row level security;
alter table review_submissions enable row level security;
alter table review_feedback enable row level security;
alter table session_types enable row level security;
alter table availability_slots enable row level security;
alter table bookings enable row level security;
alter table completed_drills enable row level security;

create or replace function is_coach() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'coach') $$;

create or replace function is_parent_of(child uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from parent_links where parent_id = auth.uid() and child_id = child and accepted) $$;

-- profiles
drop policy if exists "read own / coach / parent" on profiles;
create policy "read own / coach / parent" on profiles for select
  using (id = auth.uid() or is_coach() or is_parent_of(id));
drop policy if exists "update own" on profiles;
create policy "update own" on profiles for update using (id = auth.uid());

-- parent links
drop policy if exists "links visible to both" on parent_links;
create policy "links visible to both" on parent_links for select
  using (parent_id = auth.uid() or child_id = auth.uid());
drop policy if exists "parent creates link" on parent_links;
create policy "parent creates link" on parent_links for insert with check (parent_id = auth.uid());
drop policy if exists "child accepts" on parent_links;
create policy "child accepts" on parent_links for update using (child_id = auth.uid());
drop policy if exists "parent removes" on parent_links;
create policy "parent removes" on parent_links for delete using (parent_id = auth.uid());

-- billing
drop policy if exists "own subscription" on subscriptions;
create policy "own subscription" on subscriptions for select using (user_id = auth.uid());
drop policy if exists "own credits" on review_credits;
create policy "own credits" on review_credits for select using (user_id = auth.uid());

-- content
drop policy if exists "read drills" on drills;
create policy "read drills" on drills for select using (auth.uid() is not null);
drop policy if exists "coach writes drills" on drills;
create policy "coach writes drills" on drills for all using (is_coach());
drop policy if exists "read programs" on programs;
create policy "read programs" on programs for select using (auth.uid() is not null);
drop policy if exists "coach writes programs" on programs;
create policy "coach writes programs" on programs for all using (is_coach());
drop policy if exists "read program days" on program_days;
create policy "read program days" on program_days for select using (auth.uid() is not null);
drop policy if exists "coach writes program days" on program_days;
create policy "coach writes program days" on program_days for all using (is_coach());
drop policy if exists "read day drills" on program_day_drills;
create policy "read day drills" on program_day_drills for select using (auth.uid() is not null);
drop policy if exists "coach writes day drills" on program_day_drills;
create policy "coach writes day drills" on program_day_drills for all using (is_coach());

-- enrollments / activity
drop policy if exists "own enrollments" on program_enrollments;
create policy "own enrollments" on program_enrollments for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "enrollments visible" on program_enrollments;
create policy "enrollments visible" on program_enrollments for select
  using (user_id = auth.uid() or is_coach() or is_parent_of(user_id));
drop policy if exists "own workouts" on workout_logs;
create policy "own workouts" on workout_logs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "workouts visible" on workout_logs;
create policy "workouts visible" on workout_logs for select
  using (user_id = auth.uid() or is_coach() or is_parent_of(user_id));
drop policy if exists "own shot sessions" on shot_sessions;
create policy "own shot sessions" on shot_sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "shot sessions visible" on shot_sessions;
create policy "shot sessions visible" on shot_sessions for select
  using (user_id = auth.uid() or is_coach() or is_parent_of(user_id));
drop policy if exists "own shot logs" on shot_logs;
create policy "own shot logs" on shot_logs for all
  using (exists (select 1 from shot_sessions s where s.id = session_id and s.user_id = auth.uid()));
drop policy if exists "shot logs visible" on shot_logs;
create policy "shot logs visible" on shot_logs for select
  using (exists (select 1 from shot_sessions s where s.id = session_id
         and (s.user_id = auth.uid() or is_coach() or is_parent_of(s.user_id))));
drop policy if exists "stats visible" on user_stats;
create policy "stats visible" on user_stats for select
  using (user_id = auth.uid() or is_coach() or is_parent_of(user_id));
drop policy if exists "read badges" on badges;
create policy "read badges" on badges for select using (true);
drop policy if exists "user badges visible" on user_badges;
create policy "user badges visible" on user_badges for select
  using (user_id = auth.uid() or is_coach() or is_parent_of(user_id));
drop policy if exists "earn badges" on user_badges;
create policy "earn badges" on user_badges for insert with check (user_id = auth.uid());

-- reviews
drop policy if exists "own submissions" on review_submissions;
create policy "own submissions" on review_submissions for select
  using (user_id = auth.uid() or is_coach() or is_parent_of(user_id));
drop policy if exists "create submission" on review_submissions;
create policy "create submission" on review_submissions for insert with check (user_id = auth.uid());
drop policy if exists "coach updates submission" on review_submissions;
create policy "coach updates submission" on review_submissions for update using (is_coach());
drop policy if exists "feedback visible" on review_feedback;
create policy "feedback visible" on review_feedback for select
  using (is_coach() or exists (select 1 from review_submissions r
         where r.id = submission_id and (r.user_id = auth.uid() or is_parent_of(r.user_id))));
drop policy if exists "coach writes feedback" on review_feedback;
create policy "coach writes feedback" on review_feedback for insert with check (is_coach());

-- booking
drop policy if exists "read session types" on session_types;
create policy "read session types" on session_types for select using (true);
drop policy if exists "coach manages session types" on session_types;
create policy "coach manages session types" on session_types for all using (is_coach());
drop policy if exists "read open slots" on availability_slots;
create policy "read open slots" on availability_slots for select using (true);
drop policy if exists "coach manages slots" on availability_slots;
create policy "coach manages slots" on availability_slots for all using (is_coach());
drop policy if exists "own bookings" on bookings;
create policy "own bookings" on bookings for select
  using (user_id = auth.uid() or is_coach() or is_parent_of(user_id));
drop policy if exists "create booking" on bookings;
create policy "create booking" on bookings for insert with check (user_id = auth.uid());
drop policy if exists "coach updates booking" on bookings;
create policy "coach updates booking" on bookings for update using (is_coach());

-- completed drills
drop policy if exists "Users can read own completed drills" on completed_drills;
create policy "Users can read own completed drills" on completed_drills
  for select using (user_id = auth.uid());
drop policy if exists "Users can insert own completed drills" on completed_drills;
create policy "Users can insert own completed drills" on completed_drills
  for insert with check (user_id = auth.uid());
drop policy if exists "Users can update own completed drills" on completed_drills;
create policy "Users can update own completed drills" on completed_drills
  for update using (user_id = auth.uid());

-- signup trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- Storage: private bucket for review videos
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('review-videos', 'review-videos', false)
  on conflict (id) do nothing;

drop policy if exists "users upload own review videos" on storage.objects;
create policy "users upload own review videos" on storage.objects for insert
  with check (bucket_id = 'review-videos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "owner and coach read review videos" on storage.objects;
create policy "owner and coach read review videos" on storage.objects for select
  using (bucket_id = 'review-videos'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_coach()));
drop policy if exists "coach uploads replies" on storage.objects;
create policy "coach uploads replies" on storage.objects for insert
  with check (bucket_id = 'review-videos' and is_coach());
