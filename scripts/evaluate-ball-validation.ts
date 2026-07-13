import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { evaluateBallIdentity, type BallIdentityMetrics } from "../lib/motion/evaluateBall.ts";
import { selectSplit, validateManifest, type AnalysisExport, type ValidationSplit } from "../lib/motion/validation.ts";

function option(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function micro(metrics: BallIdentityMetrics[]) {
  const sum = (key: "visibleLabels" | "absentLabels" | "truePositives" | "falsePositives" | "falseNegatives" | "trueNegatives") =>
    metrics.reduce((total, item) => total + item[key], 0);
  const truePositives = sum("truePositives"); const falsePositives = sum("falsePositives"); const falseNegatives = sum("falseNegatives");
  const precision = truePositives + falsePositives ? truePositives / (truePositives + falsePositives) : falseNegatives ? 0 : 1;
  const recall = truePositives + falseNegatives ? truePositives / (truePositives + falseNegatives) : 1;
  return { visibleLabels: sum("visibleLabels"), absentLabels: sum("absentLabels"), truePositives, falsePositives, falseNegatives,
    trueNegatives: sum("trueNegatives"), precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0 };
}

const manifestPath = resolve(option("--manifest", "validation/manifest.json"));
const split = option("--split", "calibration") as ValidationSplit;
const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
const clips = selectSplit(manifest, split);
const missingLabels: string[] = [];
const failures: string[] = [];
const reports: Array<{ id: string; report: ReturnType<typeof evaluateBallIdentity> }> = [];
for (const clip of clips) {
  try {
    const data = JSON.parse(readFileSync(resolve(dirname(manifestPath), clip.observations), "utf8")) as AnalysisExport;
    if (!data.ballLabels?.length) { missingLabels.push(clip.id); continue; }
    reports.push({ id: clip.id, report: evaluateBallIdentity(data.ballLabels, data.observations) });
  } catch (error) { failures.push(`${clip.id}: ${error instanceof Error ? error.message : String(error)}`); }
}
const tracked = micro(reports.map(({ report }) => report.tracked));
const rawReports = reports.flatMap(({ report }) => report.raw ? [report.raw] : []);
console.log(JSON.stringify({
  split, clips: clips.length, labeledClips: reports.length, complete: reports.length === clips.length && failures.length === 0,
  missingLabels, failures, tracked, raw: rawReports.length === reports.length ? micro(rawReports) : null,
  perClip: Object.fromEntries(reports.map(({ id, report }) => [id, report])),
}, null, 2));
if (!reports.length || failures.length) process.exitCode = 1;
