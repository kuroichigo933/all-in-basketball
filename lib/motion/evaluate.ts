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

type DetectionMatch = { expectedIndex: number; actualIndex: number };
type MatchState = { count: number; timingError: number; pairs: DetectionMatch[] };

const betterMatchState = (candidate: MatchState, current: MatchState) => candidate.count > current.count ||
  candidate.count === current.count && candidate.timingError < current.timingError ? candidate : current;

/**
 * Finds the maximum number of same-class temporal matches, then minimizes
 * event-center error. Dynamic programming prevents a broad rapid-move
 * detection from greedily consuming the only valid match for its neighbor.
 */
export function matchDetections(expected: ExpectedMove[], actual: MoveDetection[], toleranceMs = 300) {
  const pairs: DetectionMatch[] = [];
  const moves = new Set<MoveName>([...expected.map((event) => event.move), ...actual.map((event) => event.move)]);
  for (const move of Array.from(moves)) {
    const expectedEvents = expected.map((event, index) => ({ event, index })).filter(({ event }) => event.move === move)
      .sort((a, b) => eventCenter(a.event) - eventCenter(b.event));
    const actualEvents = actual.map((event, index) => ({ event, index })).filter(({ event }) => event.move === move)
      .sort((a, b) => eventCenter(a.event) - eventCenter(b.event));
    const table: MatchState[][] = Array.from({ length: expectedEvents.length + 1 }, () =>
      Array.from({ length: actualEvents.length + 1 }, () => ({ count: 0, timingError: 0, pairs: [] })));
    for (let i = 1; i <= expectedEvents.length; i += 1) {
      for (let j = 1; j <= actualEvents.length; j += 1) {
        let best = betterMatchState(table[i - 1][j], table[i][j - 1]);
        const expectedEvent = expectedEvents[i - 1]; const actualEvent = actualEvents[j - 1];
        if (overlaps(expectedEvent.event, actualEvent.event, toleranceMs)) {
          const prior = table[i - 1][j - 1];
          const matched: MatchState = { count: prior.count + 1,
            timingError: prior.timingError + Math.abs(eventCenter(expectedEvent.event) - eventCenter(actualEvent.event)),
            pairs: [...prior.pairs, { expectedIndex: expectedEvent.index, actualIndex: actualEvent.index }] };
          best = betterMatchState(matched, best);
        }
        table[i][j] = best;
      }
    }
    pairs.push(...table[expectedEvents.length][actualEvents.length].pairs);
  }
  const matchedExpected = new Set(pairs.map((pair) => pair.expectedIndex));
  const matchedActual = new Set(pairs.map((pair) => pair.actualIndex));
  return { pairs, unmatchedExpected: expected.map((_, index) => index).filter((index) => !matchedExpected.has(index)),
    unmatchedActual: actual.map((_, index) => index).filter((index) => !matchedActual.has(index)) };
}

export function evaluateDetections(expected: ExpectedMove[], actual: MoveDetection[], toleranceMs = 300): EvaluationMetrics {
  const matches = matchDetections(expected, actual, toleranceMs);
  const truePositives = matches.pairs.length;
  const falsePositives = matches.unmatchedActual.length;
  const falseNegatives = matches.unmatchedExpected.length;
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

function eventCenter(event: { startMs: number; endMs: number }) { return (event.startMs + event.endMs) / 2; }
const increment = (record: Partial<Record<MoveName, number>>, move: MoveName) => { record[move] = (record[move] ?? 0) + 1; };

/** Matches events by time regardless of class so class substitutions remain visible. */
export function evaluateMoveConfusion(expected: ExpectedMove[], actual: MoveDetection[], toleranceMs = 300): MoveConfusionReport {
  const matches = matchMoveConfusions(expected, actual, toleranceMs);
  const report: MoveConfusionReport = { matched: {}, missed: {}, spurious: {} };
  for (const pair of matches.pairs) {
    const expectedMove = expected[pair.expectedIndex].move; const actualMove = actual[pair.actualIndex].move;
    const row = report.matched[expectedMove] ?? {}; increment(row, actualMove); report.matched[expectedMove] = row;
  }
  matches.unmatchedExpected.forEach((index) => increment(report.missed, expected[index].move));
  matches.unmatchedActual.forEach((index) => increment(report.spurious, actual[index].move));
  return report;
}

/** Returns timestamp-level class-agnostic matches for substitution diagnostics. */
export function matchMoveConfusions(expected: ExpectedMove[], actual: MoveDetection[], toleranceMs = 300) {
  const candidates = expected.flatMap((label, expectedIndex) => actual.flatMap((detection, actualIndex) =>
    overlaps(label, detection, toleranceMs) ? [{ expectedIndex, actualIndex,
      centerDistance: Math.abs(eventCenter(label) - eventCenter(detection)) }] : []))
    .sort((a, b) => a.centerDistance - b.centerDistance || a.expectedIndex - b.expectedIndex || a.actualIndex - b.actualIndex);
  const matchedExpected = new Set<number>(); const matchedActual = new Set<number>();
  const pairs: DetectionMatch[] = [];
  for (const candidate of candidates) {
    if (matchedExpected.has(candidate.expectedIndex) || matchedActual.has(candidate.actualIndex)) continue;
    matchedExpected.add(candidate.expectedIndex); matchedActual.add(candidate.actualIndex);
    pairs.push({ expectedIndex: candidate.expectedIndex, actualIndex: candidate.actualIndex });
  }
  return { pairs,
    unmatchedExpected: expected.map((_, index) => index).filter((index) => !matchedExpected.has(index)),
    unmatchedActual: actual.map((_, index) => index).filter((index) => !matchedActual.has(index)) };
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
