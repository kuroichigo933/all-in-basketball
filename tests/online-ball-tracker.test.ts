import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ONLINE_BALL_TRACKER_CONFIG, OnlineBallTracker } from "../lib/motion/onlineBallTracker.ts";

const candidate = (x: number, y: number, confidence: number, source: "detected" | "color" | "motion", apparentSize?: number) =>
  ({ point: { x, y }, confidence, source, apparentSize });

test("fuses candidates by continuity instead of confidence alone", () => {
  const tracker = new OnlineBallTracker(); tracker.seed(0, { x: 0.2, y: 0.5 });
  const result = tracker.update(100, [
    { point: { x: 0.24, y: 0.52 }, confidence: 0.5, source: "motion" },
    { point: { x: 0.9, y: 0.1 }, confidence: 0.99, source: "detected" },
  ]);
  assert.ok(result); assert.ok(result.point.x < 0.3); assert.equal(result.source, "motion");
});

test("bridges short losses but expires stale tracks", () => {
  const tracker = new OnlineBallTracker(300); tracker.seed(0, { x: 0.2, y: 0.5 });
  tracker.update(100, [{ point: { x: 0.3, y: 0.5 }, confidence: 0.8, source: "detected" }]);
  const predicted = tracker.update(200, []); assert.ok(predicted?.predicted); assert.ok(predicted.point.x > 0.3);
  assert.equal(tracker.update(450, []), null);
});

test("manual seed enables low-confidence reacquisition", () => {
  const tracker = new OnlineBallTracker(); tracker.seed(1000, { x: 0.5, y: 0.6 });
  const result = tracker.update(1100, [{ point: { x: 0.54, y: 0.62 }, confidence: 0.25, source: "motion" }]);
  assert.ok(result); assert.equal(result.predicted, false);
});

test("rejects a far high-confidence distractor after establishing a track", () => {
  const tracker = new OnlineBallTracker(); tracker.seed(0, { x: 0.2, y: 0.5 });
  tracker.update(100, [{ point: { x: 0.24, y: 0.5 }, confidence: 0.65, source: "motion" }]);
  const result = tracker.update(200, [{ point: { x: 0.58, y: 0.5 }, confidence: 0.99, source: "detected" }]);
  assert.ok(result?.predicted); assert.ok(result.point.x < 0.35);
});

test("retains plausible fast motion with an adaptive association gate", () => {
  const tracker = new OnlineBallTracker(); tracker.seed(0, { x: 0.2, y: 0.5 });
  assert.equal(tracker.update(100, [{ point: { x: 0.3, y: 0.5 }, confidence: 0.7, source: "motion" }])?.predicted, false);
  const result = tracker.update(200, [{ point: { x: 0.43, y: 0.5 }, confidence: 0.7, source: "motion" }]);
  assert.ok(result); assert.equal(result.predicted, false); assert.ok(result.point.x > 0.38);
});

test("decays prediction confidence by elapsed time rather than frame count", () => {
  const stepped = new OnlineBallTracker(); stepped.seed(0, { x: 0.2, y: 0.5 });
  stepped.update(100, []); const steppedResult = stepped.update(200, []);
  const single = new OnlineBallTracker(); single.seed(0, { x: 0.2, y: 0.5 });
  const singleResult = single.update(200, []);
  assert.ok(steppedResult && singleResult);
  assert.ok(Math.abs(steppedResult.confidence - singleResult.confidence) < 0.000001);
});

test("does not acquire a negligible pose-demoted visual candidate", () => {
  const tracker = new OnlineBallTracker();
  assert.equal(tracker.update(0, [{ point: { x: 0.5, y: 0.9 }, confidence: 0.02, source: "motion" }]), null);
});

test("does not acquire candidates while player evidence is unavailable", () => {
  const tracker = new OnlineBallTracker();
  const distractor = [{ point: { x: 0.5, y: 0.5 }, confidence: 0.9, source: "color" as const }];
  assert.equal(tracker.update(0, distractor, false), null);
  assert.equal(tracker.update(100, distractor, false), null);
});

test("predicts briefly instead of resetting when player evidence is temporarily unavailable", () => {
  const tracker = new OnlineBallTracker(300); tracker.seed(0, { x: 0.2, y: 0.5 });
  tracker.update(100, [{ point: { x: 0.3, y: 0.5 }, confidence: 0.8, source: "motion" }]);
  const predicted = tracker.update(200, [{ point: { x: 0.9, y: 0.1 }, confidence: 0.99, source: "color" }], false);
  assert.ok(predicted?.predicted); assert.ok(predicted.point.x < 0.5);
  assert.equal(tracker.update(450, [], false), null);
});

