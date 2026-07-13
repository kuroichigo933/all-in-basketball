import test from "node:test";
import assert from "node:assert/strict";
import { trackBallContinuity } from "../lib/motion/trackBall.ts";
import type { MotionObservation } from "../lib/motion/types.ts";

const frame = (timeMs: number, x: number | null): MotionObservation => ({
  timeMs, poseConfidence: 0.9, ballConfidence: x === null ? 0 : 0.8,
  ball: x === null ? null : { x, y: 0.6 },
  leftWrist: { x: 0.3, y: 0.5 }, rightWrist: { x: 0.7, y: 0.5 },
  leftHip: { x: 0.4, y: 0.5 }, rightHip: { x: 0.6, y: 0.5 },
  leftKnee: { x: 0.42, y: 0.75 }, rightKnee: { x: 0.58, y: 0.75 },
});

test("interpolates a short gap bounded by plausible detections", () => {
  const tracked = trackBallContinuity([frame(0, 0.3), frame(100, null), frame(200, null), frame(300, 0.6)]);
  assert.equal(tracked[1].ballSource, "interpolated");
  assert.ok(Math.abs(tracked[1].ball!.x - 0.4) < 0.001);
  assert.ok(Math.abs(tracked[2].ball!.x - 0.5) < 0.001);
  assert.ok(Math.abs(tracked[1].ballConfidence - 0.56) < Number.EPSILON);
});

test("does not invent an unbounded or long-gap track", () => {
  const leading = trackBallContinuity([frame(0, null), frame(100, 0.3)]);
  assert.equal(leading[0].ball, null);
  const long = trackBallContinuity([frame(0, 0.3), frame(300, null), frame(600, 0.5)]);
  assert.equal(long[1].ball, null);
});

test("rejects physically implausible jumps", () => {
  const tracked = trackBallContinuity([frame(0, 0), frame(100, null), frame(200, 1)], { maxNormalizedSpeedPerSecond: 2 });
  assert.equal(tracked[1].ball, null);
});

test("preserves measurement provenance and does not use predictions as anchors", () => {
  const color = { ...frame(0, 0.2), ballSource: "color" as const };
  const predicted = { ...frame(100, 0.8), ballSource: "interpolated" as const, ballConfidence: 0.3 };
  const motion = { ...frame(200, 0.4), ballSource: "motion" as const };
  const tracked = trackBallContinuity([color, predicted, motion]);
  assert.equal(tracked[0].ballSource, "color");
  assert.equal(tracked[1].ballSource, "interpolated");
  assert.ok(Math.abs(tracked[1].ball!.x - 0.3) < 0.001);
  assert.equal(tracked[2].ballSource, "motion");
});
