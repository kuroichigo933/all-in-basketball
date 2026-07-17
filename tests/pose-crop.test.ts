import test from "node:test";
import assert from "node:assert/strict";
import { mapPointFromCrop, selectPoseBallCrop, selectPoseBallFocusCrop } from "../lib/motion/poseCrop.ts";
import type { Point } from "../lib/motion/types.ts";

const pose = Array.from({ length: 33 }, (_, index): Point => ({
  x: 0.42 + (index % 2) * 0.16,
  y: 0.08 + index / 38,
  visibility: 0.95,
}));

test("selects a square source-pixel crop around one player", () => {
  const crop = selectPoseBallCrop(pose, 1280, 720);
  assert.ok(crop);
  assert.ok(crop.x > 0 && crop.x + crop.width < 1);
  assert.equal(Math.round(crop.width * 1280), Math.round(crop.height * 720));
  assert.ok(crop.height > 0.8, "full body and low bounce should remain visible");
});

test("maps a crop-model point back into full-frame coordinates", () => {
  const point = mapPointFromCrop({ x: 0.5, y: 0.75 }, { x: 0.2, y: 0.1, width: 0.5, height: 0.8 });
  assert.ok(Math.abs(point.x - 0.45) < 1e-9);
  assert.ok(Math.abs(point.y - 0.7) < 1e-9);
});

test("does not crop without a reliable player pose", () => {
  assert.equal(selectPoseBallCrop(pose.slice(0, 5), 1280, 720), null);
});

test("selects a tighter dribble-zone fallback crop", () => {
  const portraitPose = Array.from({ length: 33 }, (): Point => ({ x: 0.5, y: 0.5, visibility: 0 }));
  for (const [index, x, y] of [[15, 0.38, 0.46], [16, 0.62, 0.48], [23, 0.43, 0.56], [24, 0.57, 0.56],
    [25, 0.4, 0.72], [26, 0.6, 0.72]] as const) portraitPose[index] = { x, y, visibility: 0.95 };
  const broad = selectPoseBallCrop([...portraitPose, ...pose.slice(0, 6)], 720, 1280);
  const focus = selectPoseBallFocusCrop(portraitPose, 720, 1280);
  assert.ok(focus); assert.ok(focus.width < 1); assert.ok(focus.y <= 0.46); assert.ok(focus.y + focus.height >= 0.8);
  if (broad) assert.ok(focus.width <= broad.width);
});

test("does not focus without enough lower-body evidence", () => {
  assert.equal(selectPoseBallFocusCrop(pose.slice(0, 16), 1280, 720), null);
});