test("requires two coherent frames before automatic acquisition", () => {
  const tracker = new OnlineBallTracker();
  assert.equal(tracker.update(0, [{ point: { x: 0.4, y: 0.6 }, confidence: 0.7, source: "motion" }]), null);
  const acquired = tracker.update(100, [{ point: { x: 0.46, y: 0.62 }, confidence: 0.65, source: "motion" }]);
  assert.ok(acquired); assert.equal(acquired.predicted, false);
  assert.deepEqual(acquired.measurementPoint, { x: 0.46, y: 0.62 });
});

test("acquires a held ball after two coherent frames", () => {
  const tracker = new OnlineBallTracker();
  assert.equal(tracker.update(0, [{ point: { x: 0.5, y: 0.6 }, confidence: 0.95, source: "motion" }]), null);
  const acquired = tracker.update(100, [{ point: { x: 0.5, y: 0.6 }, confidence: 0.95, source: "motion" }]);
  assert.ok(acquired); assert.equal(acquired.predicted, false);
});

test("reports provenance only from the measurement that confirms acquisition", () => {
  const tracker = new OnlineBallTracker();
  assert.equal(tracker.update(0, [{ point: { x: 0.4, y: 0.6 }, confidence: 0.9, source: "detected", detectorId: "pending-detector" }]), null);
  const acquired = tracker.update(100, [{ point: { x: 0.43, y: 0.61 }, confidence: 0.7, source: "motion" }]);
  assert.ok(acquired); assert.equal(acquired.source, "motion"); assert.equal(acquired.detectorId, undefined);
  assert.deepEqual(acquired.measurementPoint, { x: 0.43, y: 0.61 });
});

test("does not reseed an expired track from one isolated distractor", () => {
  const tracker = new OnlineBallTracker(300); tracker.seed(0, { x: 0.2, y: 0.5 });
  tracker.update(100, [{ point: { x: 0.24, y: 0.5 }, confidence: 0.7, source: "motion" }]);
  assert.equal(tracker.update(500, [{ point: { x: 0.8, y: 0.2 }, confidence: 0.99, source: "detected" }]), null);
  assert.equal(tracker.update(800, []), null);
});

test("alternating distant automatic candidates never confirm an identity", () => {
  const tracker = new OnlineBallTracker();
  assert.equal(tracker.update(0, [{ point: { x: 0.1, y: 0.5 }, confidence: 0.8, source: "motion" }]), null);
  assert.equal(tracker.update(100, [{ point: { x: 0.9, y: 0.5 }, confidence: 0.8, source: "motion" }]), null);
  assert.equal(tracker.update(200, [{ point: { x: 0.1, y: 0.5 }, confidence: 0.8, source: "motion" }]), null);
  assert.equal(tracker.update(300, [{ point: { x: 0.9, y: 0.5 }, confidence: 0.8, source: "motion" }]), null);
});

test("switches from a stale heuristic lock after two coherent learned detections", () => {
  const tracker = new OnlineBallTracker(500, 3.5, { immediateDetectedMinimumConfidence: Number.POSITIVE_INFINITY });
  tracker.seed(0, { x: 0.2, y: 0.5 });
  assert.ok(tracker.update(100, [
    { point: { x: 0.21, y: 0.5 }, confidence: 0.6, source: "motion", apparentSize: 0.01 },
    { point: { x: 0.7, y: 0.5 }, confidence: 0.7, source: "detected", apparentSize: 0.05 },
  ])!.point.x < 0.3);
  const switched = tracker.update(200, [
    { point: { x: 0.22, y: 0.5 }, confidence: 0.6, source: "motion", apparentSize: 0.01 },
    { point: { x: 0.74, y: 0.52 }, confidence: 0.65, source: "detected", apparentSize: 0.05 },
  ]);
  assert.ok(switched); assert.equal(switched.source, "detected"); assert.ok(switched.point.x > 0.7);
});

test("optionally lets a strong ball-sized learned detection replace a stale lock immediately", () => {
  const tracker = new OnlineBallTracker(500, 3.5, {
    immediateDetectedMinimumConfidence: 0.3,
    immediateDetectedMinimumSize: 0.04,
    immediateDetectedMaximumSize: 0.09,
    immediateDetectedMaximumDistance: 1.5,
  });
  tracker.seed(0, { x: 0.2, y: 0.5 });
  const result = tracker.update(100, [
    { point: { x: 0.21, y: 0.5 }, confidence: 0.7, source: "motion", apparentSize: 0.02 },
    { point: { x: 0.75, y: 0.55 }, confidence: 0.4, source: "detected", apparentSize: 0.06 },
  ]);
  assert.equal(result?.source, "detected"); assert.ok(result!.point.x > 0.7);
});

