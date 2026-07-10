import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DEFAULT_MOVE_DETECTION_CONFIG, detectMoves, summarizeAnalysis, type MoveDetectionConfig } from "../lib/motion/detectMoves.ts";
import { combineEvaluations, evaluateDetections } from "../lib/motion/evaluate.ts";
import type { ExpectedMove } from "../lib/motion/evaluate.ts";
import type { AnalysisSummary } from "../lib/motion/types.ts";
import { trackBallContinuity } from "../lib/motion/trackBall.ts";
import { ALL_MOVE_NAMES, evaluateGates, selectSplit, validateManifest, type AnalysisExport, type ValidationSplit } from "../lib/motion/validation.ts";

function option(name: string, fallback?: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; }
const manifestPath = resolve(option("--manifest", "validation/manifest.json")!);
const split = option("--split", "holdout") as ValidationSplit;
const configPath = option("--config", "validation/tuned-config.json")!;
if (!existsSync(manifestPath)) { console.error(`Validation manifest not found: ${manifestPath}`); process.exitCode = 2; }
else {
  const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
  const clips = selectSplit(manifest, split);
  if (!clips.length) throw new Error(`Manifest has no ${split} clips.`);
  const resolvedConfig = resolve(configPath);
  const config: MoveDetectionConfig = existsSync(resolvedConfig) ? { ...DEFAULT_MOVE_DETECTION_CONFIG, ...JSON.parse(readFileSync(resolvedConfig, "utf8")) } : { ...DEFAULT_MOVE_DETECTION_CONFIG };
  const failures: string[] = []; const rows: Array<ReturnType<typeof evaluateDetections> & { id: string }> = [];
  const labels: ExpectedMove[] = []; const summaries: AnalysisSummary[] = [];
  for (const clip of clips) {
    try {
      const data = JSON.parse(readFileSync(resolve(dirname(manifestPath), clip.observations), "utf8")) as AnalysisExport;
      const observations = trackBallContinuity(data.observations); const actual = detectMoves(observations, config);
      rows.push({ id: clip.id, ...evaluateDetections(clip.expected, actual, manifest.toleranceMs) }); labels.push(...clip.expected); summaries.push(summarizeAnalysis(observations));
    } catch (error) { failures.push(`${clip.id}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const total = combineEvaluations(rows); const byClass = Object.fromEntries(ALL_MOVE_NAMES.map((move) => [move, combineEvaluations(clips.map((clip) => {
    try { const data = JSON.parse(readFileSync(resolve(dirname(manifestPath), clip.observations), "utf8")) as AnalysisExport; return evaluateDetections(clip.expected.filter((e) => e.move === move), detectMoves(trackBallContinuity(data.observations), config).filter((d) => d.move === move), manifest.toleranceMs); } catch { return { truePositives: 0, falsePositives: 0, falseNegatives: clip.expected.filter((e) => e.move === move).length }; }
  }))]));
  const average = (key: "poseCoverage" | "detectedBallCoverage" | "ballCoverage") => summaries.length ? summaries.reduce((sum, item) => sum + item[key], 0) / summaries.length : 0;
  const report = { split, clips: clips.length, processed: rows.length, failures, total, byClass, coverage: { pose: average("poseCoverage"), detectedBall: average("detectedBallCoverage"), trackedBall: average("ballCoverage") }, gates: evaluateGates(labels, total) };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length || report.gates.controlledTwoClass.status !== "pass") process.exitCode = 1;
}
