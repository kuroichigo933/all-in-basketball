import type { EvaluationCounts, EvaluationMetrics } from "./evaluate.ts";

export type RobustMoveScore = {
  minimumF1: number;
  meanF1: number;
  spread: number;
  pooledF1: number;
  pooledPrecision: number;
  perRun: EvaluationMetrics[];
};

export function summarizeRobustMoveScore(perRun: EvaluationMetrics[], pooled: EvaluationMetrics): RobustMoveScore {
  if (!perRun.length) throw new Error("Move tuning requires at least one calibration run.");
  const values = perRun.map((metrics) => metrics.f1);
  const minimumF1 = Math.min(...values); const maximumF1 = Math.max(...values);
  return { minimumF1, meanF1: values.reduce((sum, value) => sum + value, 0) / values.length,
    spread: maximumF1 - minimumF1, pooledF1: pooled.f1, pooledPrecision: pooled.precision, perRun };
}

/** Lexicographic selection prevents one strong replay from hiding a weak replay. */
export function isBetterRobustMoveScore(candidate: RobustMoveScore, current: RobustMoveScore | null) {
  if (!current) return true;
  if (candidate.minimumF1 !== current.minimumF1) return candidate.minimumF1 > current.minimumF1;
  if (candidate.meanF1 !== current.meanF1) return candidate.meanF1 > current.meanF1;
  if (candidate.spread !== current.spread) return candidate.spread < current.spread;
  if (candidate.pooledF1 !== current.pooledF1) return candidate.pooledF1 > current.pooledF1;
  return candidate.pooledPrecision > current.pooledPrecision;
}

export const evaluationCounts = (metrics: EvaluationMetrics): EvaluationCounts => ({
  truePositives: metrics.truePositives, falsePositives: metrics.falsePositives, falseNegatives: metrics.falseNegatives,
});
