import type { MotionObservation } from "./types.ts";

export type SamplingDiagnostics = {
  strategy: "paced-frame" | "deterministic-seek" | "live-throttled";
  targetIntervalMs: number;
  expectedSamples: number;
  actualSamples: number;
  coverage: number;
  skippedSlots: number;
  firstSampleMs: number | null;
  lastSampleMs: number | null;
  p95GapMs: number;
  maximumGapMs: number;
  maximumFrameOffsetMs?: number;
};

export function summarizeSampling(
  observations: Pick<MotionObservation, "timeMs">[],
  durationMs: number,
  targetIntervalMs: number,
  strategy: SamplingDiagnostics["strategy"] = "deterministic-seek",
): SamplingDiagnostics {
  const expectedSamples = durationMs >= 0 && targetIntervalMs > 0 ? Math.floor(durationMs / targetIntervalMs) + 1 : 0;
  const times = observations.map((observation) => observation.timeMs).sort((a, b) => a - b);
  const gaps = times.slice(1).map((timeMs, index) => timeMs - times[index]).sort((a, b) => a - b);
  const p95Index = gaps.length ? Math.min(gaps.length - 1, Math.ceil(gaps.length * 0.95) - 1) : 0;
  return {
    strategy,
    targetIntervalMs,
    expectedSamples,
    actualSamples: times.length,
    coverage: expectedSamples ? Math.min(1, times.length / expectedSamples) : 0,
    skippedSlots: Math.max(0, expectedSamples - times.length),
    firstSampleMs: times[0] ?? null,
    lastSampleMs: times.at(-1) ?? null,
    p95GapMs: gaps[p95Index] ?? 0,
    maximumGapMs: gaps.at(-1) ?? 0,
  };
}

export function assertUsableSampling(
  observations: Pick<MotionObservation, "timeMs">[],
  targetIntervalMs: number,
  declared?: SamplingDiagnostics,
) {
  if (!observations.length) throw new Error("Observation export contains no samples.");
  const lastSampleMs = Math.max(...observations.map((observation) => observation.timeMs));
  const derived = summarizeSampling(observations, lastSampleMs, targetIntervalMs, declared?.strategy);
  if ((derived.firstSampleMs ?? 0) > targetIntervalMs * 1.5) throw new Error(`Sampling starts too late at ${derived.firstSampleMs} ms.`);
  if (derived.maximumGapMs > targetIntervalMs * 1.75) throw new Error(`Sampling gap ${derived.maximumGapMs} ms exceeds the allowed cadence.`);
  if (declared && (declared.coverage < 0.95 || declared.skippedSlots > 0)) throw new Error(`Declared sample coverage is only ${Math.round(declared.coverage * 100)}%.`);
  if (declared?.maximumFrameOffsetMs !== undefined && declared.maximumFrameOffsetMs > 50) throw new Error(`Decoded frame offset ${declared.maximumFrameOffsetMs} ms is too large.`);
  return derived;
}
