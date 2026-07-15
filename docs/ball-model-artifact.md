# Basketball model artifact contract

This contract is the admission check for a future custom browser basketball detector. It does not add a model, manufacture a model card, enable a detector, or make an accuracy claim. A real artifact and truthful evidence must be supplied separately.

## Manifest

Run the verifier against a JSON manifest stored inside the repository:

```powershell
npm run ball-model:verify -- --manifest models/<artifact-id>/artifact.json
```

The manifest uses `schemaVersion: 1` and contains:

- `id`: an immutable lowercase identifier ending in `-vN`, such as `front-camera-basketball-v1`.
- `status`: `candidate` or `validated`.
- `model`: `format: "tflite"`, a safe repo-relative `.tflite` path, the exact lowercase SHA-256, byte count, and non-empty detector labels.
- `runtime`: `package: "@mediapipe/tasks-vision"` and the exact tested version. Version ranges are rejected.
- `evidence`: distinct repo-relative paths for the license and model card. A `validated` artifact also requires an evaluation report and a browser-smoke report.

All paths use forward slashes, remain below the repository root after symlink resolution, and name existing files. Absolute paths, URLs, drive paths, backslashes, and `.`/`..` traversal are rejected. The verifier compares the declared runtime with the version actually installed under `node_modules`.

## Status and evidence meaning

`candidate` means only that the artifact is available for controlled evaluation. It is not approved for the live default.

`validated` requires both `evaluationReportPath` and `browserSmokeReportPath`. Those files must describe real work. The verifier checks that evidence files exist and are repository-contained; it cannot establish that their claims are true, representative, independently produced, or sufficient for release. Review remains mandatory.

The license file must identify terms that permit the intended distribution and use. Merely passing the existence check is not legal approval.

## What TFL3 proves - and does not prove

TensorFlow Lite FlatBuffers carry the `TFL3` identifier at bytes 4-7. The verifier checks that identifier after checking the exact byte count and SHA-256.

`TFL3` is only a container check. It does not prove that the graph is a compatible object detector, that its operators are supported by MediaPipe Tasks, that labels and output tensors are correct, that inference succeeds with WebAssembly/WebGL, or that the model detects a basketball accurately. A real browser smoke test with the declared installed MediaPipe version is still required and must be recorded before `validated` status.

## Deliberate separation from runtime selection

Passing this verifier never updates environment variables or changes `BrowserBallDetector`. Runtime activation is a separate reviewed change after license, evidence, browser compatibility, calibration, and independent validation have been assessed.

Calibration labels can be exported for detector development with `npm run validation:ball-dataset -- --manifest validation/manifest.json --split calibration`. See `docs/ball-detector-dataset.md`. This package must not include holdout data and does not itself satisfy the artifact evaluation requirements.