test("optionally switches from a stale lock after two coherent ball-sized motion candidates", () => {
  const tracker = new OnlineBallTracker(500, 3.5, {
    immediateDetectedMinimumConfidence: Number.POSITIVE_INFINITY,
    challengerMotionMinimumConfidence: 0.18,
    challengerMotionMinimumSize: 0.02,
  });
  tracker.seed(0, { x: 0.2, y: 0.5 });
  const first = tracker.update(100, [
    { point: { x: 0.21, y: 0.5 }, confidence: 0.7, source: "motion", apparentSize: 0.01 },
    { point: { x: 0.7, y: 0.62 }, confidence: 0.22, source: "motion", apparentSize: 0.03 },
  ]);
  assert.ok(first!.point.x < 0.3);
  const switched = tracker.update(200, [
    { point: { x: 0.22, y: 0.5 }, confidence: 0.7, source: "motion", apparentSize: 0.01 },
    { point: { x: 0.74, y: 0.64 }, confidence: 0.2, source: "motion", apparentSize: 0.03 },
  ]);
  assert.equal(switched?.source, "motion"); assert.ok(switched!.point.x > 0.7);
});

test("can disable coherent color challengers during an occlusion", () => {
  const tracker = new OnlineBallTracker(500, 3.5, { challengerColorMinimumConfidence: 2 });
  tracker.seed(0, { x: 0.2, y: 0.5 });
  const distractor = (x: number) => [{ point: { x, y: 0.75 }, confidence: 0.7, source: "color" as const, apparentSize: 0.05 }];
  assert.equal(tracker.update(100, distractor(0.7))?.predicted, true);
  const result = tracker.update(200, distractor(0.72));
  assert.equal(result?.predicted, true); assert.ok(result!.point.x < 0.4);
});

test("uses the calibrated default to confirm a distant moderate-confidence learned ball", () => {
  const tracker = new OnlineBallTracker(); tracker.seed(0, { x: 0.2, y: 0.5 });
  const first = tracker.update(100, [
    { point: { x: 0.21, y: 0.5 }, confidence: 0.7, source: "motion", apparentSize: 0.02 },
    { point: { x: 0.75, y: 0.55 }, confidence: 0.1, source: "detected", apparentSize: 0.06 },
  ]);
  assert.equal(first?.source, "motion");
  const result = tracker.update(200, [
    { point: { x: 0.22, y: 0.5 }, confidence: 0.7, source: "motion", apparentSize: 0.02 },
    { point: { x: 0.77, y: 0.55 }, confidence: 0.1, source: "detected", apparentSize: 0.06 },
  ]);
  assert.equal(result?.source, "detected"); assert.ok(result!.point.x > 0.7);
});

test("uses repeat-robust challenger thresholds in the live default", () => {
  assert.deepEqual({
    motionConfidence: DEFAULT_ONLINE_BALL_TRACKER_CONFIG.challengerMotionMinimumConfidence,
    motionSize: DEFAULT_ONLINE_BALL_TRACKER_CONFIG.challengerMotionMinimumSize,
    colorConfidence: DEFAULT_ONLINE_BALL_TRACKER_CONFIG.challengerColorMinimumConfidence,
    immediateDistance: DEFAULT_ONLINE_BALL_TRACKER_CONFIG.immediateDetectedMaximumDistance,
    sizeWeight: DEFAULT_ONLINE_BALL_TRACKER_CONFIG.associationSizeWeight,
    appearanceWeight: DEFAULT_ONLINE_BALL_TRACKER_CONFIG.associationAppearanceWeight,
    challengerAppearanceWeight: DEFAULT_ONLINE_BALL_TRACKER_CONFIG.challengerAppearanceWeight,
    identityQualityWeight: DEFAULT_ONLINE_BALL_TRACKER_CONFIG.identityQualityWeight,
    identityOverride: DEFAULT_ONLINE_BALL_TRACKER_CONFIG.identityOverrideMinimumConfidence,
    measurementGain: DEFAULT_ONLINE_BALL_TRACKER_CONFIG.measurementCorrectionGain,
    velocityGain: DEFAULT_ONLINE_BALL_TRACKER_CONFIG.velocityCorrectionGain,
  }, { motionConfidence: 0.2, motionSize: 0.035, colorConfidence: 0.25, immediateDistance: 0.3,
    sizeWeight: 0.15, appearanceWeight: 0.3, challengerAppearanceWeight: 0,
    identityQualityWeight: 0.75, identityOverride: 0.85,
    measurementGain: 1, velocityGain: 0.35 });
});

