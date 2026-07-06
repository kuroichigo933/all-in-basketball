-- Fix tier upgrade path.
--
-- The app (lib/tiers.ts, the Stripe webhook, checkout) uses tier values
-- 'basic' and 'professional', but the original `tier` enum only had
-- 'free','member','allin'. Writing a paid tier therefore threw an invalid-enum
-- error, the update silently failed, and paying users stayed 'free' — which the
-- app layout redirects to /pricing. Add the values the code actually uses.
-- ('member'/'allin' remain as harmless unused values.)

alter type tier add value if not exists 'basic';
alter type tier add value if not exists 'professional';
