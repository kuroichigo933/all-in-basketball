# Ball Detector Dataset Export

`validation:ball-dataset` converts independently reviewed ball-label sidecars into a local YOLO detection package. It is preparation for a basketball-specific browser model; it does not train a model or create new accuracy evidence.

```bash
npm run validation:ball-dataset -- --manifest validation/manifest.json --split calibration
```

The default output is ignored by Git at `validation/local/ball-dataset/calibration-representative-v1/`:

```text
images/          training-eligible JPEG frames
labels/          matching YOLO text labels; true absent-ball frames have empty files
excluded/images/ visually auditable frames excluded from the default training set
excluded/labels/ matching labels for excluded frames
dataset.json     provenance, source IDs, boxes, eligibility, counts, and limitations
```

The command has deliberate safeguards:

- Only `calibration` is accepted. Holdout labels cannot be exported through this command.
- Output must be a child of ignored `validation/local/`.
- Sidecar schema, clip ID, normalized boxes, unique timestamps, and scheduled-label completeness are validated before extraction.
- Full occlusions are excluded because they are not valid positive boxes or true no-ball negatives.
- Visible boxes with a normalized width or height below `0.015` are retained under `excluded/` for audit but omitted from the default training directories.
- Files retain clip and source provenance so future partitions can be source-disjoint instead of randomly splitting adjacent frames.

The current controlled package contains 56 visible labels. Fifty-four are training-eligible, two tiny partial positives are excluded, four occlusions are excluded, and no true absent-ball negatives exist. These examples come from only two recordings of one player, one orange ball, one gym, and one camera setup. They are insufficient for training or validating a general detector.

Before model training, add independently labeled recordings covering black and orange balls, no-ball scenes, confusing body/shadow negatives, multiple players, lighting conditions, backgrounds, distances, blur, and camera devices. Create source-disjoint training and validation partitions only after those sources exist. Independent release holdout footage must remain outside model selection and training.
