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

## Live camera path

The default analyzer mode requests `facingMode: "user"` and keeps camera preview, inference, rendering, and classification timing separate:

- Camera preview targets the device's normal 30 FPS stream.
- MediaPipe pose and ball inference is throttled to 10 FPS.
- Debug canvas and confidence UI update on analyzed frames only.
- Move detection operates on a rolling four-second observation window.

Completed events are deduplicated with a short cooldown and update per-move repetition counts. Short ball losses are filled only when bounded by plausible detections. Upload analysis calls the same tracker and move detector.

## Key decisions

- Retain a single Next.js deployment: the current browser MediaPipe dependency is adequate for a controlled prototype.
- Analyze prerecorded clips rather than live camera input to match the brief and make timestamps reproducible.
- Keep rules independent of MediaPipe objects so labeled fixtures or a future Python service can reuse the schema.
- Report coverage and an empty result instead of filling missing ball observations.
