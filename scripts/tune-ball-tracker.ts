import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { evaluateBallIdentity, type BallIdentityMetrics } from "../lib/motion/evaluateBall.ts";
import { DEFAULT_MOVE_DETECTION_CONFIG, detectMoves } from "../lib/motion/detectMoves.ts";
import { combineEvaluations, evaluateDetections } from "../lib/motion/evaluate.ts";
import type { OnlineBallTrackerConfig } from "../lib/motion/onlineBallTracker.ts";
import { replayBallTracking } from "../lib/motion/replayBallTracking.ts";
import { trackBallContinuity } from "../lib/motion/trackBall.ts";
import { LIVE_MOVE_NAMES, selectSplit, validateManifest, type AnalysisExport } from "../lib/motion/validation.ts";

function option(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

export function buildBallTrackerConfigGrid(): OnlineBallTrackerConfig[] {
  const configs: OnlineBallTrackerConfig[] = [];
  for (const immediateDetectedMinimumConfidence of [0.15, 0.2, 0.25, 0.3, 0.4, 0.5]) {
    for (const immediateDetectedMinimumSize of [0.025, 0.035, 0.045, 0.055]) {
      for (const immediateDetectedMaximumSize of [0.09, 0.12]) configs.push({
        immediateDetectedMinimumConfidence, immediateDetectedMinimumSize, immediateDetectedMaximumSize,
      });
    }
  }
  return configs;
}

type TuningScore = { f1: number; precision: number };

/** Ball identity is primary; move F1 and ball precision break exact identity ties. */
export function isBetterBallTrackerScore(
  candidate: { metrics: TuningScore; moves: TuningScore },
  current: { metrics: TuningScore; moves: TuningScore },
) {
  return candidate.metrics.f1 > current.metrics.f1 ||
    (candidate.metrics.f1 === current.metrics.f1 && candidate.moves.f1 > current.moves.f1) ||
    (candidate.metrics.f1 === current.metrics.f1 && candidate.moves.f1 === current.moves.f1 &&
      candidate.metrics.precision > current.metrics.precision);
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
  const output = safeLocalOutput(option("--output", "validation/local/tuned-ball-tracker.json"));
  const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
  const clips = selectSplit(manifest, "calibration");
  if (!clips.length) throw new Error("Ball tracker tuning requires calibration clips; holdout clips are never read.");
  const datasets = clips.map((clip) => {
    const observations = (JSON.parse(readFileSync(resolve(dirname(manifestPath), clip.observations), "utf8")) as AnalysisExport).observations;
    if (observations.some((observation) => !Array.isArray(observation.ballCandidates))) throw new Error(`${clip.id} has no complete candidate snapshots.`);
    const sidecarPath = resolve(dirname(manifestPath), "labels", "ball", `${clip.id}.json`);
    if (!existsSync(sidecarPath)) throw new Error(`Missing ball labels: ${sidecarPath}`);
    const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8")) as { labels?: unknown };
    return { clip, observations, labels: sidecar.labels };
  });
  const score = (config: Partial<OnlineBallTrackerConfig>) => micro(datasets.map(({ observations, labels }) =>
    evaluateBallIdentity(labels, trackBallContinuity(replayBallTracking(observations, config))).tracked));
  const scoreMoves = (config: Partial<OnlineBallTrackerConfig>) => combineEvaluations(datasets.map(({ clip, observations }) => {
    const replayed = trackBallContinuity(replayBallTracking(observations, config));
    return evaluateDetections(clip.expected.filter((label) => LIVE_MOVE_NAMES.includes(label.move)),
      detectMoves(replayed, DEFAULT_MOVE_DETECTION_CONFIG).filter((detection) => LIVE_MOVE_NAMES.includes(detection.move)), manifest.toleranceMs);
  }));
  const disabledOverride = { immediateDetectedMinimumConfidence: Number.POSITIVE_INFINITY };
  const baseline = score(disabledOverride);
  let best = { config: buildBallTrackerConfigGrid()[0], metrics: { ...baseline, f1: -1 }, moves: scoreMoves(disabledOverride) };
  for (const config of buildBallTrackerConfigGrid()) {
    const metrics = score(config);
    const moves = scoreMoves(config);
    if (isBetterBallTrackerScore({ metrics, moves }, best)) {
      best = { config, metrics, moves };
    }
  }
  writeFileSync(output, `${JSON.stringify(best.config, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ calibrationClips: clips.length, candidates: buildBallTrackerConfigGrid().length,
    baseline: { ball: baseline, moves: scoreMoves(disabledOverride) },
    selected: best, output }, null, 2));
}
