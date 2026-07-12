import type { AnalysisSummary, MotionObservation, MoveDetection, Point } from "./types.ts";

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const torsoWidth = (o: MotionObservation) => Math.max(0.08, distance(o.leftHip, o.rightHip));
const centerX = (o: MotionObservation) => (o.leftHip.x + o.rightHip.x) / 2;

export type MoveDetectionConfig = {
  minimumPoseConfidence: number;
  minimumBallConfidence: number;
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
  minimumPoseConfidence: 0.35, minimumBallConfidence: 0.25,
  lateralWindowMs: 1400, centerlineMarginHipWidths: 0.18, lateralTravelHipWidths: 0.7,
  handProximityHipWidths: 2.2, legRegionHipMargin: 0.25, hipBandHalfHeight: 0.45,
  inAndOutWindowMs: 1600, inAndOutInwardTravel: 0.45, inAndOutReturnTolerance: 0.45,
  hesitationMinimumMs: 450, hesitationMaximumMs: 1600, hesitationApproachTravel: 0.25,
  hesitationMaximumTravel: 0.7,
};

function quality(window: MotionObservation[]) {
  return window.reduce((sum, o) => sum + Math.min(o.poseConfidence, o.ballConfidence), 0) / window.length;
}

const SAME_MOVE_DEDUPE_GAP_MS = 250;
const COMPETING_MOVE_CENTER_GAP_MS = 350;
const MOVE_SPECIFICITY: Record<MoveDetection["move"], number> = {
  "between-the-legs": 3,
  "behind-the-back": 3,
  "in-and-out": 2,
  crossover: 1,
  hesitation: 0,
};

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
const arbitrationScore = (detection: MoveDetection) => detection.confidence + MOVE_SPECIFICITY[detection.move] * 0.025;

/**
 * Sliding temporal windows can describe one physical ball transfer several ways.
 * Keep one label for candidates with effectively the same event center, favoring
 * stronger evidence and then the anatomically more specific rule.
 */
export function resolveMoveDetections(detections: MoveDetection[]): MoveDetection[] {
  const ranked = [...detections].sort((a, b) =>
    arbitrationScore(b) - arbitrationScore(a) ||
    b.confidence - a.confidence ||
    a.startMs - b.startMs);
  const accepted: MoveDetection[] = [];
  for (const candidate of ranked) {
    if (accepted.some((event) => Math.abs(eventCenterMs(event) - eventCenterMs(candidate)) <= COMPETING_MOVE_CENTER_GAP_MS)) continue;
    accepted.push(candidate);
  }
  return accepted.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || b.confidence - a.confidence);
}

export function detectMoves(observations: MotionObservation[], config: MoveDetectionConfig = DEFAULT_MOVE_DETECTION_CONFIG): MoveDetection[] {
  const usable = observations.filter((o) => o.ball && o.poseConfidence >= config.minimumPoseConfidence && o.ballConfidence >= config.minimumBallConfidence);
  const found: MoveDetection[] = [];

  for (let i = 2; i < usable.length; i += 1) {
    const window = usable.slice(i - 2, i + 1);
    const [a, b, c] = window;
    if (c.timeMs - a.timeMs > config.lateralWindowMs) continue;
    const ax = (a.ball!.x - centerX(a)) / torsoWidth(a);
    const cx = (c.ball!.x - centerX(c)) / torsoWidth(c);
    const displacement = Math.abs(cx - ax);
    const changedSide = Math.sign(ax) !== Math.sign(cx) && Math.abs(ax) > config.centerlineMarginHipWidths && Math.abs(cx) > config.centerlineMarginHipWidths;
    const nearHands = Math.min(distance(a.ball!, a.leftWrist), distance(a.ball!, a.rightWrist), distance(c.ball!, c.leftWrist), distance(c.ball!, c.rightWrist));

    const hipTop = Math.min(b.leftHip.y, b.rightHip.y);
    const kneeBottom = Math.max(b.leftKnee.y, b.rightKnee.y);
    const legLeft = Math.min(b.leftKnee.x, b.rightKnee.x);
    const legRight = Math.max(b.leftKnee.x, b.rightKnee.x);
    const hipBottom = Math.max(b.leftHip.y, b.rightHip.y);
    const throughLegRegion = b.ball!.x > legLeft && b.ball!.x < legRight &&
      b.ball!.y > hipBottom + torsoWidth(b) * config.legRegionHipMargin && b.ball!.y < kneeBottom;
    const throughHipBand = b.ball!.x > Math.min(b.leftHip.x, b.rightHip.x) &&
      b.ball!.x < Math.max(b.leftHip.x, b.rightHip.x) &&
      b.ball!.y >= hipTop - torsoWidth(b) * config.hipBandHalfHeight && b.ball!.y <= hipBottom + torsoWidth(b) * config.hipBandHalfHeight;
    if (changedSide && displacement > config.lateralTravelHipWidths && throughLegRegion) {
      addIfDistinct(found, { move: "between-the-legs", startMs: a.timeMs, endMs: c.timeMs,
        confidence: clamp(0.55 + quality(window) * 0.3 + Math.min(displacement, 1) * 0.15),
        evidence: ["ball crossed the body centerline", "ball entered the region between the knees and below the hips"] });
    } else if (changedSide && displacement > config.lateralTravelHipWidths && throughHipBand) {
      addIfDistinct(found, { move: "behind-the-back", startMs: a.timeMs, endMs: c.timeMs,
        confidence: clamp(0.48 + quality(window) * 0.3 + Math.min(displacement, 1) * 0.17),
        evidence: ["ball crossed behind the hip center", "ball stayed in the narrow hip-height band", "trajectory avoided the between-knee region"] });
    } else if (changedSide && displacement > config.lateralTravelHipWidths && nearHands < torsoWidth(b) * config.handProximityHipWidths) {
      const confidence = clamp(0.45 + displacement * 0.18 + quality(window) * 0.25);
      addIfDistinct(found, { move: "crossover", startMs: a.timeMs, endMs: c.timeMs, confidence,
        evidence: ["ball crossed the hip centerline", `normalized lateral travel ${displacement.toFixed(2)}`, "ball remained near a wrist"] });
    }
  }

  for (let i = 4; i < usable.length; i += 1) {
    const window = usable.slice(i - 4, i + 1);
    const [a, , middle, , e] = window;
    if (e.timeMs - a.timeMs > config.inAndOutWindowMs) continue;
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
    if (duration < config.hesitationMinimumMs || duration > config.hesitationMaximumMs) continue;
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
  const detected = observations.filter((o) => o.ball && o.ballSource !== "interpolated").length;
  return {
    observations: count,
    poseCoverage: count ? observations.filter((o) => o.poseConfidence >= 0.35).length / count : 0,
    ballCoverage: count ? observations.filter((o) => o.ball).length / count : 0,
    detectedBallCoverage: count ? detected / count : 0,
    interpolatedBallFrames: observations.filter((o) => o.ballSource === "interpolated").length,
    moves: detectMoves(observations),
  };
}
