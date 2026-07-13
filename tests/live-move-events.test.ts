import test from "node:test";
import assert from "node:assert/strict";
import { selectCompletedLiveMove, type LiveMoveCursor } from "../lib/motion/liveMoveEvents.ts";
import type { MoveDetection, MoveName } from "../lib/motion/types.ts";

const detection = (move: MoveName, startMs: number, endMs: number, confidence = 0.8): MoveDetection =>
  ({ move, startMs, endMs, confidence, evidence: [] });

test("waits for a completed live event to settle and uses its detection timestamp", () => {
  const move = detection("crossover", 200, 500);
  assert.equal(selectCompletedLiveMove([move], 650, null), null);
  assert.equal(selectCompletedLiveMove([move], 900, null)?.endMs, 500);
});

test("never emits unsupported live move classes", () => {
  assert.equal(selectCompletedLiveMove([detection("in-and-out", 0, 500)], 800, null), null);
  assert.equal(selectCompletedLiveMove([detection("hesitation", 0, 500)], 800, null), null);
});

test("emits an overlapping rolling-window event once but allows a distinct repetition", () => {
  const previous: LiveMoveCursor = { startMs: 200, endMs: 500, emittedAtMs: 700 };
  assert.equal(selectCompletedLiveMove([detection("between-the-legs", 350, 650)], 1_100, previous), null);
  const next = selectCompletedLiveMove([detection("behind-the-back", 800, 1_100)], 1_500, previous);
  assert.equal(next?.move, "behind-the-back");
});

test("chooses the newest completed event by end time", () => {
  const selected = selectCompletedLiveMove([
    detection("crossover", 100, 500, 0.95),
    detection("between-the-legs", 500, 800, 0.75),
  ], 1_200, null);
  assert.equal(selected?.move, "between-the-legs");
});
