# Ball Detector Dataset Export

`validation:ball-dataset` converts independently reviewed ball-label sidecars into a local YOLO detection package. It is preparation for a basketball-specific browser model; it does not train a model or create new accuracy evidence.

```bash
npm run validation:ball-dataset -- --manifest validation/manifest.json --split calibration
npm run validation:ball-dataset -- --manifest validation/manifest.json --additional-manifests validation/local/manifests/mixed-moves-01.json --output validation/local/ball-dataset/calibration-combined-v1
```

The default output is ignored by Git at `validation/local/ball-dataset/calibration-representative-v1/`:

```text
images/          training-eligible JPEG frames
labels/          matching YOLO text labels; true absent-ball frames have empty files
excluded/images/ visually auditable frames excluded from the default training set
excluded/labels/ matching labels for excluded frames
dataset.json     provenance, source IDs, boxes, eligibility, counts, collection readiness, and limitations
```

The command has deliberate safeguards:

- Only `calibration` is accepted. Holdout labels cannot be exported through this command.
- Additional comma-separated calibration manifests may be supplied with `--additional-manifests`; duplicate clip IDs are rejected and every source manifest is retained in `dataset.json`.
- Output must be a child of ignored `validation/local/`.
- Sidecar schema, clip ID, normalized boxes, unique timestamps, and scheduled-label completeness are validated before extraction.
- Full occlusions are excluded because they are not valid positive boxes or true no-ball negatives.
- Visible boxes with a normalized width or height below `0.015` are retained under `excluded/` for audit but omitted from the default training directories.
- Files retain clip and source provenance so future partitions can be source-disjoint instead of randomly splitting adjacent frames.
- `collectionReadiness` is a data-sufficiency check, not an accuracy score. It requires at least two sources, 40 eligible positives, 20 predeclared absent frames drawn from at least two recorded sources, black and orange coverage, two pseudonymous players, two lighting conditions, and one explicitly declared hard-negative clip that actually contains absent labels.

Record capture conditions in Upload benchmark mode when adding new detector footage. The exported ball-label sidecar stores:

```json
"capture": {
  "ballAppearance": "black",
  "playerId": "player-b",
  "lighting": "indoor-low-light",
  "hardNegative": false
}
```

`playerId` should be a local pseudonym, not a person's name. Set `hardNegative` only when the clip deliberately includes no-ball or confusing body, clothing, floor, or shadow examples. Capture metadata may also be present on the manifest clip, but the exporter rejects any disagreement with its sidecar instead of choosing one silently. The exporter reports every missing criterion but still creates an auditable package; model promotion must remain blocked until readiness is `ready` and independent evaluation also passes.

The controlled package contains 56 visible labels: 54 training-eligible positives, two tiny partial positives, four excluded occlusions, and no true absent-ball negatives. Its verified provenance is one player, orange ball, indoor gym, and fixed lighting setup. Combining it with the ignored mixed calibration manifest produces 77 eligible positives, two difficult positives, one absent frame, and five excluded occlusions across three source IDs, two players, and two indoor lighting/camera setups. Readiness still blocks on 19 more absent frames from at least one additional source, black-ball coverage, and verified hard-negative footage. It remains insufficient for training or validating a general detector.

Before model training, add independently labeled recordings covering black and orange balls, no-ball scenes, confusing body/shadow negatives, multiple players, lighting conditions, backgrounds, distances, blur, and camera devices. Create source-disjoint training and validation partitions only after those sources exist. Independent release holdout footage must remain outside model selection and training.

For each new clip, open Upload benchmark mode and choose **Create 20-frame schedule** before analyzing the video or reviewing detector output. The timestamps are selected uniformly from clip duration alone and snapped to the 100 ms analysis cadence. Label every scheduled frame, export the sidecar, and keep it beside the other ball-label sidecars; for deliberately ball-free footage, mark each scheduled frame **No ball in scene**.
