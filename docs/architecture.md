# Architecture

## Existing application

- **Frontend/orchestration:** Next.js 14 App Router, React, strict TypeScript, Tailwind.
- **Backend:** Next server components, server actions, and API routes.
- **Identity/storage/database:** Supabase Auth, Postgres, RLS, and private film-review storage.
- **External services:** Stripe payments, optional Google Drive/Sheets, SMTP email, Vercel deployment.
- **Video features:** Coach-review uploads already use Supabase. The AI analyzer is separate and processes local files in the browser.

## Analysis pipeline

```text
local video -> 10 fps seek/decode -> MediaPipe pose + EfficientDet
-> normalized wrists/hips/knees + ball center/confidence -> bounded gap tracking
-> temporal rule detectors -> move interval/confidence/evidence -> UI
```

`app/(app)/ai-tracker/AITracker.tsx` owns browser decoding, model execution, and JSON export. `lib/motion/types.ts` is the boundary between computer vision and classification. `lib/motion/trackBall.ts`, `detectMoves.ts`, and `evaluate.ts` contain pure, testable tracking, classification, and scoring logic. No observations are persisted by the application.

## Key decisions

- Retain a single Next.js deployment: the current browser MediaPipe dependency is adequate for a controlled prototype.
- Analyze prerecorded clips rather than live camera input to match the brief and make timestamps reproducible.
- Keep rules independent of MediaPipe objects so labeled fixtures or a future Python service can reuse the schema.
- Report coverage and an empty result instead of filling missing ball observations.
