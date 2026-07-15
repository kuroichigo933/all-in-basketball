import test from "node:test";
import assert from "node:assert/strict";
import { centerErrorRadii, evaluateBallIdentity, validateBallIdentityEvaluationLabels, validateBallIdentityLabels, type BallIdentityEvaluationLabel, type BallIdentityLabel, type BallIdentityObservation } from "../lib/motion/evaluateBall.ts";

const visible = (timeMs: number, x = 0.4, y = 0.5): BallIdentityLabel => ({
  timeMs, visibility: "visible", box: { x: x - 0.05, y: y - 0.05, width: 0.1, height: 0.1 },
});
const observation = (timeMs: number, x: number | null, ballMeasured = true): BallIdentityObservation => ({
  timeMs, ball: x === null ? null : { x, y: 0.5 }, ballSource: x === null ? "missing" : "motion", ballMeasured,
  ballMeasurement: x !== null && ballMeasured ? { x, y: 0.5 } : undefined,
});

test("exposes wrong-object tracking even when ball coverage is complete", () => {
  const report = evaluateBallIdentity([visible(0), visible(100)], [observation(0, 0.8), observation(100, 0.8)]);
  assert.equal(report.tracked.matchedLabels, 2);
  assert.deepEqual([report.tracked.truePositives, report.tracked.falsePositives, report.tracked.falseNegatives], [0, 2, 2]);
  assert.equal(report.tracked.precision, 0);
  assert.equal(report.tracked.recall, 0);
});

test("scores visible localization and independently labeled no-ball false positives", () => {
  const labels: BallIdentityLabel[] = [visible(0), { timeMs: 100, visibility: "absent" }];
  const report = evaluateBallIdentity(labels, [observation(0, 0.4), observation(100, 0.4)]);
  assert.deepEqual([report.tracked.truePositives, report.tracked.falsePositives, report.tracked.falseNegatives, report.tracked.trueNegatives], [1, 1, 0, 0]);
  assert.equal(report.tracked.precision, 0.5);
  assert.equal(report.tracked.recall, 1);
  assert.equal(report.tracked.negativeRejectionRate, 0);
});

test("reports tracker prediction through occlusion without changing visible or absent identity metrics", () => {
  const labels: BallIdentityEvaluationLabel[] = [visible(0), { timeMs: 100, visibility: "absent" }, { timeMs: 200, visibility: "occluded" }];
  const report = evaluateBallIdentity(labels, [observation(0, 0.4), observation(100, null), observation(200, 0.45, false)]);
  assert.deepEqual([report.tracked.visibleLabels, report.tracked.absentLabels, report.tracked.truePositives, report.tracked.trueNegatives], [1, 1, 1, 1]);
  assert.equal(report.tracked.matchedLabels, 2);
  assert.equal(report.timing.matchedLabels, 3);
  assert.deepEqual(report.occlusion, {
    occludedLabels: 1, matchedLabels: 1, unmatchedLabels: 0, trackedFrames: 1, predictedFrames: 1,
    measuredFrames: 0, missingFrames: 0, ambiguousFrames: 0, trackPresenceRate: 1, predictionPersistenceRate: 1,
  });
});

test("separates measured distractor locks, missing tracks, and unmatched occlusion labels", () => {
  const labels: BallIdentityEvaluationLabel[] = [
    { timeMs: 0, visibility: "occluded" }, { timeMs: 100, visibility: "occluded" },
    { timeMs: 200, visibility: "occluded" }, { timeMs: 300, visibility: "occluded" },
  ];
  const report = evaluateBallIdentity(labels, [observation(0, 0.4, false), observation(100, 0.4, true), observation(200, null)], { timestampToleranceMs: 0 });
  assert.deepEqual(report.occlusion, {
    occludedLabels: 4, matchedLabels: 3, unmatchedLabels: 1, trackedFrames: 2, predictedFrames: 1,
    measuredFrames: 1, missingFrames: 1, ambiguousFrames: 0, trackPresenceRate: 2 / 3, predictionPersistenceRate: 1 / 3,
  });
  assert.deepEqual([report.tracked.visibleLabels, report.tracked.absentLabels, report.tracked.truePositives, report.tracked.falsePositives], [0, 0, 0, 0]);
  assert.match(report.warnings.join(" "), /distractor locks/);
});

