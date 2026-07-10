import type { MoveDetection, MoveName } from "./types.ts";

export type ExpectedMove = { move: MoveName; startMs: number; endMs: number };
export type EvaluationCounts = { truePositives: number; falsePositives: number; falseNegatives: number };
export type EvaluationMetrics = EvaluationCounts & { precision: number; recall: number; f1: number; meets95Percent: boolean };

export function metricsFromCounts(counts: EvaluationCounts): EvaluationMetrics {
  const { truePositives, falsePositives, falseNegatives } = counts;
  const precision = truePositives + falsePositives ? truePositives / (truePositives + falsePositives) : falseNegatives ? 0 : 1;
  const recall = truePositives + falseNegatives ? truePositives / (truePositives + falseNegatives) : 1;
  const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
  return { ...counts, precision, recall, f1, meets95Percent: precision >= 0.95 && recall >= 0.95 };
}

function overlaps(expected: ExpectedMove, actual: MoveDetection, toleranceMs: number) {
  return actual.startMs <= expected.endMs + toleranceMs && actual.endMs >= expected.startMs - toleranceMs;
}

export function evaluateDetections(expected: ExpectedMove[], actual: MoveDetection[], toleranceMs = 300): EvaluationMetrics {
  const matchedActual = new Set<number>();
  let truePositives = 0;
  for (const label of expected) {
    const match = actual.findIndex((detection, index) =>
      !matchedActual.has(index) && detection.move === label.move && overlaps(label, detection, toleranceMs));
    if (match >= 0) { matchedActual.add(match); truePositives += 1; }
  }
  const falsePositives = actual.length - matchedActual.size;
  const falseNegatives = expected.length - truePositives;
  return metricsFromCounts({ truePositives, falsePositives, falseNegatives });
}

export function combineEvaluations(counts: EvaluationCounts[]): EvaluationMetrics {
  const totals = counts.reduce((sum, item) => ({
    truePositives: sum.truePositives + item.truePositives,
    falsePositives: sum.falsePositives + item.falsePositives,
    falseNegatives: sum.falseNegatives + item.falseNegatives,
  }), { truePositives: 0, falsePositives: 0, falseNegatives: 0 });
  return metricsFromCounts(totals);
}
