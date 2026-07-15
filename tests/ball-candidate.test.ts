import test from "node:test";
import assert from "node:assert/strict";
import { applyPoseBallPrior } from "../lib/motion/ballCandidate.ts";
import type { Point } from "../lib/motion/types.ts";

const pose = () => {
  const points: Point[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  points[11] = { x: 0.42, y: 0.35 }; points[12] = { x: 0.58, y: 0.35 };
  points[15] = { x: 0.42, y: 0.55 }; points[16] = { x: 0.58, y: 0.55 };
  points[23] = { x: 0.44, y: 0.55 }; points[24] = { x: 0.56, y: 0.55 };
  points[25] = { x: 0.45, y: 0.72 }; points[26] = { x: 0.55, y: 0.72 };
  points[27] = { x: 0.44, y: 0.86 }; points[28] = { x: 0.56, y: 0.86 };
  return points;
};

test("pose prior favors a wrist-controlled ball over a foot shadow", () => {
  const near = applyPoseBallPrior({ point: { x: 0.58, y: 0.58 }, confidence: 0.6, source: "motion" }, pose());
  const footShadow = applyPoseBallPrior({ point: { x: 0.8, y: 0.95 }, confidence: 0.6, source: "motion" }, pose());
  assert.ok(near.confidence > footShadow.confidence);
  assert.ok(near.confidence > 0.5);
});

test("pose prior rejects motion below the player's feet", () => {
  const bounce = applyPoseBallPrior({ point: { x: 0.5, y: 0.82 }, confidence: 0.6, source: "motion" }, pose());
  const floorShadow = applyPoseBallPrior({ point: { x: 0.5, y: 0.91 }, confidence: 0.6, source: "motion" }, pose());
  assert.ok(bounce.confidence > floorShadow.confidence * 5);
});

test("pose prior demotes a compact shorts edge immediately below a knee", () => {
  const kneeBlob = applyPoseBallPrior({ point: { x: 0.55, y: 0.76 }, confidence: 0.6, source: "color" }, pose());
  const lowBounce = applyPoseBallPrior({ point: { x: 0.5, y: 0.82 }, confidence: 0.6, source: "motion" }, pose());
  assert.ok(lowBounce.confidence > kneeBlob.confidence * 3);
});

test("pose prior demotes a shorts or knee blob away from both wrists", () => {
  const ballAtWrist = applyPoseBallPrior({ point: { x: 0.58, y: 0.58 }, confidence: 0.6, source: "color" }, pose());
  const shortsBlob = applyPoseBallPrior({ point: { x: 0.52, y: 0.68 }, confidence: 0.6, source: "color" }, pose());
  const lowBounce = applyPoseBallPrior({ point: { x: 0.5, y: 0.82 }, confidence: 0.6, source: "motion" }, pose());
  assert.ok(ballAtWrist.confidence > shortsBlob.confidence * 3);
  assert.ok(lowBounce.confidence > shortsBlob.confidence);
});

test("pose prior does not discount a generic sports-ball model result", () => {
  const model = { point: { x: 0.9, y: 0.95 }, confidence: 0.8, source: "detected" as const };
  assert.deepEqual(applyPoseBallPrior(model, pose()), model);
});

test("pose prior favors a full color component over a tiny hand fragment", () => {
  const fullBall = applyPoseBallPrior({ point: { x: 0.58, y: 0.58 }, confidence: 0.6, source: "color", apparentSize: 0.055 }, pose());
  const tinyFragment = applyPoseBallPrior({ point: { x: 0.58, y: 0.58 }, confidence: 0.6, source: "color", apparentSize: 0.009 }, pose());
  assert.ok(fullBall.confidence > tinyFragment.confidence * 5);
});
