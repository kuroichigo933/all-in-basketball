import test from "node:test";
import assert from "node:assert/strict";
import { buildValidationSegmentArgs, parsePrepareArgs } from "../scripts/prepare-validation.ts";
import { parseMoveLabelCsv, segmentMoveLabels } from "../lib/motion/moveLabelCsv.ts";
import { parseMixedImportArgs } from "../scripts/import-mixed-validation.ts";
import { resolveValidationObservationsDirectory, validationObservationPath } from "../lib/motion/validationObservations.ts";
import { resolve } from "node:path";
import { evaluateGates, parseMoveSelection, selectSplit, validateAnalysisExport, validateManifest } from "../lib/motion/validation.ts";

test("parses arbitrary validation source paths", () => {
  assert.deepEqual(parsePrepareArgs(["--input", "D:/clip.mov", "--id", "behind-01", "--move", "behind-the-back"]), { input: "D:/clip.mov", id: "behind-01", move: "behind-the-back", segmentSeconds: 20 });
  assert.deepEqual(parsePrepareArgs(["--input", "D:/mixed.mov", "--id", "mixed-01", "--move", "mixed", "--duration-seconds", "84"]), { input: "D:/mixed.mov", id: "mixed-01", move: "mixed", segmentSeconds: 20, durationSeconds: 84 });
  assert.throws(() => parsePrepareArgs(["--input", "clip.mov", "--id", "x", "--move", "unknown"]));
});

test("forces browser-compatible 8-bit H.264 segment output", () => {
  const args = buildValidationSegmentArgs("source.mov", "target.mp4", 20, 20);
  assert.deepEqual(args.slice(args.indexOf("-c:v"), args.indexOf("-preset")), ["-c:v", "libx264", "-pix_fmt", "yuv420p"]);
  assert.ok(args.includes("+faststart"));
});

test("normalizes mixed-move CSV and rejects overlapping labels", () => {
  const labels = parseMoveLabelCsv("start,end,move\n00:14.0,00:14.8,crossover,\n01:04.0,01:04.5,behind the back,", 84_000);
  assert.deepEqual(labels.map((label) => ({ ...label })), [
    { startMs: 14_000, endMs: 14_800, move: "crossover" },
    { startMs: 64_000, endMs: 64_500, move: "behind-the-back" },
  ]);
  assert.throws(() => parseMoveLabelCsv("start,end,move\n00:10.0,00:11.0,crossover\n00:10.5,00:11.5,crossover", 20_000), /Overlapping/);
});

test("segments mixed labels without moving boundary-spanning events", () => {
  const labels = parseMoveLabelCsv("start,end,move\n00:19.8,00:20.2,crossover\n00:20.2,00:21.0,between-the-legs", 40_000);
  const result = segmentMoveLabels(labels, 40_000, 20_000);
  assert.equal(result.boundaryExcluded.length, 1);
  assert.deepEqual(result.segments[1].expected, [{ startMs: 200, endMs: 1_000, move: "between-the-legs" }]);
});

test("parses calibration-only mixed manifest import arguments", () => {
  assert.deepEqual(parseMixedImportArgs(["--csv", "labels.csv", "--source-id", "mixed-01", "--duration-seconds", "84"]), {
    csv: "labels.csv", sourceId: "mixed-01", cohort: "controlled-front-camera-mixed", durationSeconds: 84, segmentSeconds: 20,
    output: "validation/local/manifests/mixed-01.json",
  });
});

test("keeps calibration and holdout isolated and blocks missing release classes", () => {
  const manifest = validateManifest({ schemaVersion: 2, clips: [
    { id: "a", sourceId: "s", segmentId: "001", cohort: "controlled", split: "calibration", observations: "a.json", expected: [] },
    { id: "b", sourceId: "s", segmentId: "002", cohort: "controlled", split: "holdout", observations: "b.json", expected: [] },
  ] });
  assert.deepEqual(selectSplit(manifest, "calibration").map((clip) => clip.id), ["a"]);
  const metrics = { truePositives: 20, falsePositives: 0, falseNegatives: 0, precision: 1, recall: 1, f1: 1, meets95Percent: true };
  const gates = evaluateGates([{ move: "behind-the-back", startMs: 0, endMs: 1 }, { move: "between-the-legs", startMs: 2, endMs: 3 }], metrics);
  assert.equal(gates.controlledTwoClass.status, "pass");
  assert.equal(gates.liveThreeMove.status, "blocked");
  assert.equal(gates.fiveClassRelease.status, "blocked");
});

