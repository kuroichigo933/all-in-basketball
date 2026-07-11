import test from "node:test";
import assert from "node:assert/strict";
import { detectMovingBallPixels, detectOrangeBallPixels } from "../lib/motion/colorBall.ts";

test("finds a compact orange basketball component", () => {
  const width = 40; const height = 30; const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 14; y <= 18; y += 1) for (let x = 24; x <= 28; x += 1) {
    if (Math.hypot(x - 26, y - 16) <= 2.5) { const offset = (y * width + x) * 4; pixels[offset] = 150; pixels[offset + 1] = 70; pixels[offset + 2] = 35; pixels[offset + 3] = 255; }
  }
  const result = detectOrangeBallPixels(pixels, width, height);
  assert.ok(result); assert.ok(Math.abs(result.center.x - 26 / width) < 0.03); assert.ok(result.confidence >= 0.25);
});

test("finds a compact moving black basketball", () => {
  const width = 40; const height = 30; const previous = new Uint8ClampedArray(width * height * 4).fill(180); const current = previous.slice();
  for (let y = 14; y <= 18; y += 1) for (let x = 24; x <= 28; x += 1) if (Math.hypot(x - 26, y - 16) <= 2.5) {
    const offset = (y * width + x) * 4; current[offset] = 20; current[offset + 1] = 20; current[offset + 2] = 20; current[offset + 3] = 255;
  }
  const result = detectMovingBallPixels(current, previous, width, height);
  assert.ok(result); assert.ok(Math.abs(result.center.x - 26 / width) < 0.03);
});

test("moving-ball fallback is color independent", () => {
  const width = 40; const height = 30; const previous = new Uint8ClampedArray(width * height * 4).fill(120); const current = previous.slice();
  for (let y = 10; y <= 14; y += 1) for (let x = 10; x <= 14; x += 1) if (Math.hypot(x - 12, y - 12) <= 2.5) {
    const offset = (y * width + x) * 4; current[offset] = 220; current[offset + 1] = 105; current[offset + 2] = 45; current[offset + 3] = 255;
  }
  assert.ok(detectMovingBallPixels(current, previous, width, height));
});

test("rejects elongated orange regions", () => {
  const width = 40; const height = 30; const pixels = new Uint8ClampedArray(width * height * 4);
  for (let x = 5; x < 30; x += 1) { const offset = (15 * width + x) * 4; pixels[offset] = 160; pixels[offset + 1] = 70; pixels[offset + 2] = 30; pixels[offset + 3] = 255; }
  assert.equal(detectOrangeBallPixels(pixels, width, height), null);
});
