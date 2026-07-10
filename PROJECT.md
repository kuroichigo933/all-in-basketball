# Basketball Video Analysis MVP

## Product boundary

The seven-day MVP analyzes prerecorded short clips containing one full-body player and one basketball with a mostly stationary camera. It runs MediaPipe pose and object detection in the browser, converts frames to normalized observations, and applies explainable temporal rules. It does not claim game-film robustness.

## Progress

- **Current milestone:** End-to-end controlled video analysis path.
- **Completed:** Repository assessment; production baseline; upload/select UI; pose and ball extraction; normalized observations; bounded ball-gap tracking; JSON export; all five requested rule paths; configurable thresholds; timestamps, confidence, evidence, coverage warnings, no-result state; event evaluator; GPU-to-CPU fallback; tests and benchmark; documentation and environment template.
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