test("selects all three live moves for mixed calibration and reports its gate", () => {
  assert.deepEqual(parseMoveSelection("crossover,between-the-legs,behind-the-back"), ["crossover", "between-the-legs", "behind-the-back"]);
  assert.throws(() => parseMoveSelection("crossover,unknown"), /Invalid move selection/);
  const metrics = { truePositives: 60, falsePositives: 2, falseNegatives: 2, precision: 60 / 62, recall: 60 / 62, f1: 60 / 62, meets95Percent: true };
  const labels = ["crossover", "between-the-legs", "behind-the-back"].map((move, index) => ({ move: move as "crossover" | "between-the-legs" | "behind-the-back", startMs: index * 2, endMs: index * 2 + 1 }));
  assert.equal(evaluateGates(labels, metrics, metrics).liveThreeMove.status, "pass");
});

test("validates split-aware manifests", () => {
  const manifest = { schemaVersion: 2, clips: [{ id: "a", sourceId: "s", segmentId: "001", cohort: "controlled", split: "holdout", observations: "a.json", expected: [] }] };
  assert.equal(validateManifest(manifest).clips[0].split, "holdout");
  assert.throws(() => validateManifest({ ...manifest, clips: [{ ...manifest.clips[0], sourceId: "" }] }));
});

test("rejects malformed source-of-truth labels and duplicate clips", () => {
  const clip = { id: "a", sourceId: "s", segmentId: "001", cohort: "controlled", split: "calibration", observations: "a.json",
    expected: [{ move: "crossover", startMs: 100, endMs: 200 }] };
  assert.throws(() => validateManifest({ schemaVersion: 2, toleranceMs: -1, clips: [clip] }), /toleranceMs/);
  assert.throws(() => validateManifest({ schemaVersion: 2, clips: [clip, { ...clip }] }), /Duplicate validation clip/);
  assert.throws(() => validateManifest({ schemaVersion: 2, clips: [clip, { ...clip, id: "b" }] }), /Duplicate validation source\/segment/);
  assert.throws(() => validateManifest({ schemaVersion: 2, clips: [{ ...clip, expected: [
    { move: "crossover", startMs: 100, endMs: 300 },
    { move: "behind-the-back", startMs: 250, endMs: 400 },
  ] }] }), /Overlapping or unsorted/);
  assert.throws(() => validateManifest({ schemaVersion: 2, clips: [{ ...clip, expected: [
    { move: "unknown", startMs: 100, endMs: 200 },
  ] }] }), /Invalid expected move/);
});

test("validates observation exports before tuning or evaluation", () => {
  const observation = { timeMs: 0, poseConfidence: 0.8, ballConfidence: 0.7, ball: { x: 0.4, y: 0.6 } };
  const data = { schemaVersion: 2, clip: { id: "clip-a" }, sampleIntervalMs: 100, observations: [observation], labels: [], result: null };
  assert.equal(validateAnalysisExport(data, "clip-a").observations.length, 1);
  assert.throws(() => validateAnalysisExport(data, "clip-b"), /belongs to/);
  assert.throws(() => validateAnalysisExport({ ...data, observations: [observation, { ...observation, timeMs: 0 }] }), /out-of-order/);
  assert.throws(() => validateAnalysisExport({ ...data, observations: [{ ...observation, ball: { x: 1.1, y: 0.5 } }] }), /ball position/);
});

test("validates optional detector capture metadata", () => {
  const manifest = { schemaVersion: 2, clips: [{ id: "a", sourceId: "s", segmentId: "001", cohort: "controlled", split: "calibration", observations: "a.json", expected: [] }] };
  assert.equal(validateManifest({ ...manifest, clips: [{ ...manifest.clips[0], capture: {
    ballAppearance: " black ", playerId: " player-b ", lighting: " indoor ", hardNegative: true,
  } }] }).clips[0].capture?.ballAppearance, "black");
  assert.throws(() => validateManifest({ ...manifest, clips: [{ ...manifest.clips[0], capture: {
    ballAppearance: "", playerId: "player-b", lighting: "indoor", hardNegative: true,
  } }] }), /capture metadata/);
});

test("confines named observation overrides to local validation data", () => {
  const directory = resolveValidationObservationsDirectory("validation/local/repeatability/run-a");
  assert.equal(directory, resolve("validation/local/repeatability/run-a"));
  assert.equal(validationObservationPath(resolve("validation/local/manifests"),
    { id: "clip-001", observations: "../../observations/clip-001.json" }, directory), resolve(directory, "clip-001.json"));
  assert.equal(validationObservationPath(resolve("validation/local/manifests"),
    { id: "clip-001", observations: "../../observations/clip-001.json" }), resolve("validation/observations/clip-001.json"));
  assert.throws(() => resolveValidationObservationsDirectory("validation/observations"), /validation\/local/);
});
