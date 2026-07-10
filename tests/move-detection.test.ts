import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MOVE_DETECTION_CONFIG, detectMoves, summarizeAnalysis } from "../lib/motion/detectMoves.ts";
import type { MotionObservation } from "../lib/motion/types.ts";

const frame = (timeMs: number, ballX: number, ballY = 0.62): MotionObservation => ({
  timeMs, poseConfidence: 0.9, ballConfidence: 0.85,
  leftWrist: { x: 0.32, y: 0.58 }, rightWrist: { x: 0.68, y: 0.58 },
  leftHip: { x: 0.4, y: 0.48 }, rightHip: { x: 0.6, y: 0.48 },
  leftKnee: { x: 0.42, y: 0.75 }, rightKnee: { x: 0.58, y: 0.75 },
  ball: { x: ballX, y: ballY },
});

test("detects a crossover with timestamps and evidence", () => {
  const moves = detectMoves([frame(0, 0.3), frame(250, 0.5, 0.35), frame(500, 0.7)]);
  const move = moves.find((candidate) => candidate.move === "crossover");
  assert.ok(move);
  assert.deepEqual([move.startMs, move.endMs], [0, 500]);
  assert.ok(move.confidence > 0.7);
  assert.ok(move.evidence.length >= 2);
});

test("detects between-the-legs only when the middle sample is in the leg region", () => {
  const moves = detectMoves([frame(0, 0.3), frame(250, 0.5, 0.62), frame(500, 0.7)]);
  assert.ok(moves.some((move) => move.move === "between-the-legs"));
  const outside = detectMoves([frame(0, 0.3), frame(250, 0.5, 0.3), frame(500, 0.7)]);
  assert.equal(outside.some((move) => move.move === "between-the-legs"), false);
});

test("detects a controlled hesitation and returns no invented result for missing ball data", () => {
  const pause = [frame(-200, 0.5, 0.7), frame(0, 0.66, 0.58), frame(200, 0.665, 0.58), frame(400, 0.66, 0.58), frame(650, 0.665, 0.58)];
  assert.ok(detectMoves(pause).some((move) => move.move === "hesitation"));
  const missing = pause.map((item) => ({ ...item, ball: null, ballConfidence: 0 }));
  assert.deepEqual(summarizeAnalysis(missing).moves, []);
  assert.equal(summarizeAnalysis(missing).ballCoverage, 0);
  const stationary = [frame(0, 0.66, 0.58), frame(200, 0.665, 0.58), frame(400, 0.66, 0.58), frame(600, 0.665, 0.58), frame(800, 0.66, 0.58)];
  assert.equal(detectMoves(stationary).some((move) => move.move === "hesitation"), false);
});

test("distinguishes a hip-band behind-the-back from a high crossover", () => {
  const behind = detectMoves([frame(0, 0.3), frame(250, 0.5, 0.49), frame(500, 0.7)]);
  assert.ok(behind.some((move) => move.move === "behind-the-back"));
  assert.equal(behind.some((move) => move.move === "between-the-legs"), false);
  const high = detectMoves([frame(0, 0.3), frame(250, 0.5, 0.3), frame(500, 0.7)]);
  assert.ok(high.some((move) => move.move === "crossover"));
  assert.equal(high.some((move) => move.move === "behind-the-back"), false);
});

test("detects an in-and-out return without inventing a crossover", () => {
  const observations = [frame(0, 0.72), frame(200, 0.64), frame(400, 0.52), frame(600, 0.63), frame(800, 0.7)];
  const moves = detectMoves(observations);
  assert.ok(moves.some((move) => move.move === "in-and-out"));
  assert.equal(moves.some((move) => move.move === "crossover"), false);
  const oneWay = [frame(0, 0.72), frame(200, 0.65), frame(400, 0.58), frame(600, 0.5), frame(800, 0.42)];
  assert.equal(detectMoves(oneWay).some((move) => move.move === "in-and-out"), false);
});

test("accepts isolated threshold configuration for dataset tuning", () => {
  const observations = [frame(0, 0.3), frame(250, 0.5, 0.3), frame(500, 0.7)];
  assert.ok(detectMoves(observations).some((move) => move.move === "crossover"));
  const strict = { ...DEFAULT_MOVE_DETECTION_CONFIG, lateralTravelHipWidths: 3 };
  assert.equal(detectMoves(observations, strict).some((move) => move.move === "crossover"), false);
});
