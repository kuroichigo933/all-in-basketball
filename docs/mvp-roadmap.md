# Live MVP Roadmap

This roadmap is ordered by product risk and validation value. The front-facing live camera remains the primary experience; upload work exists to measure and improve the same core logic.

## Completed foundation

- Front-camera request, live preview, approximately 10 FPS local inference, expanded view, pose/ball/trajectory overlays, confidence display, event timestamps, and repetition counts.
- Shared rolling observation history and move detector for live and uploaded video.
- Multi-candidate ball acquisition: pose-centred object-model crop, top-K color and three-frame motion components, body/knee/foot distractor prior, velocity-aware tracking, provenance, and bounded temporary-loss prediction.
- Paced upload sampling with cadence diagnostics and evaluator rejection of unsafe exports.
- Independent move interval annotation plus independent ball-box/no-ball annotation.
- Local preparation of nine real clips, 126 independently labeled two-class repetitions, chronological calibration/holdout isolation, tuning, per-class reporting, and explicit controlled/five-class gates.
- Stance-aware provisional wrist-transfer evidence and live event settling/deduplication.
- Latest full regression suite: 61/61 tests passing.

## Priority 1 - establish ball identity, not just coverage

1. Expand ball labels across calibration clips, including regular no-ball frames, occlusions, black and orange balls, and hard body/shadow distractors.
2. Use `npm run validation:ball` to report raw-measurement and tracked precision, recall, F1, center error, negative rejection, and unmatched timestamps.
3. Evaluate a licensed basketball-specific detector or train/export one for browser inference. Compare it on the fixed labels before replacing the generic model.
4. Add identity-aware recovery after occlusion so a plausible nearby body component cannot silently become the new ball.

Acceptance: a sufficiently varied, independently labeled calibration cohort reaches the chosen ball-identity target, including absent-ball negatives. High coverage alone does not satisfy this milestone.

## Priority 2 - raise controlled move calibration

1. Regenerate observations after each materially improved ball detector while preserving labels and split assignments.
2. Diagnose behind-the-back and between-the-legs errors by ball identity, pose coverage, transition timing, and stance/depth evidence rather than widening thresholds indiscriminately.
3. Tune configuration on calibration only. Final consistent controlled metrics are precision 0.666667, recall 0.545455, and F1 0.600000.
4. Stop tuning when precision and recall both reach 0.95 or document the detector/data limitation.

Acceptance: calibration demonstrates at least 0.95 precision and recall with both controlled classes represented and no sampling failures.

## Priority 3 - create the next independent validation round

The first controlled holdout was evaluated once with the saved calibration-selected configuration. It failed with precision 0.705882, recall 0.507042, and F1 0.590164; behind-the-back recall was 0.366667. Do not tune against these results.

After material detector improvements and calibration success, collect a new independent holdout and evaluate it once. Acceptance remains controlled micro precision and recall of at least 0.95.

## Priority 4 - complete live three-move quality

- Collect and label real crossover footage in addition to between-the-legs and behind-the-back.
- Verify mobile front-camera behavior, sustained inference rate, thermal stability, expanded view, rotation/resizing, permission recovery, and temporary loss handling on representative phones.
- Calibrate confidence presentation so provisional cues are clearly distinct from verified repetitions.

Acceptance: all three live MVP moves have independent real calibration and holdout coverage on supported phones.

## Priority 5 - unblock the five-class release gate

Collect independent calibration and holdout clips for crossover, hesitation, and in-and-out, including negative and confusing near-move examples. Synthetic fixtures or generated videos may form a separately reported cohort but cannot replace real holdout data.

Acceptance: all five move classes have labeled holdout coverage and meet the release criteria. Until then, the five-class gate remains blocked and no global 95% claim may be made.
