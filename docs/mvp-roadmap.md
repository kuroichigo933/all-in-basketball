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
- Multi-manifest calibration-only YOLO detector export with holdout isolation, duplicate-clip rejection, local-path confinement, provenance, occlusion exclusion, difficult-partial auditing, and an explicit collection-readiness report. The combined controlled-plus-mixed export has 77 eligible positives, two difficult positives, five occlusions, and one absent frame across three source IDs, two players, and two indoor setups. Readiness remains blocked by source-diverse negatives, black-ball coverage, and verified hard-negative footage.
- Upload annotation can generate a uniform 20-frame schedule from clip duration alone, before predictions are reviewed, to make new positive and absent-ball collection reproducible.
- Ball-label sidecars carry validated appearance, pseudonymous player, lighting, and hard-negative provenance; detector export rejects conflicts with optional manifest metadata.
- Pre-association candidate snapshots, candidate-oracle evaluation, deterministic tracker replay, and a 3,072-configuration calibration-only association search covering learned overrides and guarded motion/color challengers. Repeat-aware mixed calibration retains the 0.10-confidence, 0.045-0.09-size learned override and disables motion challengers.
- Named ignored browser exports and a fixed-configuration repeatability diagnostic. Two runs of the latest defaults produced ball F1 0.695652-0.739130 and move F1 0.519084-0.558140. Both spreads exceed the 0.03 limit; candidate-oracle recall was 0.956522 in both runs.
- Player-gated ball association rejects new measurements without reliable pose evidence while retaining bounded prediction through temporary pose loss. The mixed absent-ball label is now a true negative.
- Adaptive focused detector fallback retries a tighter dribble-zone crop only after a primary learned-detector miss. Learned-candidate frame coverage reached 0.854438-0.860355 across two runs. Wrist-depth and leg-corridor evidence raised move F1 substantially while ball identity remained 0.695652-0.739130.
- Named observation directories can be supplied directly to evaluation with `--observations-dir`; move and tracker tuning accept `--observations-dirs` for repeat-aware calibration without rewriting manifests or weakening local-path confinement.
- Latest mixed-video regression run: 125/125 tests, strict type-check, synthetic benchmark, and production build pass. Browser observation cadence and the ball-annotation metadata smoke test passed; the expanded live-camera smoke test was not rerun in this cycle.

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
