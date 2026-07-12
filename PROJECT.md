# Basketball Video Analysis MVP

## Product boundary

The primary MVP uses the browser's front-facing camera for near-real-time tracking of one full-body player and one basketball. MediaPipe inference runs locally at approximately 10 FPS while the preview remains at the camera frame rate. Uploaded clips remain a secondary debugging and benchmark workflow.

## Progress

- **Current milestone:** Live front-camera move tracking with shared upload benchmarks.
- **Completed:** Front-camera preview; multi-signal color-independent ball acquisition; predictive candidate fusion; tap-to-lock; four-second rolling history; temporary loss prediction; live move events, confidence, timestamps, repetition counts, persistent expanded view, and shared upload benchmarks.
- **Current task:** Label the nine prepared controlled segments, export observations, tune on calibration, and run the held-out 95% gate.
- **Latest verified result:** 22/22 tracking, detection, and evaluation tests pass; strict TypeScript and production build pass. Controlled orange-ball exports retain 100% ball coverage; grayscale live-camera testing retains ball tracking through expanded view.
- **Current blocker:** The supplied recordings are prepared, but exact human event labels and browser-produced MediaPipe observations are not yet exported; predictions cannot be used as ground truth.
- **Next task:** Add real exported observations to the validation manifest and run `npm run validate:moves`.

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run benchmark
npm run validate:moves
npm run build
```

Authenticated users can open `/ai-tracker`, select a supported short video, and analyze it locally. MediaPipe model files are downloaded from Google/CDN on first use; video pixels are not uploaded by this feature.
