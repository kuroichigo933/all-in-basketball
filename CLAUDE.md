# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # local dev server (http://localhost:3000)
npm run build    # production build — catches type errors
npm run start    # run the production build locally
```

No test suite or linter is configured. Type-check manually with `npm run build` before committing.

## Stack

- **Next.js 14 App Router** (TypeScript, Tailwind CSS)
- **Supabase** — auth, Postgres database, and storage
- **Stripe** — subscriptions and one-off payments
- **Google Drive** — drill video library (optional, see `lib/google-drive.ts`)
- **Vercel** — hosting

## Architecture

### Route structure

```
app/
  page.tsx                  ← public landing page
  (app)/                    ← auth-gated route group
    layout.tsx              ← checks auth + onboarding, renders AppNav
    dashboard/              ← home after login
    library/                ← drill library (Drive-backed) + sample sessions
    programs/               ← custom session builder + structured programs
    progress/               ← shot chart + shot tracker
    review/                 ← film upload + sample breakdown
    book/                   ← fake calendar slot booking
    coach/                  ← coach-only desk (review queue, availability)
    family/                 ← parent/child linking
    actions.ts              ← all server actions (one file)
  samples/[id]/             ← public sample drill programs (no auth)
    play/                   ← timer-driven practice player
  api/stripe/               ← webhook, checkout, portal routes
  auth/callback/            ← Supabase OAuth callback
```

### Auth + access control

Auth is handled by Supabase. `middleware.ts` gates every route not in `PUBLIC_PATHS`. The `(app)` layout does a second check and redirects to `/onboarding` if `profiles.onboarded = false`.

Three user roles (`player`, `parent`, `coach`) and three tiers (`free`, `member`, `allin`) control access. Tier gating is enforced in the app layer via `lib/tiers.ts → hasTier()`. Row-level security in Supabase enforces role boundaries (players can only see their own data; coaches can see everyone's; parents can see their linked children's).

### Supabase clients — which to use

| Client | Import | Use for |
|---|---|---|
| Server (anon) | `lib/supabase/server.ts` | Server components, server actions — RLS applies |
| Browser (anon) | `lib/supabase/client.ts` | Client components only |
| Admin (service role) | `lib/supabase/admin.ts` | Bypasses RLS — webhooks, credit grants, badge awards. **Never import in client components.** |

### Server actions

All mutations live in `app/(app)/actions.ts`. Every action calls `requireUser()` first. The pattern:
- Use `supabase` (anon client) for user-scoped writes — RLS is the guardrail
- Use `createAdminClient()` only when you need to bypass RLS (e.g. bumping XP, awarding badges, Stripe webhooks)
- Call `revalidatePath()` at the end so server components re-fetch

### Data model highlights

- `profiles` — extends `auth.users`, created automatically via `handle_new_user()` trigger on signup
- `user_stats` — XP + streaks, updated via the `bump_activity(user_id, xp)` Postgres function
- Shot tracking: `shot_sessions` (one row per session) → `shot_logs` (one row per zone per session)
- Programs: `programs` → `program_days` → `program_day_drills` (join to `drills`). `program_enrollments` tracks the user's current day.
- Tier upgrade flow: Stripe webhook → `syncSubscription()` → updates both `subscriptions` and `profiles.tier`

### Google Drive drill library

`lib/google-drive.ts` fetches a folder tree from Drive using a service account JWT (no SDK dependency). Expected folder structure:

```
<GOOGLE_DRIVE_FOLDER_ID>/
  Shooting/
    Beginner/   ← video files
    Intermediate/
    Expert/
  Dribbling/
    ...
```

Returns `DrillCategory[]` with iFrame embed URLs for each video. Results are cached 5 minutes via Next.js `fetch` `revalidate`. The library and train pages both call `getDrillLibrary()` and degrade gracefully (shows sample sessions) when env vars are absent.

### Styling conventions

All design tokens are in `tailwind.config.ts`. Use the semantic names:
- **Colors**: `asphalt` (page bg), `surface` (cards), `raised` (inputs/inset areas), `line` (borders), `chalk` (primary text), `muted` (secondary text), `game` (orange accent), `wood` (amber), `make` (green)
- **Typography**: `display` class = uppercase + tracking, used for headings. `score` class = tabular nums, used for stats.
- **Components**: `card`, `btn-game`, `btn-ghost`, `input`, `label`, `baseline` — defined in `globals.css`

### Environment variables

Required:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_MEMBER
STRIPE_PRICE_ALLIN
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
```

Optional (Google Drive drill library):
```
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY        # raw PEM, use \n for newlines in .env.local
GOOGLE_DRIVE_FOLDER_ID
```

Add to `.env.local` for local dev and to Vercel → Settings → Environment Variables for production.
