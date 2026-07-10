# Benchmark Results

## Current baseline

No labeled real test clips existed in the repository on 2026-07-09. Accuracy numbers are therefore intentionally omitted. `npm test` validates rule behavior on deterministic synthetic observations, and `npm run benchmark` reports pure detector runtime on a 300-observation synthetic smoke fixture. Neither is an accuracy benchmark.

## Required validation dataset

Create an untracked `validation/videos/` directory and a manifest with: clip filename, expected move, event start/end seconds, camera view, lighting, and notes. Minimum useful set: three clips for each supported move plus three negative/no-move clips. Include one imperfect ball-visibility example per move.

Analyze each clip in `/ai-tracker`, choose **Export observations**, save the JSON under `validation/observations/`, copy `validation/manifest.example.json` to `validation/manifest.json`, and add the labels. Then run:

```bash
npm run validate:moves
```

For long HEVC sources, prepare local browser-compatible segments first:

```bash
npm run validation:prepare -- --input "D:\path\clip.mov" --id source-01 --move behind-the-back
npm run validation:tune -- --manifest validation/manifest.json
npm run validate:moves -- --manifest validation/manifest.json --split holdout
```

Preparation produces untracked 20-second 720p30 H.264 segments without audio. Use the analyzer's independent-label controls to mark every complete repetition; exclude partial moves crossing a boundary. Alternate chronological segments between calibration and holdout. Tuning reads calibration entries only.

The controlled two-class gate requires both behind-the-back and between-the-legs labels plus at least 95% micro precision and recall on holdout. The five-class release gate remains blocked until independent holdout labels cover all five moves.

The command exits successfully only when both event-level precision and recall are at least 95%.

Record for every run: processed/total clips, pose coverage, ball coverage, move true positives, false positives, misses, end-to-end processing seconds, browser/device, and failure notes. Keep the manifest fixed while tuning.

| Metric | Result |
|---|---:|
| Real clips available | 0 |
| Real-video accuracy | Not measured |
| Real-video 95% gate | Blocked: labeled exports absent |
| Prepared controlled segments | 9 (4 behind-the-back, 5 between-the-legs) |
| Synthetic rule/tracker/evaluator cases | 12/12 passed |
| Synthetic detector smoke runtime | 3.03 ms / 300 observations |
| Repeatable commands | `npm test`, `npm run benchmark`, `npm run validate:moves` |

Last run: 2026-07-09 on Node 22.14.0. Runtime is machine-specific and excludes video decoding and MediaPipe inference.
