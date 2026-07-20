import assert from "node:assert/strict";
import test from "node:test";
import { summarizeLiveRuntimeDiagnostics, type LiveRuntimeMetrics } from "../lib/motion/liveRuntimeDiagnostics.ts";

const metrics = (samples: number): LiveRuntimeMetrics => ({ samples, measuredBallSamples: Math.floor(samples * 0.8),
  trackedBallSamples: Math.floor(samples * 0.9), maximumGapMs: 140, totalInferenceMs: samples * 72,
  maximumInferenceMs: 105, primaryPasses: Math.floor(samples / 2), focusPasses: Math.floor(samples / 3),
  skippedModelPasses: samples - Math.floor(samples / 2) - Math.floor(samples / 3) });

test("live runtime diagnostics separate cadence, latency, coverage, and model passes", () => {
  const report = summarizeLiveRuntimeDiagnostics(metrics(120), 12_000);
  assert.equal(report.observedInferenceFps, 10);
  assert.equal(report.averageInferenceMs, 72);
  assert.equal(report.measuredBallCoverage, 0.8);
  assert.equal(report.trackedBallCoverage, 0.9);
  assert.equal(report.modelPasses.primary + report.modelPasses.focus + report.modelPasses.skipped, 120);
  assert.equal(report.gate, "pass");
});

test("live runtime gate requires a sustained run and the full target rate", () => {
  assert.equal(summarizeLiveRuntimeDiagnostics(metrics(80), 8_000).gate, "insufficient-duration");
  assert.equal(summarizeLiveRuntimeDiagnostics(metrics(95), 10_000).gate, "fail");
  assert.equal(summarizeLiveRuntimeDiagnostics(metrics(100), 10_000).gate, "pass");
});

test("live runtime diagnostics handle an empty session without non-finite values", () => {
  const report = summarizeLiveRuntimeDiagnostics(metrics(0), Number.NaN);
  assert.equal(report.observedInferenceFps, 0);
  assert.equal(report.averageInferenceMs, 0);
  assert.equal(report.gate, "insufficient-duration");
});
