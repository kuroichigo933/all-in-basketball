import test from "node:test";
import assert from "node:assert/strict";
import { GENERIC_BALL_MODEL, MediaPipeBallDetector, resolvePreferredBallModel } from "../lib/motion/browserBallDetector.ts";

test("uses the generic model unless a custom basketball artifact is configured", () => {
  assert.deepEqual(resolvePreferredBallModel(), { ...GENERIC_BALL_MODEL, labels: ["sports ball"] });
  assert.deepEqual(resolvePreferredBallModel(" /models/basketball-v1.tflite ", "ball,basketball"), {
    id: "custom-basketball", assetPath: "/models/basketball-v1.tflite", labels: ["ball", "basketball"], custom: true,
  });
});

test("normalizes matching model boxes and preserves detector provenance", () => {
  let closed = false;
  const detector = new MediaPipeBallDetector({
    detectForVideo: () => ({ detections: [
      { boundingBox: { originX: 40, originY: 20, width: 20, height: 20 }, categories: [{ categoryName: "basketball", score: 0.8 }] },
      { boundingBox: { originX: 0, originY: 0, width: 10, height: 10 }, categories: [{ categoryName: "person", score: 0.99 }] },
    ] }),
    close: () => { closed = true; },
  }, { id: "custom-v1", assetPath: "/model.tflite", labels: ["basketball"], custom: true });
  const candidates = detector.detectForVideo({ width: 100, height: 50 } as HTMLCanvasElement, 10);
  assert.deepEqual(candidates, [{ point: { x: 0.5, y: 0.6 }, confidence: 0.8, detectorId: "custom-v1",
    apparentSize: Math.sqrt((20 / 100) * (20 / 50)), appearanceConfidence: 1 }]);
  detector.close(); assert.equal(closed, true);
});
