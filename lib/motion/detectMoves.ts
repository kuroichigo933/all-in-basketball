import type { AnalysisSummary, MotionObservation, MoveDetection, Point } from "./types.ts";

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const torsoWidth = (o: MotionObservation) => Math.max(0.08, distance(o.leftHip, o.rightHip));
const centerX = (o: MotionObservation) => (o.leftHip.x + o.rightHip.x) / 2;

export type MoveDetectionConfig = {
  minimumPoseConfidence: number;
  minimumBallConfidence: number;
  maximumObservationGapMs: number;
  minimumScreenLateralTravel: number;
  maximumTorsoCenterTravelHipWidths: number;
  minimumKeypointConfidence: number;
  behindMaximumKneeSpreadHipWidths: number;
  poseTransferBallProximityHipWidths: number;
  poseTransferMaximumTorsoTravelHipWidths: number;
  poseTransferConfirmationMs: number;
  poseTransferCooldownMs: number;
  lateralWindowMs: number;
  centerlineMarginHipWidths: number;
  lateralTravelHipWidths: number;
  handProximityHipWidths: number;
  legRegionHipMargin: number;
  hipBandHalfHeight: number;
  inAndOutWindowMs: number;
  inAndOutInwardTravel: number;
  inAndOutReturnTolerance: number;
  hesitationMinimumMs: number;
  hesitationMaximumMs: number;
  hesitationApproachTravel: number;
  hesitationMaximumTravel: number;
};

export const DEFAULT_MOVE_DETECTION_CONFIG: Readonly<MoveDetectionConfig> = {
  minimumPoseConfidence: 0.35, minimumBallConfidence: 0.25, maximumObservationGapMs: 350,
  minimumScreenLateralTravel: 0.04, maximumTorsoCenterTravelHipWidths: 0.8,
  minimumKeypointConfidence: 0.35, behindMaximumKneeSpreadHipWidths: 1.25,
  poseTransferBallProximityHipWidths: 2.2, poseTransferMaximumTorsoTravelHipWidths: 0.25,
  poseTransferConfirmationMs: 250, poseTransferCooldownMs: 250,
  lateralWindowMs: 1400, centerlineMarginHipWidths: 0.18, lateralTravelHipWidths: 0.55,
  handProximityHipWidths: 2.2, legRegionHipMargin: 0.35, hipBandHalfHeight: 0.45,
  inAndOutWindowMs: 1600, inAndOutInwardTravel: 0.45, inAndOutReturnTolerance: 0.45,
  hesitationMinimumMs: 450, hesitationMaximumMs: 1600, hesitationApproachTravel: 0.25,
  hesitationMaximumTravel: 0.7,
};

function quality(window: MotionObservation[]) {
  return window.reduce((sum, o) => sum + Math.min(o.poseConfidence, o.ballConfidence), 0) / window.length;
}

const SAME_MOVE_DEDUPE_GAP_MS = 80;
const SAME_MOVE_CENTER_GAP_MS = 220;
const COMPETING_MOVE_CENTER_GAP_MS = 200;

function addIfDistinct(found: MoveDetection[], detection: MoveDetection) {
  const duplicateIndex = found.findIndex((candidate) =>
    candidate.move === detection.move &&
    detection.startMs <= candidate.endMs + SAME_MOVE_DEDUPE_GAP_MS &&
    detection.endMs >= candidate.startMs - SAME_MOVE_DEDUPE_GAP_MS);
  if (duplicateIndex < 0) {
    found.push(detection);
    return;
  }
  if (detection.confidence > found[duplicateIndex].confidence) found[duplicateIndex] = detection;
}

const eventCenterMs = (detection: MoveDetection) => (detection.startMs + detection.endMs) / 2;
const hasLargeObservationGap = (window: MotionObservation[], maximumGapMs: number) =>
  window.slice(1).some((observation, index) => observation.timeMs - window[index].timeMs > maximumGapMs);
const isSpecificLateralMove = (detection: MoveDetection) =>
  detection.move === "between-the-legs" || detection.move === "behind-the-back";
