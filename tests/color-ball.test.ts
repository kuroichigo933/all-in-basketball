import test from "node:test";
import assert from "node:assert/strict";
import { detectMovingBallPixelCandidates, detectMovingBallPixels, detectOrangeBallPixelCandidates, detectOrangeBallPixels } from "../lib/motion/colorBall.ts";

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

test("joins orange ball lobes split by a dark one-pixel seam", () => {
  const width = 40; const height = 30; const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 12; y <= 18; y += 1) for (const [left, right] of [[15, 17], [19, 21]]) for (let x = left; x <= right; x += 1) {
    const offset = (y * width + x) * 4; pixels[offset] = 170; pixels[offset + 1] = 75; pixels[offset + 2] = 30; pixels[offset + 3] = 255;
  }
  const results = detectOrangeBallPixelCandidates(pixels, width, height);
  assert.equal(results.length, 1); assert.ok(Math.abs(results[0].center.x - 18 / width) < 0.02);
});

test("retains multiple compact motion candidates for temporal fusion", () => {
  const width = 60; const height = 30;
  const previous = new Uint8ClampedArray(width * height * 4).fill(150); const current = previous.slice();
  for (const centerX of [14, 44]) for (let y = 12; y <= 18; y += 1) for (let x = centerX - 3; x <= centerX + 3; x += 1) {
    if (Math.hypot(x - centerX, y - 15) > 3.2) continue;
    const offset = (y * width + x) * 4; current[offset] = 15; current[offset + 1] = 15; current[offset + 2] = 15; current[offset + 3] = 255;
  }
  const candidates = detectMovingBallPixelCandidates(current, previous, width, height);
  assert.equal(candidates.length, 2);
  assert.ok(candidates.some((candidate) => Math.abs(candidate.center.x - 14 / width) < 0.03));
  assert.ok(candidates.some((candidate) => Math.abs(candidate.center.x - 44 / width) < 0.03));
});

test("three-frame motion keeps the new ball position instead of old-position ghosts", () => {
  const width = 60; const height = 30;
  const makeFrame = (centerX: number) => {
    const pixels = new Uint8ClampedArray(width * height * 4).fill(170);
    for (let y = 12; y <= 18; y += 1) for (let x = centerX - 3; x <= centerX + 3; x += 1) {
      if (Math.hypot(x - centerX, y - 15) > 3.2) continue;
      const offset = (y * width + x) * 4; pixels[offset] = 15; pixels[offset + 1] = 15; pixels[offset + 2] = 15; pixels[offset + 3] = 255;
    }
    return pixels;
  };
  const candidates = detectMovingBallPixelCandidates(makeFrame(44), makeFrame(28), width, height, undefined, { x: 28 / width, y: 0.5 }, 5, makeFrame(12));
  assert.equal(candidates.length, 1);
  assert.ok(Math.abs(candidates[0].center.x - 44 / width) < 0.03);
});

test("does not prefer an oversized round motion blob over a ball-sized component", () => {
  const width = 80; const height = 50;
  const previous = new Uint8ClampedArray(width * height * 4).fill(180); const current = previous.slice();
  for (const [centerX, centerY, radius] of [[20, 25, 3], [58, 25, 10]]) {
    for (let y = centerY - radius; y <= centerY + radius; y += 1) for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if (Math.hypot(x - centerX, y - centerY) > radius) continue;
      const offset = (y * width + x) * 4; current[offset] = 15; current[offset + 1] = 15; current[offset + 2] = 15; current[offset + 3] = 255;
    }
  }
  const result = detectMovingBallPixels(current, previous, width, height);
  assert.ok(result); assert.ok(Math.abs(result.center.x - 20 / width) < 0.03);
});
