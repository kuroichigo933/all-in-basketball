import type { MotionObservation, Point } from "./types.ts";

export type BallMeasurement = {
  point: Point;
  confidence: number;
  source: NonNullable<MotionObservation["ballSource"]>;
  detectorId?: string;
  /** Square root of candidate area divided by frame area. */
  apparentSize?: number;
};
export type OnlineBallTrack = BallMeasurement & { predicted: boolean; measurementPoint?: Point };
export type OnlineBallTrackerConfig = {
  /** A strong, ball-sized learned detection may replace a stale heuristic identity immediately. */
  immediateDetectedMinimumConfidence: number;
  immediateDetectedMinimumSize: number;
  immediateDetectedMaximumSize: number;
};

export const DEFAULT_ONLINE_BALL_TRACKER_CONFIG: Readonly<OnlineBallTrackerConfig> = {
  immediateDetectedMinimumConfidence: 0.15,
  immediateDetectedMinimumSize: 0.045,
  immediateDetectedMaximumSize: 0.09,
};

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

const measurementQuality = (measurement: BallMeasurement) => {
  const detectedSizeMultiplier = measurement.source === "detected" && measurement.apparentSize !== undefined
    ? Math.max(0.3, Math.min(1, (measurement.apparentSize - 0.015) / 0.035)) : 1;
  const identityBoost = measurement.source === "detected" ? 1.18
    : measurement.source === "color" && (measurement.apparentSize ?? 0) >= 0.028 ? 1.1 : 1;
  return measurement.confidence * sourceReliability[measurement.source] * identityBoost * detectedSizeMultiplier;
};

const canChallengeIdentity = (measurement: BallMeasurement) =>
  (measurement.source === "detected" && (measurement.apparentSize ?? 0) >= 0.025) ||
  (measurement.source === "color" && (measurement.apparentSize ?? 0) >= 0.028);

export class OnlineBallTracker {
  private point: Point | null = null;
  private velocity: Point = { x: 0, y: 0 };
  private pending: { measurement: BallMeasurement; timeMs: number } | null = null;
  private challenger: { measurement: BallMeasurement; timeMs: number } | null = null;
  private updatedAt = 0;
  private measuredAt = 0;
  private confidence = 0;
  private readonly maxGapMs: number;
  private readonly maxSpeedPerSecond: number;
  private readonly config: OnlineBallTrackerConfig;

  constructor(maxGapMs = 500, maxSpeedPerSecond = 3.5, config: Partial<OnlineBallTrackerConfig> = {}) {
    this.maxGapMs = maxGapMs; this.maxSpeedPerSecond = maxSpeedPerSecond;
    this.config = { ...DEFAULT_ONLINE_BALL_TRACKER_CONFIG, ...config };
  }

  reset() { this.point = null; this.velocity = { x: 0, y: 0 }; this.pending = null; this.challenger = null; this.updatedAt = 0; this.measuredAt = 0; this.confidence = 0; }

  seed(timeMs: number, point: Point) {
    this.point = { ...point }; this.velocity = { x: 0, y: 0 }; this.pending = null; this.challenger = null; this.updatedAt = timeMs; this.measuredAt = timeMs; this.confidence = 0.8;
  }

