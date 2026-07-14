# Live Basketball Move Tracking MVP

## Product boundary

The primary MVP is a front-facing live-camera experience. A user opens `/ai-tracker`, grants camera access, positions one full-body player and one basketball in view, and receives near-real-time move cues. Uploaded video is retained only for annotation, debugging, reproducible tuning, and benchmark evaluation; it is not the product's primary interaction.

The preview stays at the camera's native frame rate while browser inference targets approximately 10 FPS. Move detection uses a rolling four-second observation history, so feedback may appear shortly after a move finishes.

## Current state

- Front camera is requested by default with `facingMode: "user"`; the preview, debug overlay, tracking confidence, move confidence, event time, and repetition count remain available in expanded view.
- Ball acquisition combines a pose-centred object-model crop, top-K orange and color-independent motion components, pose/body distractor priors, temporal candidate fusion, and short-gap prediction. The generic `sports ball` model contributes when it detects the ball, but detections on the supplied footage are sparse.
- Automatic acquisition and post-loss reacquisition require two coherent frames; explicit tap-to-lock remains immediate. A configurable MediaPipe-compatible basketball TFLite model can replace the generic detector, with automatic fallback and detector provenance.
- Ball provenance distinguishes generic-model, color, motion, and predicted/interpolated points. Coverage therefore does not get presented as identity accuracy.
- Live and upload paths share the observation schema, continuity tracker, and move detector. Upload sampling is paced at 100 ms, reports cadence diagnostics, and is rejected by evaluation when gaps or decoded-frame offsets are unsafe.
- Upload annotation keeps human move labels separate from detector output. Ball labels now support tracked sidecars, import/export, 100 ms timestamp snapping, and predeclared schedule navigation, so observation regeneration cannot erase ground truth.
- The validation set contains nine real controlled segments and 126 independently labeled repetitions of behind-the-back and between-the-legs moves. Chronological segments alternate between calibration and holdout.

## Measured status

- Last complete automated run: 78/78 tests, strict type-check, synthetic benchmark, production build, and expanded live-camera smoke test passing.
- Current calibration after two-frame identity-safe reacquisition: controlled precision 0.658537, recall 0.490909, and F1 0.562500. Ball identity remains the dominant source of move errors.
- The prior configuration's once-only holdout result remains precision 0.705882, recall 0.507042, and F1 0.590164. It was not rerun or used for the current change and must not become tuning data.
- The five-class release gate remains blocked because crossover, hesitation, and in-and-out do not yet have independent labeled holdout coverage.
- The predeclared representative calibration protocol has 60/60 independently adjudicated frames: 56 visible boxes and four full occlusions. The current default pipeline localizes 24/56 visible labels, for tracked and raw precision/recall/F1 of 0.428571. All four occlusion labels matched measured distractors rather than predictions. It still has no truly absent-ball negatives.
- The expanded live-camera smoke test continued inference at approximately 9.1-9.3 FPS with 99% measured/tracked coverage on its controlled generated feed. Coverage measures whether a track exists, not whether it follows the correct object.

No 95% or global accuracy claim is currently supported. The main technical blocker is reliable ball identity under blur, occlusion, and player/body motion; the generic object model is not a basketball-specific detector.

## Commands

```bash
npm run dev
npm run typecheck
npm test
npm run benchmark
npm run validation:prepare -- --input <path> --id <source-id> --move <move-name>
npm run validation:tune -- --manifest validation/manifest.json
npm run validate:moves -- --manifest validation/manifest.json --split calibration
npm run validation:ball -- --manifest validation/manifest.json --split calibration
npm run build
```

Source recordings, prepared segments, observations, labels, and tuning outputs remain local under ignored `validation/local/` or other ignored validation paths. MediaPipe model assets are downloaded on first use; camera/video pixels are processed in the browser by the current implementation.
