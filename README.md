# All In Basketball Training — App

Training app for All In Basketball Training. Free + paid tiers, follow-along Court Mode
workouts, drill library, shot-chart progress tracking, streaks & badges, coach film reviews,
1:1 session booking, and a parent dashboard.

**Stack:** Next.js 14 (App Router) · Supabase (auth, Postgres, storage) · Stripe · Tailwind

---

## 1. Prerequisites

- Node.js 18.17+ (`node -v`)
- A free [Supabase](https://supabase.com) account
- A [Stripe](https://stripe.com) account (test mode is fine to start)

## 2. Supabase setup

1. Create a new Supabase project.
2. In the SQL Editor, paste and run **`supabase/schema.sql`** (tables, security policies, the
   private `review-videos` bucket, and the signup trigger).
3. Then run **`supabase/seed.sql`** (badges, session types, sample drills, a starter program).
4. From Project Settings → API, copy the **Project URL**, **anon key**, and **service_role key**.

> The seed drills use `https://example.com/...` placeholder video URLs. Replace them with real
> hosted MP4s (Supabase Storage public bucket, Cloudflare Stream, or Mux all work — anything a
> `<video src>` can play).

## 3. Stripe setup

1. In Stripe → Product catalog, create:
   - **Member** — recurring monthly, $14.99
   - **All In** — recurring monthly, $39.99
   - **Film Review** — one-time, $29
2. Copy each **price ID** (starts with `price_`).
3. Webhook (after you deploy, or use `stripe listen --forward-to localhost:3000/api/stripe/webhook`
   for local dev): add an endpoint pointing to `https://YOURDOMAIN/api/stripe/webhook` with events:
   - `checkout.session.completed`
   - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - `invoice.paid`
4. Copy the webhook **signing secret** (`whsec_...`).

The webhook keeps `profiles.tier` in sync and grants **2 review credits per month** to All In
subscribers on every paid invoice, plus 1 credit per single review purchase.

## 4. Environment

```bash
cp .env.example .env.local
```

Fill in every value. `NEXT_PUBLIC_SITE_URL` is `http://localhost:3000` locally and your real
domain in production.

## 5. Run it

```bash
npm install
npm run dev
```

For the basketball tracking MVP, open `/ai-tracker` after signing in and start the front-facing camera. Upload analysis remains under the benchmark tab. See [`PROJECT.md`](PROJECT.md) for scope and validation commands.

Sign up at `http://localhost:3000/signup` — the signup trigger creates the profile + stats rows
automatically, and you'll land in the onboarding quiz.

## 6. Make yourself (or Sarah) a coach

Coach accounts see the **Coach Desk**: the film-review queue, booking requests, and availability
management. In the Supabase Table Editor (or SQL editor):

```sql
update profiles set role = 'coach' where id = 'THE-USER-UUID';
```

## 7. Deploy

[Vercel](https://vercel.com) is the easy path: import the repo, paste in the same env vars,
deploy. Then point the Stripe webhook at your production URL and switch Stripe to live keys.

In Supabase → Authentication → URL Configuration, set the Site URL to your domain and add
`https://YOURDOMAIN/auth/callback` to the redirect list.

---

## How the pieces fit

| Area | Where | Notes |
|---|---|---|
| Tiers & gating | `lib/tiers.ts`, checks in each page | `profiles.tier` is the cached source of truth, updated only by the Stripe webhook |
| Onboarding quiz | `app/onboarding` | Answers stored on the profile; the dashboard recommends a program matching the player's first goal |
| Court Mode | `app/(app)/programs/[id]/play` | Wake lock keeps the screen on; `speechSynthesis` speaks drill cues; finishing logs the workout, bumps XP/streak, advances the program day |
| Shot tracking | `app/(app)/progress` | Tap-the-court logging; the same court SVG renders the all-time heat chart |
| Gamification | `bump_activity()` SQL function + `app/(app)/actions.ts` | XP, daily streaks, badges (first workout, 7/30-day streaks, 500 shots, first review) |
| Film Room | `app/(app)/review` + `app/(app)/coach` | Uploads go to the private `review-videos` bucket; coaches watch via short-lived signed URLs; submitting spends 1 credit |
| Booking | `app/(app)/book` + Coach Desk | Players request open slots; coach confirms/cancels. **v1 is pay-at-session** (no Stripe on bookings yet) |
| Parent dashboard | `app/(app)/family` | Parent generates a 6-character code; the player redeems it; security policies then let the parent read the child's stats |

## Before you launch (the honest checklist)

- **Replace placeholder drill videos** in the seed data with Sarah's real content.
- **Privacy policy + terms.** You'll be collecting minors' data and videos of kids. You need a
  COPPA-conscious privacy policy and a parental-consent step for under-13 signups before going
  live in the US. Worth a one-hour consult with a lawyer — this is the one piece I'd not skip.
- **Review turnaround promise.** The app tells players "within 5 business days." Make sure
  that's a promise a 2-person operation can keep, or change the copy in
  `app/(app)/review/ReviewUpload.tsx`.
- **App icon.** Drop a real 512×512 `icon-512.png` into `public/` for the PWA install prompt.
- **Stripe live mode** + production webhook before charging real money.

## Ideas already wired for later

- Booking payments: add a Stripe Checkout step in `requestBooking` (the schema already stores
  everything needed).
- Coach video replies: `review_feedback.video_path` exists; add an upload in the coach review
  page mirroring the player upload flow.
- Native app feel: this is an installable PWA already; wrap with Capacitor later if you want
  app-store presence.
