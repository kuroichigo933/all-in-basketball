import artifact from "./models/calibrated-ball-candidate-ranker-v1.json" with { type: "json" };
import type { BallMeasurement } from "./onlineBallTracker.ts";
import type { MotionObservation, Point } from "./types.ts";

export const BALL_CANDIDATE_FEATURES = [
  "confidence", "apparentSize", "appearanceConfidence", "sourceDetected", "sourceColor", "sourceMotion", "x", "y",
  "nearestWristDistance", "nearestKneeDistance", "nearestHipDistance", "xFromHipCenter", "yFromHipCenter", "yFromKneeCenter",
] as const;

type Layer = { weights: number[][]; bias: number[]; activation: "relu" | "linear" };
export type CalibratedBallCandidateRanker = {
  schemaVersion: 1; id: string; calibrationOnly: true; features: string[];
  mean: number[]; standardDeviation: number[]; layers: Layer[];
};
export type BallCandidatePoseContext = {
  leftWrist: Point; rightWrist: Point; leftHip: Point; rightHip: Point; leftKnee: Point; rightKnee: Point;
};

const distance = (first: Point, second: Point) => Math.hypot(first.x - second.x, first.y - second.y);
const midpoint = (first: Point, second: Point): Point => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });

export function candidateIdentityFeatures(measurement: BallMeasurement, pose: BallCandidatePoseContext): number[] {
  const hipCenter = midpoint(pose.leftHip, pose.rightHip);
  const kneeCenter = midpoint(pose.leftKnee, pose.rightKnee);
  const point = measurement.point;
  return [measurement.confidence, measurement.apparentSize ?? 0, measurement.appearanceConfidence ?? 0.5,
    Number(measurement.source === "detected"), Number(measurement.source === "color"), Number(measurement.source === "motion"),
    point.x, point.y, Math.min(distance(point, pose.leftWrist), distance(point, pose.rightWrist)),
    Math.min(distance(point, pose.leftKnee), distance(point, pose.rightKnee)),
    Math.min(distance(point, pose.leftHip), distance(point, pose.rightHip)),
    point.x - hipCenter.x, point.y - hipCenter.y, point.y - kneeCenter.y];
}

export function validateCalibratedBallCandidateRanker(value: unknown): CalibratedBallCandidateRanker {
  if (!value || typeof value !== "object") throw new Error("Ball candidate ranker must be an object.");
  const model = value as Partial<CalibratedBallCandidateRanker>;
  if (model.schemaVersion !== 1 || model.calibrationOnly !== true || !model.id) throw new Error("Unsupported ball candidate ranker artifact.");
  if (JSON.stringify(model.features) !== JSON.stringify(BALL_CANDIDATE_FEATURES)) throw new Error("Ball candidate ranker feature contract does not match runtime.");
  const width = BALL_CANDIDATE_FEATURES.length;
  if (model.mean?.length !== width || model.standardDeviation?.length !== width || !model.layers?.length) throw new Error("Ball candidate ranker dimensions are invalid.");
  let inputWidth: number = width;
  for (const layer of model.layers) {
    if (!Array.isArray(layer.weights) || layer.weights.length !== layer.bias?.length ||
      layer.weights.some((row) => row.length !== inputWidth) || !["relu", "linear"].includes(layer.activation)) {
      throw new Error("Ball candidate ranker layer dimensions are invalid.");
    }
    inputWidth = layer.weights.length;
  }
  if (inputWidth !== 1) throw new Error("Ball candidate ranker must emit one identity logit.");
  return model as CalibratedBallCandidateRanker;
}

export const CALIBRATED_BALL_CANDIDATE_RANKER = validateCalibratedBallCandidateRanker(artifact);

export function scoreBallCandidateIdentity(measurement: BallMeasurement, pose: BallCandidatePoseContext,
  model: CalibratedBallCandidateRanker = CALIBRATED_BALL_CANDIDATE_RANKER) {
  let values = candidateIdentityFeatures(measurement, pose).map((value, index) =>
    (value - model.mean[index]) / Math.max(0.01, model.standardDeviation[index]));
  for (const layer of model.layers) values = layer.weights.map((weights, output) => {
    const value = weights.reduce((sum, weight, input) => sum + weight * values[input], layer.bias[output]);
    return layer.activation === "relu" ? Math.max(0, value) : value;
  });
  const logit = Math.max(-30, Math.min(30, values[0]));
  return 1 / (1 + Math.exp(-logit));
}

export function rankBallCandidates<T extends BallMeasurement>(measurements: T[], pose: BallCandidatePoseContext) {
  return measurements.map((measurement) => ({ ...measurement, identityConfidence: scoreBallCandidateIdentity(measurement, pose) }));
}

export function poseContextFromObservation(observation: MotionObservation): BallCandidatePoseContext {
  return { leftWrist: observation.leftWrist, rightWrist: observation.rightWrist, leftHip: observation.leftHip,
    rightHip: observation.rightHip, leftKnee: observation.leftKnee, rightKnee: observation.rightKnee };
}
