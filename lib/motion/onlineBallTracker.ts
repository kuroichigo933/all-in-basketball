import type { MotionObservation, Point } from "./types.ts";

export type BallMeasurement = {
  point: Point;
  confidence: number;
  source: NonNullable<MotionObservation["ballSource"]>;
  detectorId?: string;
  /** Square root of candidate area divided by frame area. */
  apparentSize?: number;
  /** Color-neutral component shape/contrast or learned-box roundness evidence. */
  appearanceConfidence?: number;
  /** Pose-relative calibration candidate-ranker output. */
  identityConfidence?: number;
};
export type OnlineBallTrack = BallMeasurement & { predicted: boolean; measurementPoint?: Point };
export type OnlineBallTrackerConfig = {
  /** A strong, ball-sized learned detection may replace a stale heuristic identity immediately. */
  immediateDetectedMinimumConfidence: number;
  immediateDetectedMinimumSize: number;
  immediateDetectedMaximumSize: number;
  /** Motion candidates may challenge a stale identity only after two coherent frames. */
  challengerMotionMinimumConfidence: number;
  challengerMotionMinimumSize: number;
  challengerColorMinimumConfidence: number;
  /** Learned detections farther than this from the predicted track must confirm as challengers. */
  immediateDetectedMaximumDistance: number;
  /** Relative influence of candidate identity quality during normal association. */
  associationQualityWeight: number;
  /** Relative influence of apparent-size continuity during normal association. */
  associationSizeWeight: number;
  /** Relative influence of color-neutral shape/contrast evidence during normal association. */
  associationAppearanceWeight: number;
  /** Relative influence of color-neutral appearance when ranking distant identity challengers. */
  challengerAppearanceWeight: number;
  /** Relative influence of the calibrated ranker in identity-quality comparisons. */
  identityQualityWeight: number;
  /** A candidate above this ranker score may replace the current track immediately. */
  identityOverrideMinimumConfidence: number;
  /** Fraction of the measurement residual applied to the emitted track point. */
  measurementCorrectionGain: number;
  /** Fraction of the measurement residual applied to velocity estimation. */
  velocityCorrectionGain: number;
};

