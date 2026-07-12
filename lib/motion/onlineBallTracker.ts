import type { MotionObservation, Point } from "./types.ts";

export type BallMeasurement = { point: Point; confidence: number; source: NonNullable<MotionObservation["ballSource"]> };
export type OnlineBallTrack = BallMeasurement & { predicted: boolean };

export class OnlineBallTracker {
  private point: Point | null = null;
  private velocity: Point = { x: 0, y: 0 };
  private updatedAt = 0;
  private measuredAt = 0;
  private confidence = 0;
  private readonly maxGapMs: number;
  private readonly maxSpeedPerSecond: number;

  constructor(maxGapMs = 320, maxSpeedPerSecond = 5.5) { this.maxGapMs = maxGapMs; this.maxSpeedPerSecond = maxSpeedPerSecond; }

  reset() { this.point = null; this.velocity = { x: 0, y: 0 }; this.updatedAt = 0; this.measuredAt = 0; this.confidence = 0; }

  seed(timeMs: number, point: Point) {
    this.point = { ...point }; this.velocity = { x: 0, y: 0 }; this.updatedAt = timeMs; this.measuredAt = timeMs; this.confidence = 0.8;
  }

  update(timeMs: number, measurements: BallMeasurement[]): OnlineBallTrack | null {
    if (!this.point) {
      const first = measurements.sort((a, b) => b.confidence - a.confidence)[0];
      if (!first) return null; this.seed(timeMs, first.point); this.confidence = first.confidence;
      return { ...first, point: { ...first.point }, predicted: false };
    }
    const dtMs = Math.max(1, timeMs - this.updatedAt); const dtSeconds = dtMs / 1000;
    const predicted = { x: this.point.x + this.velocity.x * dtSeconds, y: this.point.y + this.velocity.y * dtSeconds };
    const gate = 0.06 + this.maxSpeedPerSecond * dtSeconds;
    const candidates = measurements.map((measurement) => {
      const distance = Math.hypot(measurement.point.x - predicted.x, measurement.point.y - predicted.y);
      return { measurement, distance, score: measurement.confidence * 0.45 + Math.max(0, 1 - distance / gate) * 0.55 };
    }).filter((candidate) => candidate.distance <= gate).sort((a, b) => b.score - a.score);
    const selected = candidates[0]?.measurement;
    if (selected) {
      const measuredVelocity = { x: (selected.point.x - this.point.x) / dtSeconds, y: (selected.point.y - this.point.y) / dtSeconds };
      this.velocity = { x: this.velocity.x * 0.45 + measuredVelocity.x * 0.55, y: this.velocity.y * 0.45 + measuredVelocity.y * 0.55 };
      this.point = { x: selected.point.x * 0.88 + predicted.x * 0.12, y: selected.point.y * 0.88 + predicted.y * 0.12 };
      this.updatedAt = timeMs; this.measuredAt = timeMs; this.confidence = selected.confidence;
      return { ...selected, point: { ...this.point }, predicted: false };
    }
    if (timeMs - this.measuredAt <= this.maxGapMs) {
      this.point = predicted; this.updatedAt = timeMs; this.confidence *= 0.72;
      return { point: { ...this.point }, confidence: this.confidence, source: "interpolated", predicted: true };
    }
    this.reset(); return null;
  }
}
