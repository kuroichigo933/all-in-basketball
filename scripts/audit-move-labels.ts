import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { auditMoveLabelCoverage, auditRapidMoveLabels } from "../lib/motion/auditMoveLabels.ts";
import type { OnlineBallTrackerConfig } from "../lib/motion/onlineBallTracker.ts";
import { replayBallTracking } from "../lib/motion/replayBallTracking.ts";
import { assertUsableSampling } from "../lib/motion/sampling.ts";
import { trackBallContinuity } from "../lib/motion/trackBall.ts";
import { selectSplit, validateAnalysisExport, validateManifest } from "../lib/motion/validation.ts";
import { resolveValidationObservationsDirectory, validationObservationPath } from "../lib/motion/validationObservations.ts";

function option(name: string, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const manifestPath = resolve(option("--manifest", "validation/manifest.json"));
const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
const clips = selectSplit(manifest, "calibration");
if (!clips.length) throw new Error("Move-label auditing is calibration-only and requires calibration clips.");
const observationOptions = option("--observations-dirs", option("--observations-dir"))
  .split(",").map((value) => value.trim()).filter(Boolean);
const observationDirectories = observationOptions.length
  ? observationOptions.map((value) => resolveValidationObservationsDirectory(value))
  : [undefined];
const ballConfigOption = option("--ball-config");
const ballConfig = ballConfigOption
  ? JSON.parse(readFileSync(resolve(ballConfigOption), "utf8")) as Partial<OnlineBallTrackerConfig>
  : null;
const minimumTransitionToLabelRatio = Number(option("--minimum-transition-ratio", "0.8"));
if (!Number.isFinite(minimumTransitionToLabelRatio) || minimumTransitionToLabelRatio < 0) {
  throw new Error("--minimum-transition-ratio must be a non-negative number.");
}
const transitionLabelToleranceMs = Number(option("--transition-label-tolerance-ms", "250"));
if (!Number.isFinite(transitionLabelToleranceMs) || transitionLabelToleranceMs < 0) {
  throw new Error("--transition-label-tolerance-ms must be a non-negative number.");
}

const runs = observationDirectories.map((observationsDirectory) => {
  const rows: Array<{ clipId: string } & ReturnType<typeof auditRapidMoveLabels>[number]> = [];
  const coverage: Array<{ clipId: string } & ReturnType<typeof auditMoveLabelCoverage>> = [];
  const failures: string[] = [];
  for (const clip of clips) {
    try {
      const data = validateAnalysisExport(JSON.parse(readFileSync(validationObservationPath(dirname(manifestPath), clip, observationsDirectory), "utf8")), clip.id);
      assertUsableSampling(data.observations, data.sampleIntervalMs, data.sampling);
      const observations = trackBallContinuity(ballConfig ? replayBallTracking(data.observations, ballConfig) : data.observations);
      rows.push(...auditRapidMoveLabels(clip.expected, observations, { minimumTransitionToLabelRatio })
        .map((row) => ({ clipId: clip.id, ...row })));
      coverage.push({ clipId: clip.id, ...auditMoveLabelCoverage(clip.expected, observations, { transitionLabelToleranceMs }) });
    } catch (error) {
      failures.push(`${clip.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {
    observationsDirectory: observationsDirectory ?? null,
    processedClips: clips.length - failures.length,
    failures,
    groups: rows,
    coverage,
    summary: {
      groups: rows.length,
      pass: rows.filter((row) => row.status === "pass").length,
      review: rows.filter((row) => row.status === "review").length,
      insufficientMotionData: rows.filter((row) => row.status === "insufficient-motion-data").length,
    },
    coverageSummary: {
      clips: coverage.length,
      pass: coverage.filter((row) => row.status === "pass").length,
      review: coverage.filter((row) => row.status === "review").length,
      insufficientMotionData: coverage.filter((row) => row.status === "insufficient-motion-data").length,
      uncoveredTransitions: coverage.reduce((sum, row) => sum + row.uncoveredTransitionTimesMs.length, 0),
      unmatchedLabels: coverage.reduce((sum, row) => sum + row.unmatchedLabels.length, 0),
      boundaryReviewTransitions: coverage.reduce((sum, row) => sum + row.boundaryReviewTransitionTimesMs.length, 0),
    },
  };
});
const needsReview = runs.some((run) => run.failures.length || run.summary.review || run.summary.insufficientMotionData ||
  run.coverageSummary.review || run.coverageSummary.insufficientMotionData);
console.log(JSON.stringify({
  protocol: "calibration-only-move-label-motion-audit-v2",
  manifest: manifestPath,
  ballConfig: ballConfigOption || null,
  minimumTransitionToLabelRatio,
  transitionLabelToleranceMs,
  runs,
  needsReview,
}, null, 2));
if (needsReview) process.exitCode = 1;
