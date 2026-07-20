import type { ExpectedMove } from "./evaluate.ts";
import type { MotionObservation, MoveName } from "./types.ts";

export type RapidMoveLabelGroup = {
  move: MoveName;
  startMs: number;
  endMs: number;
  labels: ExpectedMove[];
};

export type MoveLabelMotionAudit = {
  move: MoveName;
  startMs: number;
  endMs: number;
  labelCount: number;
  observationFrames: number;
  usableFrames: number;
  measuredBallFrames: number;
  usableCoverage: number;
  measuredBallCoverage: number;
  stableSideTransitions: number;
  transitionTimesMs: number[];
  transitionToLabelRatio: number;
  status: "pass" | "review" | "insufficient-motion-data";
  reason: string;
};

export type MoveLabelCoverageAudit = {
  observationStartMs: number | null;
  observationEndMs: number | null;
  observationFrames: number;
  usableFrames: number;
  usableCoverage: number;
  lateralLabelCount: number;
  stableSideTransitions: number;
  transitionTimesMs: number[];
  matchedTransitions: number;
  uncoveredTransitionTimesMs: number[];
  boundaryReviewTransitionTimesMs: number[];
  unmatchedLabels: ExpectedMove[];
  transitionCoverage: number;
  labelCoverage: number;
  status: "pass" | "review" | "insufficient-motion-data";
  reason: string;
};

export type MoveLabelAuditOptions = {
  maximumInterLabelGapMs?: number;
  minimumGroupLabels?: number;
  minimumPoseConfidence?: number;
  minimumBallConfidence?: number;
  centerlineMarginHipWidths?: number;
  minimumTransitionGapMs?: number;
  minimumUsableCoverage?: number;
  minimumTransitionToLabelRatio?: number;
  maximumTransitionToLabelRatio?: number;
  transitionLabelToleranceMs?: number;
  minimumScreenLateralTravel?: number;
  maximumTorsoCenterTravelHipWidths?: number;
  maximumEndpointWristProximityHipWidths?: number;
  boundaryReviewMarginMs?: number;
};

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const torsoWidth = (observation: MotionObservation) => Math.max(0.08, distance(observation.leftHip, observation.rightHip));
const centerX = (observation: MotionObservation) => (observation.leftHip.x + observation.rightHip.x) / 2;
const LATERAL_MOVES = new Set<MoveName>(["crossover", "between-the-legs", "behind-the-back"]);

function usableMotionObservations(observations: MotionObservation[], options: MoveLabelAuditOptions) {
  const minimumPoseConfidence = options.minimumPoseConfidence ?? 0.35;
  const minimumBallConfidence = options.minimumBallConfidence ?? 0.25;
  return observations.filter((observation) => observation.ball &&
    observation.poseConfidence >= minimumPoseConfidence && observation.ballConfidence >= minimumBallConfidence);
}

function stableSideTransitionTimes(observations: MotionObservation[], options: MoveLabelAuditOptions) {
  const centerlineMarginHipWidths = options.centerlineMarginHipWidths ?? 0.18;
  const minimumTransitionGapMs = options.minimumTransitionGapMs ?? 300;
  const minimumScreenLateralTravel = options.minimumScreenLateralTravel ?? 0.04;
  const maximumTorsoCenterTravelHipWidths = options.maximumTorsoCenterTravelHipWidths ?? 0.8;
  const maximumEndpointWristProximityHipWidths = options.maximumEndpointWristProximityHipWidths ?? 3;
  let previousSide = 0;
  let previousSideObservation: MotionObservation | null = null;
  let lastTransitionMs = Number.NEGATIVE_INFINITY;
  const transitionTimesMs: number[] = [];
  for (const observation of observations) {
    const offset = (observation.ball!.x - centerX(observation)) / torsoWidth(observation);
    const side = offset <= -centerlineMarginHipWidths ? -1 : offset >= centerlineMarginHipWidths ? 1 : 0;
    if (!side) continue;
    if (previousSide && side !== previousSide && previousSideObservation && observation.timeMs - lastTransitionMs >= minimumTransitionGapMs) {
      const width = Math.max(0.08, (torsoWidth(previousSideObservation) + torsoWidth(observation)) / 2);
      const screenBallTravel = Math.abs(observation.ball!.x - previousSideObservation.ball!.x);
      const torsoCenterTravel = Math.abs(centerX(observation) - centerX(previousSideObservation)) / width;
      const startWristProximity = Math.min(distance(previousSideObservation.ball!, previousSideObservation.leftWrist),
        distance(previousSideObservation.ball!, previousSideObservation.rightWrist)) / width;
      const endWristProximity = Math.min(distance(observation.ball!, observation.leftWrist),
        distance(observation.ball!, observation.rightWrist)) / width;
      if (screenBallTravel >= minimumScreenLateralTravel && torsoCenterTravel <= maximumTorsoCenterTravelHipWidths &&
        Math.max(startWristProximity, endWristProximity) <= maximumEndpointWristProximityHipWidths) {
        transitionTimesMs.push(observation.timeMs);
        lastTransitionMs = observation.timeMs;
      }
    }
    previousSide = side;
    previousSideObservation = observation;
  }
  return transitionTimesMs;
}

