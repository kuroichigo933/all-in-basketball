import test from "node:test";
import assert from "node:assert/strict";
import { combineEvaluations, evaluateDetections } from "../lib/motion/evaluate.ts";

test("matches move name and timestamp with tolerance", () => {
  const metrics = evaluateDetections(
    [{ move: "crossover", startMs: 1000, endMs: 1300 }],
    [{ move: "crossover", startMs: 1250, endMs: 1500, confidence: 0.8, evidence: [] }],
  );
  assert.equal(metrics.truePositives, 1);
  assert.equal(metrics.f1, 1);
});

test("counts wrong labels and missing events", () => {
  const metrics = evaluateDetections(
    [{ move: "crossover", startMs: 1000, endMs: 1300 }],
    [{ move: "hesitation", startMs: 1000, endMs: 1300, confidence: 0.8, evidence: [] }],
  );
  assert.deepEqual([metrics.truePositives, metrics.falsePositives, metrics.falseNegatives], [0, 1, 1]);
  assert.equal(metrics.meets95Percent, false);
});

test("combines clip counts without macro-average distortion", () => {
  const metrics = combineEvaluations([
    { truePositives: 19, falsePositives: 1, falseNegatives: 1 },
    { truePositives: 1, falsePositives: 0, falseNegatives: 0 },
  ]);
  assert.equal(metrics.truePositives, 20);
  assert.equal(metrics.falsePositives, 1);
  assert.equal(metrics.falseNegatives, 1);
  assert.ok(Math.abs(metrics.f1 - 20 / 21) < 0.0001);
  assert.equal(metrics.meets95Percent, true);
});