export const DEFAULT_ONLINE_BALL_TRACKER_CONFIG: Readonly<OnlineBallTrackerConfig> = {
  immediateDetectedMinimumConfidence: 0.1,
  immediateDetectedMinimumSize: 0.045,
  immediateDetectedMaximumSize: 0.09,
  challengerMotionMinimumConfidence: 0.2,
  challengerMotionMinimumSize: 0.035,
  challengerColorMinimumConfidence: 0.25,
  immediateDetectedMaximumDistance: 0.3,
  associationQualityWeight: 0.55,
  associationSizeWeight: 0.15,
  associationAppearanceWeight: 0.3,
  challengerAppearanceWeight: 0,
  identityQualityWeight: 0.75,
  identityOverrideMinimumConfidence: 0.85,
  measurementCorrectionGain: 1,
  velocityCorrectionGain: 0.35,
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

const identityQuality = (measurement: BallMeasurement, config: OnlineBallTrackerConfig) => {
  const weight = clamp(config.identityQualityWeight, 0, 1);
  return measurementQuality(measurement) * (1 - weight) + (measurement.identityConfidence ?? 0.5) * weight;
};

const reportedConfidence = (measurement: BallMeasurement, config: OnlineBallTrackerConfig) =>
  Math.max(measurement.confidence, (measurement.identityConfidence ?? 0) * clamp(config.identityQualityWeight, 0, 1));

const sizeContinuity = (measurement: BallMeasurement, trackedSize: number | null) => {
  if (!trackedSize || !measurement.apparentSize) return 0.5;
  const octaveDistance = Math.abs(Math.log2(measurement.apparentSize / trackedSize));
  return Math.max(0, 1 - octaveDistance);
};

const canChallengeIdentity = (measurement: BallMeasurement, config: OnlineBallTrackerConfig) =>
  (measurement.source === "detected" && (measurement.apparentSize ?? 0) >= 0.025) ||
  (measurement.source === "color" && measurement.confidence >= config.challengerColorMinimumConfidence &&
    (measurement.apparentSize ?? 0) >= 0.028) ||
  (measurement.source === "motion" && measurement.confidence >= config.challengerMotionMinimumConfidence &&
    (measurement.apparentSize ?? 0) >= config.challengerMotionMinimumSize);

const challengerQuality = (measurement: BallMeasurement, config: OnlineBallTrackerConfig) => {
  const appearanceWeight = clamp(config.challengerAppearanceWeight, 0, 1);
  return identityQuality(measurement, config) * (1 - appearanceWeight) +
    (measurement.appearanceConfidence ?? 0.5) * appearanceWeight;
};

export class OnlineBallTracker {
  private point: Point | null = null;
  private velocity: Point = { x: 0, y: 0 };
  private pending: { measurement: BallMeasurement; timeMs: number } | null = null;
  private challenger: { measurement: BallMeasurement; timeMs: number } | null = null;
  private updatedAt = 0;
  private measuredAt = 0;
  private confidence = 0;
  private apparentSize: number | null = null;
  private readonly maxGapMs: number;
  private readonly maxSpeedPerSecond: number;
  private readonly config: OnlineBallTrackerConfig;

  constructor(maxGapMs = 500, maxSpeedPerSecond = 3.5, config: Partial<OnlineBallTrackerConfig> = {}) {
    this.maxGapMs = maxGapMs; this.maxSpeedPerSecond = maxSpeedPerSecond;
    this.config = { ...DEFAULT_ONLINE_BALL_TRACKER_CONFIG, ...config };
  }

  reset() { this.point = null; this.velocity = { x: 0, y: 0 }; this.pending = null; this.challenger = null; this.updatedAt = 0; this.measuredAt = 0; this.confidence = 0; this.apparentSize = null; }

  seed(timeMs: number, point: Point) {
    this.point = { ...point }; this.velocity = { x: 0, y: 0 }; this.pending = null; this.challenger = null; this.updatedAt = timeMs; this.measuredAt = timeMs; this.confidence = 0.8; this.apparentSize = null;
  }

  private rememberSize(measurement: BallMeasurement) {
    if (!measurement.apparentSize) return;
    this.apparentSize = this.apparentSize === null ? measurement.apparentSize : this.apparentSize * 0.7 + measurement.apparentSize * 0.3;
  }

  update(timeMs: number, measurements: BallMeasurement[], acceptMeasurements = true): OnlineBallTrack | null {
    if (!acceptMeasurements) measurements = [];
    measurements = measurements.filter((measurement) =>
      measurement.confidence >= minimumMeasurementConfidence[measurement.source] ||
      (measurement.identityConfidence ?? 0) >= this.config.identityOverrideMinimumConfidence);
    if (!this.point) {
      const first = [...measurements].filter((measurement) => sourceReliability[measurement.source] > 0)
        .sort((a, b) => identityQuality(b, this.config) - identityQuality(a, this.config))[0];
      if (!first) { this.pending = null; return null; }
      if (this.pending) {
        const elapsedMs = timeMs - this.pending.timeMs;
        const gate = clamp(0.14 + Math.max(0, elapsedMs) / 1000 * 1.6, 0.14, 0.3);
        const coherent = measurements.filter((measurement) => sourceReliability[measurement.source] > 0).map((measurement) => {
          const separation = Math.hypot(measurement.point.x - this.pending!.measurement.point.x, measurement.point.y - this.pending!.measurement.point.y);
          const proximity = Math.max(0, 1 - separation / gate);
          return { measurement, separation, score: identityQuality(measurement, this.config) * 0.6 + proximity * 0.4 };
        }).filter((candidate) => elapsedMs > 0 && elapsedMs <= 250 && candidate.separation <= gate)
          .sort((a, b) => b.score - a.score)[0];
        if (coherent) {
          const dtSeconds = elapsedMs / 1000;
          const velocity = { x: (coherent.measurement.point.x - this.pending.measurement.point.x) / dtSeconds,
            y: (coherent.measurement.point.y - this.pending.measurement.point.y) / dtSeconds };
          const speed = Math.hypot(velocity.x, velocity.y); const scale = speed > this.maxSpeedPerSecond ? this.maxSpeedPerSecond / speed : 1;
          this.point = { ...coherent.measurement.point }; this.velocity = { x: velocity.x * scale, y: velocity.y * scale };
          this.rememberSize(coherent.measurement);
          this.pending = null; this.updatedAt = timeMs; this.measuredAt = timeMs;
          this.confidence = reportedConfidence(coherent.measurement, this.config);
          return { ...coherent.measurement, confidence: this.confidence, point: { ...this.point }, predicted: false,
            measurementPoint: { ...coherent.measurement.point } };
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
      const quality = identityQuality(measurement, this.config);
      const size = sizeContinuity(measurement, this.apparentSize);
      const appearance = measurement.appearanceConfidence ?? 0.5;
      const proximityWeight = Math.max(0, 1 - this.config.associationQualityWeight - this.config.associationSizeWeight -
        this.config.associationAppearanceWeight);
      return { measurement, distance, score: quality * this.config.associationQualityWeight +
        proximity * proximityWeight + size * this.config.associationSizeWeight + appearance * this.config.associationAppearanceWeight };
    }).filter((candidate) => candidate.distance <= gate).sort((a, b) => b.score - a.score);
    const selected = candidates[0];

    const identityOverride = measurements.filter((measurement) =>
      (measurement.identityConfidence ?? 0) >= this.config.identityOverrideMinimumConfidence)
      .sort((a, b) => (b.identityConfidence ?? 0) - (a.identityConfidence ?? 0))[0];
    if (identityOverride) {
      const residual = { x: identityOverride.point.x - predicted.x, y: identityOverride.point.y - predicted.y };
      const proposedVelocity = { x: residual.x / dtSeconds, y: residual.y / dtSeconds };
      const proposedSpeed = Math.hypot(proposedVelocity.x, proposedVelocity.y);
      const velocityScale = proposedSpeed > this.maxSpeedPerSecond ? this.maxSpeedPerSecond / proposedSpeed : 1;
      this.point = { ...identityOverride.point };
      this.velocity = { x: proposedVelocity.x * velocityScale, y: proposedVelocity.y * velocityScale };
      this.challenger = null; this.rememberSize(identityOverride); this.updatedAt = timeMs; this.measuredAt = timeMs;
      this.confidence = reportedConfidence(identityOverride, this.config);
      return { ...identityOverride, confidence: this.confidence, point: { ...this.point }, predicted: false,
        measurementPoint: { ...identityOverride.point } };
    }

    const immediateDetected = measurements.filter((measurement) => measurement.source === "detected" &&
      measurement.confidence >= this.config.immediateDetectedMinimumConfidence &&
      (measurement.apparentSize ?? 0) >= this.config.immediateDetectedMinimumSize &&
      (measurement.apparentSize ?? 0) <= this.config.immediateDetectedMaximumSize &&
      Math.hypot(measurement.point.x - predicted.x, measurement.point.y - predicted.y) <= this.config.immediateDetectedMaximumDistance)
      .sort((a, b) => identityQuality(b, this.config) - identityQuality(a, this.config))[0];
    if (immediateDetected) {
      this.point = { ...immediateDetected.point }; this.velocity = { x: 0, y: 0 }; this.challenger = null;
      this.rememberSize(immediateDetected);
      this.updatedAt = timeMs; this.measuredAt = timeMs; this.confidence = reportedConfidence(immediateDetected, this.config);
      return { ...immediateDetected, confidence: this.confidence, point: { ...this.point }, predicted: false,
        measurementPoint: { ...immediateDetected.point } };
    }

    // Continuity alone can trap the tracker on a stable hand or clothing edge.
    // Only a learned detection or a full-sized color component may challenge
    // that identity, and it must be motion-coherent for two consecutive frames.
    const distantIdentityCandidates = measurements.filter((measurement) =>
      canChallengeIdentity(measurement, this.config) &&
      Math.hypot(measurement.point.x - predicted.x, measurement.point.y - predicted.y) > gate)
      .sort((a, b) => challengerQuality(b, this.config) - challengerQuality(a, this.config));
    if (this.challenger) {
      const elapsedMs = timeMs - this.challenger.timeMs;
      const challengerGate = clamp(0.1 + Math.max(0, elapsedMs) / 1000 * 1.6, 0.1, 0.3);
      const coherent = distantIdentityCandidates.map((measurement) => ({ measurement,
        separation: Math.hypot(measurement.point.x - this.challenger!.measurement.point.x,
          measurement.point.y - this.challenger!.measurement.point.y) }))
        .filter((candidate) => elapsedMs > 0 && elapsedMs <= 250 && candidate.separation <= challengerGate)
        .sort((a, b) => challengerQuality(b.measurement, this.config) - challengerQuality(a.measurement, this.config))[0];
      if (coherent) {
        const challengerDtSeconds = elapsedMs / 1000;
        const velocity = { x: (coherent.measurement.point.x - this.challenger.measurement.point.x) / challengerDtSeconds,
          y: (coherent.measurement.point.y - this.challenger.measurement.point.y) / challengerDtSeconds };
        const challengerSpeed = Math.hypot(velocity.x, velocity.y);
        const velocityScale = challengerSpeed > this.maxSpeedPerSecond ? this.maxSpeedPerSecond / challengerSpeed : 1;
        this.point = { ...coherent.measurement.point };
        this.velocity = { x: velocity.x * velocityScale, y: velocity.y * velocityScale };
        this.rememberSize(coherent.measurement);
        this.challenger = null; this.updatedAt = timeMs; this.measuredAt = timeMs;
        this.confidence = reportedConfidence(coherent.measurement, this.config);
        return { ...coherent.measurement, confidence: this.confidence, point: { ...this.point }, predicted: false,
          measurementPoint: { ...coherent.measurement.point } };
      }
      if (elapsedMs > 250 || !distantIdentityCandidates.length) this.challenger = null;
    }
    if (!this.challenger && distantIdentityCandidates[0]) {
      this.challenger = { measurement: { ...distantIdentityCandidates[0], point: { ...distantIdentityCandidates[0].point } }, timeMs };
    }
    if (selected) {
      const residual = { x: selected.measurement.point.x - predicted.x, y: selected.measurement.point.y - predicted.y };
      const nextVelocity = { x: this.velocity.x + residual.x / dtSeconds * this.config.velocityCorrectionGain,
        y: this.velocity.y + residual.y / dtSeconds * this.config.velocityCorrectionGain };
      const nextSpeed = Math.hypot(nextVelocity.x, nextVelocity.y); const velocityScale = nextSpeed > this.maxSpeedPerSecond ? this.maxSpeedPerSecond / nextSpeed : 1;
      this.velocity = { x: nextVelocity.x * velocityScale, y: nextVelocity.y * velocityScale };
      this.point = { x: clamp(predicted.x + residual.x * this.config.measurementCorrectionGain, 0, 1),
        y: clamp(predicted.y + residual.y * this.config.measurementCorrectionGain, 0, 1) };
      this.rememberSize(selected.measurement);
      this.updatedAt = timeMs; this.measuredAt = timeMs; this.confidence = reportedConfidence(selected.measurement, this.config);
      return { ...selected.measurement, confidence: this.confidence, point: { ...this.point }, predicted: false,
        measurementPoint: { ...selected.measurement.point } };
    }
    if (timeMs - this.measuredAt <= this.maxGapMs) {
      this.point = { x: clamp(predicted.x, 0, 1), y: clamp(predicted.y, 0, 1) }; this.updatedAt = timeMs;
      this.confidence *= Math.exp(-dtMs / 300);
      return { point: { ...this.point }, confidence: this.confidence, source: "interpolated", predicted: true };
    }
    this.point = null; this.velocity = { x: 0, y: 0 }; this.challenger = null; this.updatedAt = 0; this.measuredAt = 0; this.confidence = 0; this.apparentSize = null;
    const first = [...measurements].filter((measurement) => sourceReliability[measurement.source] > 0)
      .sort((a, b) => identityQuality(b, this.config) - identityQuality(a, this.config))[0];
    this.pending = first ? { measurement: { ...first, point: { ...first.point } }, timeMs } : null;
    return null;
  }
}
