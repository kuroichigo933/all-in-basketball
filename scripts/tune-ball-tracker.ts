import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { evaluateBallIdentity, type BallIdentityMetrics } from "../lib/motion/evaluateBall.ts";
import { DEFAULT_MOVE_DETECTION_CONFIG, detectMoves } from "../lib/motion/detectMoves.ts";
import { combineEvaluations, evaluateDetections } from "../lib/motion/evaluate.ts";
import { DEFAULT_ONLINE_BALL_TRACKER_CONFIG, type OnlineBallTrackerConfig } from "../lib/motion/onlineBallTracker.ts";
import { replayBallTracking } from "../lib/motion/replayBallTracking.ts";
import { trackBallContinuity } from "../lib/motion/trackBall.ts";
import { LIVE_MOVE_NAMES, selectSplit, validateManifest, type AnalysisExport } from "../lib/motion/validation.ts";
import { resolveValidationObservationsDirectory, validationObservationPath } from "../lib/motion/validationObservations.ts";

function option(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

export function buildBallTrackerConfigGrid(): OnlineBallTrackerConfig[] {
  const configs: OnlineBallTrackerConfig[] = [];
  for (const immediateDetectedMinimumConfidence of [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5]) {
    for (const immediateDetectedMinimumSize of [0.025, 0.035, 0.045, 0.055]) {
      for (const immediateDetectedMaximumSize of [0.09, 0.12]) configs.push({
        ...DEFAULT_ONLINE_BALL_TRACKER_CONFIG,
        immediateDetectedMinimumConfidence, immediateDetectedMinimumSize, immediateDetectedMaximumSize,
        challengerMotionMinimumConfidence: 2, challengerMotionMinimumSize: 0.025, challengerColorMinimumConfidence: 0,
      });
    }
  }
  return configs.flatMap((config) => [2, 0.15, 0.2, 0.25].flatMap((challengerMotionMinimumConfidence) =>
    [0.015, 0.025, 0.035].flatMap((challengerMotionMinimumSize) =>
      [0, 0.25, 0.4, 2].map((challengerColorMinimumConfidence) =>
        ({ ...config, challengerMotionMinimumConfidence, challengerMotionMinimumSize, challengerColorMinimumConfidence })))));
}

/** Focused second-stage search that leaves the calibrated acquisition/challenger gates unchanged. */
export function buildBallAssociationConfigGrid(): OnlineBallTrackerConfig[] {
  const configs: OnlineBallTrackerConfig[] = [];
  for (const immediateDetectedMaximumDistance of [0.12, 0.18, 0.24, 0.3, 1.5]) {
    for (const associationQualityWeight of [0.25, 0.4, 0.55, 0.7]) {
      for (const associationSizeWeight of [0, 0.15, 0.3]) {
        if (associationQualityWeight + associationSizeWeight > 1) continue;
        configs.push({ ...DEFAULT_ONLINE_BALL_TRACKER_CONFIG, immediateDetectedMaximumDistance,
          associationQualityWeight, associationSizeWeight });
      }
    }
  }
  return configs;
}

/** Tunes only the newly exported appearance evidence on top of the promoted association defaults. */
export function buildBallAppearanceConfigGrid(): OnlineBallTrackerConfig[] {
  const configs: OnlineBallTrackerConfig[] = [];
  for (const associationQualityWeight of [0.4, 0.55]) {
    for (const associationSizeWeight of [0.15, 0.3]) {
      for (const associationAppearanceWeight of [0, 0.15, 0.3, 0.45]) {
        if (associationQualityWeight + associationSizeWeight + associationAppearanceWeight > 1) continue;
        configs.push({ ...DEFAULT_ONLINE_BALL_TRACKER_CONFIG, associationQualityWeight, associationSizeWeight,
          associationAppearanceWeight });
      }
    }
  }
  return configs;
}

/** Tunes temporal response after candidate identity and appearance weights are fixed. */
export function buildBallDynamicsConfigGrid(): OnlineBallTrackerConfig[] {
  return [0.7, 0.82, 0.9, 1].flatMap((measurementCorrectionGain) =>
    [0, 0.1, 0.2, 0.35].map((velocityCorrectionGain) =>
      ({ ...DEFAULT_ONLINE_BALL_TRACKER_CONFIG, measurementCorrectionGain, velocityCorrectionGain })));
}

/** Tunes appearance-aware ranking of two-frame distant identity challengers. */
export function buildBallChallengerConfigGrid(): OnlineBallTrackerConfig[] {
  return [0, 0.2, 0.4, 0.6, 0.8, 1].map((challengerAppearanceWeight) =>
    ({ ...DEFAULT_ONLINE_BALL_TRACKER_CONFIG, challengerAppearanceWeight }));
}

/** Tunes influence and immediate recovery for the calibration-cohort candidate ranker. */
export function buildBallRankerConfigGrid(): OnlineBallTrackerConfig[] {
  return [0, 0.25, 0.5, 0.75, 1].flatMap((identityQualityWeight) =>
    [0.5, 0.7, 0.85, 0.95, 2].map((identityOverrideMinimumConfidence) =>
      ({ ...DEFAULT_ONLINE_BALL_TRACKER_CONFIG, identityQualityWeight, identityOverrideMinimumConfidence })));
}

export function ballTrackerCandidateConfigs(evaluationConfig?: Partial<OnlineBallTrackerConfig>, associationOnly = false,
  appearanceOnly = false, dynamicsOnly = false, challengerOnly = false, rankerOnly = false) {
  return evaluationConfig ? [evaluationConfig as OnlineBallTrackerConfig]
    : rankerOnly ? buildBallRankerConfigGrid() : challengerOnly ? buildBallChallengerConfigGrid()
      : dynamicsOnly ? buildBallDynamicsConfigGrid() : appearanceOnly ? buildBallAppearanceConfigGrid()
      : associationOnly ? buildBallAssociationConfigGrid() : buildBallTrackerConfigGrid();
}

type TuningScore = { f1: number; precision: number; occlusionPredictionRate?: number };

/** Ball identity is primary; move F1 and ball precision break exact identity ties. */
export function isBetterBallTrackerScore(
  candidate: { metrics: TuningScore; moves: TuningScore },
  current: { metrics: TuningScore; moves: TuningScore },
) {
  const candidateOcclusion = candidate.metrics.occlusionPredictionRate ?? 0;
  const currentOcclusion = current.metrics.occlusionPredictionRate ?? 0;
  return candidate.metrics.f1 > current.metrics.f1 ||
    (candidate.metrics.f1 === current.metrics.f1 && candidateOcclusion > currentOcclusion) ||
    (candidate.metrics.f1 === current.metrics.f1 && candidateOcclusion === currentOcclusion && candidate.moves.f1 > current.moves.f1) ||
    (candidate.metrics.f1 === current.metrics.f1 && candidateOcclusion === currentOcclusion && candidate.moves.f1 === current.moves.f1 &&
      candidate.metrics.precision > current.metrics.precision);
}

export function requirePerManifestObservationDirectories(manifestCount: number, directories: string[]) {
  if (manifestCount > 1 && directories.length !== manifestCount) {
    throw new Error("Multi-manifest ball tuning requires exactly one --observation-dirs-by-manifest entry per manifest.");
  }
}

function micro(metrics: BallIdentityMetrics[]) {
  const sum = (key: "truePositives" | "falsePositives" | "falseNegatives") => metrics.reduce((total, item) => total + item[key], 0);
  const truePositives = sum("truePositives"); const falsePositives = sum("falsePositives"); const falseNegatives = sum("falseNegatives");
  const precision = truePositives + falsePositives ? truePositives / (truePositives + falsePositives) : 0;
  const recall = truePositives + falseNegatives ? truePositives / (truePositives + falseNegatives) : 0;
  return { truePositives, falsePositives, falseNegatives, precision, recall,
    f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0 };
}

function safeLocalOutput(path: string) {
  const localRoot = resolve("validation/local"); const output = resolve(path); const fromRoot = relative(localRoot, output);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error("Ball tracker tuning output must stay under validation/local/.");
  return output;
}

if (process.argv[1]?.endsWith("tune-ball-tracker.ts")) {
  const manifestPath = resolve(option("--manifest", "validation/manifest.json"));
  const additionalManifestPaths = option("--additional-manifests", "").split(",").map((value) => value.trim()).filter(Boolean).map((path) => resolve(path));
  const manifestPaths = [manifestPath, ...additionalManifestPaths];
  const output = safeLocalOutput(option("--output", "validation/local/tuned-ball-tracker.json"));
  const evaluationConfigPath = option("--evaluate-config", "");
  const associationOnly = process.argv.includes("--tune-association");
  const appearanceOnly = process.argv.includes("--tune-appearance");
  const dynamicsOnly = process.argv.includes("--tune-dynamics");
  const challengerOnly = process.argv.includes("--tune-challenger");
  const rankerOnly = process.argv.includes("--tune-ranker");
  if ([associationOnly, appearanceOnly, dynamicsOnly, challengerOnly, rankerOnly].filter(Boolean).length > 1) {
    throw new Error("Choose only one focused ball tracker tuning mode.");
  }
  const minimumMoveF1 = Number(option("--minimum-move-f1", "0"));
  if (!Number.isFinite(minimumMoveF1) || minimumMoveF1 < 0 || minimumMoveF1 > 1) {
    throw new Error("--minimum-move-f1 must be between 0 and 1.");
  }
  const evaluationConfig = evaluationConfigPath
    ? JSON.parse(readFileSync(resolve(evaluationConfigPath), "utf8")) as Partial<OnlineBallTrackerConfig>
    : undefined;
  const observationsOption = option("--observations-dir", "");
  const observationsOptions = option("--observations-dirs", observationsOption).split(",").map((value) => value.trim()).filter(Boolean);
  const observationsDirectories = observationsOptions.length
    ? observationsOptions.map((value) => resolveValidationObservationsDirectory(value))
    : [undefined];
  const byManifestOptions = option("--observation-dirs-by-manifest", "").split(",").map((value) => value.trim()).filter(Boolean);
  requirePerManifestObservationDirectories(manifestPaths.length, byManifestOptions);
  if (manifestPaths.length > 1 && observationsOptions.length) throw new Error("Use --observation-dirs-by-manifest for multi-manifest tuning.");
  const byManifestDirectories = byManifestOptions.map((value) => resolveValidationObservationsDirectory(value));
  const clipInputs = manifestPaths.flatMap((path, manifestIndex) => {
    const manifest = validateManifest(JSON.parse(readFileSync(path, "utf8")));
    return selectSplit(manifest, "calibration").map((clip) => ({ clip, manifestRoot: dirname(path),
      toleranceMs: manifest.toleranceMs, observationDirectory: byManifestDirectories[manifestIndex] }));
  });
  if (!clipInputs.length) throw new Error("Ball tracker tuning requires calibration clips; holdout clips are never read.");
  const datasetInputs = manifestPaths.length > 1 ? clipInputs : observationsDirectories.flatMap((observationsDirectory) =>
    clipInputs.map((input) => ({ ...input, observationDirectory: observationsDirectory })));
  const datasets = datasetInputs.map(({ clip, manifestRoot, toleranceMs, observationDirectory }) => {
    const observations = (JSON.parse(readFileSync(validationObservationPath(manifestRoot, clip, observationDirectory), "utf8")) as AnalysisExport).observations;
    if (observations.some((observation) => !Array.isArray(observation.ballCandidates))) throw new Error(`${clip.id} has no complete candidate snapshots.`);
    const sidecarPath = resolve(manifestRoot, "labels", "ball", `${clip.id}.json`);
    if (!existsSync(sidecarPath)) throw new Error(`Missing ball labels: ${sidecarPath}`);
    const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8")) as { labels?: unknown };
    return { clip, observations, labels: sidecar.labels, toleranceMs };
  });
  const score = (config: Partial<OnlineBallTrackerConfig>) => {
    const reports = datasets.map(({ observations, labels }) =>
      evaluateBallIdentity(labels, trackBallContinuity(replayBallTracking(observations, config))));
    const metrics = micro(reports.map((report) => report.tracked));
    const matched = reports.reduce((sum, report) => sum + report.occlusion.matchedLabels, 0);
    const predicted = reports.reduce((sum, report) => sum + report.occlusion.predictedFrames, 0);
    return { ...metrics, occlusionPredictionRate: matched ? predicted / matched : 0 };
  };
  const scoreMoves = (config: Partial<OnlineBallTrackerConfig>) => combineEvaluations(datasets.map(({ clip, observations, toleranceMs }) => {
    const replayed = trackBallContinuity(replayBallTracking(observations, config));
    return evaluateDetections(clip.expected.filter((label) => LIVE_MOVE_NAMES.includes(label.move)),
      detectMoves(replayed, DEFAULT_MOVE_DETECTION_CONFIG).filter((detection) => LIVE_MOVE_NAMES.includes(detection.move)), toleranceMs);
  }));
  const disabledOverride = { immediateDetectedMinimumConfidence: Number.POSITIVE_INFINITY };
  const baseline = score(disabledOverride);
  const candidateConfigs = ballTrackerCandidateConfigs(evaluationConfig, associationOnly, appearanceOnly, dynamicsOnly, challengerOnly, rankerOnly);
  let best: { config: OnlineBallTrackerConfig; metrics: ReturnType<typeof score>; moves: ReturnType<typeof scoreMoves> } | null = null;
  for (const config of candidateConfigs) {
    const metrics = score(config);
    const moves = scoreMoves(config);
    if (moves.f1 < minimumMoveF1) continue;
    if (!best || isBetterBallTrackerScore({ metrics, moves }, best)) {
      best = { config, metrics, moves };
    }
  }
  if (!best) throw new Error(`No ball tracker candidate meets minimum move F1 ${minimumMoveF1}.`);
  if (!evaluationConfig) writeFileSync(output, `${JSON.stringify(best.config, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ calibrationClips: clipInputs.length, calibrationRuns: manifestPaths.length > 1 ? 1 : observationsDirectories.length,
    mode: evaluationConfig ? "evaluate-config" : rankerOnly ? "ranker-grid-search" : challengerOnly ? "challenger-grid-search"
      : dynamicsOnly ? "dynamics-grid-search" : appearanceOnly ? "appearance-grid-search"
      : associationOnly ? "association-grid-search" : "grid-search",
    manifests: manifestPaths, observationsDirectories: manifestPaths.length > 1 ? byManifestDirectories : observationsDirectories.map((directory) => directory ?? null),
    candidates: candidateConfigs.length, minimumMoveF1,
    baseline: { ball: baseline, moves: scoreMoves(disabledOverride) },
    selected: best, output: evaluationConfig ? null : output }, null, 2));
}
