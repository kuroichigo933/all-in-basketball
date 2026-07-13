import type { BallMeasurement } from "./onlineBallTracker.ts";
import type { Point } from "./types.ts";

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const visible = (point: Point | undefined): point is Point => Boolean(point && (point.visibility ?? 1) >= 0.35);

/** Demotes body/shorts blobs while retaining a wrist-controlled ball and low bounce. */
export function applyPoseBallPrior(measurement: BallMeasurement, points: Point[]): BallMeasurement {
  const wrists = [points[15], points[16]].filter(visible);
  const knees = [points[25], points[26]].filter(visible);
  const hips = [points[23], points[24]].filter(visible);
  const ankles = [points[27], points[28]].filter(visible);
  if (!wrists.length || measurement.source === "detected") return measurement;
  const widths = [[points[11], points[12]], [points[23], points[24]]]
    .filter((pair): pair is [Point, Point] => visible(pair[0]) && visible(pair[1]))
    .map(([a, b]) => distance(a, b));
  const bodyScale = Math.max(0.08, ...widths);
  const wristProximity = Math.max(0, 1 - Math.min(...wrists.map((point) => distance(measurement.point, point))) / (bodyScale * 2.2));
  const nearestKneeDistance = knees.length ? Math.min(...knees.map((point) => distance(measurement.point, point))) : Number.POSITIVE_INFINITY;
  const kneeProximity = Math.max(0, 1 - nearestKneeDistance / (bodyScale * 2.4));
  const bodyPoints = [...hips, ...knees];
  const hipTop = hips.length ? Math.min(...hips.map((point) => point.y)) : Number.POSITIVE_INFINITY;
  const kneeBottom = knees.length ? Math.max(...knees.map((point) => point.y)) : Number.NEGATIVE_INFINITY;
  const insideThighs = bodyPoints.length >= 4 &&
    measurement.point.x >= Math.min(...bodyPoints.map((point) => point.x)) - bodyScale * 0.2 &&
    measurement.point.x <= Math.max(...bodyPoints.map((point) => point.x)) + bodyScale * 0.2 &&
    measurement.point.y >= hipTop - bodyScale * 0.1 && measurement.point.y <= kneeBottom + bodyScale * 0.1;
  const belowKnees = knees.length > 0 && measurement.point.y > kneeBottom + bodyScale * 0.05;
  const belowFeet = ankles.length > 0 && measurement.point.y > Math.max(...ankles.map((point) => point.y)) + bodyScale * 0.12;

  let multiplier = 0.18 + wristProximity * 0.82;
  if (belowKnees) multiplier = Math.max(multiplier, 0.35 + kneeProximity * 0.25);
  else if (!insideThighs) multiplier = Math.max(multiplier, 0.25 + kneeProximity * 0.25);
  if (insideThighs && wristProximity < 0.65) multiplier *= 0.35;
  if (belowKnees && nearestKneeDistance < bodyScale * 0.5 && wristProximity < 0.5) multiplier *= 0.18;
  if (belowFeet) multiplier *= 0.12;
  return { ...measurement, confidence: measurement.confidence * multiplier };
}
