import type { MotionObservation, Point } from "./types.ts";

export type BallBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BallIdentityLabel =
  | { timeMs: number; visibility: "visible"; box: BallBoundingBox }
  | { timeMs: number; visibility: "absent" };

export type BallOcclusionLabel = { timeMs: number; visibility: "occluded" };
export type BallIdentityEvaluationLabel = BallIdentityLabel | BallOcclusionLabel;

export type BallIdentityObservation = Pick<MotionObservation, "timeMs" | "ball" | "ballSource" | "ballMeasurement" | "ballDetectorId" | "ballCandidates"> & {
  /** True only when this frame supplied a detector measurement, false for tracker prediction. */
  ballMeasured?: boolean;
};

export type BallIdentityMetrics = {
  visibleLabels: number;
  absentLabels: number;
  matchedLabels: number;
  unmatchedLabels: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  visibleLocalizationRate: number;
  negativeRejectionRate: number | null;
  medianCenterErrorRadii: number | null;
  p95CenterErrorRadii: number | null;
};

export type BallOcclusionMetrics = {
  occludedLabels: number;
  matchedLabels: number;
  unmatchedLabels: number;
  trackedFrames: number;
  predictedFrames: number;
  measuredFrames: number;
  missingFrames: number;
  ambiguousFrames: number;
  /** Any track was present. Measured frames may still be distractor locks. */
  trackPresenceRate: number | null;
  /** The temporal tracker explicitly carried a prediction through the occlusion. */
  predictionPersistenceRate: number | null;
};

export type BallIdentityReport = {
  tracked: BallIdentityMetrics;
  raw: BallIdentityMetrics | null;
  candidateOracle: {
    available: boolean;
    visibleLabels: number;
    visibleHits: number;
    visibleRecall: number | null;
    absentLabels: number;
    absentFramesWithoutCandidates: number;
    negativeRejectionRate: number | null;
    medianNearestCenterErrorRadii: number | null;
    p95NearestCenterErrorRadii: number | null;
  };
  occlusion: BallOcclusionMetrics;
  timing: {
    toleranceMs: number;
    matchedLabels: number;
    unmatchedLabels: number;
    maximumMatchedOffsetMs: number;
  };
  provenance: {
    ballObservations: number;
    explicitlyClassifiedBallObservations: number;
    rawMetricsAvailable: boolean;
    sources: Record<string, number>;
    detectors: Record<string, number>;
  };
  warnings: string[];
};

export type BallIdentityEvaluationOptions = {
  timestampToleranceMs?: number;
  /** A prediction at or inside this many annotated ball radii is localized correctly. */
  maximumCenterErrorRadii?: number;
};

type LabelObservationMatch = {
  label: BallIdentityEvaluationLabel;
  observation: BallIdentityObservation | null;
  offsetMs: number | null;
};

const finite = (value: number) => Number.isFinite(value);
const inUnitInterval = (value: number) => finite(value) && value >= 0 && value <= 1;

function validateLabels(value: unknown, allowOccluded: boolean): BallIdentityEvaluationLabel[] {
  if (!Array.isArray(value)) throw new Error("Ball identity labels must be an array.");
  const times = new Set<number>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") throw new Error("Each ball identity label must be an object.");
    const label = candidate as Partial<BallIdentityEvaluationLabel>;
    if (!finite(label.timeMs ?? Number.NaN) || (label.timeMs ?? -1) < 0) throw new Error("Ball identity label timeMs must be a non-negative number.");
    if (times.has(label.timeMs!)) throw new Error(`Duplicate ball identity label at ${label.timeMs} ms.`);
    times.add(label.timeMs!);
    if (label.visibility === "absent" || (allowOccluded && label.visibility === "occluded")) continue;
    const expected = allowOccluded ? "visible, absent, or occluded" : "visible or absent";
    if (label.visibility !== "visible" || !("box" in label) || !label.box) throw new Error(`Ball identity label at ${label.timeMs} ms needs ${expected} visibility.`);
    const { x, y, width, height } = label.box;
    if (![x, y, width, height].every(finite) || width <= 0 || height <= 0 || !inUnitInterval(x) || !inUnitInterval(y) || x + width > 1 || y + height > 1) {
      throw new Error(`Visible ball box at ${label.timeMs} ms must be a positive normalized box inside the frame.`);
    }
  }
  return [...value].sort((a, b) => a.timeMs - b.timeMs) as BallIdentityEvaluationLabel[];
}

