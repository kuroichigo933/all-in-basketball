import test from "node:test";
import assert from "node:assert/strict";
import { assertUsableSampling, summarizeSampling } from "../lib/motion/sampling.ts";

test("reports complete deterministic sampling", () => {
  const report = summarizeSampling([0, 100, 200, 300].map((timeMs) => ({ timeMs })), 300, 100);
  assert.deepEqual({ expected: report.expectedSamples, actual: report.actualSamples, skipped: report.skippedSlots }, { expected: 4, actual: 4, skipped: 0 });
  assert.equal(report.coverage, 1); assert.equal(report.maximumGapMs, 100);
});

test("surfaces startup holes and skipped sampling slots", () => {
  const report = summarizeSampling([0, 100, 2_000, 2_100].map((timeMs) => ({ timeMs })), 2_100, 100);
  assert.equal(report.expectedSamples, 22); assert.equal(report.actualSamples, 4);
  assert.equal(report.skippedSlots, 18); assert.equal(report.maximumGapMs, 1_900);
  assert.ok(report.coverage < 0.2);
  assert.throws(() => assertUsableSampling([0, 100, 2_000, 2_100].map((timeMs) => ({ timeMs })), 100), /Sampling gap/);
});

test("accepts a complete fixed cadence for validation", () => {
  const observations = [0, 100, 200, 300].map((timeMs) => ({ timeMs }));
  const declared = summarizeSampling(observations, 300, 100);
  assert.equal(assertUsableSampling(observations, 100, declared).maximumGapMs, 100);
});

test("rejects decoded frames that are too far from their requested timestamps", () => {
  const observations = [0, 100, 200, 300].map((timeMs) => ({ timeMs }));
  const declared = { ...summarizeSampling(observations, 300, 100), maximumFrameOffsetMs: 166.667 };
  assert.throws(() => assertUsableSampling(observations, 100, declared), /Decoded frame offset/);
});
