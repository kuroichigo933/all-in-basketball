# Benchmark Results

## Real move-validation cohort

Two supplied HEVC recordings were converted locally into nine browser-compatible, 20-second-or-shorter 720p30 H.264 segments: four behind-the-back and five between-the-legs. Every complete visible repetition was labeled independently of detector predictions, yielding 126 move intervals. Partial events crossing segment boundaries were excluded.

Segments alternate chronologically between `calibration` and `holdout`. All observation exports passed the 100 ms cadence checks: no skipped sample slots, 100% declared sample coverage, maximum sample gap 100 ms, and maximum decoded-frame offset no greater than 33.333 ms. The original holdout has now been consumed by regression checks and cannot support a future release claim.

The latest calibration-only grid search selected a controlled two-class configuration with:

| Metric | Calibration result |
|---|---:|
| Real segments in complete cohort | 9 |
| Independent move labels | 126 |
| Calibration labels | 55 |
| Holdout labels | 71, consumed regression data |
| Current calibration precision / recall / F1 | 0.658537 / 0.490909 / 0.562500 |
| Current between-the-legs precision / recall / F1 | 0.760000 / 0.542857 / 0.633333 |
| Current behind-the-back precision / recall / F1 | 0.500000 / 0.400000 / 0.444444 |
| Consumed holdout controlled precision / recall / F1 (hybrid defaults) | 0.705882 / 0.507042 / 0.590164 |
| Consumed holdout between-the-legs F1 | 0.675676 |
| Consumed holdout behind-the-back F1 | 0.458333 |
| Controlled 95% gate | Failed |
| Five-class release gate | Blocked: three classes lack labeled holdout coverage |

The earlier configuration was selected from calibration only, but subsequent implementation work used the original holdout for regression checks. These labels are now explicitly treated as consumed. Future release evidence needs a new independent validation round.

Run the reproducible workflow with:

```bash
npm run validation:prepare -- --input <path> --id <source-id> --move <move-name>
npm run validation:tune -- --manifest validation/manifest.json
npm run validate:moves -- --manifest validation/manifest.json --split calibration
# The current holdout has already been evaluated once; do not tune against it.
```

## Mixed front-camera calibration video (first 84 seconds)

The first 84 seconds of the locally supplied `Video AI Movement Test.mov` were converted to five 8-bit H.264, 720p30, audio-free segments. The cleaned CSV contributes 71 non-overlapping repetitions: 30 crossover, 19 between-the-legs, and 22 behind-the-back. No labeled event crosses a segment boundary. The source, cleaned CSV, segments, manifest, observations, ball sidecars, and tuned configuration remain ignored under `validation/local/` or `validation/observations/`.

This entire source is a **calibration cohort**. Tracker changes and threshold selection used its labels, so none of its segments are valid untouched holdout evidence. A new recording is required for the live three-move release evaluation.

| Metric | Calibration result |
|---|---:|
| Segments / move labels | 5 / 71 |
| Pose / measured-ball / tracked-ball coverage | 0.916418 / 0.887659 / 0.911540 |
| Promoted live-default browser move F1 range | 0.519084-0.558140 |
| Promoted live-default move F1 spread | 0.039056 (fails 0.03 diagnostic) |
| Repeat-calibrated saved-config move F1 range | 0.551181-0.569106 |
| Repeat-calibrated saved-config spread | 0.017925 (passes) |
| Run-B saved-config precision / recall / F1 | 0.625000 / 0.492958 / 0.551181 |
| Live three-move 95% gate | Failed |
| Five-class release gate | Blocked |

The predeclared ball-identity slice contains 23 visible boxes, one absent-ball negative, and one full occlusion. Adjacent-frame inspection found one box centered above the visible ball; the ignored local sidecar was corrected from decoded pixels before the final evaluation. Two runs of the latest defaults measured tracked precision/recall/F1 of 0.695652-0.739130 and raw F1 of 0.711111-0.755556. The absent frame contains raw candidates but no reliable player, so it remained a true negative instead of a false track. Candidate-oracle recall was 22/23 (0.956522) in both runs. The occluded timestamp matched a measured candidate, not a prediction.

