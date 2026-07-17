# Live Basketball Move Tracking MVP

## Product boundary

The primary MVP is a front-facing live-camera experience. A user opens `/ai-tracker`, grants camera access, positions one full-body player and one basketball in view, and receives near-real-time move cues. Uploaded video is retained only for annotation, debugging, reproducible tuning, and benchmark evaluation; it is not the product's primary interaction.

The preview stays at the camera's native frame rate while browser inference targets approximately 10 FPS. Move detection uses a rolling four-second observation history, so feedback may appear shortly after a move finishes.

## Current state

- Front camera is requested by default with `facingMode: "user"`; the preview, debug overlay, tracking confidence, move confidence, event time, and repetition count remain available in expanded view.
- Ball acquisition combines a pose-centred object-model crop, top-K orange and color-independent motion components, pose/body distractor priors, temporal candidate fusion, and short-gap prediction. The generic `sports ball` model contributes when it detects the ball, but detections on the supplied footage are sparse.
- Pre-association candidate snapshots retain source, confidence, and apparent scale for deterministic replay. Tiny hand/clothing components are demoted; a calibration-selected, ball-sized learned detection can replace a stale heuristic identity immediately, while other distant identity challenges still require two coherent frames.
- Automatic acquisition and post-loss reacquisition require two coherent frames; explicit tap-to-lock remains immediate. A configurable MediaPipe-compatible basketball TFLite model can replace the generic detector, with automatic fallback and detector provenance.
- Ball provenance distinguishes generic-model, color, motion, and predicted/interpolated points. Coverage therefore does not get presented as identity accuracy.
- New ball measurements are accepted only while a reliable player pose is present. Existing tracks can still predict through the normal short pose-loss window, preventing full-frame background motion from starting a session.
- Live and upload paths share the observation schema, continuity tracker, and move detector. Upload sampling is paced at 100 ms, reports cadence diagnostics, and is rejected by evaluation when gaps or decoded-frame offsets are unsafe.
- Upload annotation keeps human move labels separate from detector output. Ball labels now support tracked sidecars, import/export, 100 ms timestamp snapping, and predeclared schedule navigation, so observation regeneration cannot erase ground truth.
- The validation set contains nine real controlled segments and 126 independently labeled repetitions of behind-the-back and between-the-legs moves. Chronological segments alternate between calibration and holdout.
- A separate ignored mixed calibration source uses the first 84 seconds of one front-camera video: five segments and 71 labels across crossover, between-the-legs, and behind-the-back. Because it influenced tracker and threshold choices, it is not holdout evidence.

## Measured status

- Latest mixed-video implementation run: 125/125 tests, strict type-check, synthetic benchmark, and production build passing. Named browser exports preserve repeatability evidence; all reported runs passed cadence validation, and the ball-annotation schedule/metadata browser smoke passed. The separate expanded live-camera smoke test was not rerun in this cycle.
- Current calibration after two-frame identity-safe reacquisition: controlled precision 0.658537, recall 0.490909, and F1 0.562500. Ball identity remains the dominant source of move errors.
- The original two-class holdout is now consumed regression data. The promoted hybrid defaults measured controlled precision 0.705882, recall 0.507042, and F1 0.590164 on it; future release evidence requires a new source-independent holdout.
- The five-class release gate remains blocked because crossover, hesitation, and in-and-out do not yet have independent labeled holdout coverage.
- The predeclared representative calibration protocol has 60/60 independently adjudicated frames: 56 visible boxes and four full occlusions. The current default pipeline localizes 24/56 visible labels, for tracked and raw precision/recall/F1 of 0.428571. All four occlusion labels matched measured distractors rather than predictions. It still has no truly absent-ball negatives.
- The expanded live-camera smoke test continued inference at approximately 9.1-9.3 FPS with 99% measured/tracked coverage on its controlled generated feed. Coverage measures whether a track exists, not whether it follows the correct object.
- Adaptive focused inference retries a tighter dribble-zone crop only when the primary learned detector returns nothing. Two browser runs produced tracked ball F1 0.695652-0.739130 and candidate-oracle recall 0.956522. Wrist/hip depth gates and leg-corridor control evidence raised the promoted live-default move F1 range to 0.519084-0.558140; its 0.039056 spread still fails the 0.03 diagnostic. A repeat-calibrated saved configuration reaches 0.551181-0.569106 with a passing 0.017925 spread, but is not promoted because its tighter pose thresholds regress the older cohort. The 95% gate fails.

No 95% or global accuracy claim is currently supported. The main technical blocker is reliable ball identity under blur, occlusion, and player/body motion; the generic object model is not a basketball-specific detector.

## Commands

```bash
npm run dev
npm run typecheck
npm test
npm run benchmark
npm run validation:prepare -- --input <path> --id <source-id> --move <move-name>
npm run validation:import-mixed -- --csv <path> --source-id <source-id> --duration-seconds <seconds>
npm run validation:tune -- --manifest validation/manifest.json
npm run validation:tune -- --manifest <manifest> --observations-dirs <run-a>,<run-b>
npm run validation:tune-ball -- --manifest <manifest> --observations-dirs <run-a>,<run-b>
npm run validation:repeatability -- --manifest validation/manifest.json --runs <run-a>,<run-b> --config <saved-config>
npm run validate:moves -- --manifest validation/manifest.json --split calibration
npm run validation:ball -- --manifest validation/manifest.json --split calibration
npm run validation:ball-dataset -- --manifest validation/manifest.json --split calibration
npm run validation:ball-dataset -- --manifest validation/manifest.json --additional-manifests <other-calibration-manifest> --output validation/local/ball-dataset/<name>
npm run build
```

Source recordings, prepared segments, observations, labels, and tuning outputs remain local under ignored `validation/local/` or other ignored validation paths. MediaPipe model assets are downloaded on first use; camera/video pixels are processed in the browser by the current implementation.
