export type LiveRuntimeMetrics = {
  samples: number;
  measuredBallSamples: number;
  trackedBallSamples: number;
  maximumGapMs: number;
  totalInferenceMs: number;
  maximumInferenceMs: number;
  primaryPasses: number;
  focusPasses: number;
  skippedModelPasses: number;
};

export type LiveRuntimeDiagnostics = {
  schemaVersion: 1;
  durationMs: number;
  targetInferenceFps: number;
  observedInferenceFps: number;
  averageInferenceMs: number;
  maximumInferenceMs: number;
  maximumSampleGapMs: number;
  measuredBallCoverage: number;
  trackedBallCoverage: number;
  modelPasses: { primary: number; focus: number; skipped: number };
  gate: "insufficient-duration" | "pass" | "fail";
};

export function summarizeLiveRuntimeDiagnostics(metrics: LiveRuntimeMetrics, durationMs: number,
  targetInferenceFps = 10, minimumGateDurationMs = 10_000): LiveRuntimeDiagnostics {
  const safeDurationMs = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  const observedInferenceFps = safeDurationMs > 0 ? metrics.samples / (safeDurationMs / 1000) : 0;
  const averageInferenceMs = metrics.samples ? metrics.totalInferenceMs / metrics.samples : 0;
  const gate = safeDurationMs < minimumGateDurationMs ? "insufficient-duration"
    : observedInferenceFps >= targetInferenceFps ? "pass" : "fail";
  return {
    schemaVersion: 1,
    durationMs: Math.round(safeDurationMs),
    targetInferenceFps,
    observedInferenceFps,
    averageInferenceMs,
    maximumInferenceMs: metrics.maximumInferenceMs,
    maximumSampleGapMs: metrics.maximumGapMs,
    measuredBallCoverage: metrics.samples ? metrics.measuredBallSamples / metrics.samples : 0,
    trackedBallCoverage: metrics.samples ? metrics.trackedBallSamples / metrics.samples : 0,
    modelPasses: { primary: metrics.primaryPasses, focus: metrics.focusPasses, skipped: metrics.skippedModelPasses },
    gate,
  };
}
