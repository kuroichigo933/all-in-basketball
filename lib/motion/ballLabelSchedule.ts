export function createUniformBallLabelSchedule(
  durationMs: number,
  requestedFrames = 20,
  intervalMs = 100,
  edgeMarginMs = 300,
) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("Ball-label schedule duration must be positive.");
  if (!Number.isSafeInteger(requestedFrames) || requestedFrames <= 0) throw new Error("Ball-label schedule frame count must be a positive integer.");
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) throw new Error("Ball-label schedule interval must be a positive integer.");
  if (!Number.isFinite(edgeMarginMs) || edgeMarginMs < 0) throw new Error("Ball-label schedule edge margin must be non-negative.");

  const maximumTime = Math.max(0, Math.floor(durationMs / intervalMs) * intervalMs);
  const margin = Math.min(edgeMarginMs, maximumTime / 2);
  const first = Math.ceil(margin / intervalMs) * intervalMs;
  const last = Math.floor((maximumTime - margin) / intervalMs) * intervalMs;
  const available = Array.from({ length: Math.max(0, Math.floor((last - first) / intervalMs) + 1) },
    (_, index) => first + index * intervalMs);
  if (!available.length) return [Math.round((maximumTime / 2) / intervalMs) * intervalMs];
  const count = Math.min(requestedFrames, available.length);
  if (count === 1) return [available[Math.floor(available.length / 2)]];
  return Array.from({ length: count }, (_, index) => available[Math.round(index * (available.length - 1) / (count - 1))]);
}
