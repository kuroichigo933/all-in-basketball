import test from "node:test";
import assert from "node:assert/strict";
import { parsePrepareArgs } from "../scripts/prepare-validation.ts";
import { evaluateGates, selectSplit, validateManifest } from "../lib/motion/validation.ts";

test("parses arbitrary validation source paths", () => {
  assert.deepEqual(parsePrepareArgs(["--input", "D:/clip.mov", "--id", "behind-01", "--move", "behind-the-back"]), { input: "D:/clip.mov", id: "behind-01", move: "behind-the-back", segmentSeconds: 20 });
  assert.throws(() => parsePrepareArgs(["--input", "clip.mov", "--id", "x", "--move", "unknown"]));
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
  assert.equal(gates.fiveClassRelease.status, "blocked");
});

test("validates split-aware manifests", () => {
  const manifest = { schemaVersion: 2, clips: [{ id: "a", sourceId: "s", segmentId: "001", cohort: "controlled", split: "holdout", observations: "a.json", expected: [] }] };
  assert.equal(validateManifest(manifest).clips[0].split, "holdout");
  assert.throws(() => validateManifest({ ...manifest, clips: [{ ...manifest.clips[0], sourceId: "" }] }));
});
