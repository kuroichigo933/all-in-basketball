-- ============================================================
-- ALL IN BASKETBALL TRAINING — full schema (historical reference).
--
-- This file is NO LONGER the way the schema is applied. Migrations now live in
-- supabase/migrations/ and run automatically on production deploys via
-- scripts/migrate.mjs. supabase/migrations/0001_baseline.sql is the idempotent,
-- executable copy of this schema; make schema changes by adding a new
-- supabase/migrations/000N_*.sql file, not by editing this file.
-- ============================================================

create type user_role as enum ('player', 'parent', 'coach');
create type tier as enum ('free', 'member', 'allin');
create type review_status as enum ('pending', 'in_review', 'complete');
create type booking_status as enum ('requested', 'confirmed', 'completed', 'cancelled');

-- ---------- Profiles ----------
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  role user_role not null default 'player',
  full_name text not null default '',
  tier tier not null default 'free',
  onboarded boolean not null default false,
  -- onboarding quiz answers
  age_group text,            -- 'u10' | 'u13' | 'u15' | 'u18' | 'adult'
  position text,             -- 'guard' | 'wing' | 'big' | 'unsure'
  skill_level text,          -- 'beginner' | 'intermediate' | 'advanced'
  goals text[],              -- e.g. {'shooting','handles','defense','iq','athleticism'}
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
create table parent_links (
  parent_id uuid not null references profiles on delete cascade,
  child_id uuid not null references profiles on delete cascade,
  invite_code text unique,   -- child enters this code to link
  accepted boolean not null default false,
  primary key (parent_id, child_id)
);

-- ---------- Billing ----------
create table subscriptions (
  user_id uuid primary key references profiles on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan tier not null default 'free',
  status text not null default 'inactive',  -- mirrors Stripe status
  current_period_end timestamptz
);

create table review_credits (
  user_id uuid primary key references profiles on delete cascade,
  balance int not null default 0
);

-- ---------- Content: drills & programs ----------
create table drills (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null,            -- 'shooting' | 'handles' | 'finishing' | 'defense' | 'footwork' | 'conditioning'
  skill_level text not null default 'all',
  duration_seconds int not null default 60,
  video_url text not null,           -- mp4 / HLS / Mux playback URL
  thumbnail_url text,
  tier_required tier not null default 'member',
  created_at timestamptz not null default now()
);

create table programs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  skill_level text not null default 'all',
  focus text not null default 'shooting',     -- matches onboarding goals for recommendations
  weeks int not null default 4,
  cover_url text,
  tier_required tier not null default 'member',
  created_at timestamptz not null default now()
);

create table program_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs on delete cascade,
  day_number int not null,
  title text not null,
  unique (program_id, day_number)
);

create table program_day_drills (
  id uuid primary key default gen_random_uuid(),
  program_day_id uuid not null references program_days on delete cascade,
  drill_id uuid not null references drills on delete cascade,
  sort int not null default 0,
  work_seconds int not null default 60,   -- timer for this block in Court Mode
  rest_seconds int not null default 20,
  reps_label text,                        -- e.g. '3 x 10 makes' (shown + spoken)
  audio_cue text                          -- spoken when the block starts
);

create table program_enrollments (
  user_id uuid not null references profiles on delete cascade,
  program_id uuid not null references programs on delete cascade,
  current_day int not null default 1,
  started_at timestamptz not null default now(),
  primary key (user_id, program_id)
);

-- ---------- Activity, streaks, gamification ----------
create table workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  program_day_id uuid references program_days on delete set null,
  duration_seconds int not null default 0,
  completed_at timestamptz not null default now()
);

create table shot_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now()
);

create table shot_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references shot_sessions on delete cascade,
  zone text not null,        -- 'corner3_l','corner3_r','wing3_l','wing3_r','top3','midrange_l','midrange_r','elbow_l','elbow_r','freethrow','paint'
  makes int not null default 0,
  attempts int not null default 0
);

create table user_stats (
  user_id uuid primary key references profiles on delete cascade,
  xp int not null default 0,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_activity_date date
);

create table badges (
  code text primary key,
  name text not null,
  description text not null,
  icon text not null default '🏀'
);

create table user_badges (
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
create table review_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  video_path text not null,         -- path in 'review-videos' storage bucket
  focus text not null default 'shooting form',
  notes text not null default '',
  status review_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table review_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references review_submissions on delete cascade,
  coach_id uuid not null references profiles on delete cascade,
  body text not null,
  video_path text,                  -- optional coach reply video in same bucket
  created_at timestamptz not null default now()
);

-- ---------- 1:1 booking ----------
create table session_types (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  duration_minutes int not null default 60,
  price_cents int not null default 8000,
  active boolean not null default true
);

create table availability_slots (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  booked boolean not null default false
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references availability_slots on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  session_type_id uuid not null references session_types,
  status booking_status not null default 'requested',
  note text not null default '',
  created_at timestamptz not null default now()
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

create or replace function is_coach() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'coach') $$;

