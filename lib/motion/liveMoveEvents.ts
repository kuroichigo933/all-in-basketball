import type { MoveDetection, MoveName } from "./types.ts";

export const LIVE_MOVE_NAMES: readonly MoveName[] = ["crossover", "between-the-legs", "behind-the-back"];

const LIVE_MOVE_SET = new Set<MoveName>(LIVE_MOVE_NAMES);
const EVENT_SETTLE_MS = 400;
const EVENT_MAX_AGE_MS = 1_000;
const EVENT_IDENTITY_GAP_MS = 200;
const MIN_EMISSION_GAP_MS = 250;

export type LiveMoveCursor = {
  startMs: number;
  endMs: number;
  emittedAtMs: number;
};

const samePhysicalEvent = (candidate: MoveDetection, previous: LiveMoveCursor) =>
  Math.abs((candidate.startMs + candidate.endMs) / 2 - (previous.startMs + previous.endMs) / 2) <= EVENT_IDENTITY_GAP_MS;

/**
 * Wait briefly for adjacent detector windows to settle, then emit the newest
 * supported completed event exactly once. Detection timestamps, rather than a
 * wall-clock cooldown alone, identify a physical repetition.
 */
export function selectCompletedLiveMove(
  detections: MoveDetection[],
  nowMs: number,
  previous: LiveMoveCursor | null,
): MoveDetection | null {
  const candidates = detections
    .filter((detection) => {
      const ageMs = nowMs - detection.endMs;
      return LIVE_MOVE_SET.has(detection.move) && ageMs >= EVENT_SETTLE_MS && ageMs <= EVENT_MAX_AGE_MS;
    })
    .sort((a, b) => b.endMs - a.endMs || b.confidence - a.confidence || b.startMs - a.startMs);

  for (const candidate of candidates) {
    if (!previous) return candidate;
    if (nowMs - previous.emittedAtMs < MIN_EMISSION_GAP_MS) continue;
    if (candidate.endMs <= previous.endMs || samePhysicalEvent(candidate, previous)) continue;
    return candidate;
  }
  return null;
}
