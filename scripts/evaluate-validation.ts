import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DEFAULT_MOVE_DETECTION_CONFIG, detectMoves, summarizeAnalysis, type MoveDetectionConfig } from "../lib/motion/detectMoves.ts";
import { combineEvaluations, combineMoveConfusions, evaluateDetections, evaluateMoveConfusion } from "../lib/motion/evaluate.ts";
import type { ExpectedMove } from "../lib/motion/evaluate.ts";
import type { AnalysisSummary } from "../lib/motion/types.ts";
import { trackBallContinuity } from "../lib/motion/trackBall.ts";
import { assertUsableSampling } from "../lib/motion/sampling.ts";
import { ALL_MOVE_NAMES, CONTROLLED_MOVE_NAMES, LIVE_MOVE_NAMES, evaluateGates, selectSplit, validateManifest, type AnalysisExport, type ValidationSplit } from "../lib/motion/validation.ts";
import { resolveValidationObservationsDirectory, validationObservationPath } from "../lib/motion/validationObservations.ts";

function option(name: string, fallback?: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; }
const manifestPath = resolve(option("--manifest", "validation/manifest.json")!);
const split = option("--split", "holdout") as ValidationSplit;
const configPath = option("--config", "validation/tuned-config.json")!;
const observationsOption = option("--observations-dir");
const observationsDirectory = observationsOption ? resolveValidationObservationsDirectory(observationsOption) : undefined;
if (!existsSync(manifestPath)) { console.error(`Validation manifest not found: ${manifestPath}`); process.exitCode = 2; }
else {
  const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
  const clips = selectSplit(manifest, split);
  if (!clips.length) throw new Error(`Manifest has no ${split} clips.`);
  const resolvedConfig = resolve(configPath);
  const config: MoveDetectionConfig = existsSync(resolvedConfig) ? { ...DEFAULT_MOVE_DETECTION_CONFIG, ...JSON.parse(readFileSync(resolvedConfig, "utf8")) } : { ...DEFAULT_MOVE_DETECTION_CONFIG };
  const failures: string[] = []; const rows: Array<ReturnType<typeof evaluateDetections> & { id: string }> = [];
  const confusionRows: ReturnType<typeof evaluateMoveConfusion>[] = [];
  const labels: ExpectedMove[] = []; const summaries: AnalysisSummary[] = [];
  for (const clip of clips) {
    try {
      const data = JSON.parse(readFileSync(validationObservationPath(dirname(manifestPath), clip, observationsDirectory), "utf8")) as AnalysisExport;
      assertUsableSampling(data.observations, data.sampleIntervalMs, data.sampling);
      const observations = trackBallContinuity(data.observations); const actual = detectMoves(observations, config);
      rows.push({ id: clip.id, ...evaluateDetections(clip.expected, actual, manifest.toleranceMs) });
      confusionRows.push(evaluateMoveConfusion(clip.expected, actual, manifest.toleranceMs)); labels.push(...clip.expected); summaries.push(summarizeAnalysis(observations));
    } catch (error) { failures.push(`${clip.id}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const total = combineEvaluations(rows); const byClass = Object.fromEntries(ALL_MOVE_NAMES.map((move) => [move, combineEvaluations(clips.map((clip) => {
    try { const data = JSON.parse(readFileSync(validationObservationPath(dirname(manifestPath), clip, observationsDirectory), "utf8")) as AnalysisExport; assertUsableSampling(data.observations, data.sampleIntervalMs, data.sampling); return evaluateDetections(clip.expected.filter((e) => e.move === move), detectMoves(trackBallContinuity(data.observations), config).filter((d) => d.move === move), manifest.toleranceMs); } catch { return { truePositives: 0, falsePositives: 0, falseNegatives: clip.expected.filter((e) => e.move === move).length }; }
  }))]));
  const controlledTotal = combineEvaluations(CONTROLLED_MOVE_NAMES.map((move) => byClass[move]));
  const liveThreeTotal = combineEvaluations(LIVE_MOVE_NAMES.map((move) => byClass[move]));
  const average = (key: "poseCoverage" | "detectedBallCoverage" | "ballCoverage") => summaries.length ? summaries.reduce((sum, item) => sum + item[key], 0) / summaries.length : 0;
  const report = { split, clips: clips.length, observationsDirectory: observationsDirectory ?? null,
    processed: rows.length, failures, total, controlledTotal, liveThreeTotal, byClass,
    confusion: combineMoveConfusions(confusionRows), coverage: { pose: average("poseCoverage"), detectedBall: average("detectedBallCoverage"), trackedBall: average("ballCoverage") }, gates: evaluateGates(labels, controlledTotal, liveThreeTotal, total) };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length || report.gates.controlledTwoClass.status === "fail" || report.gates.liveThreeMove.status === "fail") process.exitCode = 1;
}
