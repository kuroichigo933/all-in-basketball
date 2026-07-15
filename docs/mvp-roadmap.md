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
- Two-frame automatic acquisition/reacquisition, custom MediaPipe detector seam with generic fallback, and learned-detector provenance.
- Versioned ball-label sidecars, 100 ms snapping, import/export, representative schedule navigation, and incomplete-protocol failure.
- A complete predeclared 60-frame calibration protocol with 56 visible boxes and four separately scored full occlusions.
- Two coherent frames for automatic cold acquisition/reacquisition, plus a versioned custom-model artifact verifier.
- Export-time rejection of incomplete cadence and decoded-frame drift above 50 ms, matching evaluator checks.
- Calibration-only YOLO detector-dataset export with holdout isolation, local-path confinement, provenance, occlusion exclusion, and difficult-partial auditing. Current export: 54 eligible positives, two difficult positives, four occlusions, and no negatives.
- Pre-association candidate snapshots, candidate-oracle evaluation, deterministic tracker replay, and a 48-configuration calibration-only association search. Player gating lifts the mixed slice from the original 0.382979 baseline ball F1 to 0.695652; candidate-oracle recall is 0.956522-1.000000 across gated runs.
- Named ignored browser exports and a fixed-configuration repeatability diagnostic. Two gated runs produced identical 0.695652 ball F1 and move F1 spread of 0.005510, passing the diagnostic 0.03 limit.
- Player-gated ball association rejects new measurements without reliable pose evidence while retaining bounded prediction through temporary pose loss. The mixed absent-ball label is now a true negative.
- Latest mixed-video regression run: 103/103 tests, strict type-check, synthetic benchmark, and production build pass. Browser observation cadence passed; the expanded live-camera smoke test was not rerun in this cycle.

## Priority 1 - establish ball identity, not just coverage

1. Add real, predeclared no-ball frames, black and orange balls, varied lighting/players, and hard body/shadow distractors. The first 60-frame orange-ball schedule is complete but has no absent-ball negatives.
2. Evaluate a licensed basketball-specific detector or train/export one for browser inference. Compare it on the fixed labels before replacing the generic model; the current default reaches only 0.428571 tracked/raw F1.
3. Reject stable body/shadow candidates using basketball-specific visual identity or learned appearance, without suppressing held balls or fast dribbles.
4. Improve measured occlusion entry and reacquisition: the current four occlusion samples all attach to measured distractors and show zero valid prediction persistence.
5. Expand repeatability measurement beyond two runs and one controlled recording before treating the current diagnostic pass as general stability evidence.

Acceptance: a sufficiently varied, independently labeled calibration cohort reaches the chosen ball-identity target, including absent-ball negatives. High coverage alone does not satisfy this milestone.

## Priority 2 - raise controlled move calibration

1. Regenerate observations after each materially improved ball detector while preserving labels and split assignments.
2. Diagnose behind-the-back and between-the-legs errors by ball identity, pose coverage, transition timing, and stance/depth evidence rather than widening thresholds indiscriminately.
3. Tune configuration on calibration only. Current controlled metrics are precision 0.658537, recall 0.490909, and F1 0.562500.
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
