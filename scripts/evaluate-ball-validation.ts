import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { evaluateBallIdentity, type BallIdentityMetrics, type BallOcclusionMetrics } from "../lib/motion/evaluateBall.ts";
import { selectSplit, validateManifest, type AnalysisExport, type ValidationSplit } from "../lib/motion/validation.ts";
import { resolveValidationObservationsDirectory, validationObservationPath } from "../lib/motion/validationObservations.ts";

export type BallEvaluationArgs = {
  manifest: string;
  additionalManifests: string[];
  observationDirs: string[];
  split: ValidationSplit;
  allowIncomplete: boolean;
};

function option(argv: string[], name: string, fallback: string) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  if (!argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error(`Missing value for ${name}.`);
  return argv[index + 1];
}

export function parseBallEvaluationArgs(argv: string[]): BallEvaluationArgs {
  const split = option(argv, "--split", "calibration");
  if (split !== "calibration" && split !== "holdout") throw new Error(`Invalid validation split: ${split}.`);
  return {
    manifest: option(argv, "--manifest", "validation/manifest.json"),
    additionalManifests: option(argv, "--additional-manifests", "").split(",").map((value) => value.trim()).filter(Boolean),
    observationDirs: option(argv, "--observation-dirs", "").split(",").map((value) => value.trim()).filter(Boolean),
    split,
    allowIncomplete: argv.includes("--allow-incomplete"),
  };
}

export function microBallIdentityMetrics(metrics: BallIdentityMetrics[]) {
  const sum = (key: "visibleLabels" | "absentLabels" | "matchedLabels" | "unmatchedLabels" | "truePositives" | "falsePositives" | "falseNegatives" | "trueNegatives") =>
    metrics.reduce((total, item) => total + item[key], 0);
  const truePositives = sum("truePositives"); const falsePositives = sum("falsePositives"); const falseNegatives = sum("falseNegatives");
  const visibleLabels = sum("visibleLabels"); const absentLabels = sum("absentLabels"); const trueNegatives = sum("trueNegatives");
  const precision = truePositives + falsePositives ? truePositives / (truePositives + falsePositives) : falseNegatives ? 0 : 1;
  const recall = truePositives + falseNegatives ? truePositives / (truePositives + falseNegatives) : 1;
  return { visibleLabels, absentLabels, matchedLabels: sum("matchedLabels"), unmatchedLabels: sum("unmatchedLabels"),
    truePositives, falsePositives, falseNegatives, trueNegatives, precision, recall,
    f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0,
    visibleLocalizationRate: visibleLabels ? truePositives / visibleLabels : 1,
    negativeRejectionRate: absentLabels ? trueNegatives / absentLabels : null };
}

function microOcclusion(metrics: BallOcclusionMetrics[]): BallOcclusionMetrics {
  const sum = (key: "occludedLabels" | "matchedLabels" | "unmatchedLabels" | "trackedFrames" | "predictedFrames" | "measuredFrames" | "missingFrames" | "ambiguousFrames") =>
    metrics.reduce((total, item) => total + item[key], 0);
  const matchedLabels = sum("matchedLabels"); const ambiguousFrames = sum("ambiguousFrames");
  const trackedFrames = sum("trackedFrames"); const predictedFrames = sum("predictedFrames");
  return {
    occludedLabels: sum("occludedLabels"), matchedLabels, unmatchedLabels: sum("unmatchedLabels"),
    trackedFrames, predictedFrames, measuredFrames: sum("measuredFrames"), missingFrames: sum("missingFrames"), ambiguousFrames,
    trackPresenceRate: matchedLabels ? trackedFrames / matchedLabels : null,
    predictionPersistenceRate: matchedLabels && !ambiguousFrames ? predictedFrames / matchedLabels : null,
  };
}

type EvaluatedClip = {
  id: string;
  sourceId: string;
  cohort: string;
  labelSource: "sidecar" | "embedded";
  report: ReturnType<typeof evaluateBallIdentity>;
};

export function requireUniqueBallEvaluationClipIds(clips: Array<{ id: string }>) {
  const ids = new Set<string>();
  for (const clip of clips) {
    if (ids.has(clip.id)) throw new Error(`Duplicate ball-evaluation clip ID across manifests: ${clip.id}.`);
    ids.add(clip.id);
  }
}

