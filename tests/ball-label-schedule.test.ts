import test from "node:test";
import assert from "node:assert/strict";
import { createUniformBallLabelSchedule } from "../lib/motion/ballLabelSchedule.ts";

test("creates a prediction-independent uniform ball-label schedule", () => {
  const schedule = createUniformBallLabelSchedule(20_000, 20);
  assert.equal(schedule.length, 20);
  assert.equal(schedule[0], 300);
  assert.equal(schedule.at(-1), 19_700);
  assert.ok(schedule.every((timeMs) => timeMs % 100 === 0));
  assert.equal(new Set(schedule).size, schedule.length);
});

test("caps dense schedules at unique decodable timestamps", () => {
  assert.deepEqual(createUniformBallLabelSchedule(500, 20), [300]);
  assert.throws(() => createUniformBallLabelSchedule(0), /duration must be positive/);
  assert.throws(() => createUniformBallLabelSchedule(1_000, 0), /frame count/);
});
