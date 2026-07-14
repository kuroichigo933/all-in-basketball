# Benchmark Results

## Real move-validation cohort

Two supplied HEVC recordings were converted locally into nine browser-compatible, 20-second-or-shorter 720p30 H.264 segments: four behind-the-back and five between-the-legs. Every complete visible repetition was labeled independently of detector predictions, yielding 126 move intervals. Partial events crossing segment boundaries were excluded.

Segments alternate chronologically between `calibration` and `holdout`. All observation exports passed the 100 ms cadence checks: no skipped sample slots, 100% declared sample coverage, maximum sample gap 100 ms, and maximum decoded-frame offset no greater than 33.333 ms. Calibration observations were regenerated for identity-safe reacquisition; the consumed holdout was not rerun.

The latest calibration-only grid search selected a controlled two-class configuration with:

| Metric | Calibration result |
|---|---:|
| Real segments in complete cohort | 9 |
| Independent move labels | 126 |
| Calibration labels | 55 |
| Holdout labels | 71, evaluated once |
| Current calibration precision / recall / F1 | 0.658537 / 0.490909 / 0.562500 |
| Current between-the-legs precision / recall / F1 | 0.760000 / 0.542857 / 0.633333 |
| Current behind-the-back precision / recall / F1 | 0.500000 / 0.400000 / 0.444444 |
| Consumed holdout precision / recall / F1 (prior configuration) | 0.705882 / 0.507042 / 0.590164 |
| Consumed holdout between-the-legs F1 | 0.675676 |
| Consumed holdout behind-the-back F1 | 0.458333 |
| Controlled 95% gate | Failed |
| Five-class release gate | Blocked: three classes lack labeled holdout coverage |

The earlier configuration was selected from calibration only and the holdout was then evaluated exactly once. The current pipeline was subsequently measured and tuned on regenerated calibration observations only; the holdout was not rerun. Future release evidence needs a new independent validation round.

Run the reproducible workflow with:

```bash
npm run validation:prepare -- --input <path> --id <source-id> --move <move-name>
npm run validation:tune -- --manifest validation/manifest.json
npm run validate:moves -- --manifest validation/manifest.json --split calibration
# The current holdout has already been evaluated once; do not tune against it.
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

The last complete automated run passed 78/78 tests, strict TypeScript, the synthetic move benchmark, the production build, and the expanded live-camera smoke test. Synthetic detector runtime and unit fixtures are useful regressions but are not real-video accuracy evidence.

Last documented calibration run: 2026-07-13. Results apply only to the controlled frontal-view recordings described above.
