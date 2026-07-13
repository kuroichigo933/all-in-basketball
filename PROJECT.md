# Live Basketball Move Tracking MVP

## Product boundary

The primary MVP is a front-facing live-camera experience. A user opens `/ai-tracker`, grants camera access, positions one full-body player and one basketball in view, and receives near-real-time move cues. Uploaded video is retained only for annotation, debugging, reproducible tuning, and benchmark evaluation; it is not the product's primary interaction.

The preview stays at the camera's native frame rate while browser inference targets approximately 10 FPS. Move detection uses a rolling four-second observation history, so feedback may appear shortly after a move finishes.

## Current state

- Front camera is requested by default with `facingMode: "user"`; the preview, debug overlay, tracking confidence, move confidence, event time, and repetition count remain available in expanded view.
- Ball acquisition combines a pose-centred object-model crop, top-K orange and color-independent motion components, pose/body distractor priors, temporal candidate fusion, and short-gap prediction. The generic `sports ball` model contributes when it detects the ball, but detections on the supplied footage are sparse.
- Ball provenance distinguishes generic-model, color, motion, and predicted/interpolated points. Coverage therefore does not get presented as identity accuracy.
- Live and upload paths share the observation schema, continuity tracker, and move detector. Upload sampling is paced at 100 ms, reports cadence diagnostics, and is rejected by evaluation when gaps or decoded-frame offsets are unsafe.
- Upload annotation keeps human move labels separate from detector output. A separate ball-label UI supports tight ball boxes and explicit no-ball frames, exported in the same JSON without accepting tracker output as truth.
- The validation set contains nine real controlled segments and 126 independently labeled repetitions of behind-the-back and between-the-legs moves. Chronological segments alternate between calibration and holdout.

## Measured status

- Latest full automated suite: 61/61 tests passing. Strict type-check and the production build pass.
- Final consistent calibration result: controlled precision 0.666667, recall 0.545455, and F1 0.600000.
- The saved calibration-selected configuration was evaluated on holdout once: controlled precision 0.705882, recall 0.507042, and F1 0.590164. The gate failed, and this holdout must not be used for further tuning.
- The five-class release gate remains blocked because crossover, hesitation, and in-and-out do not yet have independent labeled holdout coverage.
- On one fixed seven-frame, all-visible ball-identity slice, tracked F1 improved from 14.3% to 71.4%, with median center error 0.23 annotated ball radii. This slice is incomplete, contains no absent-ball frames, and is not a general accuracy result.
- Controlled browser camera feeds ran near 10 FPS and showed complete orange-ball coverage and approximately 98-99% grayscale-ball coverage. Those numbers measure whether a track exists, not whether it follows the correct object.

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