/** Validates labels supported by the current browser annotation UI. */
export function validateBallIdentityLabels(value: unknown): BallIdentityLabel[] {
  return validateLabels(value, false) as BallIdentityLabel[];
}

/** Validates evaluation labels, including independently adjudicated full occlusion. */
export function validateBallIdentityEvaluationLabels(value: unknown): BallIdentityEvaluationLabel[] {
  return validateLabels(value, true);
}

function matchByTimestamp(
  labels: BallIdentityEvaluationLabel[],
  observations: BallIdentityObservation[],
  toleranceMs: number,
): LabelObservationMatch[] {
  const matches = labels.map((label) => ({ label, observation: null, offsetMs: null })) as LabelObservationMatch[];
  type Cell = { count: number; offset: number; choice: "label" | "observation" | "match" | "done" };
  const table: Cell[][] = Array.from({ length: labels.length + 1 }, () => Array.from({ length: observations.length + 1 }, () => ({ count: 0, offset: 0, choice: "done" })));
  const better = (candidate: Cell, current: Cell) => candidate.count > current.count || (candidate.count === current.count && candidate.offset < current.offset);
  for (let labelIndex = labels.length; labelIndex >= 0; labelIndex -= 1) {
    for (let observationIndex = observations.length; observationIndex >= 0; observationIndex -= 1) {
      if (labelIndex === labels.length && observationIndex === observations.length) continue;
      let best: Cell = labelIndex < labels.length
        ? { ...table[labelIndex + 1][observationIndex], choice: "label" }
        : { ...table[labelIndex][observationIndex + 1], choice: "observation" };
      if (observationIndex < observations.length) {
        const skipObservation: Cell = { ...table[labelIndex][observationIndex + 1], choice: "observation" };
        if (better(skipObservation, best)) best = skipObservation;
      }
      if (labelIndex < labels.length && observationIndex < observations.length) {
        const offset = Math.abs(labels[labelIndex].timeMs - observations[observationIndex].timeMs);
        if (offset <= toleranceMs) {
          const rest = table[labelIndex + 1][observationIndex + 1];
          const match: Cell = { count: rest.count + 1, offset: rest.offset + offset, choice: "match" };
          if (better(match, best)) best = match;
        }
      }
      table[labelIndex][observationIndex] = best;
    }
  }
  let labelIndex = 0; let observationIndex = 0;
  while (labelIndex < labels.length || observationIndex < observations.length) {
    const choice = table[labelIndex][observationIndex].choice;
    if (choice === "match") {
      const offsetMs = Math.abs(labels[labelIndex].timeMs - observations[observationIndex].timeMs);
      matches[labelIndex].observation = observations[observationIndex]; matches[labelIndex].offsetMs = offsetMs;
      labelIndex += 1; observationIndex += 1;
    } else if (choice === "label") labelIndex += 1;
    else if (choice === "observation") observationIndex += 1;
    else break;
  }
  return matches;
}

/** Elliptical center error, where 1 means the edge of the independently drawn ball box. */
export function centerErrorRadii(point: Point, box: BallBoundingBox): number {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  return Math.hypot((point.x - centerX) / (box.width / 2), (point.y - centerY) / (box.height / 2));
}