create or replace function is_parent_of(child uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from parent_links where parent_id = auth.uid() and child_id = child and accepted) $$;

-- profiles
create policy "read own / coach / parent" on profiles for select
  using (id = auth.uid() or is_coach() or is_parent_of(id));
create policy "update own" on profiles for update using (id = auth.uid());

-- parent links: either side can see; parent creates; child accepts
create policy "links visible to both" on parent_links for select
  using (parent_id = auth.uid() or child_id = auth.uid());
create policy "parent creates link" on parent_links for insert with check (parent_id = auth.uid());
create policy "child accepts" on parent_links for update using (child_id = auth.uid());
create policy "parent removes" on parent_links for delete using (parent_id = auth.uid());

-- billing (writes happen via service role in webhooks)
create policy "own subscription" on subscriptions for select using (user_id = auth.uid());
create policy "own credits" on review_credits for select using (user_id = auth.uid());

-- content: readable by all signed-in users (tier gating enforced in app); coach manages
create policy "read drills" on drills for select using (auth.uid() is not null);
create policy "coach writes drills" on drills for all using (is_coach());
create policy "read programs" on programs for select using (auth.uid() is not null);
create policy "coach writes programs" on programs for all using (is_coach());
create policy "read program days" on program_days for select using (auth.uid() is not null);
create policy "coach writes program days" on program_days for all using (is_coach());
create policy "read day drills" on program_day_drills for select using (auth.uid() is not null);
create policy "coach writes day drills" on program_day_drills for all using (is_coach());

-- enrollments / activity: own rows, visible to coach and linked parent
create policy "own enrollments" on program_enrollments for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "enrollments visible" on program_enrollments for select
  using (user_id = auth.uid() or is_coach() or is_parent_of(user_id));
create policy "own workouts" on workout_logs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "workouts visible" on workout_logs for select
  using (user_id = auth.uid() or is_coach() or is_parent_of(user_id));
create policy "own shot sessions" on shot_sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "shot sessions visible" on shot_sessions for select
  using (user_id = auth.uid() or is_coach() or is_parent_of(user_id));
create policy "own shot logs" on shot_logs for all
  using (exists (select 1 from shot_sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy "shot logs visible" on shot_logs for select
  using (exists (select 1 from shot_sessions s where s.id = session_id
         and (s.user_id = auth.uid() or is_coach() or is_parent_of(s.user_id))));
create policy "stats visible" on user_stats for select
  using (user_id = auth.uid() or is_coach() or is_parent_of(user_id));
create policy "read badges" on badges for select using (true);
create policy "user badges visible" on user_badges for select
  using (user_id = auth.uid() or is_coach() or is_parent_of(user_id));
create policy "earn badges" on user_badges for insert with check (user_id = auth.uid());

-- reviews: owner + coach
create policy "own submissions" on review_submissions for select
  using (user_id = auth.uid() or is_coach() or is_parent_of(user_id));
create policy "create submission" on review_submissions for insert with check (user_id = auth.uid());
create policy "coach updates submission" on review_submissions for update using (is_coach());
create policy "feedback visible" on review_feedback for select
  using (is_coach() or exists (select 1 from review_submissions r
         where r.id = submission_id and (r.user_id = auth.uid() or is_parent_of(r.user_id))));
create policy "coach writes feedback" on review_feedback for insert with check (is_coach());

-- booking
create policy "read session types" on session_types for select using (true);
create policy "coach manages session types" on session_types for all using (is_coach());
create policy "read open slots" on availability_slots for select using (true);
create policy "coach manages slots" on availability_slots for all using (is_coach());
create policy "own bookings" on bookings for select
  using (user_id = auth.uid() or is_coach() or is_parent_of(user_id));
create policy "create booking" on bookings for insert with check (user_id = auth.uid());
create policy "coach updates booking" on bookings for update using (is_coach());

-- signup trigger
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- Storage: private bucket for review videos
-- ============================================================
insert into storage.buckets (id, name, public) values ('review-videos', 'review-videos', false);

create policy "users upload own review videos" on storage.objects for insert
  with check (bucket_id = 'review-videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner and coach read review videos" on storage.objects for select
  using (bucket_id = 'review-videos'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_coach()));
create policy "coach uploads replies" on storage.objects for insert
  with check (bucket_id = 'review-videos' and is_coach());

-- ---------- Completed Drills ----------
create table completed_drills (
  user_id uuid not null references profiles on delete cascade,
  drill_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, drill_id)
);

alter table completed_drills enable row level security;

create policy "Users can read own completed drills" on completed_drills
  for select using (user_id = auth.uid());

create policy "Users can insert own completed drills" on completed_drills
  for insert with check (user_id = auth.uid());

create policy "Users can update own completed drills" on completed_drills
  for update using (user_id = auth.uid());
