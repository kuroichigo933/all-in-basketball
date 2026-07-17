import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { assessBallDetectorCollectionReadiness, createBallDatasetSamples, requireCalibrationDatasetSplit, yoloBallLabel, type BallDetectorDatasetSample } from "../lib/motion/ballDataset.ts";
import { validateBallIdentityEvaluationLabels } from "../lib/motion/evaluateBall.ts";
import { selectSplit, validateBallCaptureMetadata, validateManifest, type BallCaptureMetadata, type ValidationSplit } from "../lib/motion/validation.ts";

export type BallDatasetArgs = { manifest: string; additionalManifests: string[]; split: "calibration"; output: string };

function valueAfter(argv: string[], name: string, fallback: string) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  if (!argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error(`Missing value for ${name}.`);
  return argv[index + 1];
}

export function parseBallDatasetArgs(argv: string[]): BallDatasetArgs {
  const split = valueAfter(argv, "--split", "calibration");
  requireCalibrationDatasetSplit(split);
  const additionalManifests = valueAfter(argv, "--additional-manifests", "").split(",").map((value) => value.trim()).filter(Boolean);
  return {
    manifest: valueAfter(argv, "--manifest", "validation/manifest.json"),
    additionalManifests,
    split,
    output: valueAfter(argv, "--output", "validation/local/ball-dataset/calibration-representative-v1"),
  };
}

export function resolveSafeBallDatasetOutput(output: string, localRoot = resolve("validation/local")) {
  const target = resolve(output);
  const pathFromRoot = relative(localRoot, target);
  if (!pathFromRoot || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw new Error("Ball detector dataset output must be a child of validation/local/.");
  }
  return target;
}

type Sidecar = {
  schemaVersion?: number;
  clipId?: string;
  protocol?: { name?: string; scheduledTimesMs?: number[] };
  labels?: unknown;
  capture?: unknown;
};

function readSidecar(path: string, clipId: string) {
  if (!existsSync(path)) throw new Error(`Missing ball-label sidecar for ${clipId}: ${path}`);
  const sidecar = JSON.parse(readFileSync(path, "utf8")) as Sidecar;
  if (sidecar.schemaVersion !== 1 || sidecar.clipId !== clipId) throw new Error(`Invalid ball-label sidecar for ${clipId}.`);
  const labels = validateBallIdentityEvaluationLabels(sidecar.labels);
  if (sidecar.protocol?.scheduledTimesMs) {
    const actual = new Set(labels.map((label) => label.timeMs));
    const missing = sidecar.protocol.scheduledTimesMs.filter((timeMs) => !actual.has(timeMs));
    if (missing.length) throw new Error(`Incomplete ball-label protocol for ${clipId}: missing ${missing.join(", ")} ms.`);
  }
  const capture = sidecar.capture === undefined ? undefined : validateBallCaptureMetadata(sidecar.capture);
  return { labels, protocol: sidecar.protocol?.name ?? null, capture };
}

export function requireUniqueBallDatasetClipIds(clips: Array<{ id: string }>) {
  const clipIds = new Set<string>();
  for (const clip of clips) {
    if (clipIds.has(clip.id)) throw new Error(`Duplicate calibration clip ID across manifests: ${clip.id}.`);
    clipIds.add(clip.id);
  }
}

function captureMatches(left: BallCaptureMetadata, right: BallCaptureMetadata) {
  return left.ballAppearance === right.ballAppearance && left.playerId === right.playerId &&
    left.lighting === right.lighting && left.hardNegative === right.hardNegative;
}

export function resolveBallDatasetCaptureMetadata(
  manifestCapture?: BallCaptureMetadata,
  sidecarCapture?: BallCaptureMetadata,
) {
  if (manifestCapture && sidecarCapture && !captureMatches(manifestCapture, sidecarCapture)) {
    throw new Error("Capture metadata disagrees between manifest and ball-label sidecar.");
  }
  return sidecarCapture ?? manifestCapture;
}

function extractFrame(video: string, timeMs: number, target: string) {
  const result = spawnSync("ffmpeg", [
    "-v", "error", "-y", "-i", video, "-ss", (timeMs / 1000).toFixed(3),
    "-frames:v", "1", "-q:v", "2", target,
  ], { encoding: "utf8" });
  if (result.status !== 0 || !existsSync(target)) {
    throw new Error(`ffmpeg could not extract ${video} at ${timeMs} ms: ${result.stderr?.trim() || "unknown error"}`);
  }
}