The final tracker records complete pre-association candidate snapshots, demotes tiny color/motion fragments, joins orange lobes split by a one-pixel seam, weights full-ball components, and permits an immediate override from a learned detection of plausible size. Replay preserves the player-acceptance decision, so tuning cannot reintroduce no-player distractors. The tracker tuner now searches 3,072 learned-override and guarded motion/color challenger configurations. Disabling distant color challenges improved representative visible-ball replay F1 from 0.500000 to 0.589286 but remained at 0/4 valid occlusion predictions and slightly reduced mixed move F1, so it was not promoted. The move tuner evaluates 6,075 depth/anatomy configurations across multiple calibration repeats. Threshold-only tuning remains far below 95%, so a representative basketball-specific detector and denser labels remain necessary.

### Fixed-configuration repeatability

Browser exports can now target named ignored directories with `--output-dir`. `validation:repeatability` evaluates at least two distinct directories against one fixed saved move configuration, reports minimum/maximum/mean/spread for ball F1, candidate-oracle recall, and move F1, and fails its diagnostic when ball or move F1 spread exceeds 0.03 by default. This is a reproducibility diagnostic, not a release gate.

Two independent adaptive-focus exports produced ball F1 0.695652-0.739130, a spread of 0.043478 that fails the 0.03 diagnostic. Candidate-oracle recall was 0.956522 in both runs. Promoted live-default move F1 ranged from 0.519084 to 0.558140 and also missed the stability limit. A repeat-calibrated saved configuration reached 0.551181-0.569106 with a passing 0.017925 spread, but its tighter pose thresholds were not promoted because they regressed the older cohort. Learned-candidate frame coverage was 0.854438-0.860355.

Reproduce the local workflow with:

```bash
npm run validation:prepare -- --input "validation/local/Video AI Movement Test.mov" --id mixed-moves-01 --move mixed --duration-seconds 84
npm run validation:import-mixed -- --csv validation/local/video-ai-movement-timestamps-clean.csv --source-id mixed-moves-01 --cohort controlled-front-camera-mixed-2026-07 --duration-seconds 84
npm run validation:tune -- --manifest validation/local/manifests/mixed-moves-01.json --moves crossover,between-the-legs,behind-the-back --output validation/local/mixed-moves-01-tuned-config.json
npm run validation:tune -- --manifest validation/local/manifests/mixed-moves-01.json --observations-dirs validation/local/repeatability/adaptive-focus-a,validation/local/repeatability/adaptive-focus-b --moves crossover,between-the-legs,behind-the-back --output validation/local/repeat-robust-move-config.json
npm run validation:tune-ball -- --manifest validation/local/manifests/mixed-moves-01.json --observations-dirs validation/local/repeatability/adaptive-focus-a,validation/local/repeatability/adaptive-focus-b --output validation/local/repeat-robust-tuned.json
npm run validate:moves -- --manifest validation/local/manifests/mixed-moves-01.json --split calibration --config validation/local/mixed-moves-01-tuned-config.json
npm run validate:moves -- --manifest validation/local/manifests/mixed-moves-01.json --split calibration --observations-dir validation/local/repeatability/adaptive-focus-b --config validation/local/repeat-robust-move-config.json
npm run validation:ball -- --manifest validation/local/manifests/mixed-moves-01.json --split calibration
python scripts/export-validation-observations.py --output-dir validation/local/repeatability/run-a --force mixed-moves-01-000
npm run validation:repeatability -- --manifest validation/local/manifests/mixed-moves-01.json --runs validation/local/repeatability/run-a,validation/local/repeatability/run-b --config validation/local/repeat-robust-move-config.json
```

## Ball-identity slice