test("does not claim prediction persistence when occluded track provenance is ambiguous", () => {
  const legacy: BallIdentityObservation = { timeMs: 0, ball: { x: 0.4, y: 0.5 }, ballSource: "motion" };
  const report = evaluateBallIdentity([{ timeMs: 0, visibility: "occluded" }], [legacy]);
  assert.equal(report.occlusion.trackPresenceRate, 1);
  assert.equal(report.occlusion.ambiguousFrames, 1);
  assert.equal(report.occlusion.predictionPersistenceRate, null);
});

test("reports normalized center error in annotated ball radii", () => {
  const box = { x: 0.3, y: 0.4, width: 0.2, height: 0.1 };
  assert.equal(centerErrorRadii({ x: 0.4, y: 0.45 }, box), 0);
  assert.ok(Math.abs(centerErrorRadii({ x: 0.5, y: 0.45 }, box) - 1) < 1e-9);
});

test("matches labels and observations one-to-one and reports timing misses", () => {
  const report = evaluateBallIdentity([visible(0), visible(50)], [observation(25, 0.4)], { timestampToleranceMs: 30 });
  assert.equal(report.timing.matchedLabels, 1);
  assert.equal(report.timing.unmatchedLabels, 1);
  assert.equal(report.tracked.truePositives, 1);
  assert.equal(report.tracked.falseNegatives, 1);
});

test("timestamp matching maximizes label coverage before minimizing offsets", () => {
  const report = evaluateBallIdentity([visible(0), visible(50)], [observation(45, 0.4), observation(100, 0.4)], { timestampToleranceMs: 60 });
  assert.equal(report.timing.matchedLabels, 2);
  assert.equal(report.timing.maximumMatchedOffsetMs, 50);
  assert.equal(report.tracked.recall, 1);
});

test("refuses raw metrics when measured-versus-predicted provenance is ambiguous", () => {
  const legacy: BallIdentityObservation = { timeMs: 0, ball: { x: 0.4, y: 0.5 }, ballSource: "motion" };
  const report = evaluateBallIdentity([visible(0)], [legacy]);
  assert.equal(report.tracked.f1, 1);
  assert.equal(report.raw, null);
  assert.equal(report.provenance.rawMetricsAvailable, false);
  assert.match(report.warnings[0], /provenance is missing/);
});

test("separates raw acquisition from tracker prediction when provenance is explicit", () => {
  const report = evaluateBallIdentity([visible(0), visible(100)], [observation(0, 0.4, true), observation(100, 0.4, false)]);
  assert.equal(report.tracked.recall, 1);
  assert.equal(report.raw?.truePositives, 1);
  assert.equal(report.raw?.falseNegatives, 1);
  assert.equal(report.raw?.recall, 0.5);
});

test("validates normalized boxes and unique timestamps", () => {
  assert.throws(() => validateBallIdentityLabels([visible(0), visible(0)]), /Duplicate/);
  assert.throws(() => validateBallIdentityLabels([{ timeMs: 0, visibility: "visible", box: { x: 0.9, y: 0, width: 0.2, height: 0.1 } }]), /inside the frame/);
  assert.deepEqual(validateBallIdentityLabels([{ timeMs: 100, visibility: "absent" }, visible(0)]).map((label) => label.timeMs), [0, 100]);
  assert.deepEqual(validateBallIdentityEvaluationLabels([{ timeMs: 200, visibility: "occluded" }, { timeMs: 100, visibility: "absent" }, visible(0)]).map((label) => label.timeMs), [0, 100, 200]);
  assert.throws(() => validateBallIdentityLabels([{ timeMs: 0, visibility: "occluded" }]), /visible or absent/);
});

test("reports candidate-set oracle recall separately from the selected track", () => {
  const wrongTrack: BallIdentityObservation = {
    ...observation(0, 0.8),
    ballCandidates: [
      { point: { x: 0.8, y: 0.5 }, confidence: 0.8, source: "motion" },
      { point: { x: 0.4, y: 0.5 }, confidence: 0.5, source: "color" },
    ],
  };
  const report = evaluateBallIdentity([visible(0)], [wrongTrack]);
  assert.equal(report.tracked.recall, 0);
  assert.equal(report.candidateOracle.available, true);
  assert.equal(report.candidateOracle.visibleRecall, 1);
});
