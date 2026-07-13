import test from "node:test";
import assert from "node:assert/strict";
import { OnlineBallTracker } from "../lib/motion/onlineBallTracker.ts";

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