function summarizeReports(reports: EvaluatedClip[]) {
  const rawReports = reports.flatMap(({ report }) => report.raw ? [report.raw] : []);
  const oracleReports = reports.map(({ report }) => report.candidateOracle);
  const candidateOracle = oracleReports.length === reports.length && oracleReports.every((report) => report.available) ? (() => {
    const visibleLabels = oracleReports.reduce((sum, report) => sum + report.visibleLabels, 0);
    const visibleHits = oracleReports.reduce((sum, report) => sum + report.visibleHits, 0);
    const absentLabels = oracleReports.reduce((sum, report) => sum + report.absentLabels, 0);
    const absentFramesWithoutCandidates = oracleReports.reduce((sum, report) => sum + report.absentFramesWithoutCandidates, 0);
    return { visibleLabels, visibleHits, visibleRecall: visibleLabels ? visibleHits / visibleLabels : null,
      absentLabels, absentFramesWithoutCandidates, negativeRejectionRate: absentLabels ? absentFramesWithoutCandidates / absentLabels : null };
  })() : null;
  return {
    evaluatedClips: reports.length,
    tracked: microBallIdentityMetrics(reports.map(({ report }) => report.tracked)),
    raw: rawReports.length === reports.length ? microBallIdentityMetrics(rawReports) : null,
    candidateOracle,
    occlusion: microOcclusion(reports.map(({ report }) => report.occlusion)),
  };
}

export function evaluateBallValidation(args: BallEvaluationArgs) {
  const manifestPaths = [args.manifest, ...args.additionalManifests].map((path) => resolve(path));
  const observationDirectories = args.observationDirs.map((path) => resolveValidationObservationsDirectory(path));
  if (observationDirectories.length && observationDirectories.length !== manifestPaths.length) {
    throw new Error("--observation-dirs must provide exactly one directory per manifest.");
  }
  const clipInputs = manifestPaths.flatMap((manifestPath, manifestIndex) => {
    const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
    return selectSplit(manifest, args.split).map((clip) => ({ clip, manifestRoot: dirname(manifestPath),
      observationDirectory: observationDirectories[manifestIndex] }));
  });
  requireUniqueBallEvaluationClipIds(clipInputs.map(({ clip }) => clip));
  const missingLabels: string[] = [];
  const failures: string[] = [];
  const incompleteProtocols: string[] = [];
  const reports: EvaluatedClip[] = [];
  for (const { clip, manifestRoot, observationDirectory } of clipInputs) {
    try {
      const data = JSON.parse(readFileSync(validationObservationPath(manifestRoot, clip, observationDirectory), "utf8")) as AnalysisExport;
      const sidecarPath = resolve(manifestRoot, "labels", "ball", `${clip.id}.json`);
      let labels: unknown = data.ballLabels; let labelSource: "sidecar" | "embedded" = "embedded";
      if (existsSync(sidecarPath)) {
        const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8")) as { schemaVersion?: number; clipId?: string; protocol?: { scheduledTimesMs?: number[] }; labels?: unknown };
        if (sidecar.schemaVersion !== 1 || sidecar.clipId !== clip.id) throw new Error(`Invalid ball-label sidecar: ${sidecarPath}`);
        labels = sidecar.labels; labelSource = "sidecar";
        if (sidecar.protocol?.scheduledTimesMs) {
          const labelTimes = new Set(Array.isArray(sidecar.labels) ? sidecar.labels.map((label) => (label as { timeMs?: number }).timeMs) : []);
          if (sidecar.protocol.scheduledTimesMs.some((timeMs) => !labelTimes.has(timeMs))) incompleteProtocols.push(clip.id);
        }
      }
      if (!Array.isArray(labels) || !labels.length) { missingLabels.push(clip.id); continue; }
      reports.push({ id: clip.id, sourceId: clip.sourceId, cohort: clip.cohort, labelSource,
        report: evaluateBallIdentity(labels, data.observations) });
    } catch (error) { failures.push(`${clip.id}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const complete = reports.length === clipInputs.length && failures.length === 0 && incompleteProtocols.length === 0;
  const sourceIds = Array.from(new Set(reports.map((report) => report.sourceId))).sort();
  const cohorts = Array.from(new Set(reports.map((report) => report.cohort))).sort();
  const output = {
    split: args.split, manifests: manifestPaths, observationDirectories, clips: clipInputs.length, labeledClips: reports.length, complete,
    missingLabels, incompleteProtocols, failures, ...summarizeReports(reports),
    bySource: Object.fromEntries(sourceIds.map((sourceId) => [sourceId, summarizeReports(reports.filter((report) => report.sourceId === sourceId))])),
    byCohort: Object.fromEntries(cohorts.map((cohort) => [cohort, summarizeReports(reports.filter((report) => report.cohort === cohort))])),
    perClip: Object.fromEntries(reports.map(({ id, sourceId, cohort, labelSource, report }) => [id, { sourceId, cohort, labelSource, ...report }])),
  };
  console.log(JSON.stringify(output, null, 2));
  return { output, success: Boolean(reports.length) && failures.length === 0 && (complete || args.allowIncomplete) };
}

if (process.argv[1]?.endsWith("evaluate-ball-validation.ts")) {
  const result = evaluateBallValidation(parseBallEvaluationArgs(process.argv.slice(2)));
  if (!result.success) process.exitCode = 1;
}
