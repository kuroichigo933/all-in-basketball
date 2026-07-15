import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DEFAULT_MOVE_DETECTION_CONFIG, detectMoves, type MoveDetectionConfig } from "../lib/motion/detectMoves.ts";
import { combineEvaluations, evaluateDetections } from "../lib/motion/evaluate.ts";
import { trackBallContinuity } from "../lib/motion/trackBall.ts";
import { assertUsableSampling } from "../lib/motion/sampling.ts";
import { CONTROLLED_MOVE_NAMES, parseMoveSelection, selectSplit, validateManifest, type AnalysisExport } from "../lib/motion/validation.ts";

function option(name: string, fallback: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; }
const manifestPath = resolve(option("--manifest", "validation/manifest.json"));
if (!existsSync(manifestPath)) { console.error(`Validation manifest not found: ${manifestPath}`); process.exitCode = 2; }
else {
  const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8"))); const clips = selectSplit(manifest, "calibration");
  if (!clips.length) throw new Error("Tuning requires calibration clips; holdout clips are never read.");
  const tuningMoves = parseMoveSelection(option("--moves", CONTROLLED_MOVE_NAMES.join(",")));
  const candidates: MoveDetectionConfig[] = [];
  for (const lateralTravelHipWidths of [0.55, 0.7, 0.85])
    for (const hipBandHalfHeight of [0.3, 0.45, 0.6])
      for (const legRegionHipMargin of [0.15, 0.25, 0.35])
        for (const behindMaximumKneeSpreadHipWidths of [1.15, 1.25, 1.35])
          for (const poseTransferBallProximityHipWidths of [1.6, 2.2, 2.8])
            candidates.push({ ...DEFAULT_MOVE_DETECTION_CONFIG, lateralTravelHipWidths, hipBandHalfHeight, legRegionHipMargin, behindMaximumKneeSpreadHipWidths, poseTransferBallProximityHipWidths });
  const calibration = clips.map((clip) => {
    const data = JSON.parse(readFileSync(resolve(dirname(manifestPath), clip.observations), "utf8")) as AnalysisExport;
    assertUsableSampling(data.observations, data.sampleIntervalMs, data.sampling);
    return { clip, observations: trackBallContinuity(data.observations) };
  });
  let best = { config: candidates[0], f1: -1, precision: -1 };
  for (const config of candidates) {
    const scores = calibration.map(({ clip, observations }) => evaluateDetections(
      clip.expected.filter((label) => tuningMoves.includes(label.move)),
      detectMoves(observations, config).filter((detection) => tuningMoves.includes(detection.move)),
      manifest.toleranceMs,
    ));
    const total = combineEvaluations(scores); if (total.f1 > best.f1 || total.f1 === best.f1 && total.precision > best.precision) best = { config, f1: total.f1, precision: total.precision };
  }
  const output = resolve(option("--output", "validation/tuned-config.json")); writeFileSync(output, JSON.stringify(best.config, null, 2));
  console.log(JSON.stringify({ calibrationClips: clips.length, tuningMoves, candidates: candidates.length, f1: best.f1, precision: best.precision, output }, null, 2));
}
