# Live Basketball Move Tracking MVP

## Product boundary

The primary MVP is a front-facing live-camera experience. A user opens `/ai-tracker`, grants camera access, positions one full-body player and one basketball in view, and receives near-real-time move cues. Uploaded video is retained only for annotation, debugging, reproducible tuning, and benchmark evaluation; it is not the product's primary interaction.

The preview stays at the camera's native frame rate while browser inference targets approximately 10 FPS. Move detection uses a rolling four-second observation history, so feedback may appear shortly after a move finishes.

## Current state

- Front camera is requested by default with `facingMode: "user"`; the preview, debug overlay, tracking confidence, move confidence, event time, and repetition count remain available in expanded view.
- Ball acquisition combines a pose-centred object-model crop, top-K orange and color-independent motion components, pose/body distractor priors, temporal candidate fusion, and short-gap prediction. The generic `sports ball` model contributes when it detects the ball, but detections on the supplied footage are sparse.
- Pre-association candidate snapshots retain source, confidence, and apparent scale for deterministic replay. Tiny hand/clothing components are demoted; immediate learned-detector overrides are bounded by track distance, apparent-size continuity participates in normal association, and distant identity challenges require two coherent frames.
- Automatic acquisition and post-loss reacquisition require two coherent frames; explicit tap-to-lock remains immediate. A configurable MediaPipe-compatible basketball TFLite model can replace the generic detector, with automatic fallback and detector provenance.
- Ball provenance distinguishes generic-model, color, motion, and predicted/interpolated points. Coverage therefore does not get presented as identity accuracy.
- New ball measurements are accepted only while a reliable player pose is present. Existing tracks can still predict through the normal short pose-loss window, preventing full-frame background motion from starting a session.
- Live and upload paths share the observation schema, continuity tracker, and move detector. Upload sampling is paced at 100 ms, reports cadence diagnostics, and is rejected by evaluation when gaps or decoded-frame offsets are unsafe.
- Upload annotation keeps human move labels separate from detector output. Ball labels now support tracked sidecars, import/export, 100 ms timestamp snapping, and predeclared schedule navigation, so observation regeneration cannot erase ground truth.
- The validation set contains nine real controlled segments and 126 independently labeled repetitions of behind-the-back and between-the-legs moves. Chronological segments alternate between calibration and holdout.
- A separate ignored mixed calibration source uses the first 84 seconds of one front-camera video: five source-reviewed segments and 73 manual labels across crossover, between-the-legs, and behind-the-back. Because it influenced tracker, anatomy, and threshold choices, it is not holdout evidence.
- Human labels are audited independently of move predictions. The annotation panel imports validated CSV/JSON/manifest labels, reports label count, observed body-center transitions, tracking coverage, and seek-only group/transition anchors, then exports a reviewed sidecar; it never rewrites a label.

## Measured status

- Latest mixed-video implementation run: 186/186 tests, strict type-check, synthetic benchmark, and production build passing. Named browser exports preserve repeatability evidence; all reported runs passed runtime schema, clip-identity, ordering, coordinate, and cadence validation. Reviewed move-label revisions retain manual protocol/FPS/duration provenance and cannot replace holdout labels.
- Current calibration after two-frame identity-safe reacquisition: controlled precision 0.658537, recall 0.490909, and F1 0.562500. Ball identity remains the dominant source of move errors.
- The original two-class holdout is now consumed regression data. The promoted hybrid defaults measured controlled precision 0.705882, recall 0.507042, and F1 0.590164 on it; future release evidence requires a new source-independent holdout.
- The five-class release gate remains blocked because crossover, hesitation, and in-and-out do not yet have independent labeled holdout coverage.
- Independent 10 FPS decoded-frame review now covers all five mixed-video segments. It corrected the inherited rapid blocks and added source-visible repetitions omitted by the coarse CSV, producing 73 labels. With the identity-safe tracker, worst-run-first tuning, and promoted temporal stance/depth anatomy, paired live-three calibration is precision 0.914286-0.915493, recall 0.876712-0.890411, and F1 0.895105-0.902778. Between-the-legs recall and behind-the-back ambiguity remain the main errors. These are calibration diagnostics, not holdout evidence.
- The predeclared source-aware calibration protocol contains 79 visible boxes, one absent label, and five occlusions. A versioned 14-feature pose-relative candidate ranker trained from these human boxes localizes 76/79 visible labels on both A/B exports. Precision/recall/F1 ranges are 0.962025-0.974359 / 0.962025 / 0.962025-0.968153. This clears the requested 95% ball calibration target, but the ranker is calibration-only and is not independent validation evidence.
- Expanded live-camera smoke tests continued inference on their controlled generated feed, but analyzed throughput varied from 4.6-8.2 FPS across isolated development runs. The latest dynamics run reported 99% measured and tracked coverage; an earlier appearance run reported 98% measured and 99% tracked coverage. Coverage measures whether a track exists, not whether it follows the correct object, and the 10 FPS performance target remains failed.
- Learned ball inference is bounded to one object-model pass per analyzed frame. A primary miss schedules the tighter dribble-zone crop for the next sample; frames without a reliable player crop skip the object pass because they cannot acquire a track. The UI reports average/slowest latency and pass counts at an independent 4 FPS update cadence. A new phone run is still required to replace the historical 4.6-8.2 FPS measurement. Across the combined 79-visible-label calibration slice, candidates reach 0.974684 oracle recall. Rapid-transfer tracking misses, behind-the-back generalization, and a new independent holdout remain blockers to a 95% move claim.

The 95% result applies only to ball localization on the calibration videos used to train the ranker. No holdout or global 95% claim is supported. The next source-independent video is required to measure generalization, including black-ball behavior.

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
npm run validation:audit-labels -- --manifest <calibration-manifest> --observations-dirs <run-a>,<run-b> --ball-config <tracker-config> --transition-label-tolerance-ms 250
npm run validation:apply-reviewed-labels -- --manifest <calibration-manifest> --labels <sidecar-a>,<sidecar-b> --output validation/local/manifests/<reviewed>.json
npm run validate:moves -- --manifest validation/manifest.json --split calibration
npm run validate:moves -- --manifest <manifest> --split calibration --diagnostics
npm run validation:ball -- --manifest validation/manifest.json --split calibration
npm run validation:ball-dataset -- --manifest validation/manifest.json --split calibration
npm run validation:ball-dataset -- --manifest validation/manifest.json --additional-manifests <other-calibration-manifest> --output validation/local/ball-dataset/<name>
npm run build
```

Source recordings, prepared segments, observations, labels, and tuning outputs remain local under ignored `validation/local/` or other ignored validation paths. MediaPipe model assets are downloaded on first use; camera/video pixels are processed in the browser by the current implementation.
