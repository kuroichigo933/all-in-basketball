import test from "node:test";
import assert from "node:assert/strict";
import { replayBallTracking } from "../lib/motion/replayBallTracking.ts";
import { buildBallTrackerConfigGrid, isBetterBallTrackerScore } from "../scripts/tune-ball-tracker.ts";
import type { MotionObservation } from "../lib/motion/types.ts";

const observation = (timeMs: number, candidates: MotionObservation["ballCandidates"]): MotionObservation => ({
  timeMs, poseConfidence: 1, ballConfidence: 0, ball: null, ballSource: "missing",
  leftWrist: { x: 0.3, y: 0.4 }, rightWrist: { x: 0.7, y: 0.4 }, leftHip: { x: 0.4, y: 0.6 },
  rightHip: { x: 0.6, y: 0.6 }, leftKnee: { x: 0.4, y: 0.8 }, rightKnee: { x: 0.6, y: 0.8 }, ballCandidates: candidates,
});

test("replays pre-association candidates through a configured tracker", () => {
  const replayed = replayBallTracking([
    observation(0, [{ point: { x: 0.2, y: 0.5 }, confidence: 0.7, source: "motion", apparentSize: 0.02 }]),
    observation(100, [{ point: { x: 0.22, y: 0.5 }, confidence: 0.7, source: "motion", apparentSize: 0.02 }]),
    observation(200, [{ point: { x: 0.75, y: 0.55 }, confidence: 0.5, source: "detected", apparentSize: 0.06 }]),
  ], { immediateDetectedMinimumConfidence: 0.3, immediateDetectedMinimumSize: 0.04, immediateDetectedMaximumSize: 0.09 });
  assert.equal(replayed[2].ballSource, "detected"); assert.ok(replayed[2].ball!.x > 0.7);
});

test("refuses replay when candidate snapshots are missing", () => {
  assert.throws(() => replayBallTracking([{ ...observation(0, []), ballCandidates: undefined }]), /no candidate snapshot/);
});

test("builds a finite calibration grid for immediate learned-detection overrides", () => {
  const grid = buildBallTrackerConfigGrid();
  assert.equal(grid.length, 48);
  assert.ok(grid.every((config) => Number.isFinite(config.immediateDetectedMinimumConfidence) &&
    config.immediateDetectedMinimumSize < config.immediateDetectedMaximumSize));
});

test("uses move F1 to break an exact ball-identity tuning tie", () => {
  const current = { metrics: { f1: 0.68, precision: 0.66 }, moves: { f1: 0.3, precision: 0.4 } };
  const candidate = { metrics: { f1: 0.68, precision: 0.66 }, moves: { f1: 0.34, precision: 0.35 } };
  assert.equal(isBetterBallTrackerScore(candidate, current), true);
  assert.equal(isBetterBallTrackerScore(current, candidate), false);
});
