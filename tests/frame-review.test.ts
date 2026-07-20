import test from "node:test";
import assert from "node:assert/strict";
import { frameDurationMs, snapReviewTimeMs, stepReviewTimeMs } from "../lib/motion/frameReview.ts";

test("steps rapid-move review by exact source frames", () => {
  assert.equal(frameDurationMs(25), 40);
  assert.ok(Math.abs(stepReviewTimeMs(1_000, 1, 2_000, 30) - 1_033.3333333333333) < 0.000001);
  assert.ok(Math.abs(stepReviewTimeMs(1_000, -1, 2_000, 30) - 966.6666666666666) < 0.000001);
});

test("snaps review marks and clamps them to the clip", () => {
  assert.ok(Math.abs(snapReviewTimeMs(1_021, 30, 2_000) - 1_033.3333333333333) < 0.000001);
  assert.equal(stepReviewTimeMs(1_990, 1, 2_000, 30), 2_000);
  assert.equal(stepReviewTimeMs(5, -1, 2_000, 30), 0);
});

test("rejects invalid review timing settings", () => {
  assert.throws(() => frameDurationMs(0), /frame rate/);
  assert.throws(() => stepReviewTimeMs(0, 0, 1_000), /Frame step/);
  assert.throws(() => snapReviewTimeMs(Number.NaN, 30, 1_000), /finite/);
});
