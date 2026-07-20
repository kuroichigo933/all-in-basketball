import test from "node:test";
import assert from "node:assert/strict";
import { combineEvaluations, combineMoveConfusions, evaluateDetections, evaluateMoveConfusion, matchDetections, matchMoveConfusions } from "../lib/motion/evaluate.ts";

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

test("reports temporally aligned class substitutions separately from misses", () => {
  const report = evaluateMoveConfusion([
    { move: "behind-the-back", startMs: 1000, endMs: 1300 },
    { move: "behind-the-back", startMs: 2000, endMs: 2300 },
  ], [
    { move: "crossover", startMs: 1050, endMs: 1350, confidence: 0.8, evidence: [] },
    { move: "hesitation", startMs: 4000, endMs: 4300, confidence: 0.7, evidence: [] },
  ]);
  assert.equal(report.matched["behind-the-back"]?.crossover, 1);
  assert.equal(report.missed["behind-the-back"], 1);
  assert.equal(report.spurious.hesitation, 1);
});

test("exposes the exact expected and actual indices for class substitutions", () => {
  const expected = [
    { move: "between-the-legs" as const, startMs: 1000, endMs: 1400 },
    { move: "behind-the-back" as const, startMs: 3000, endMs: 3400 },
  ];
  const actual = [
    { move: "crossover" as const, startMs: 1100, endMs: 1500, confidence: 0.8, evidence: [] },
    { move: "behind-the-back" as const, startMs: 5000, endMs: 5400, confidence: 0.8, evidence: [] },
  ];
  const matches = matchMoveConfusions(expected, actual);
  assert.deepEqual(matches.pairs, [{ expectedIndex: 0, actualIndex: 0 }]);
  assert.deepEqual(matches.unmatchedExpected, [1]);
  assert.deepEqual(matches.unmatchedActual, [1]);
});

test("matches rapid neighboring events one-to-one by nearest center and combines reports", () => {
  const report = evaluateMoveConfusion([
    { move: "crossover", startMs: 1000, endMs: 1200 },
    { move: "between-the-legs", startMs: 1400, endMs: 1600 },
  ], [
    { move: "between-the-legs", startMs: 1420, endMs: 1620, confidence: 0.8, evidence: [] },
    { move: "crossover", startMs: 1020, endMs: 1220, confidence: 0.8, evidence: [] },
  ]);
  const combined = combineMoveConfusions([report, report]);
  assert.equal(combined.matched.crossover?.crossover, 2);
  assert.equal(combined.matched["between-the-legs"]?.["between-the-legs"], 2);
  assert.deepEqual(combined.missed, {}); assert.deepEqual(combined.spurious, {});
});

test("maximizes rapid same-class matches before minimizing timing error", () => {
  const expected = [
    { move: "crossover" as const, startMs: 0, endMs: 100 },
    { move: "crossover" as const, startMs: 400, endMs: 500 },
  ];
  const actual = [
    { move: "crossover" as const, startMs: 350, endMs: 350, confidence: 0.8, evidence: [] },
    { move: "crossover" as const, startMs: 0, endMs: 0, confidence: 0.8, evidence: [] },
  ];
  const matches = matchDetections(expected, actual, 300);
  assert.equal(matches.pairs.length, 2);
  assert.equal(evaluateDetections(expected, actual, 300).f1, 1);
});