type CoverageMatchState = { count: number; timingError: number; pairs: Array<{ labelIndex: number; transitionIndex: number }> };
const betterCoverageMatch = (candidate: CoverageMatchState, current: CoverageMatchState) => candidate.count > current.count ||
  candidate.count === current.count && candidate.timingError < current.timingError ? candidate : current;

/** One-to-one chronological matching prevents one broad label from hiding several transitions. */
function matchLabelsToTransitions(labels: ExpectedMove[], transitions: number[], toleranceMs: number) {
  const table: CoverageMatchState[][] = Array.from({ length: labels.length + 1 }, () =>
    Array.from({ length: transitions.length + 1 }, () => ({ count: 0, timingError: 0, pairs: [] })));
  for (let labelIndex = 1; labelIndex <= labels.length; labelIndex += 1) {
    for (let transitionIndex = 1; transitionIndex <= transitions.length; transitionIndex += 1) {
      let best = betterCoverageMatch(table[labelIndex - 1][transitionIndex], table[labelIndex][transitionIndex - 1]);
      const label = labels[labelIndex - 1];
      const transition = transitions[transitionIndex - 1];
      if (transition >= label.startMs - toleranceMs && transition <= label.endMs + toleranceMs) {
        const prior = table[labelIndex - 1][transitionIndex - 1];
        const matched: CoverageMatchState = {
          count: prior.count + 1,
          timingError: prior.timingError + Math.abs(transition - (label.startMs + label.endMs) / 2),
          pairs: [...prior.pairs, { labelIndex: labelIndex - 1, transitionIndex: transitionIndex - 1 }],
        };
        best = betterCoverageMatch(matched, best);
      }
      table[labelIndex][transitionIndex] = best;
    }
  }
  return table[labels.length][transitions.length].pairs;
}

/** Groups only contiguous same-class labels; sparse drill repetitions remain independent. */
export function groupRapidMoveLabels(
  labels: ExpectedMove[],
  maximumInterLabelGapMs = 50,
  minimumGroupLabels = 3,
): RapidMoveLabelGroup[] {
  if (!Number.isFinite(maximumInterLabelGapMs) || maximumInterLabelGapMs < 0) throw new Error("maximumInterLabelGapMs must be non-negative.");
  if (!Number.isInteger(minimumGroupLabels) || minimumGroupLabels < 2) throw new Error("minimumGroupLabels must be an integer of at least two.");
  const sorted = [...labels].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const groups: RapidMoveLabelGroup[] = [];
  let current: ExpectedMove[] = [];
  const flush = () => {
    if (current.length >= minimumGroupLabels) groups.push({
      move: current[0].move,
      startMs: current[0].startMs,
      endMs: current.at(-1)!.endMs,
      labels: current,
    });
    current = [];
  };
  for (const label of sorted) {
    const previous = current.at(-1);
    if (!previous || label.move === previous.move && label.startMs - previous.endMs <= maximumInterLabelGapMs) current.push(label);
    else { flush(); current.push(label); }
  }
  flush();
  return groups;
}

export function auditRapidMoveLabelGroup(
  group: RapidMoveLabelGroup,
  observations: MotionObservation[],
  options: MoveLabelAuditOptions = {},
): MoveLabelMotionAudit {
  const minimumUsableCoverage = options.minimumUsableCoverage ?? 0.6;
  const minimumTransitionToLabelRatio = options.minimumTransitionToLabelRatio ?? 0.8;
  const maximumTransitionToLabelRatio = options.maximumTransitionToLabelRatio ?? 1.25;
  const window = observations.filter((observation) => observation.timeMs >= group.startMs && observation.timeMs <= group.endMs);
  const usable = usableMotionObservations(window, options);
  const measuredBallFrames = usable.filter((observation) => observation.ballMeasured ??
    (observation.ballSource !== "interpolated" && observation.ballSource !== "missing")).length;
  const transitionTimesMs = stableSideTransitionTimes(usable, options);
  const stableSideTransitions = transitionTimesMs.length;
  const usableCoverage = window.length ? usable.length / window.length : 0;
  const measuredBallCoverage = window.length ? measuredBallFrames / window.length : 0;
  const transitionToLabelRatio = group.labels.length ? stableSideTransitions / group.labels.length : 0;
  let status: MoveLabelMotionAudit["status"] = "pass";
  let reason = "Observed body-center transitions are consistent with the rapid label count.";
  if (!window.length || usableCoverage < minimumUsableCoverage) {
    status = "insufficient-motion-data";
    reason = `Usable pose/ball coverage ${(usableCoverage * 100).toFixed(1)}% is below ${(minimumUsableCoverage * 100).toFixed(1)}%.`;
  } else if (transitionToLabelRatio < minimumTransitionToLabelRatio || transitionToLabelRatio > maximumTransitionToLabelRatio) {
    status = "review";
    reason = `${stableSideTransitions} stable body-center transitions do not support ${group.labels.length} contiguous labels at the configured ratio.`;
  }
  return {
    move: group.move, startMs: group.startMs, endMs: group.endMs, labelCount: group.labels.length,
    observationFrames: window.length, usableFrames: usable.length, measuredBallFrames, usableCoverage,
    measuredBallCoverage, stableSideTransitions, transitionTimesMs, transitionToLabelRatio, status, reason,
  };
}

