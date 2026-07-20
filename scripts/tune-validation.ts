import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DEFAULT_MOVE_DETECTION_CONFIG, detectMoves, type MoveDetectionConfig } from "../lib/motion/detectMoves.ts";
import { combineEvaluations, evaluateDetections } from "../lib/motion/evaluate.ts";
import { evaluationCounts, isBetterRobustMoveScore, summarizeRobustMoveScore } from "../lib/motion/moveConfigSelection.ts";
import { trackBallContinuity } from "../lib/motion/trackBall.ts";
import { replayBallTracking } from "../lib/motion/replayBallTracking.ts";
import type { OnlineBallTrackerConfig } from "../lib/motion/onlineBallTracker.ts";
import { assertUsableSampling } from "../lib/motion/sampling.ts";
import { CONTROLLED_MOVE_NAMES, parseMoveSelection, selectSplit, validateAnalysisExport, validateManifest } from "../lib/motion/validation.ts";
import { resolveValidationObservationsDirectory, validationObservationPath } from "../lib/motion/validationObservations.ts";

function option(name: string, fallback: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; }
const manifestPath = resolve(option("--manifest", "validation/manifest.json"));
if (!existsSync(manifestPath)) { console.error(`Validation manifest not found: ${manifestPath}`); process.exitCode = 2; }
else {
  const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8"))); const clips = selectSplit(manifest, "calibration");
  if (!clips.length) throw new Error("Tuning requires calibration clips; holdout clips are never read.");
  const tuningMoves = parseMoveSelection(option("--moves", CONTROLLED_MOVE_NAMES.join(",")));
  const ballConfigOption = option("--ball-config", "");
  const ballConfig = ballConfigOption
    ? JSON.parse(readFileSync(resolve(ballConfigOption), "utf8")) as Partial<OnlineBallTrackerConfig>
    : null;
  const observationsOption = option("--observations-dir", "");
  const observationsOptions = option("--observations-dirs", observationsOption).split(",").map((value) => value.trim()).filter(Boolean);
  const observationsDirectories = observationsOptions.length
    ? observationsOptions.map((value) => resolveValidationObservationsDirectory(value))
    : [undefined];
  const candidates: MoveDetectionConfig[] = [];
  for (const minimumLateralDurationMs of [400, 500, 600])
    for (const lateralTravelHipWidths of [0.55, 0.7])
      for (const hipBandHalfHeight of [0.3, 0.45])
        for (const legRegionHipMargin of [0.15, 0.25])
          for (const behindMaximumKneeSpreadHipWidths of [2.55, 2.6, 2.65])
            for (const betweenLegsVeryStrongKneeSpreadHipWidths of [2.68, 2.72])
              for (const betweenLegsRecentExtremeKneeSpreadHipWidths of [2.75, 2.85, 3.5])
                for (const poseTransferOutsideCorridorBetweenLegsMinimumWristDepthHipWidths of [-5.25, -5])
                  for (const poseTransferBallProximityHipWidths of [0.8, 1, 1.2])
                    for (const poseTransferCooldownMs of [550, 900])
                      for (const poseTransferCrossoverMaximumWristDepthHipWidths of [-7, -6.75, -6.5])
                        for (const lateralCrossoverMaximumWristDepthHipWidths of [-7, -6.5])
                          candidates.push({ ...DEFAULT_MOVE_DETECTION_CONFIG, minimumLateralDurationMs, lateralTravelHipWidths,
                            hipBandHalfHeight, legRegionHipMargin, behindMaximumKneeSpreadHipWidths,
                            betweenLegsVeryStrongKneeSpreadHipWidths, betweenLegsRecentExtremeKneeSpreadHipWidths,
                            poseTransferOutsideCorridorBetweenLegsMinimumWristDepthHipWidths,
                            poseTransferBallProximityHipWidths, poseTransferCooldownMs,
                            poseTransferCrossoverMaximumWristDepthHipWidths, lateralCrossoverMaximumWristDepthHipWidths });
  const calibrationRuns = observationsDirectories.map((observationsDirectory) => clips.map((clip) => {
    const data = validateAnalysisExport(JSON.parse(readFileSync(validationObservationPath(dirname(manifestPath), clip, observationsDirectory), "utf8")), clip.id);
    assertUsableSampling(data.observations, data.sampleIntervalMs, data.sampling);
    return { clip, observations: trackBallContinuity(ballConfig ? replayBallTracking(data.observations, ballConfig) : data.observations) };
  }));
  let best: { config: MoveDetectionConfig; score: ReturnType<typeof summarizeRobustMoveScore> } | null = null;
  for (const config of candidates) {
    const perRun = calibrationRuns.map((calibration) => combineEvaluations(calibration.map(({ clip, observations }) => evaluateDetections(
        clip.expected.filter((label) => tuningMoves.includes(label.move)),
        detectMoves(observations, config).filter((detection) => tuningMoves.includes(detection.move)),
        manifest.toleranceMs,
      ))));
    const pooled = combineEvaluations(perRun.map(evaluationCounts));
    const score = summarizeRobustMoveScore(perRun, pooled);
    if (isBetterRobustMoveScore(score, best?.score ?? null)) best = { config, score };
  }
  if (!best) throw new Error("Move tuning produced no configuration candidates.");
  const output = resolve(option("--output", "validation/tuned-config.json")); writeFileSync(output, JSON.stringify(best.config, null, 2));
  console.log(JSON.stringify({ calibrationClips: clips.length, calibrationRuns: observationsDirectories.length,
    observationsDirectories: observationsDirectories.map((directory) => directory ?? null), ballConfig: ballConfigOption || null,
    tuningMoves, candidates: candidates.length, selection: "maximum-worst-run-f1", ...best.score, output }, null, 2));
}
