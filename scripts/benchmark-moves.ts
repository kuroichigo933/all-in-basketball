import { performance } from "node:perf_hooks";
import { detectMoves } from "../lib/motion/detectMoves.ts";
import type { MotionObservation } from "../lib/motion/types.ts";

const fixture: MotionObservation[] = Array.from({ length: 300 }, (_, index) => ({
  timeMs: index * 100, poseConfidence: 0.9, ballConfidence: 0.85,
  leftWrist: { x: 0.32, y: 0.58 }, rightWrist: { x: 0.68, y: 0.58 },
  leftHip: { x: 0.4, y: 0.48 }, rightHip: { x: 0.6, y: 0.48 },
  leftKnee: { x: 0.42, y: 0.75 }, rightKnee: { x: 0.58, y: 0.75 },
  ball: { x: 0.3 + (index % 3) * 0.2, y: 0.62 },
}));
const started = performance.now();
const moves = detectMoves(fixture);
const elapsed = performance.now() - started;
console.log(JSON.stringify({ fixture: "synthetic-smoke", observations: fixture.length, detections: moves.length, detectorMs: Number(elapsed.toFixed(2)) }, null, 2));