const isLateralMove = (detection: MoveDetection) => detection.move === "crossover" || isSpecificLateralMove(detection);
const isMeasuredBall = (observation: MotionObservation) => observation.ball && observation.ballSource !== "interpolated" && observation.ballSource !== "missing";
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const interpolatePoint = (a: Point, b: Point, ratio: number): Point => ({
  x: a.x + (b.x - a.x) * ratio,
  y: a.y + (b.y - a.y) * ratio,
  visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
});

function centerlineCrossing(window: MotionObservation[], width: number) {
  const relative = window.map((observation) => (observation.ball!.x - centerX(observation)) / width);
  for (let index = 0; index < window.length - 1; index += 1) {
    if (Math.sign(relative[index]) === Math.sign(relative[index + 1])) continue;
    const denominator = relative[index + 1] - relative[index];
    if (denominator === 0) continue;
    const ratio = clamp(-relative[index] / denominator);
    const a = window[index]; const b = window[index + 1];
    return {
      ball: interpolatePoint(a.ball!, b.ball!, ratio),
      leftHip: interpolatePoint(a.leftHip, b.leftHip, ratio), rightHip: interpolatePoint(a.rightHip, b.rightHip, ratio),
      leftKnee: interpolatePoint(a.leftKnee, b.leftKnee, ratio), rightKnee: interpolatePoint(a.rightKnee, b.rightKnee, ratio),
    };
  }
  return null;
}

/**
 * Sliding temporal windows can describe one physical ball transfer several ways.
 * Keep one label for candidates with effectively the same event center, favoring
 * stronger evidence and then the anatomically more specific rule.
 */
export function resolveMoveDetections(detections: MoveDetection[]): MoveDetection[] {
  const ranked = [...detections].sort((a, b) => b.confidence - a.confidence || a.startMs - b.startMs || a.endMs - b.endMs);
  const deduplicated: MoveDetection[] = [];
  for (const candidate of ranked) {
    if (deduplicated.some((event) => event.move === candidate.move && Math.abs(eventCenterMs(event) - eventCenterMs(candidate)) <= SAME_MOVE_CENTER_GAP_MS)) continue;
    deduplicated.push(candidate);
  }
  const ambiguousSpecific = deduplicated.filter((candidate) => isSpecificLateralMove(candidate) && deduplicated.some((event) =>
    isSpecificLateralMove(event) && event.move !== candidate.move && Math.abs(eventCenterMs(event) - eventCenterMs(candidate)) <= COMPETING_MOVE_CENTER_GAP_MS));
  const unambiguous = deduplicated.filter((candidate) => !ambiguousSpecific.some((event) =>
    isLateralMove(candidate) && Math.abs(eventCenterMs(event) - eventCenterMs(candidate)) <= COMPETING_MOVE_CENTER_GAP_MS));
  const accepted = unambiguous.filter((candidate) => candidate.move !== "crossover" || !unambiguous.some((event) =>
    isSpecificLateralMove(event) && Math.abs(eventCenterMs(event) - eventCenterMs(candidate)) <= COMPETING_MOVE_CENTER_GAP_MS));
  return accepted.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || b.confidence - a.confidence);
}

