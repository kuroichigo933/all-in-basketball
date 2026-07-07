-- Defense-in-depth for privilege escalation.
--
-- The "update own" RLS policy lets a user update their own profile row, which
-- (without this) would let a crafted request set role='coach' or bump their own
-- tier. Roles are granted only by an admin (service role / SQL editor); tier is
-- set only by the Stripe webhook (service role). This trigger silently reverts
-- attempts to change role→coach or change tier when the request comes from a
-- normal end-user (authenticated/anon via PostgREST). Service-role and direct
-- admin connections are unaffected, so the webhook and manual grants still work.
-- Player↔parent selection during onboarding is still allowed.

create or replace function lock_privileged_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() in ('authenticated', 'anon') then
    if new.role = 'coach' and old.role is distinct from 'coach' then
      new.role := old.role;         -- no self-promotion to coach
    end if;
    if new.tier is distinct from old.tier then
      new.tier := old.tier;         -- tier changes only via the Stripe webhook
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists lock_privileged_profile_fields on profiles;
create trigger lock_privileged_profile_fields
  before update on profiles
  for each row execute function lock_privileged_profile_fields();