export function exportBallDataset(args: BallDatasetArgs) {
  const manifestPaths = [args.manifest, ...args.additionalManifests].map((path) => resolve(path));
  const output = resolveSafeBallDatasetOutput(args.output);
  const clipInputs = manifestPaths.flatMap((manifestPath) => {
    const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
    return selectSplit(manifest, args.split).map((clip) => ({ clip, manifestRoot: dirname(manifestPath) }));
  });
  if (!clipInputs.length) throw new Error("No calibration clips were found.");
  requireUniqueBallDatasetClipIds(clipInputs.map(({ clip }) => clip));
  const protocols = new Set<string>();
  let occludedExcluded = 0;
  const prepared = clipInputs.map(({ clip, manifestRoot }) => {
    if (!clip.video) throw new Error(`Validation clip ${clip.id} has no local video path.`);
    const video = resolve(manifestRoot, clip.video);
    if (!existsSync(video)) throw new Error(`Validation video not found for ${clip.id}: ${video}`);
    const sidecarPath = resolve(manifestRoot, "labels", "ball", `${clip.id}.json`);
    const { labels, protocol, capture } = readSidecar(sidecarPath, clip.id);
    let resolvedCapture: BallCaptureMetadata | undefined;
    try { resolvedCapture = resolveBallDatasetCaptureMetadata(clip.capture, capture); }
    catch { throw new Error(`Capture metadata disagrees between manifest and ball-label sidecar for ${clip.id}.`); }
    if (protocol) protocols.add(protocol);
    occludedExcluded += labels.filter((label) => label.visibility === "occluded").length;
    return { video, labels, clip: { ...clip, ...(resolvedCapture ? { capture: resolvedCapture } : {}) }, samples: createBallDatasetSamples(clip, labels) };
  });
  const samples: BallDetectorDatasetSample[] = prepared.flatMap((item) => item.samples);
  const collectionReadiness = assessBallDetectorCollectionReadiness(prepared.map((item) => item.clip), samples);

  const visible = samples.filter((sample) => sample.visibility === "visible").length;
  const absent = samples.length - visible;
  const trainingEligible = samples.filter((sample) => sample.trainingEligible).length;
  const difficultExcluded = samples.length - trainingEligible;
  const index = {
    schemaVersion: 1,
    format: "yolo-detection",
    classNames: ["basketball"],
    split: args.split,
    sourceManifest: relative(output, manifestPaths[0]).replaceAll("\\", "/"),
    sourceManifests: manifestPaths.map((manifestPath) => relative(output, manifestPath).replaceAll("\\", "/")),
    protocols: Array.from(protocols).sort(),
    samples,
    summary: { clips: clipInputs.length, samples: samples.length, trainingEligible, difficultExcluded, visible, absent, occludedExcluded },
    collectionReadiness,
    limitations: [
      "Calibration examples only; do not treat this package as an independent validation set.",
      "Occluded labels are excluded because they are neither positive boxes nor true absent-ball negatives.",
      "Extremely small partial boxes are retained under excluded/ for audit but omitted from the default training directories.",
      "Create source-disjoint training and validation partitions only after collecting additional source recordings.",
    ],
  };
  const staging = `${output}.tmp`;
  rmSync(staging, { recursive: true, force: true });
  try {
    mkdirSync(resolve(staging, "images"), { recursive: true });
    mkdirSync(resolve(staging, "labels"), { recursive: true });
    mkdirSync(resolve(staging, "excluded", "images"), { recursive: true });
    mkdirSync(resolve(staging, "excluded", "labels"), { recursive: true });
    for (const item of prepared) {
      for (const sample of item.samples) {
        const label = item.labels.find((candidate) => candidate.timeMs === sample.timeMs)!;
        extractFrame(item.video, sample.timeMs, resolve(staging, sample.image));
        writeFileSync(resolve(staging, sample.label), yoloBallLabel(label)!, "utf8");
      }
    }
    writeFileSync(resolve(staging, "dataset.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
    rmSync(output, { recursive: true, force: true });
    renameSync(staging, output);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  console.log(JSON.stringify({ output, ...index.summary, collectionReadiness }, null, 2));
  return index;
}

if (process.argv[1]?.endsWith("export-ball-dataset.ts")) {
  exportBallDataset(parseBallDatasetArgs(process.argv.slice(2)));
}
