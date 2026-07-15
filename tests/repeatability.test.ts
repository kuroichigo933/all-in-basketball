import test from "node:test";
import assert from "node:assert/strict";
import { repeatabilityPasses, summarizeRepeatability } from "../lib/motion/repeatability.ts";
import { parseRunDirectories } from "../scripts/evaluate-repeatability.ts";

test("summarizes repeatability range without hiding the worst run", () => {
  const range = summarizeRepeatability([0.68, 0.72, 0.7]);
  assert.equal(range.samples, 3); assert.equal(range.minimum, 0.68); assert.equal(range.maximum, 0.72);
  assert.ok(Math.abs(range.mean - 0.7) < 1e-12); assert.ok(Math.abs(range.spread - 0.04) < 1e-12);
});

test("requires multiple runs and enforces the configured spread", () => {
  assert.equal(repeatabilityPasses(summarizeRepeatability([0.7]), 0.03), false);
  assert.equal(repeatabilityPasses(summarizeRepeatability([0.7, 0.72]), 0.03), true);
  assert.equal(repeatabilityPasses(summarizeRepeatability([0.7, 0.75]), 0.03), false);
  assert.throws(() => summarizeRepeatability([]), /at least one/);
  assert.throws(() => repeatabilityPasses(summarizeRepeatability([0.7, 0.7]), -1), /non-negative/);
});

test("requires at least two repeatability run directories", () => {
  assert.throws(() => parseRunDirectories("validation/local/run-1"), /at least two/);
  assert.throws(() => parseRunDirectories("validation/local/run-1,validation/local/run-1"), /distinct/);
  const runs = parseRunDirectories("validation/local/run-1, validation/local/run-2");
  assert.equal(runs.length, 2); assert.ok(runs.every((run) => run.includes("validation")));
});
