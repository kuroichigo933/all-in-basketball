import type { MotionObservation, Point } from "./types.ts";

export type BallTrackingOptions = {
  maxGapMs?: number;
  maxNormalizedSpeedPerSecond?: number;
  confidenceDecay?: number;
};

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Fills only short gaps bounded by real detections. This deliberately avoids
 * extrapolation: an unbounded missing ball remains missing instead of becoming
 * a confident-looking guess.
 */
export function trackBallContinuity(
  observations: MotionObservation[],
  options: BallTrackingOptions = {},
): MotionObservation[] {
  const maxGapMs = options.maxGapMs ?? 300;
  const maxSpeed = options.maxNormalizedSpeedPerSecond ?? 4;
  const confidenceDecay = options.confidenceDecay ?? 0.7;
  const tracked: MotionObservation[] = observations.map((observation) => ({
    ...observation,
    ballSource: observation.ball ? "detected" as const : "missing" as const,
  }));

  let previousDetected = -1;
  for (let index = 0; index < tracked.length; index += 1) {
    if (!tracked[index].ball) continue;
    if (previousDetected >= 0 && index - previousDetected > 1) {
      const before = tracked[previousDetected];
      const after = tracked[index];
      const elapsedMs = after.timeMs - before.timeMs;
      const speed = distance(before.ball!, after.ball!) / (elapsedMs / 1000);

      if (elapsedMs <= maxGapMs && elapsedMs > 0 && speed <= maxSpeed) {
        for (let gapIndex = previousDetected + 1; gapIndex < index; gapIndex += 1) {
          const ratio = (tracked[gapIndex].timeMs - before.timeMs) / elapsedMs;
          tracked[gapIndex] = {
            ...tracked[gapIndex],
            ball: {
              x: before.ball!.x + (after.ball!.x - before.ball!.x) * ratio,
              y: before.ball!.y + (after.ball!.y - before.ball!.y) * ratio,
            },
            ballConfidence: Math.min(before.ballConfidence, after.ballConfidence) * confidenceDecay,
            ballSource: "interpolated",
          };
        }
      }
    }
    previousDetected = index;
  }
  return tracked;
}