test("requires a distant learned candidate to confirm when immediate override distance is bounded", () => {
  const tracker = new OnlineBallTracker(500, 3.5, { immediateDetectedMaximumDistance: 0.2 });
  tracker.update(0, [candidate(0.25, 0.5, 0.8, "color", 0.05)]);
  tracker.update(100, [candidate(0.26, 0.5, 0.8, "color", 0.05)]);
  const firstChallenge = tracker.update(200, [candidate(0.8, 0.5, 0.9, "detected", 0.06)]);
  assert.ok(firstChallenge); assert.ok(firstChallenge.point.x < 0.4);
  const confirmed = tracker.update(300, [candidate(0.81, 0.5, 0.9, "detected", 0.06)]);
  assert.ok(confirmed); assert.ok(confirmed.point.x > 0.7);
});

test("can use apparent-size continuity to disambiguate equally close candidates", () => {
  const tracker = new OnlineBallTracker(500, 3.5, { associationQualityWeight: 0.2, associationSizeWeight: 0.6,
    immediateDetectedMinimumConfidence: 2 });
  tracker.update(0, [candidate(0.4, 0.5, 0.8, "color", 0.05)]);
  tracker.update(100, [candidate(0.41, 0.5, 0.8, "color", 0.05)]);
  const track = tracker.update(200, [
    candidate(0.42, 0.5, 0.75, "motion", 0.1),
    candidate(0.44, 0.5, 0.7, "motion", 0.05),
  ]);
  assert.ok(track?.measurementPoint?.x && track.measurementPoint.x > 0.43);
});

test("can use color-neutral appearance evidence to disambiguate equally close candidates", () => {
  const tracker = new OnlineBallTracker(500, 3.5, { associationQualityWeight: 0.2, associationSizeWeight: 0,
    associationAppearanceWeight: 0.7, immediateDetectedMinimumConfidence: 2 });
  tracker.seed(0, { x: 0.5, y: 0.5 });
  const track = tracker.update(100, [
    { point: { x: 0.48, y: 0.5 }, confidence: 0.8, source: "motion", appearanceConfidence: 0.2 },
    { point: { x: 0.52, y: 0.5 }, confidence: 0.6, source: "motion", appearanceConfidence: 0.95 },
  ]);
  assert.ok(track?.measurementPoint); assert.ok(track.measurementPoint.x > 0.5);
});

test("can emit the accepted measurement without positional lag", () => {
  const tracker = new OnlineBallTracker(500, 3.5, { measurementCorrectionGain: 1,
    immediateDetectedMinimumConfidence: 2 });
  tracker.seed(0, { x: 0.4, y: 0.5 });
  const track = tracker.update(100, [candidate(0.5, 0.55, 0.7, "motion", 0.05)]);
  assert.deepEqual(track?.point, { x: 0.5, y: 0.55 });
});

test("can use appearance to choose between coherent distant identity challengers", () => {
  const tracker = new OnlineBallTracker(500, 3.5, { immediateDetectedMinimumConfidence: 2,
    challengerAppearanceWeight: 0.8 });
  tracker.seed(0, { x: 0.2, y: 0.5 });
  const candidates = (offset: number) => [
    { point: { x: 0.21 + offset, y: 0.5 }, confidence: 0.7, source: "motion" as const,
      apparentSize: 0.01, appearanceConfidence: 0.2 },
    { point: { x: 0.65 + offset, y: 0.55 }, confidence: 0.8, source: "motion" as const,
      apparentSize: 0.05, appearanceConfidence: 0.1 },
    { point: { x: 0.75 + offset, y: 0.55 }, confidence: 0.4, source: "motion" as const,
      apparentSize: 0.05, appearanceConfidence: 0.95 },
  ];
  assert.ok(tracker.update(100, candidates(0))!.point.x < 0.3);
  const switched = tracker.update(200, candidates(0.01));
  assert.ok(switched); assert.ok(switched.point.x > 0.7);
});

test("can immediately recover a distant calibration-ranker identity", () => {
  const tracker = new OnlineBallTracker(500, 3.5, { immediateDetectedMinimumConfidence: 2,
    identityOverrideMinimumConfidence: 0.9 });
  tracker.seed(0, { x: 0.2, y: 0.5 });
  const recovered = tracker.update(100, [
    { point: { x: 0.22, y: 0.5 }, confidence: 0.8, source: "motion", identityConfidence: 0.1 },
    { point: { x: 0.75, y: 0.6 }, confidence: 0.02, source: "motion", identityConfidence: 0.98 },
  ]);
  assert.ok(recovered); assert.ok(recovered.point.x > 0.7); assert.ok(recovered.confidence > 0.7);
});
