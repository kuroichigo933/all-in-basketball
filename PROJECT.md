# Basketball Video Analysis MVP

## Product boundary

The primary MVP uses the browser's front-facing camera for near-real-time tracking of one full-body player and one basketball. MediaPipe inference runs locally at approximately 10 FPS while the preview remains at the camera frame rate. Uploaded clips remain a secondary debugging and benchmark workflow.

## Progress

- **Current milestone:** Live front-camera move tracking with shared upload benchmarks.
- **Completed:** Front-camera preview; live pose/ball inference; four-second rolling history; temporary ball-gap tracking; live crossover, between-the-legs, and behind-the-back events; confidence, timestamps, repetition counts, trajectory overlays; shared upload benchmark path; validation tooling and all five offline rule paths.
- **Current task:** Label the nine prepared controlled segments, export observations, tune on calibration, and run the held-out 95% gate.
- **Latest verified result:** 12/12 tracking, detection, and evaluation tests pass; strict TypeScript and production build pass. Synthetic detector runtime was approximately 3 ms for 300 observations.
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
