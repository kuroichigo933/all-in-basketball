import type { MotionObservation, Point } from "./types.ts";

export type BallMeasurement = { point: Point; confidence: number; source: NonNullable<MotionObservation["ballSource"]> };
export type OnlineBallTrack = BallMeasurement & { predicted: boolean; measurementPoint?: Point };

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const sourceReliability: Record<BallMeasurement["source"], number> = {
  detected: 1,
  color: 0.92,
  motion: 0.72,
  interpolated: 0,
  missing: 0,
};
const minimumMeasurementConfidence: Record<BallMeasurement["source"], number> = {
  detected: 0.08, color: 0.08, motion: 0.08, interpolated: 1, missing: 1,
};

export class OnlineBallTracker {
  private point: Point | null = null;
  private velocity: Point = { x: 0, y: 0 };
  private updatedAt = 0;
  private measuredAt = 0;
  private confidence = 0;
  private readonly maxGapMs: number;
  private readonly maxSpeedPerSecond: number;

  constructor(maxGapMs = 500, maxSpeedPerSecond = 3.5) { this.maxGapMs = maxGapMs; this.maxSpeedPerSecond = maxSpeedPerSecond; }

  reset() { this.point = null; this.velocity = { x: 0, y: 0 }; this.updatedAt = 0; this.measuredAt = 0; this.confidence = 0; }

  seed(timeMs: number, point: Point) {
    this.point = { ...point }; this.velocity = { x: 0, y: 0 }; this.updatedAt = timeMs; this.measuredAt = timeMs; this.confidence = 0.8;
  }

  update(timeMs: number, measurements: BallMeasurement[]): OnlineBallTrack | null {
    measurements = measurements.filter((measurement) => measurement.confidence >= minimumMeasurementConfidence[measurement.source]);
    if (!this.point) {
      const first = [...measurements].filter((measurement) => sourceReliability[measurement.source] > 0)
        .sort((a, b) => b.confidence * sourceReliability[b.source] - a.confidence * sourceReliability[a.source])[0];
      if (!first) return null; this.seed(timeMs, first.point); this.confidence = first.confidence;
      return { ...first, point: { ...first.point }, predicted: false, measurementPoint: { ...first.point } };
    }
    const dtMs = Math.max(1, timeMs - this.updatedAt); const dtSeconds = dtMs / 1000;
    const predicted = { x: this.point.x + this.velocity.x * dtSeconds, y: this.point.y + this.velocity.y * dtSeconds };
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    const gate = clamp(0.04 + speed * dtSeconds * 0.5 + 6 * dtSeconds ** 2, 0.14, 0.3);
    const candidates = measurements.map((measurement) => {
      const distance = Math.hypot(measurement.point.x - predicted.x, measurement.point.y - predicted.y);
      const proximity = Math.max(0, 1 - distance / gate);
      const quality = measurement.confidence * sourceReliability[measurement.source];
      return { measurement, distance, score: quality * 0.35 + proximity * 0.65 };
    }).filter((candidate) => candidate.distance <= gate).sort((a, b) => b.score - a.score);
    const selected = candidates[0];
    if (selected) {
      const residual = { x: selected.measurement.point.x - predicted.x, y: selected.measurement.point.y - predicted.y };
      const nextVelocity = { x: this.velocity.x + residual.x / dtSeconds * 0.2, y: this.velocity.y + residual.y / dtSeconds * 0.2 };
      const nextSpeed = Math.hypot(nextVelocity.x, nextVelocity.y); const velocityScale = nextSpeed > this.maxSpeedPerSecond ? this.maxSpeedPerSecond / nextSpeed : 1;
      this.velocity = { x: nextVelocity.x * velocityScale, y: nextVelocity.y * velocityScale };
      this.point = { x: clamp(predicted.x + residual.x * 0.82, 0, 1), y: clamp(predicted.y + residual.y * 0.82, 0, 1) };
      this.updatedAt = timeMs; this.measuredAt = timeMs; this.confidence = selected.measurement.confidence;
      return { ...selected.measurement, point: { ...this.point }, predicted: false, measurementPoint: { ...selected.measurement.point } };
    }
    if (timeMs - this.measuredAt <= this.maxGapMs) {
      this.point = { x: clamp(predicted.x, 0, 1), y: clamp(predicted.y, 0, 1) }; this.updatedAt = timeMs;
      this.confidence *= Math.exp(-dtMs / 300);
      return { point: { ...this.point }, confidence: this.confidence, source: "interpolated", predicted: true };
    }
    this.reset(); return null;
  }
}
