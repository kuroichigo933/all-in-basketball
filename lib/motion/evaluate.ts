import type { MoveDetection, MoveName } from "./types.ts";

export type ExpectedMove = { move: MoveName; startMs: number; endMs: number };
export type EvaluationCounts = { truePositives: number; falsePositives: number; falseNegatives: number };
export type EvaluationMetrics = EvaluationCounts & { precision: number; recall: number; f1: number; meets95Percent: boolean };
export type MoveConfusionReport = {
  matched: Partial<Record<MoveName, Partial<Record<MoveName, number>>>>;
  missed: Partial<Record<MoveName, number>>;
  spurious: Partial<Record<MoveName, number>>;
};

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

const eventCenter = (event: { startMs: number; endMs: number }) => (event.startMs + event.endMs) / 2;
const increment = (record: Partial<Record<MoveName, number>>, move: MoveName) => { record[move] = (record[move] ?? 0) + 1; };

/** Matches events by time regardless of class so class substitutions remain visible. */
export function evaluateMoveConfusion(expected: ExpectedMove[], actual: MoveDetection[], toleranceMs = 300): MoveConfusionReport {
  const candidates = expected.flatMap((label, expectedIndex) => actual.flatMap((detection, actualIndex) =>
    overlaps(label, detection, toleranceMs) ? [{ expectedIndex, actualIndex,
      centerDistance: Math.abs(eventCenter(label) - eventCenter(detection)) }] : []))
    .sort((a, b) => a.centerDistance - b.centerDistance || a.expectedIndex - b.expectedIndex || a.actualIndex - b.actualIndex);
  const matchedExpected = new Set<number>(); const matchedActual = new Set<number>();
  const report: MoveConfusionReport = { matched: {}, missed: {}, spurious: {} };
  for (const candidate of candidates) {
    if (matchedExpected.has(candidate.expectedIndex) || matchedActual.has(candidate.actualIndex)) continue;
    matchedExpected.add(candidate.expectedIndex); matchedActual.add(candidate.actualIndex);
    const expectedMove = expected[candidate.expectedIndex].move; const actualMove = actual[candidate.actualIndex].move;
    const row = report.matched[expectedMove] ?? {}; increment(row, actualMove); report.matched[expectedMove] = row;
  }
  expected.forEach((label, index) => { if (!matchedExpected.has(index)) increment(report.missed, label.move); });
  actual.forEach((detection, index) => { if (!matchedActual.has(index)) increment(report.spurious, detection.move); });
  return report;
}

export function combineMoveConfusions(reports: MoveConfusionReport[]): MoveConfusionReport {
  const combined: MoveConfusionReport = { matched: {}, missed: {}, spurious: {} };
  for (const report of reports) {
    for (const [expectedMove, row] of Object.entries(report.matched) as Array<[MoveName, Partial<Record<MoveName, number>>]>) {
      const target = combined.matched[expectedMove] ?? {};
      for (const [actualMove, count] of Object.entries(row) as Array<[MoveName, number]>) target[actualMove] = (target[actualMove] ?? 0) + count;
      combined.matched[expectedMove] = target;
    }
    for (const [move, count] of Object.entries(report.missed) as Array<[MoveName, number]>) combined.missed[move] = (combined.missed[move] ?? 0) + count;
    for (const [move, count] of Object.entries(report.spurious) as Array<[MoveName, number]>) combined.spurious[move] = (combined.spurious[move] ?? 0) + count;
  }
  return combined;
}