function percentile(sorted: number[], fraction: number) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function scoreMatches(
  matches: LabelObservationMatch[],
  pointFor: (observation: BallIdentityObservation) => Point | null,
  maximumCenterErrorRadii: number,
): BallIdentityMetrics {
  const scoredMatches = matches.filter(({ label }) => label.visibility !== "occluded");
  let truePositives = 0; let falsePositives = 0; let falseNegatives = 0; let trueNegatives = 0;
  const centerErrors: number[] = [];
  const visibleLabels = scoredMatches.filter(({ label }) => label.visibility === "visible").length;
  const absentLabels = scoredMatches.length - visibleLabels;
  for (const { label, observation } of scoredMatches) {
    if (label.visibility === "occluded") continue;
    if (!observation) {
      if (label.visibility === "visible") falseNegatives += 1;
      continue;
    }
    const point = pointFor(observation);
    if (label.visibility === "absent") {
      if (point) falsePositives += 1; else trueNegatives += 1;
      continue;
    }
    if (!point) { falseNegatives += 1; continue; }
    const error = centerErrorRadii(point, label.box); centerErrors.push(error);
    if (error <= maximumCenterErrorRadii) truePositives += 1;
    else { falsePositives += 1; falseNegatives += 1; }
  }
  const precision = truePositives + falsePositives ? truePositives / (truePositives + falsePositives) : falseNegatives ? 0 : 1;
  const recall = truePositives + falseNegatives ? truePositives / (truePositives + falseNegatives) : 1;
  const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
  const sortedErrors = centerErrors.sort((a, b) => a - b);
  const matchedLabels = scoredMatches.filter(({ observation }) => observation !== null).length;
  return {
    visibleLabels, absentLabels, matchedLabels, unmatchedLabels: scoredMatches.length - matchedLabels,
    truePositives, falsePositives, falseNegatives, trueNegatives, precision, recall, f1,
    visibleLocalizationRate: visibleLabels ? truePositives / visibleLabels : 1,
    negativeRejectionRate: absentLabels ? trueNegatives / absentLabels : null,
    medianCenterErrorRadii: percentile(sortedErrors, 0.5),
    p95CenterErrorRadii: percentile(sortedErrors, 0.95),
  };
}

function scoreOcclusions(matches: LabelObservationMatch[]): BallOcclusionMetrics {
  const occlusions = matches.filter(({ label }) => label.visibility === "occluded");
  let trackedFrames = 0; let predictedFrames = 0; let measuredFrames = 0; let missingFrames = 0; let ambiguousFrames = 0;
  for (const { observation } of occlusions) {
    if (!observation) continue;
    if (!observation.ball) { missingFrames += 1; continue; }
    trackedFrames += 1;
    if (observation.ballMeasured === false) predictedFrames += 1;
    else if (observation.ballMeasured === true) measuredFrames += 1;
    else ambiguousFrames += 1;
  }
  const matchedLabels = occlusions.filter(({ observation }) => observation !== null).length;
  return {
    occludedLabels: occlusions.length,
    matchedLabels,
    unmatchedLabels: occlusions.length - matchedLabels,
    trackedFrames,
    predictedFrames,
    measuredFrames,
    missingFrames,
    ambiguousFrames,
    trackPresenceRate: matchedLabels ? trackedFrames / matchedLabels : null,
    predictionPersistenceRate: matchedLabels && !ambiguousFrames ? predictedFrames / matchedLabels : null,
  };
}

function scoreCandidateOracle(matches: LabelObservationMatch[], maximumCenterErrorRadii: number): BallIdentityReport["candidateOracle"] {
  const scored = matches.filter(({ label }) => label.visibility !== "occluded");
  const available = scored.every(({ observation }) => !observation || Array.isArray(observation.ballCandidates));
  const visible = scored.filter(({ label }) => label.visibility === "visible");
  const absent = scored.filter(({ label }) => label.visibility === "absent");
  if (!available) return { available: false, visibleLabels: visible.length, visibleHits: 0, visibleRecall: null,
    absentLabels: absent.length, absentFramesWithoutCandidates: 0, negativeRejectionRate: null,
    medianNearestCenterErrorRadii: null, p95NearestCenterErrorRadii: null };
  const nearestErrors: number[] = [];
  let visibleHits = 0;
  for (const { label, observation } of visible) {
    if (label.visibility !== "visible" || !observation?.ballCandidates?.length) continue;
    const nearest = Math.min(...observation.ballCandidates.map((candidate) => centerErrorRadii(candidate.point, label.box)));
    nearestErrors.push(nearest); if (nearest <= maximumCenterErrorRadii) visibleHits += 1;
  }
  const absentFramesWithoutCandidates = absent.filter(({ observation }) => !observation?.ballCandidates?.length).length;
  nearestErrors.sort((a, b) => a - b);
  return { available, visibleLabels: visible.length, visibleHits, visibleRecall: visible.length ? visibleHits / visible.length : null,
    absentLabels: absent.length, absentFramesWithoutCandidates,
    negativeRejectionRate: absent.length ? absentFramesWithoutCandidates / absent.length : null,
    medianNearestCenterErrorRadii: percentile(nearestErrors, 0.5), p95NearestCenterErrorRadii: percentile(nearestErrors, 0.95) };
}

