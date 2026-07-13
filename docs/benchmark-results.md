# Benchmark Results

## Real move-validation cohort

Two supplied HEVC recordings were converted locally into nine browser-compatible, 20-second-or-shorter 720p30 H.264 segments: four behind-the-back and five between-the-legs. Every complete visible repetition was labeled independently of detector predictions, yielding 126 move intervals. Partial events crossing segment boundaries were excluded.

Segments alternate chronologically between `calibration` and `holdout`. All nine observation exports passed the 100 ms cadence checks: no skipped sample slots, 100% declared sample coverage, maximum sample gap 100 ms, and maximum decoded-frame offset no greater than 33.333 ms. Short final segments contain fewer samples by duration, not dropped inference slots.

The latest calibration-only grid search selected a controlled two-class configuration with:

| Metric | Calibration result |
|---|---:|
| Real segments in complete cohort | 9 |
| Independent move labels | 126 |
| Calibration labels | 55 |
| Holdout labels | 71, evaluated once |
| Calibration precision / recall / F1 | 0.666667 / 0.545455 / 0.600000 |
| Holdout precision / recall / F1 | 0.705882 / 0.507042 / 0.590164 |
| Holdout between-the-legs F1 | 0.675676 |
| Holdout behind-the-back F1 | 0.458333 |
| Controlled 95% gate | Failed |
| Five-class release gate | Blocked: three classes lack labeled holdout coverage |

The configuration was selected from calibration only and the holdout was then evaluated exactly once. No further thresholds were selected from holdout results. Future detector work needs a new independent validation round rather than repeated feedback from these 71 labels.

Run the reproducible workflow with:

```bash
npm run validation:prepare -- --input <path> --id <source-id> --move <move-name>
npm run validation:tune -- --manifest validation/manifest.json
npm run validate:moves -- --manifest validation/manifest.json --split calibration
# The current holdout has already been evaluated once; do not tune against it.
```

## Ball-identity slice

Coverage alone cannot show that the tracker selected the basketball rather than a hand, shorts, knee, foot, or moving shadow. The upload analyzer therefore supports independent tight ball boxes and explicit no-ball labels, and `validation:ball` measures localization in annotated ball radii.

On one fixed seven-frame visible-ball slice, the tracked-identity result changed as follows:

| Metric | Earlier tracker | Current tracker |
|---|---:|---:|
| Tracked identity F1 | 14.3% | 71.4% |
| Current median center error | Not measured | 0.23 ball radii |

This is a development slice, not a release benchmark. It is incomplete, contains only seven labeled visible frames, and has no absent-ball labels. It therefore does not measure false positives when no basketball is present, different balls/players/backgrounds, sustained occlusion, or general-environment performance. The generic `sports ball` model detected the basketball only sparsely in the supplied recordings; most tracking evidence still comes from heuristic color/motion candidates.

Run ball identity evaluation with:

```bash
npm run validation:ball -- --manifest validation/manifest.json --split calibration
```

## Live browser diagnostics

Controlled generated camera feeds ran at approximately 10 analyzed frames per second, with maximum inference gaps around one target interval. Orange-ball runs produced 100% measured/tracked coverage; grayscale runs produced approximately 98-99% measured/tracked coverage after pose/body priors were added. Expanded front-camera view continued advancing and tracking.

These are pipeline and coverage diagnostics only. A track existing in a frame does not prove that it belongs to the basketball. Identity accuracy requires independent ball boxes such as those evaluated above.

## Verification status

The latest full automated suite passed 61/61 tests covering tracking, candidate extraction, ball identity, pose crop mapping, sampling, live event delivery, move detection, validation isolation, and gates. Strict TypeScript and the production build pass. Synthetic detector runtime and unit fixtures are useful regressions but are not real-video accuracy evidence.

Last documented calibration run: 2026-07-12. Results apply only to the controlled frontal-view recordings described above.