export function auditRapidMoveLabels(
  labels: ExpectedMove[],
  observations: MotionObservation[],
  options: MoveLabelAuditOptions = {},
) {
  const groups = groupRapidMoveLabels(labels, options.maximumInterLabelGapMs, options.minimumGroupLabels);
  return groups.map((group) => auditRapidMoveLabelGroup(group, observations, options));
}

/**
 * Audits the complete observation span for cross-body transitions not covered
 * by an independently authored lateral-move label. Tracker output is only a
 * review anchor: this function never creates or changes labels.
 */
export function auditMoveLabelCoverage(
  labels: ExpectedMove[],
  observations: MotionObservation[],
  options: MoveLabelAuditOptions = {},
): MoveLabelCoverageAudit {
  const minimumUsableCoverage = options.minimumUsableCoverage ?? 0.6;
  const toleranceMs = options.transitionLabelToleranceMs ?? 250;
  const boundaryReviewMarginMs = options.boundaryReviewMarginMs ?? 500;
  if (!Number.isFinite(toleranceMs) || toleranceMs < 0) throw new Error("transitionLabelToleranceMs must be non-negative.");
  if (!Number.isFinite(boundaryReviewMarginMs) || boundaryReviewMarginMs < 0) throw new Error("boundaryReviewMarginMs must be non-negative.");
  const orderedObservations = [...observations].sort((a, b) => a.timeMs - b.timeMs);
  const usable = usableMotionObservations(orderedObservations, options);
  const transitionTimesMs = stableSideTransitionTimes(usable, options);
  const lateralLabels = labels.filter((label) => LATERAL_MOVES.has(label.move))
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const pairs = matchLabelsToTransitions(lateralLabels, transitionTimesMs, toleranceMs);
  const matchedLabelIndexes = new Set(pairs.map((pair) => pair.labelIndex));
  const matchedTransitionIndexes = new Set(pairs.map((pair) => pair.transitionIndex));
  const unmatchedTransitionTimesMs = transitionTimesMs.filter((_, index) => !matchedTransitionIndexes.has(index));
  const observationStartMs = orderedObservations.at(0)?.timeMs ?? null;
  const observationEndMs = orderedObservations.at(-1)?.timeMs ?? null;
  const isNearBoundary = (timeMs: number) => observationStartMs !== null && observationEndMs !== null &&
    (timeMs - observationStartMs < boundaryReviewMarginMs || observationEndMs - timeMs < boundaryReviewMarginMs);
  const boundaryReviewTransitionTimesMs = unmatchedTransitionTimesMs.filter(isNearBoundary);
  const uncoveredTransitionTimesMs = unmatchedTransitionTimesMs.filter((timeMs) => !isNearBoundary(timeMs));
  const unmatchedLabels = lateralLabels.filter((_, index) => !matchedLabelIndexes.has(index));
  const usableCoverage = orderedObservations.length ? usable.length / orderedObservations.length : 0;
  const transitionCoverage = transitionTimesMs.length ? pairs.length / transitionTimesMs.length : 1;
  const labelCoverage = lateralLabels.length ? pairs.length / lateralLabels.length : 1;
  let status: MoveLabelCoverageAudit["status"] = "pass";
  let reason = "Every confidence-qualified cross-body transition has a one-to-one lateral-move label match.";
  if (!orderedObservations.length || usableCoverage < minimumUsableCoverage) {
    status = "insufficient-motion-data";
    reason = `Usable pose/ball coverage ${(usableCoverage * 100).toFixed(1)}% is below ${(minimumUsableCoverage * 100).toFixed(1)}%.`;
  } else if (uncoveredTransitionTimesMs.length || unmatchedLabels.length) {
    status = "review";
    reason = `${uncoveredTransitionTimesMs.length} transition(s) lack a label match and ${unmatchedLabels.length} lateral label(s) lack tracked transition support.`;
  } else if (boundaryReviewTransitionTimesMs.length) {
    reason = `No interior label gap; ${boundaryReviewTransitionTimesMs.length} unmatched transition(s) remain isolated for segment-boundary review.`;
  }
  return {
    observationStartMs,
    observationEndMs,
    observationFrames: orderedObservations.length,
    usableFrames: usable.length,
    usableCoverage,
    lateralLabelCount: lateralLabels.length,
    stableSideTransitions: transitionTimesMs.length,
    transitionTimesMs,
    matchedTransitions: pairs.length,
    uncoveredTransitionTimesMs,
    boundaryReviewTransitionTimesMs,
    unmatchedLabels,
    transitionCoverage,
    labelCoverage,
    status,
    reason,
  };
}