export function evaluateBallIdentity(
  unvalidatedLabels: unknown,
  observations: BallIdentityObservation[],
  options: BallIdentityEvaluationOptions = {},
): BallIdentityReport {
  const labels = validateBallIdentityEvaluationLabels(unvalidatedLabels);
  const timestampToleranceMs = options.timestampToleranceMs ?? 60;
  const maximumCenterErrorRadii = options.maximumCenterErrorRadii ?? 1.25;
  if (!finite(timestampToleranceMs) || timestampToleranceMs < 0) throw new Error("timestampToleranceMs must be non-negative.");
  if (!finite(maximumCenterErrorRadii) || maximumCenterErrorRadii <= 0) throw new Error("maximumCenterErrorRadii must be positive.");
  const ordered = [...observations].sort((a, b) => a.timeMs - b.timeMs);
  const matches = matchByTimestamp(labels, ordered, timestampToleranceMs);
  const ballObservations = ordered.filter((observation) => observation.ball !== null).length;
  const explicitlyClassifiedBallObservations = ordered.filter((observation) => observation.ball !== null && typeof observation.ballMeasured === "boolean" && (!observation.ballMeasured || Boolean(observation.ballMeasurement))).length;
  const rawMetricsAvailable = explicitlyClassifiedBallObservations === ballObservations;
  const tracked = scoreMatches(matches, (observation) => observation.ball, maximumCenterErrorRadii);
  const raw = rawMetricsAvailable ? scoreMatches(matches, (observation) => observation.ballMeasured ? observation.ballMeasurement ?? null : null, maximumCenterErrorRadii) : null;
  const candidateOracle = scoreCandidateOracle(matches, maximumCenterErrorRadii);
  const occlusion = scoreOcclusions(matches);
  const matchedOffsets = matches.flatMap(({ offsetMs }) => offsetMs === null ? [] : [offsetMs]);
  const unmatchedLabels = matches.filter(({ observation }) => observation === null).length;
  const warnings: string[] = [];
  if (!rawMetricsAvailable) warnings.push("Raw detector identity metrics are unavailable because ballMeasured provenance is missing from one or more ball observations.");
  if (unmatchedLabels) warnings.push(`${unmatchedLabels} ball labels have no observation within ${timestampToleranceMs} ms.`);
  if (!labels.some((label) => label.visibility === "absent")) warnings.push("No absent-ball labels were supplied, so false-positive behavior outside visible-ball frames is not measured.");
  if (occlusion.measuredFrames) warnings.push(`${occlusion.measuredFrames} occluded ball labels matched accepted detector measurements; inspect them for distractor locks.`);
  const countBy = (values: string[]) => Object.fromEntries(Array.from(new Set(values)).sort().map((value) => [value, values.filter((item) => item === value).length]));
  const sources = countBy(ordered.map((observation) => observation.ballSource ?? "unknown"));
  const detectors = countBy(ordered.flatMap((observation) => observation.ballDetectorId ? [observation.ballDetectorId] : []));
  return {
    tracked, raw, candidateOracle, occlusion,
    timing: {
      toleranceMs: timestampToleranceMs,
      matchedLabels: matches.length - unmatchedLabels,
      unmatchedLabels,
      maximumMatchedOffsetMs: matchedOffsets.length ? Math.max(...matchedOffsets) : 0,
    },
    provenance: { ballObservations, explicitlyClassifiedBallObservations, rawMetricsAvailable, sources, detectors },
    warnings,
  };
}