export function detectMoves(observations: MotionObservation[], config: MoveDetectionConfig = DEFAULT_MOVE_DETECTION_CONFIG): MoveDetection[] {
  const usable = observations.filter((o) => o.ball && o.poseConfidence >= config.minimumPoseConfidence && o.ballConfidence >= config.minimumBallConfidence);
  const found: MoveDetection[] = [];

  for (let crossingIndex = 0; crossingIndex < usable.length - 1; crossingIndex += 1) {
    const beforeCrossing = usable[crossingIndex]; const afterCrossing = usable[crossingIndex + 1];
    const beforeOffset = beforeCrossing.ball!.x - centerX(beforeCrossing); const afterOffset = afterCrossing.ball!.x - centerX(afterCrossing);
    if (beforeOffset === 0 || beforeOffset * afterOffset > 0 || afterCrossing.timeMs - beforeCrossing.timeMs > config.maximumObservationGapMs) continue;
    const beforeSide = Math.sign(beforeOffset);
    let afterSide = Math.sign(afterOffset);
    if (!afterSide) {
      const next = usable.slice(crossingIndex + 2).find((observation) => Math.sign(observation.ball!.x - centerX(observation)) !== 0);
      afterSide = next ? Math.sign(next.ball!.x - centerX(next)) : 0;
    }
    if (!afterSide || beforeSide === afterSide) continue;
    const halfWindowMs = config.lateralWindowMs / 2;
    let startIndex = crossingIndex; let startMagnitude = Math.abs(beforeOffset);
    for (let index = crossingIndex; index >= 0 && beforeCrossing.timeMs - usable[index].timeMs <= halfWindowMs; index -= 1) {
      const offset = usable[index].ball!.x - centerX(usable[index]); const side = Math.sign(offset);
      if (side && side !== beforeSide) break;
      if (side === beforeSide && isMeasuredBall(usable[index]) && Math.abs(offset) >= startMagnitude) { startIndex = index; startMagnitude = Math.abs(offset); }
    }
    let endIndex = crossingIndex + 1; let endMagnitude = Math.abs(afterOffset);
    for (let index = crossingIndex + 1; index < usable.length && usable[index].timeMs - afterCrossing.timeMs <= halfWindowMs; index += 1) {
      const offset = usable[index].ball!.x - centerX(usable[index]); const side = Math.sign(offset);
      if (side && side !== afterSide) break;
      if (side === afterSide && isMeasuredBall(usable[index]) && Math.abs(offset) >= endMagnitude) { endIndex = index; endMagnitude = Math.abs(offset); }
    }
    const window = usable.slice(startIndex, endIndex + 1);
    const a = usable[startIndex]; const c = usable[endIndex];
    if (c.timeMs - a.timeMs > config.lateralWindowMs || hasLargeObservationGap(window, config.maximumObservationGapMs)) continue;
    if (!isMeasuredBall(a) || !isMeasuredBall(c)) continue;
    const width = median(window.map(torsoWidth));
    const ax = (a.ball!.x - centerX(a)) / width;
    const cx = (c.ball!.x - centerX(c)) / width;
    const displacement = Math.abs(cx - ax);
    const screenTravel = Math.abs(c.ball!.x - a.ball!.x);
    const torsoCenterTravel = Math.abs(centerX(c) - centerX(a)) / width;
    const changedSide = Math.sign(ax) !== Math.sign(cx) && Math.abs(ax) > config.centerlineMarginHipWidths && Math.abs(cx) > config.centerlineMarginHipWidths;
    const nearHands = Math.min(distance(a.ball!, a.leftWrist), distance(a.ball!, a.rightWrist), distance(c.ball!, c.leftWrist), distance(c.ball!, c.rightWrist));
    const crossing = centerlineCrossing(window, width);
    if (!changedSide || !crossing || displacement <= config.lateralTravelHipWidths || screenTravel < config.minimumScreenLateralTravel || torsoCenterTravel > config.maximumTorsoCenterTravelHipWidths) continue;
    const hipTop = Math.min(crossing.leftHip.y, crossing.rightHip.y);
    const kneeBottom = Math.max(crossing.leftKnee.y, crossing.rightKnee.y);
    const legLeft = Math.min(crossing.leftKnee.x, crossing.rightKnee.x);
    const legRight = Math.max(crossing.leftKnee.x, crossing.rightKnee.x);
    const hipBottom = Math.max(crossing.leftHip.y, crossing.rightHip.y);
    const throughLegRegion = crossing.ball.x > legLeft && crossing.ball.x < legRight &&
      crossing.ball.y > hipBottom + width * config.legRegionHipMargin && crossing.ball.y < kneeBottom;
    const throughHipBand = crossing.ball.x > Math.min(crossing.leftHip.x, crossing.rightHip.x) &&
      crossing.ball.x < Math.max(crossing.leftHip.x, crossing.rightHip.x) &&
      crossing.ball.y >= hipTop - width * config.hipBandHalfHeight && crossing.ball.y <= hipBottom + width * config.hipBandHalfHeight;
    if (throughLegRegion) {
      addIfDistinct(found, { move: "between-the-legs", startMs: a.timeMs, endMs: c.timeMs,
        confidence: clamp(0.55 + quality(window) * 0.3 + Math.min(displacement, 1) * 0.15),
        evidence: ["measured ball endpoints crossed the body centerline", "interpolated crossing point entered the region between the knees and below the hips"] });
    } else if (throughHipBand) {
      addIfDistinct(found, { move: "behind-the-back", startMs: a.timeMs, endMs: c.timeMs,
        confidence: clamp(0.48 + quality(window) * 0.3 + Math.min(displacement, 1) * 0.17),
        evidence: ["measured ball endpoints crossed at hip height", "crossing point stayed in the narrow hip band", "trajectory avoided the between-knee region"] });
    } else if (nearHands < width * config.handProximityHipWidths) {
      const confidence = clamp(0.45 + displacement * 0.18 + quality(window) * 0.25);
      addIfDistinct(found, { move: "crossover", startMs: a.timeMs, endMs: c.timeMs, confidence,
        evidence: ["ball crossed the hip centerline", `normalized lateral travel ${displacement.toFixed(2)}`, "ball remained near a wrist"] });
    }
  }

  const corridorHands = usable.map((observation): "left" | "right" | null => {
    const hipBottom = Math.max(observation.leftHip.y, observation.rightHip.y);
    const kneeBottom = Math.max(observation.leftKnee.y, observation.rightKnee.y);
    const kneeLeft = Math.min(observation.leftKnee.x, observation.rightKnee.x);
    const kneeRight = Math.max(observation.leftKnee.x, observation.rightKnee.x);
    const wristInside = (wrist: Point) => (wrist.visibility ?? 1) >= config.minimumKeypointConfidence &&
      wrist.x > kneeLeft && wrist.x < kneeRight && wrist.y > hipBottom && wrist.y < kneeBottom;
    const leftInside = wristInside(observation.leftWrist); const rightInside = wristInside(observation.rightWrist);
    const activeHand = leftInside && rightInside
      ? (observation.leftWrist.y >= observation.rightWrist.y ? "left" : "right")
      : leftInside ? "left" : rightInside ? "right" : null;
    return activeHand;
  });
  let previousActiveHand: "left" | "right" | null = null;
  let lastPoseTransferMs = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < usable.length; index += 1) {
    const observation = usable[index]; const previousObservation = usable[index - 1];
    const activeHand = corridorHands[index];
    if (!activeHand || activeHand === previousActiveHand) continue;
    if (!previousActiveHand) { previousActiveHand = activeHand; continue; }
    previousActiveHand = activeHand;
    if (!previousObservation || !isMeasuredBall(observation) || !isMeasuredBall(previousObservation) ||
      observation.timeMs - previousObservation.timeMs > config.maximumObservationGapMs ||
      observation.timeMs - lastPoseTransferMs < config.poseTransferCooldownMs) continue;
    const activeWrist = activeHand === "left" ? observation.leftWrist : observation.rightWrist;
    const width = torsoWidth(observation);
    if (Math.abs(centerX(observation) - centerX(previousObservation)) / width > config.poseTransferMaximumTorsoTravelHipWidths ||
      distance(observation.ball!, activeWrist) > width * config.poseTransferBallProximityHipWidths) continue;
    const kneeSpread = Math.abs(observation.leftKnee.x - observation.rightKnee.x) / width;
    const move: MoveDetection["move"] = kneeSpread < config.behindMaximumKneeSpreadHipWidths ? "behind-the-back" : "between-the-legs";
    if (move === "between-the-legs") {
      const confirmations = corridorHands.slice(index).filter((hand, relativeIndex) =>
        usable[index + relativeIndex].timeMs - observation.timeMs <= config.poseTransferConfirmationMs && hand === activeHand).length;
      if (confirmations < 2) continue;
    }
    addIfDistinct(found, {
      move, startMs: Math.max(0, observation.timeMs - 200), endMs: observation.timeMs + 200,
      confidence: clamp(0.5 + Math.min(observation.poseConfidence, observation.ballConfidence) * 0.25 + Math.min(1, Math.abs(kneeSpread - config.behindMaximumKneeSpreadHipWidths)) * 0.12),
      evidence: ["controlling wrist changed inside the knee corridor", "measured ball stayed near the receiving wrist",
        move === "behind-the-back" ? "knee spread remained narrow relative to the hips" : "receiving hand persisted while the knee spread remained wide"],
    });
    lastPoseTransferMs = observation.timeMs;
  }

  // Crossovers often keep the ball above or outside the knee corridor, so the
  // corridor-only handoff rule cannot see them. Track measured ball control at
  // either wrist and emit a crossover when control changes on consecutive
  // frames, the receiving hand remains outside the knee corridor, and the new
  // hand persists long enough to reject a one-frame pose wobble.
  const controllingHands = usable.map((observation): "left" | "right" | null => {
    if (!isMeasuredBall(observation)) return null;
    const leftDistance = distance(observation.ball!, observation.leftWrist);
    const rightDistance = distance(observation.ball!, observation.rightWrist);
    const width = torsoWidth(observation);
    if (Math.min(leftDistance, rightDistance) > width * config.handProximityHipWidths) return null;
    return leftDistance <= rightDistance ? "left" : "right";
  });
  const wristInKneeCorridor = (observation: MotionObservation, hand: "left" | "right") => {
    const wrist = hand === "left" ? observation.leftWrist : observation.rightWrist;
    const hipBottom = Math.max(observation.leftHip.y, observation.rightHip.y);
    const kneeBottom = Math.max(observation.leftKnee.y, observation.rightKnee.y);
    const kneeLeft = Math.min(observation.leftKnee.x, observation.rightKnee.x);
    const kneeRight = Math.max(observation.leftKnee.x, observation.rightKnee.x);
    return wrist.x > kneeLeft && wrist.x < kneeRight && wrist.y > hipBottom && wrist.y < kneeBottom;
  };
  let previousControlHand: "left" | "right" | null = null;
  let lastCrossoverTransferMs = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < usable.length; index += 1) {
    const activeHand = controllingHands[index];
    if (!activeHand) continue;
    if (!previousControlHand) { previousControlHand = activeHand; continue; }
    if (activeHand === previousControlHand) continue;
    const previousObservation = usable[index - 1]; const previousFrameHand = controllingHands[index - 1];
    previousControlHand = activeHand;
    const observation = usable[index];
    if (!previousObservation || previousFrameHand === null || previousFrameHand === activeHand ||
      observation.timeMs - previousObservation.timeMs > config.maximumObservationGapMs ||
      observation.timeMs - lastCrossoverTransferMs < config.poseTransferCooldownMs ||
      wristInKneeCorridor(observation, activeHand)) continue;
    const width = torsoWidth(observation);
    const previousBallOffset = (previousObservation.ball!.x - centerX(previousObservation)) / width;
    const currentBallOffset = (observation.ball!.x - centerX(observation)) / width;
    const crossedBody = Math.sign(previousBallOffset) !== Math.sign(currentBallOffset) &&
      Math.abs(previousBallOffset) > config.centerlineMarginHipWidths && Math.abs(currentBallOffset) > config.centerlineMarginHipWidths;
    if (!crossedBody || Math.abs(observation.ball!.x - previousObservation.ball!.x) < config.minimumScreenLateralTravel ||
      Math.abs(centerX(observation) - centerX(previousObservation)) / width > config.poseTransferMaximumTorsoTravelHipWidths) continue;
    const confirmations = controllingHands.slice(index).filter((hand, relativeIndex) =>
      usable[index + relativeIndex].timeMs - observation.timeMs <= config.poseTransferConfirmationMs && hand === activeHand).length;
    if (confirmations < 2) continue;
    addIfDistinct(found, { move: "crossover", startMs: Math.max(0, observation.timeMs - 200), endMs: observation.timeMs + 200,
      confidence: clamp(0.48 + Math.min(observation.poseConfidence, observation.ballConfidence) * 0.3),
      evidence: ["measured ball control changed between wrists", "receiving hand remained outside the knee corridor", "receiving hand control persisted"] });
    lastCrossoverTransferMs = observation.timeMs;
  }

  for (let i = 4; i < usable.length; i += 1) {
    const window = usable.slice(i - 4, i + 1);
    const [a, , middle, , e] = window;
    if (e.timeMs - a.timeMs > config.inAndOutWindowMs || hasLargeObservationGap(window, config.maximumObservationGapMs)) continue;
    if (![a, middle, e].every(isMeasuredBall)) continue;
    const width = torsoWidth(middle);
    const start = (a.ball!.x - centerX(a)) / width;
    const apex = (middle.ball!.x - centerX(middle)) / width;
    const end = (e.ball!.x - centerX(e)) / width;
    const sameSide = Math.sign(start) === Math.sign(end) && Math.sign(start) !== 0 && Math.abs(start) > 0.25 && Math.abs(end) > 0.25;
    const movedInward = Math.abs(start) - Math.abs(apex);
    const returned = Math.abs(end - start) < config.inAndOutReturnTolerance;
    const endpointHand = start < 0 ? "left" : "right";
    const hand = endpointHand === "left" ? e.leftWrist : e.rightWrist;
    const nearSameHand = distance(e.ball!, hand) < width * 1.8;
    if (sameSide && movedInward > config.inAndOutInwardTravel && returned && nearSameHand) {
      addIfDistinct(found, { move: "in-and-out", startMs: a.timeMs, endMs: e.timeMs,
        confidence: clamp(0.46 + quality(window) * 0.3 + Math.min(movedInward, 1) * 0.2),
        evidence: [`ball moved inward ${movedInward.toFixed(2)} hip widths`, "ball returned to its original side", `ball finished near the ${endpointHand} wrist`] });
    }
  }

  for (let i = 4; i < usable.length; i += 1) {
    const window = usable.slice(i - 3, i + 1);
    const approach = usable[i - 4];
    const duration = window.at(-1)!.timeMs - window[0].timeMs;
    if (duration < config.hesitationMinimumMs || duration > config.hesitationMaximumMs || hasLargeObservationGap([approach, ...window], config.maximumObservationGapMs)) continue;
    if (![approach, ...window].every(isMeasuredBall)) continue;
    const travel = window.slice(1).reduce((sum, o, j) => sum + distance(o.ball!, window[j].ball!), 0);
    const approachTravel = distance(approach.ball!, window[0].ball!);
    const wristDistance = Math.min(distance(window.at(-1)!.ball!, window.at(-1)!.leftWrist), distance(window.at(-1)!.ball!, window.at(-1)!.rightWrist));
    if (approachTravel > torsoWidth(window[0]) * config.hesitationApproachTravel && travel < torsoWidth(window[0]) * config.hesitationMaximumTravel && wristDistance < torsoWidth(window[0]) * 1.5) {
      addIfDistinct(found, { move: "hesitation", startMs: window[0].timeMs, endMs: window.at(-1)!.timeMs,
        confidence: clamp(0.45 + quality(window) * 0.35 + (1 - travel / torsoWidth(window[0])) * 0.2),
        evidence: ["ball slowed after visible approach motion", "ball motion paused for at least 450 ms", "ball stayed near a hand"] });
    }
  }

  return resolveMoveDetections(found);
}

export function summarizeAnalysis(observations: MotionObservation[]): AnalysisSummary {
  const count = observations.length;
  const detected = observations.filter((o) => o.ball && (o.ballMeasured ?? (o.ballSource !== "interpolated" && o.ballSource !== "missing"))).length;
  return {
    observations: count,
    poseCoverage: count ? observations.filter((o) => o.poseConfidence >= 0.35).length / count : 0,
    ballCoverage: count ? observations.filter((o) => o.ball).length / count : 0,
    detectedBallCoverage: count ? detected / count : 0,
    interpolatedBallFrames: observations.filter((o) => o.ballSource === "interpolated").length,
    moves: detectMoves(observations),
  };
}