Coverage alone cannot show that the tracker selected the basketball rather than a hand, shorts, knee, foot, or moving shadow. The upload analyzer therefore supports independent tight ball boxes and explicit no-ball labels, and `validation:ball` measures localization in annotated ball radii. Labels live in tracked sidecars under `validation/labels/ball/`, while ignored observations may be regenerated freely. The evaluator fails incomplete protocols unless `--allow-incomplete` is explicitly supplied for diagnostics.

The predeclared representative calibration protocol is fully labeled at 60/60 frames: 56 visible basketball boxes and four full occlusions. Occluded frames are scored separately for temporal prediction persistence and do not enter visible localization or absent-ball confusion counts. No frame in this controlled footage is a true absent-ball negative.

The current default pipeline produced:

| Metric | Representative calibration result |
|---|---:|
| Visible labels localized | 24 / 56 |
| Tracked precision / recall / F1 | 0.428571 / 0.428571 / 0.428571 |
| Raw precision / recall / F1 | 0.428571 / 0.428571 / 0.428571 |
| Occlusion track presence | 4 / 4 |
| Occlusion prediction persistence | 0 / 4 |
| Occlusion measured distractor locks | 4 / 4 |
| True absent-ball labels | 0 |

High observation coverage therefore concealed wrong-object tracking in 32 of the 56 visible adjudicated frames. The default generic model supplied only 12 selected learned detections across 873 exported observations; color and motion heuristics supplied most measurements.

The calibration labels can now be reproduced as a local YOLO detector package with `validation:ball-dataset`, including multiple calibration manifests without admitting holdout clips. The combined controlled-plus-mixed export contains 77 training-eligible positive frames, two tiny partial positives retained for audit, five excluded full occlusions, and one true absent-ball negative across three source IDs, two players, and two indoor setups. Its collection-readiness report still blocks on 20 total negatives from at least two sources, black-ball coverage, and verified hard-negative footage. It is a pipeline fixture, not a sufficient training or validation dataset, and readiness is deliberately separate from accuracy.

An EfficientDet-Lite2 diagnostic increased learned detections and reached tracked F1 0.428571 and raw F1 0.446429, but its maximum decoded-frame offset was 166.667 ms. The 50 ms cadence gate correctly rejects that export, so Lite2 was not adopted and its scores are not valid tuning evidence.

The older fixed seven-frame visible-ball diagnostic changed as follows and remains archived separately from the representative protocol:

| Metric | Earlier tracker | Current tracker |
|---|---:|---:|
| Tracked identity F1 | 14.3% | 71.4% |
| Current median center error | Not measured | 0.23 ball radii |

This older result is diagnostic history, not a release benchmark. The complete representative protocol improves coverage and now exercises four occlusions, but it still cannot measure false positives when no basketball is present, black balls, different players/backgrounds, or general-environment performance. The generic `sports ball` model detected the basketball only sparsely in the supplied recordings; most tracking evidence still comes from heuristic color/motion candidates.

Run ball identity evaluation with:

```bash
npm run validation:ball -- --manifest validation/manifest.json --split calibration
```

## Live browser diagnostics

The latest controlled generated-camera smoke test ran at approximately 9.1-9.3 analyzed frames per second, reported 99% measured/tracked coverage, and continued advancing and tracking in expanded front-camera view.

These are pipeline and coverage diagnostics only. A track existing in a frame does not prove that it belongs to the basketball. Identity accuracy requires independent ball boxes such as those evaluated above.

## Verification status

The latest mixed-video implementation run passed 125/125 tests, strict TypeScript, the synthetic benchmark, and the production build. All named browser observation exports used in the report passed the sampling-cadence gates, and the ball-annotation schedule/metadata browser smoke passed. The separate expanded live-camera smoke test was not rerun in this cycle. Synthetic detector runtime and unit fixtures are useful regressions but are not real-video accuracy evidence.

Latest documented mixed calibration run: 2026-07-15. Results apply only to the controlled frontal-view recordings described above.
