import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { evaluateBallIdentity, type BallIdentityMetrics, type BallOcclusionMetrics } from "../lib/motion/evaluateBall.ts";
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

const manifestPath = resolve(option("--manifest", "validation/manifest.json"));
const split = option("--split", "calibration") as ValidationSplit;
const allowIncomplete = process.argv.includes("--allow-incomplete");
const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
const clips = selectSplit(manifest, split);
const missingLabels: string[] = [];
const failures: string[] = [];
const incompleteProtocols: string[] = [];
const reports: Array<{ id: string; source: "sidecar" | "embedded"; report: ReturnType<typeof evaluateBallIdentity> }> = [];
for (const clip of clips) {
  try {
    const data = JSON.parse(readFileSync(resolve(dirname(manifestPath), clip.observations), "utf8")) as AnalysisExport;
    const sidecarPath = resolve(dirname(manifestPath), "labels", "ball", `${clip.id}.json`);
    let labels: unknown = data.ballLabels; let source: "sidecar" | "embedded" = "embedded";
    if (existsSync(sidecarPath)) {
      const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8")) as { schemaVersion?: number; clipId?: string; protocol?: { scheduledTimesMs?: number[] }; labels?: unknown };
      if (sidecar.schemaVersion !== 1 || sidecar.clipId !== clip.id) throw new Error(`Invalid ball-label sidecar: ${sidecarPath}`);
      labels = sidecar.labels; source = "sidecar";
      if (sidecar.protocol?.scheduledTimesMs) {
        const labelTimes = new Set(Array.isArray(sidecar.labels) ? sidecar.labels.map((label) => (label as { timeMs?: number }).timeMs) : []);
        if (sidecar.protocol.scheduledTimesMs.some((timeMs) => !labelTimes.has(timeMs))) incompleteProtocols.push(clip.id);
      }
    }
    if (!Array.isArray(labels) || !labels.length) { missingLabels.push(clip.id); continue; }
    reports.push({ id: clip.id, source, report: evaluateBallIdentity(labels, data.observations) });
  } catch (error) { failures.push(`${clip.id}: ${error instanceof Error ? error.message : String(error)}`); }
}
const tracked = micro(reports.map(({ report }) => report.tracked));
const rawReports = reports.flatMap(({ report }) => report.raw ? [report.raw] : []);
const occlusion = microOcclusion(reports.map(({ report }) => report.occlusion));
const complete = reports.length === clips.length && failures.length === 0 && incompleteProtocols.length === 0;
console.log(JSON.stringify({
  split, clips: clips.length, labeledClips: reports.length, complete,
  missingLabels, incompleteProtocols, failures, tracked, raw: rawReports.length === reports.length ? micro(rawReports) : null, occlusion,
  perClip: Object.fromEntries(reports.map(({ id, source, report }) => [id, { source, ...report }])),
}, null, 2));
if (!reports.length || failures.length || (!complete && !allowIncomplete)) process.exitCode = 1;
