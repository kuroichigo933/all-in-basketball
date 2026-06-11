-- Seed data: run after schema.sql. Replace video URLs with your real hosted videos.

insert into badges (code, name, description, icon) values
  ('first_workout', 'First Bucket', 'Complete your first workout', '🏀'),
  ('streak_7', 'Locked In', '7-day practice streak', '🔥'),
  ('streak_30', 'All In', '30-day practice streak', '💯'),
  ('shots_500', 'Volume Shooter', 'Log 500 shot attempts', '🎯'),
  ('first_review', 'Film Session', 'Submit your first shot review', '🎬'),
  ('program_done', 'Finisher', 'Complete a full program', '🏆');

insert into session_types (title, description, duration_minutes, price_cents) values
  ('1-on-1 Skills Session', 'Full hour of individual training: footwork, hand placement, game-speed reps.', 60, 8000),
  ('Small Group (2-4 players)', 'Train with friends. Competitive drills and game-situation work.', 60, 5000),
  ('Shooting Lab', '45 minutes of pure shooting mechanics with film breakdown.', 45, 6500);

-- Sample drills (tier_required 'free' = visible to free users as the funnel)
insert into drills (title, description, category, skill_level, duration_seconds, video_url, tier_required) values
  ('Form Shooting: One-Hand Start', 'Five feet from the rim. Elbow under the ball, snap the wrist, hold the follow-through.', 'shooting', 'beginner', 120, 'https://example.com/videos/form-shooting.mp4', 'free'),
  ('Stationary Pound Dribble', 'Pound the ball hard at hip height. Eyes up the whole time.', 'handles', 'beginner', 90, 'https://example.com/videos/pound-dribble.mp4', 'free'),
  ('Mikan Series', 'Alternating layups, both hands, no dribble. Soft touch off the glass.', 'finishing', 'beginner', 120, 'https://example.com/videos/mikan.mp4', 'free'),
  ('Catch & Shoot: 1-2 Step', 'Inside foot first, hop into your shot pocket, same release every rep.', 'shooting', 'intermediate', 180, 'https://example.com/videos/catch-shoot.mp4', 'member'),
  ('In-and-Out Crossover Combo', 'Sell the in-and-out, then cross low and tight. Change pace, not just direction.', 'handles', 'intermediate', 150, 'https://example.com/videos/in-out-cross.mp4', 'member'),
  ('Closeout Slide Series', 'Sprint to closeout, chop steps, high hand, then mirror the drive.', 'defense', 'intermediate', 180, 'https://example.com/videos/closeouts.mp4', 'member'),
  ('Euro Step Finishing', 'Long first step at the defender, second step away. Finish high off the glass.', 'finishing', 'advanced', 180, 'https://example.com/videos/euro.mp4', 'member'),
  ('Drop Step + Counter', 'Seal, drop step baseline, counter middle with the up-and-under.', 'footwork', 'advanced', 180, 'https://example.com/videos/dropstep.mp4', 'member');

-- Sample program with 3 days wired for Court Mode
with p as (
  insert into programs (title, description, skill_level, focus, weeks, tier_required)
  values ('Pure Shooter: 4 Weeks', 'Rebuild your shot from the ground up. Mechanics week 1, footwork week 2, game shots weeks 3-4.', 'all', 'shooting', 4, 'member')
  returning id
),
d1 as (insert into program_days (program_id, day_number, title) select id, 1, 'Mechanics Reset' from p returning id),
d2 as (insert into program_days (program_id, day_number, title) select id, 2, 'Footwork Into the Shot' from p returning id),
d3 as (insert into program_days (program_id, day_number, title) select id, 3, 'Game Speed Reps' from p returning id)
insert into program_day_drills (program_day_id, drill_id, sort, work_seconds, rest_seconds, reps_label, audio_cue)
select d1.id, dr.id, 0, 180, 30, '50 makes close range', 'Form shooting. Fifty makes, five feet out. Hold every follow-through.'
  from d1, drills dr where dr.title = 'Form Shooting: One-Hand Start'
union all
select d1.id, dr.id, 1, 240, 30, '3 x 10 makes', 'Catch and shoot. One-two step. Ten makes, three rounds.'
  from d1, drills dr where dr.title = 'Catch & Shoot: 1-2 Step'
union all
select d2.id, dr.id, 0, 240, 30, '3 x 10 each side', 'One-two step footwork. Inside foot first. Both sides.'
  from d2, drills dr where dr.title = 'Catch & Shoot: 1-2 Step'
union all
select d2.id, dr.id, 1, 180, 30, '2 x 10 each hand', 'Mikan series. Both hands. Soft off the glass.'
  from d2, drills dr where dr.title = 'Mikan Series'
union all
select d3.id, dr.id, 0, 300, 45, '5 spots x 5 makes', 'Game shots. Five spots, five makes each. Sprint between spots.'
  from d3, drills dr where dr.title = 'Catch & Shoot: 1-2 Step'
union all
select d3.id, dr.id, 1, 240, 45, '10 finishes each side', 'Euro step finishing. Attack the cone, finish high.'
  from d3, drills dr where dr.title = 'Euro Step Finishing';
