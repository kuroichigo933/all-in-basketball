# Move Detection

## Shared detector contract

Live camera and uploaded-video benchmarks feed the same `MotionObservation[]` into `trackBallContinuity` and `detectMoves`. Coordinates are normalized to the source frame. Body-relative features use hip width where practical, while minimum screen-space travel prevents torso jitter or a shifting pose estimate from becoming a move.

Frames must meet pose and ball-confidence thresholds. Lateral moves require measured ball endpoints; a prediction-only crossing cannot create an event. Continuity fills only short, plausibly bounded gaps and keeps the original source provenance.

## Current rules

- **Crossover:** measured endpoints change sides across the player's hip centerline within the configured transition window, exceed body-relative and screen-space travel thresholds, remain near a wrist, and use wrist depth to reject shallow ambiguous transfers when MediaPipe depth is available. A second pose-supported path requires measured control to switch wrists across the centerline and persist; a wrist far in front of the hips supports crossover instead of a specific behind/through-leg label.
- **Between-the-legs:** a lateral transfer passes between the projected knees below the hips while normalized knee spread is wide; ambiguous stance requires sustained wrist control in the leg corridor. A pose-supported wrist handoff provides a fallback when measured trajectory endpoints are incomplete.
- **Behind-the-back:** a lateral transfer crosses in the hip/leg projection with wrist depth behind the crossover boundary and a narrower stance. The trajectory path also accepts crossings just below the projected knee line, which occurs when a frontal 2D pose projection places a behind-the-back bounce lower than the hips.
- **Hesitation:** visible approach motion is followed by a sustained low-travel interval near a wrist. A stationary hold alone is not sufficient.
- **In-and-out:** the ball moves inward, reverses to its original side, and finishes near the same-side wrist.

The stance-aware transfer path is deliberately provisional. It uses normalized knee spread because the ball detector supplies only a 2D point; it does not observe the ball's true depth behind the torso. Conflicting between-the-legs and behind-the-back evidence near the same time causes abstention, and a more specific transfer suppresses a crossover fallback.

Confidence is a heuristic score assembled from observation quality and rule margins. It is not a calibrated probability. Evidence strings expose which conditions triggered a result.

## Live behavior

The live detector reads a rolling four-second history. `selectCompletedLiveMove` waits 400 ms for adjacent detector windows to settle, accepts events no more than one second old, identifies a physical repetition by interval timing, and prevents duplicate counts. Only crossover, between-the-legs, and behind-the-back are shown as live MVP move events.

Temporary ball loss does not immediately reset the session. The online tracker can predict for approximately 500 ms with decaying confidence, but predicted endpoints are not allowed to establish a completed lateral move.

The camera preview uses the browser's native frame rate, analyzed observations target 100 ms spacing, and React tracking metrics update every 250 ms. Learned ball detection performs at most one cropped object-model pass per observation: after a primary crop miss, the next observation uses a tighter dribble-zone crop. Pixel candidates and the rolling tracker still run on every analyzed observation, so the scheduled retry does not reset temporal state.

## Tuning and evaluation

Thresholds are supplied through `MoveDetectionConfig`; the grid search does not modify detector logic. Chronologically alternating segments form calibration and holdout splits. `npm run validation:tune` reads calibration labels only and writes the selected configuration. Sampling validation runs before any clip is scored.

Move evaluation uses ordered maximum-cardinality same-class matching and then minimizes event-center timing error. This prevents a broad detection in a rapid sequence from greedily consuming the only valid neighbor match. `validate:moves -- --diagnostics` includes unmatched event timestamps and evidence for label review; diagnostics never modify labels.

The latest controlled calibration result on the real two-class cohort is:

| Metric | Result |
|---|---:|
| Current calibration precision | 0.658537 |
| Current calibration recall | 0.490909 |
| Current calibration F1 | 0.562500 |
| Consumed holdout controlled precision | 0.705882 |
| Consumed holdout controlled recall | 0.507042 |
| Consumed holdout controlled F1 | 0.590164 |