  update(timeMs: number, measurements: BallMeasurement[]): OnlineBallTrack | null {
    measurements = measurements.filter((measurement) => measurement.confidence >= minimumMeasurementConfidence[measurement.source]);
    if (!this.point) {
      const first = [...measurements].filter((measurement) => sourceReliability[measurement.source] > 0)
        .sort((a, b) => measurementQuality(b) - measurementQuality(a))[0];
      if (!first) { this.pending = null; return null; }
      if (this.pending) {
        const elapsedMs = timeMs - this.pending.timeMs;
        const gate = clamp(0.14 + Math.max(0, elapsedMs) / 1000 * 1.6, 0.14, 0.3);
        const coherent = measurements.filter((measurement) => sourceReliability[measurement.source] > 0).map((measurement) => {
          const separation = Math.hypot(measurement.point.x - this.pending!.measurement.point.x, measurement.point.y - this.pending!.measurement.point.y);
          const proximity = Math.max(0, 1 - separation / gate);
          return { measurement, separation, score: measurementQuality(measurement) * 0.6 + proximity * 0.4 };
        }).filter((candidate) => elapsedMs > 0 && elapsedMs <= 250 && candidate.separation <= gate)
          .sort((a, b) => b.score - a.score)[0];
        if (coherent) {
          const dtSeconds = elapsedMs / 1000;
          const velocity = { x: (coherent.measurement.point.x - this.pending.measurement.point.x) / dtSeconds,
            y: (coherent.measurement.point.y - this.pending.measurement.point.y) / dtSeconds };
          const speed = Math.hypot(velocity.x, velocity.y); const scale = speed > this.maxSpeedPerSecond ? this.maxSpeedPerSecond / speed : 1;
          this.point = { ...coherent.measurement.point }; this.velocity = { x: velocity.x * scale, y: velocity.y * scale };
          this.pending = null; this.updatedAt = timeMs; this.measuredAt = timeMs; this.confidence = coherent.measurement.confidence;
          return { ...coherent.measurement, point: { ...this.point }, predicted: false, measurementPoint: { ...coherent.measurement.point } };
        }
      }
      this.pending = { measurement: { ...first, point: { ...first.point } }, timeMs };
      return null;
    }
    const dtMs = Math.max(1, timeMs - this.updatedAt); const dtSeconds = dtMs / 1000;
    const predicted = { x: this.point.x + this.velocity.x * dtSeconds, y: this.point.y + this.velocity.y * dtSeconds };
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    const gate = clamp(0.04 + speed * dtSeconds * 0.5 + 6 * dtSeconds ** 2, 0.14, 0.3);
    const candidates = measurements.map((measurement) => {
      const distance = Math.hypot(measurement.point.x - predicted.x, measurement.point.y - predicted.y);
      const proximity = Math.max(0, 1 - distance / gate);
      const quality = measurementQuality(measurement);
      return { measurement, distance, score: quality * 0.55 + proximity * 0.45 };
    }).filter((candidate) => candidate.distance <= gate).sort((a, b) => b.score - a.score);
    const selected = candidates[0];

    const immediateDetected = measurements.filter((measurement) => measurement.source === "detected" &&
      measurement.confidence >= this.config.immediateDetectedMinimumConfidence &&
      (measurement.apparentSize ?? 0) >= this.config.immediateDetectedMinimumSize &&
      (measurement.apparentSize ?? 0) <= this.config.immediateDetectedMaximumSize)
      .sort((a, b) => measurementQuality(b) - measurementQuality(a))[0];
    if (immediateDetected) {
      this.point = { ...immediateDetected.point }; this.velocity = { x: 0, y: 0 }; this.challenger = null;
      this.updatedAt = timeMs; this.measuredAt = timeMs; this.confidence = immediateDetected.confidence;
      return { ...immediateDetected, point: { ...this.point }, predicted: false, measurementPoint: { ...immediateDetected.point } };
    }

    // Continuity alone can trap the tracker on a stable hand or clothing edge.
    // Only a learned detection or a full-sized color component may challenge
    // that identity, and it must be motion-coherent for two consecutive frames.
    const distantIdentityCandidates = measurements.filter((measurement) =>
      canChallengeIdentity(measurement) &&
      Math.hypot(measurement.point.x - predicted.x, measurement.point.y - predicted.y) > gate)
      .sort((a, b) => measurementQuality(b) - measurementQuality(a));
    if (this.challenger) {
      const elapsedMs = timeMs - this.challenger.timeMs;
      const challengerGate = clamp(0.1 + Math.max(0, elapsedMs) / 1000 * 1.6, 0.1, 0.3);
      const coherent = distantIdentityCandidates.map((measurement) => ({ measurement,
        separation: Math.hypot(measurement.point.x - this.challenger!.measurement.point.x,
          measurement.point.y - this.challenger!.measurement.point.y) }))
        .filter((candidate) => elapsedMs > 0 && elapsedMs <= 250 && candidate.separation <= challengerGate)
        .sort((a, b) => measurementQuality(b.measurement) - measurementQuality(a.measurement))[0];
      if (coherent) {
        const challengerDtSeconds = elapsedMs / 1000;
        const velocity = { x: (coherent.measurement.point.x - this.challenger.measurement.point.x) / challengerDtSeconds,
          y: (coherent.measurement.point.y - this.challenger.measurement.point.y) / challengerDtSeconds };
        const challengerSpeed = Math.hypot(velocity.x, velocity.y);
        const velocityScale = challengerSpeed > this.maxSpeedPerSecond ? this.maxSpeedPerSecond / challengerSpeed : 1;
        this.point = { ...coherent.measurement.point };
        this.velocity = { x: velocity.x * velocityScale, y: velocity.y * velocityScale };
        this.challenger = null; this.updatedAt = timeMs; this.measuredAt = timeMs; this.confidence = coherent.measurement.confidence;
        return { ...coherent.measurement, point: { ...this.point }, predicted: false,
          measurementPoint: { ...coherent.measurement.point } };
      }
      if (elapsedMs > 250 || !distantIdentityCandidates.length) this.challenger = null;
    }
    if (!this.challenger && distantIdentityCandidates[0]) {
      this.challenger = { measurement: { ...distantIdentityCandidates[0], point: { ...distantIdentityCandidates[0].point } }, timeMs };
    }
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
    this.point = null; this.velocity = { x: 0, y: 0 }; this.challenger = null; this.updatedAt = 0; this.measuredAt = 0; this.confidence = 0;
    const first = [...measurements].filter((measurement) => sourceReliability[measurement.source] > 0)
      .sort((a, b) => measurementQuality(b) - measurementQuality(a))[0];
    this.pending = first ? { measurement: { ...first, point: { ...first.point } }, timeMs } : null;
    return null;
  }
}
