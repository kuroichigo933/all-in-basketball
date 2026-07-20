import assert from "node:assert/strict";
import test from "node:test";
import { BallModelPassScheduler, type BallModelPass } from "../lib/motion/ballModelPassScheduler.ts";

test("ball model scheduler runs at most one pass and alternates after misses", () => {
  const scheduler = new BallModelPassScheduler();
  const passes: BallModelPass[] = [];
  passes.push(scheduler.select(true, true));
  scheduler.record(passes.at(-1)!, false);
  passes.push(scheduler.select(true, true));
  scheduler.record(passes.at(-1)!, false);
  passes.push(scheduler.select(true, true));
  assert.deepEqual(passes, ["primary", "focus", "primary"]);
});

test("ball model scheduler returns to primary after a measurement", () => {
  const scheduler = new BallModelPassScheduler();
  scheduler.record(scheduler.select(true, true), false);
  const focus = scheduler.select(true, true);
  scheduler.record(focus, true);
  assert.equal(focus, "focus");
  assert.equal(scheduler.select(true, true), "primary");
});

test("ball model scheduler skips inference without a player and resets safely", () => {
  const scheduler = new BallModelPassScheduler();
  scheduler.record(scheduler.select(true, true), false);
  const skipped = scheduler.select(false, false);
  scheduler.record(skipped, false);
  assert.equal(skipped, "skip");
  assert.equal(scheduler.select(true, true), "primary");
});

test("ball model scheduler falls back to primary when no focus crop exists", () => {
  const scheduler = new BallModelPassScheduler();
  scheduler.record(scheduler.select(true, true), false);
  assert.equal(scheduler.select(true, false), "primary");
  scheduler.reset();
  assert.equal(scheduler.select(true, true), "primary");
});
