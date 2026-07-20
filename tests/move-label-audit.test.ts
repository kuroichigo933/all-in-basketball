import test from "node:test";
import assert from "node:assert/strict";
import { auditMoveLabelCoverage, auditRapidMoveLabels, groupRapidMoveLabels } from "../lib/motion/auditMoveLabels.ts";
import type { ExpectedMove } from "../lib/motion/evaluate.ts";
import type { MotionObservation } from "../lib/motion/types.ts";

const label = (startMs: number, endMs: number, move: ExpectedMove["move"] = "behind-the-back"): ExpectedMove =>
  ({ startMs, endMs, move });
const frame = (timeMs: number, ballX: number, measured = true): MotionObservation => ({
  timeMs, poseConfidence: 0.9, ballConfidence: 0.9, ball: { x: ballX, y: 0.6 },
  ballMeasured: measured, ballSource: measured ? "detected" : "interpolated",
  leftWrist: { x: 0.35, y: 0.6 }, rightWrist: { x: 0.65, y: 0.6 },
  leftHip: { x: 0.4, y: 0.5 }, rightHip: { x: 0.6, y: 0.5 },
  leftKnee: { x: 0.35, y: 0.75 }, rightKnee: { x: 0.65, y: 0.75 },
});

test("groups only contiguous same-class rapid labels", () => {
  const groups = groupRapidMoveLabels([
    label(0, 500), label(500, 1_000), label(1_000, 1_500),
    label(2_000, 2_500), label(2_500, 3_000, "crossover"), label(3_000, 3_500, "crossover"), label(3_500, 4_000, "crossover"),
  ]);
  assert.deepEqual(groups.map((group) => [group.move, group.startMs, group.endMs, group.labels.length]), [
    ["behind-the-back", 0, 1_500, 3], ["crossover", 2_500, 4_000, 3],
  ]);
});

test("flags a rapid label group whose count exceeds stable side transitions", () => {
  const labels = Array.from({ length: 8 }, (_, index) => label(index * 500, (index + 1) * 500));
  const observations = [
    frame(0, 0.3), frame(400, 0.7), frame(800, 0.3), frame(1_200, 0.7),
    frame(1_600, 0.3), frame(2_000, 0.7), frame(2_400, 0.7), frame(2_800, 0.7),
    frame(3_200, 0.7), frame(3_600, 0.7), frame(4_000, 0.7),
  ];
  const [audit] = auditRapidMoveLabels(labels, observations);
  assert.equal(audit.stableSideTransitions, 5);
  assert.deepEqual(audit.transitionTimesMs, [400, 800, 1_200, 1_600, 2_000]);
  assert.equal(audit.status, "review");
  assert.match(audit.reason, /5 stable body-center transitions/);
});

test("passes supported counts and separates insufficient tracking coverage", () => {
  const labels = [label(0, 500), label(500, 1_000), label(1_000, 1_500)];
  const supported = [frame(0, 0.3), frame(400, 0.7), frame(800, 0.3), frame(1_200, 0.7), frame(1_500, 0.7)];
  assert.equal(auditRapidMoveLabels(labels, supported)[0].status, "pass");
  const missing = supported.map((observation, index) => index < 3 ? { ...observation, ball: null, ballConfidence: 0 } : observation);
  assert.equal(auditRapidMoveLabels(labels, missing)[0].status, "insufficient-motion-data");
});

test("full-clip coverage audit exposes transitions outside existing rapid label groups", () => {
  const labels = [label(400, 650, "crossover")];
  const observations = [
    frame(0, 0.3), frame(400, 0.7), frame(800, 0.3), frame(1_200, 0.7), frame(1_600, 0.7),
  ];
  const audit = auditMoveLabelCoverage(labels, observations, { boundaryReviewMarginMs: 0 });
  assert.equal(audit.stableSideTransitions, 3);
  assert.equal(audit.matchedTransitions, 1);
  assert.deepEqual(audit.uncoveredTransitionTimesMs, [800, 1_200]);
  assert.equal(audit.transitionCoverage, 1 / 3);
  assert.equal(audit.status, "review");
});

test("full-clip coverage uses one label for at most one transition", () => {
  const observations = [frame(0, 0.3), frame(400, 0.7), frame(800, 0.3), frame(1_200, 0.7)];
  const audit = auditMoveLabelCoverage([label(0, 1_200, "crossover")], observations, { boundaryReviewMarginMs: 0 });
  assert.equal(audit.matchedTransitions, 1);
  assert.equal(audit.uncoveredTransitionTimesMs.length, 2);
  assert.equal(audit.unmatchedLabels.length, 0);
});

test("full-clip coverage ignores non-lateral labels and reports insufficient observations", () => {
  const observations = [frame(0, 0.3), { ...frame(400, 0.7), ball: null, ballConfidence: 0 }];
  const audit = auditMoveLabelCoverage([label(0, 500, "hesitation")], observations);
  assert.equal(audit.lateralLabelCount, 0);
  assert.equal(audit.status, "insufficient-motion-data");
});

test("does not call a stationary ball a transition when the player center moves around it", () => {
  const rightOfBody = frame(0, 0.3);
  rightOfBody.leftHip = { x: 0.1, y: 0.5 }; rightOfBody.rightHip = { x: 0.3, y: 0.5 };
  const leftOfBody = frame(500, 0.3);
  leftOfBody.leftHip = { x: 0.4, y: 0.5 }; leftOfBody.rightHip = { x: 0.6, y: 0.5 };
  const audit = auditMoveLabelCoverage([], [rightOfBody, leftOfBody]);
  assert.equal(audit.stableSideTransitions, 0);
  assert.equal(audit.status, "pass");
});

test("does not call a distant distractor jump a player-controlled transition", () => {
  const left = frame(0, 0.2); left.leftWrist.y = -0.2; left.rightWrist.y = -0.2;
  const right = frame(500, 0.8); right.leftWrist.y = -0.2; right.rightWrist.y = -0.2;
  const audit = auditMoveLabelCoverage([], [left, right]);
  assert.equal(audit.stableSideTransitions, 0);
});

test("separates an unmatched segment-boundary transition from missing complete-event labels", () => {
  const observations = [frame(0, 0.3), frame(600, 0.3), frame(1_000, 0.7)];
  const audit = auditMoveLabelCoverage([], observations, { boundaryReviewMarginMs: 500 });
  assert.deepEqual(audit.boundaryReviewTransitionTimesMs, [1_000]);
  assert.deepEqual(audit.uncoveredTransitionTimesMs, []);
  assert.equal(audit.status, "pass");
});
