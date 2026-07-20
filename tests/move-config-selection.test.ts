import test from "node:test";
import assert from "node:assert/strict";
import { metricsFromCounts } from "../lib/motion/evaluate.ts";
import { isBetterRobustMoveScore, summarizeRobustMoveScore } from "../lib/motion/moveConfigSelection.ts";

test("robust move tuning favors the better worst replay over pooled overfit", () => {
  const stableRuns = [metricsFromCounts({ truePositives: 88, falsePositives: 12, falseNegatives: 12 }),
    metricsFromCounts({ truePositives: 88, falsePositives: 12, falseNegatives: 12 })];
  const unstableRuns = [metricsFromCounts({ truePositives: 80, falsePositives: 20, falseNegatives: 20 }),
    metricsFromCounts({ truePositives: 99, falsePositives: 1, falseNegatives: 1 })];
  const stable = summarizeRobustMoveScore(stableRuns, metricsFromCounts({ truePositives: 176, falsePositives: 24, falseNegatives: 24 }));
  const unstable = summarizeRobustMoveScore(unstableRuns, metricsFromCounts({ truePositives: 179, falsePositives: 21, falseNegatives: 21 }));
  assert.ok(unstable.pooledF1 > stable.pooledF1);
  assert.equal(isBetterRobustMoveScore(stable, unstable), true);
});

test("robust move tuning uses mean, spread, and precision as deterministic tie breakers", () => {
  const base = { minimumF1: 0.8, meanF1: 0.85, spread: 0.1, pooledF1: 0.85, pooledPrecision: 0.8, perRun: [] };
  assert.equal(isBetterRobustMoveScore({ ...base, meanF1: 0.86 }, base), true);
  assert.equal(isBetterRobustMoveScore({ ...base, spread: 0.09 }, base), true);
  assert.equal(isBetterRobustMoveScore({ ...base, pooledPrecision: 0.81 }, base), true);
});
