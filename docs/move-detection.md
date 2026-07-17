# Move Detection

## Shared detector contract

Live camera and uploaded-video benchmarks feed the same `MotionObservation[]` into `trackBallContinuity` and `detectMoves`. Coordinates are normalized to the source frame. Body-relative features use hip width where practical, while minimum screen-space travel prevents torso jitter or a shifting pose estimate from becoming a move.

Frames must meet pose and ball-confidence thresholds. Lateral moves require measured ball endpoints; a prediction-only crossing cannot create an event. Continuity fills only short, plausibly bounded gaps and keeps the original source provenance.

## Current rules

- **Crossover:** measured endpoints change sides across the player's hip centerline within the configured transition window, exceed body-relative and screen-space travel thresholds, remain near a wrist, and use wrist depth to reject shallow ambiguous transfers when MediaPipe depth is available. A second pose-supported path requires measured control to switch wrists across the centerline and persist; a wrist far in front of the hips supports crossover instead of a specific behind/through-leg label.
- **Between-the-legs:** a lateral transfer enters the knee corridor below the hips while a controlling wrist is sustained in that corridor, or the controlling wrist changes while a measured ball stays near the receiving wrist and stance evidence supports the between-the-legs path.
- **Behind-the-back:** a lateral transfer crosses in a hip-height band while avoiding the lower between-knee region, or a pose-supported wrist transfer has the narrower stance associated with a behind-the-back action.
- **Hesitation:** visible approach motion is followed by a sustained low-travel interval near a wrist. A stationary hold alone is not sufficient.
- **In-and-out:** the ball moves inward, reverses to its original side, and finishes near the same-side wrist.

The stance-aware transfer path is deliberately provisional. It uses normalized knee spread because the ball detector supplies only a 2D point; it does not observe the ball's true depth behind the torso. Conflicting between-the-legs and behind-the-back evidence near the same time causes abstention, and a more specific transfer suppresses a crossover fallback.

Confidence is a heuristic score assembled from observation quality and rule margins. It is not a calibrated probability. Evidence strings expose which conditions triggered a result.

## Live behavior

The live detector reads a rolling four-second history. `selectCompletedLiveMove` waits 400 ms for adjacent detector windows to settle, accepts events no more than one second old, identifies a physical repetition by interval timing, and prevents duplicate counts. Only crossover, between-the-legs, and behind-the-back are shown as live MVP move events.

Temporary ball loss does not immediately reset the session. The online tracker can predict for approximately 500 ms with decaying confidence, but predicted endpoints are not allowed to establish a completed lateral move.

## Tuning and evaluation

Thresholds are supplied through `MoveDetectionConfig`; the grid search does not modify detector logic. Chronologically alternating segments form calibration and holdout splits. `npm run validation:tune` reads calibration labels only and writes the selected configuration. Sampling validation runs before any clip is scored.

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

The first 84 seconds of the local mixed recording contain 30 crossover, 19 between-the-legs, and 22 behind-the-back labels. All five segments and both inference repeats are calibration data because tracker and threshold choices used this source. Adaptive focused detector fallback raised learned-candidate frame coverage to 0.854438-0.860355. The promoted live defaults produce move F1 0.519084-0.558140; a repeat-calibrated saved configuration reaches 0.551181-0.569106 with a 0.017925 spread. Ball F1 remains 0.695652-0.739130 with a failing 0.043478 spread. The rolling detector still cannot reliably count all rapid half-second sequences while ball identity varies between browser inference runs.

The evaluator reports `liveThreeTotal` separately from global five-class output. Predictions of hesitation or in-and-out no longer contaminate the live-three gate, while they remain visible in the global report. The live-three gate failed and cannot become release evidence until a new untouched labeled recording is evaluated once.