The controlled gate requires both behind-the-back and between-the-legs to be represented and requires micro precision and recall of at least 0.95 on holdout data. The original holdout has now been consumed by regression checks and failed; it is no longer valid untouched release evidence. The five-class release gate remains blocked until new independent holdout labels exist for all five moves.

Synthetic tests verify rule mechanics but do not count as accuracy evidence. No 95% claim is warranted by the current results.

### Mixed three-move calibration cohort

The original first-84-second mixed manifest contained 30 crossover, 19 between-the-legs, and 22 behind-the-back labels. Independent 10 FPS source review of all five segments replaced stale rapid blocks and added omitted complete repetitions; the ignored reviewed manifest now contains 73 labels. All clips remain calibration data because tracker, ranker, anatomy, threshold, and label-review choices used this source. With the identity-safe tracker and promoted defaults, paired live-three precision is 0.914286-0.915493, recall is 0.876712-0.890411, and F1 is 0.895105-0.902778. Per-class F1 ranges are 0.962963-0.981132 crossover, 0.869565 between-the-legs, and 0.818182-0.863636 behind-the-back. This is not independent accuracy evidence.

Runtime counting remains tied to complete observed transfers rather than fixed timer intervals. The full-clip motion audit still exposes tracker limitations: three reviewed rapid BTL labels lack tracked-transition support, clip 000 has low usable motion coverage, and one final segment-boundary transition remains isolated rather than labeled as a complete event.

Run `npm run validation:audit-labels -- --manifest <calibration-manifest> --observations-dirs <run-a>,<run-b> --ball-config <tracker-config> --transition-label-tolerance-ms 250` before tuning. The calibration-only audit has two independent checks: dense label groups are compared with confidence-qualified tracked-ball body-center transition counts, and the complete clip is checked with one-to-one transition-to-label matching. A broad label cannot hide several transitions. Low tracking coverage, unmatched labels, and uncovered transition timestamps are reported separately. These are review pointers, not ground truth: the upload annotation panel only seeks to the source frames and never creates, accepts, edits, or deletes a label automatically. Existing labels can be imported from CSV, analysis/sidecar JSON, or a validation manifest selected by clip ID, then exported as a move-label sidecar after manual source-frame review.

For rapid repetitions, set the decoded source FPS (the prepared validation segments are 30 FPS) and use the `-1 frame` / `+1 frame` controls. New marks snap to source-frame boundaries, the current timestamp and frame number remain visible, and each label has a direct review seek. Export is blocked if manual edits overlap, fall outside the clip, use an unsupported move, or reverse an interval. The exported sidecar records the review FPS but still identifies its labels as manual and prediction-independent.

Reviewed sidecars also record the loaded video duration. Apply one or more completed sidecars to a copy of a calibration manifest with `npm run validation:apply-reviewed-labels -- --manifest <source-manifest> --labels <clip-a-sidecar>,<clip-b-sidecar> --output validation/local/manifests/<reviewed-manifest>.json`. The command refuses holdout replacement, duplicate clip reviews, missing provenance, output outside `validation/local`, and overwriting the source manifest. Unreviewed clips are copied unchanged and reviewed clips carry their protocol, FPS, duration, and label count into the revised manifest.

Validation manifests reject duplicate clip IDs, duplicate source/segment pairs, invalid tolerances, unsupported moves, and overlapping or unsorted expected intervals. Before tuning or evaluation, analysis exports are also runtime-validated for schema, clip identity, sample ordering, confidence bounds, and normalized ball coordinates. Type assertions alone are not treated as evidence integrity.

The evaluator reports `liveThreeTotal` separately from global five-class output. Predictions of hesitation or in-and-out no longer contaminate the live-three gate, while they remain visible in the global report. The live-three gate failed and cannot become release evidence until a new untouched labeled recording is evaluated once.
