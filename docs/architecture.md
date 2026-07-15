# Architecture

## Product paths

The live front-camera path is the primary product. The upload path is a development and validation harness that calls the same observation, tracking, and move-detection core.

```text
front camera preview (native FPS)
            |
       inference throttle (~10 FPS)
            |
pose landmarks + pose-centred ball-model crop
            |
generic sports-ball detections + top-K color components + top-K motion components
            |
pose/body distractor prior + online candidate fusion + <=500 ms prediction
            |
provenance-rich observations + rolling four-second history
            |
shared move detector + settled/deduplicated live events
            |
overlay, confidence, timestamp, and repetition count
```

Upload analysis substitutes paced decoded frames for camera frames. It otherwise uses the same `MotionObservation`, continuity, and `detectMoves` contracts.

## Browser vision pipeline

`app/(app)/ai-tracker/AITracker.tsx` owns camera lifecycle, video decoding, model execution, overlays, annotation, and JSON export. Camera access prefers `facingMode: "user"`. Preview frame rate, inference frame rate, UI rendering, and the move-event window are intentionally separate.

At each analyzed frame:

1. MediaPipe Pose Landmarker extracts one player's landmarks.
2. A square, pose-centred crop retains the full player and low bounce while making a small ball larger for the generic EfficientDet `sports ball` model.
3. Full-frame pixels produce multiple compact orange candidates and multiple three-frame, color-independent motion candidates.
4. `applyPoseBallPrior` retains wrist-controlled and plausible low-bounce candidates while demoting shorts/body, knee/foot, below-foot, and unrelated-motion distractors. Generic-model candidates keep their model confidence.
5. `OnlineBallTracker` scores candidate quality and proximity to its velocity prediction, limits acceleration/speed, and predicts for at most about 500 ms during temporary loss. Automatic acquisition or reacquisition requires two spatially coherent frames; user tap-to-lock intentionally bypasses that delay.

Every observation records the selected point, its confidence, whether it was measured, the raw measurement point, and its source (`detected`, `color`, `motion`, `interpolated`, or `missing`). Learned detections also record a detector ID. Predicted points never become measured anchors.

`BrowserBallDetector` is the model boundary. `NEXT_PUBLIC_BASKETBALL_MODEL_URL` may select a MediaPipe-compatible one-class TFLite detector and `NEXT_PUBLIC_BASKETBALL_MODEL_LABELS` declares its labels. Initialization falls back to the generic EfficientDet sports-ball model on the same GPU/CPU delegate if the custom artifact fails, without changing the live or upload interfaces. A separate artifact verifier requires a versioned manifest, exact bytes and SHA-256, TFL3 container identifier, license/model-card evidence, exact MediaPipe runtime version, and evaluation/browser-smoke evidence before an artifact can be marked validated.

## Timing and event delivery

- Camera preview: device/native stream, normally around 30 FPS.
- Vision inference: throttled to a 100 ms target interval, approximately 10 FPS.
- UI/debug overlay: refreshed on analyzed frames.
- Temporal history: four seconds.
- Live event settling: 400 ms after the detected interval, with interval-based identity and a short emission guard to avoid duplicate counts.

Only crossover, between-the-legs, and behind-the-back are emitted as live MVP events. A stance-aware pose-transfer cue uses wrist ownership, the knee corridor, and normalized knee spread as provisional evidence for between-the-legs versus behind-the-back. It is still a heuristic, not a learned move classifier.

## Upload, annotation, and validation

Upload analysis advances with `requestVideoFrameCallback` at paced 100 ms slots. Exports contain sample coverage, skipped slots, gap statistics, and maximum decoded-frame offset. Tuning and evaluation reject incomplete or badly spaced exports.

Move-label annotation and ball-identity annotation are independent of detector output:

- Move labels store exact start/end intervals and can be edited or deleted while raw detections remain visible for comparison.
- Ball labels store a tight normalized box, a temporary full-occlusion state, or a true no-ball-in-scene state. Occlusions are reported separately as tracker prediction persistence and never counted as visible localization or absent-ball rejection. Versioned sidecars are separate from ignored detector observations; the UI imports/exports them, snaps times to 100 ms, and navigates predeclared schedules.
- `validation:ball-dataset` converts calibration sidecars into ignored YOLO frames and labels for basketball-detector development. It refuses holdout export, excludes occlusions, preserves true absent frames as empty negative labels, separates tiny partial positives for audit, and retains source provenance for future source-disjoint partitioning.
- Exports preserve labels and predictions as separate fields.

`lib/motion/` contains pure tracking, move detection, sampling validation, event evaluation, and ball-identity evaluation. `scripts/tune-validation.ts` reads calibration clips only. `scripts/evaluate-validation.ts` reports controlled and five-class gates by split. `scripts/evaluate-ball-validation.ts` reports tracked and, when provenance is complete, raw-measurement identity metrics.

## Deployment boundary

The current implementation performs inference locally in the browser using MediaPipe Tasks. The live UI and normalized observation contract are designed so a future basketball-specific browser model or sampled-frame server service can replace the object detector without changing the camera experience. Full uncompressed 30 FPS server streaming is not part of the current design.
