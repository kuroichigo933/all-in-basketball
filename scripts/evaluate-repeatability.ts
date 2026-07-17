import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DEFAULT_MOVE_DETECTION_CONFIG, detectMoves, type MoveDetectionConfig } from "../lib/motion/detectMoves.ts";
import { combineEvaluations, evaluateDetections } from "../lib/motion/evaluate.ts";
import { evaluateBallIdentity, type BallIdentityMetrics } from "../lib/motion/evaluateBall.ts";
import { repeatabilityPasses, summarizeRepeatability } from "../lib/motion/repeatability.ts";
import type { OnlineBallTrackerConfig } from "../lib/motion/onlineBallTracker.ts";
import { replayBallTracking } from "../lib/motion/replayBallTracking.ts";
import { assertUsableSampling } from "../lib/motion/sampling.ts";
import { trackBallContinuity } from "../lib/motion/trackBall.ts";
import { LIVE_MOVE_NAMES, selectSplit, validateManifest, type AnalysisExport, type ValidationSplit } from "../lib/motion/validation.ts";

function option(name: string, fallback?: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

export function parseRunDirectories(value: string | undefined) {
  const directories = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (directories.length < 2) throw new Error("Repeatability evaluation requires at least two comma-separated run directories.");
  const resolved = directories.map((directory) => resolve(directory));
  if (new Set(resolved.map((directory) => directory.toLowerCase())).size !== resolved.length) {
    throw new Error("Repeatability run directories must be distinct.");
  }
  return resolved;
}

function micro(metrics: BallIdentityMetrics[]) {
  const sum = (key: "truePositives" | "falsePositives" | "falseNegatives" | "trueNegatives") =>
    metrics.reduce((total, item) => total + item[key], 0);
  const truePositives = sum("truePositives"); const falsePositives = sum("falsePositives");
  const falseNegatives = sum("falseNegatives"); const trueNegatives = sum("trueNegatives");
  const precision = truePositives + falsePositives ? truePositives / (truePositives + falsePositives) : falseNegatives ? 0 : 1;
  const recall = truePositives + falseNegatives ? truePositives / (truePositives + falseNegatives) : 1;
  return { truePositives, falsePositives, falseNegatives, trueNegatives, precision, recall,
    f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0 };
}

if (process.argv[1]?.endsWith("evaluate-repeatability.ts")) {
  const manifestPath = resolve(option("--manifest", "validation/manifest.json")!);
  const split = option("--split", "calibration") as ValidationSplit;
  const runDirectories = parseRunDirectories(option("--runs"));
  const maximumF1Spread = Number(option("--maximum-f1-spread", "0.03"));
  if (!Number.isFinite(maximumF1Spread) || maximumF1Spread < 0) throw new Error("--maximum-f1-spread must be a non-negative number.");
  const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
  const clips = selectSplit(manifest, split);
  if (!clips.length) throw new Error(`Manifest has no ${split} clips.`);
  const configPath = option("--config");
  const config: MoveDetectionConfig = configPath
    ? { ...DEFAULT_MOVE_DETECTION_CONFIG, ...JSON.parse(readFileSync(resolve(configPath), "utf8")) }
    : { ...DEFAULT_MOVE_DETECTION_CONFIG };
  const trackerConfigPath = option("--tracker-config");
  const trackerConfig: Partial<OnlineBallTrackerConfig> | undefined = trackerConfigPath
    ? JSON.parse(readFileSync(resolve(trackerConfigPath), "utf8"))
    : undefined;

  const runs = runDirectories.map((runDirectory) => {
    const ballReports: BallIdentityMetrics[] = []; const moveRows: ReturnType<typeof evaluateDetections>[] = [];
    let oracleVisibleLabels = 0; let oracleVisibleHits = 0; let oracleAvailable = true; const failures: string[] = [];
    for (const clip of clips) {
      try {
        const observationPath = resolve(runDirectory, `${clip.id}.json`);
        if (!existsSync(observationPath)) throw new Error(`Missing observations: ${observationPath}`);
        const data = JSON.parse(readFileSync(observationPath, "utf8")) as AnalysisExport;
        assertUsableSampling(data.observations, data.sampleIntervalMs, data.sampling);
        const observations = trackBallContinuity(trackerConfig ? replayBallTracking(data.observations, trackerConfig) : data.observations);
        const sidecarPath = resolve(dirname(manifestPath), "labels", "ball", `${clip.id}.json`);
        if (!existsSync(sidecarPath)) throw new Error(`Missing ball labels: ${sidecarPath}`);
        const labels = (JSON.parse(readFileSync(sidecarPath, "utf8")) as { labels?: unknown }).labels;
        const ball = evaluateBallIdentity(labels, observations);
        ballReports.push(ball.tracked);
        if (ball.candidateOracle.available) {
          oracleVisibleLabels += ball.candidateOracle.visibleLabels;
          oracleVisibleHits += ball.candidateOracle.visibleHits;
        } else oracleAvailable = false;
        const expected = clip.expected.filter((label) => LIVE_MOVE_NAMES.includes(label.move));
        const actual = detectMoves(observations, config).filter((detection) => LIVE_MOVE_NAMES.includes(detection.move));
        moveRows.push(evaluateDetections(expected, actual, manifest.toleranceMs));
      } catch (error) {
        failures.push(`${clip.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const ball = micro(ballReports); const moves = combineEvaluations(moveRows);
    return { id: runDirectory, processed: ballReports.length, failures, ball,
      candidateOracleRecall: oracleAvailable && oracleVisibleLabels ? oracleVisibleHits / oracleVisibleLabels : null, moves };
  });
  const failed = runs.some((run) => run.failures.length || run.processed !== clips.length || run.candidateOracleRecall === null);
  const ballF1 = summarizeRepeatability(runs.map((run) => run.ball.f1));
  const candidateOracleRecall = summarizeRepeatability(runs.map((run) => run.candidateOracleRecall ?? 0));
  const moveF1 = summarizeRepeatability(runs.map((run) => run.moves.f1));
  const stability = {
    maximumF1Spread,
    ball: repeatabilityPasses(ballF1, maximumF1Spread),
    moves: repeatabilityPasses(moveF1, maximumF1Spread),
    diagnosticPass: !failed && repeatabilityPasses(ballF1, maximumF1Spread) && repeatabilityPasses(moveF1, maximumF1Spread),
  };
  console.log(JSON.stringify({ split, clips: clips.length, trackerConfig: trackerConfigPath ? resolve(trackerConfigPath) : null,
    runs, ranges: { ballF1, candidateOracleRecall, moveF1 }, stability }, null, 2));
  if (failed || !stability.diagnosticPass) process.exitCode = 1;
}
