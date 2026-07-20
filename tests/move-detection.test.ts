import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MOVE_DETECTION_CONFIG, detectMoves, resolveMoveDetections, summarizeAnalysis } from "../lib/motion/detectMoves.ts";
import type { MotionObservation, MoveDetection, MoveName } from "../lib/motion/types.ts";

const frame = (timeMs: number, ballX: number, ballY = 0.62): MotionObservation => ({
  timeMs, poseConfidence: 0.9, ballConfidence: 0.85,
  leftWrist: { x: 0.32, y: 0.58 }, rightWrist: { x: 0.68, y: 0.58 },
  leftHip: { x: 0.4, y: 0.48 }, rightHip: { x: 0.6, y: 0.48 },
  leftKnee: { x: 0.42, y: 0.75 }, rightKnee: { x: 0.58, y: 0.75 },
  ball: { x: ballX, y: ballY },
});

const detection = (move: MoveName, startMs: number, endMs: number, confidence: number): MoveDetection =>
  ({ move, startMs, endMs, confidence, evidence: [] });

test("uses repeat-robust lateral transfer defaults", () => {
  assert.equal(DEFAULT_MOVE_DETECTION_CONFIG.minimumLateralDurationMs, 500);
  assert.equal(DEFAULT_MOVE_DETECTION_CONFIG.behindMaximumKneeSpreadHipWidths, 2.6);
  assert.equal(DEFAULT_MOVE_DETECTION_CONFIG.betweenLegsVeryStrongKneeSpreadHipWidths, 2.68);
  assert.equal(DEFAULT_MOVE_DETECTION_CONFIG.poseTransferBallProximityHipWidths, 1);
  assert.equal(DEFAULT_MOVE_DETECTION_CONFIG.lateralCrossoverMaximumWristDepthHipWidths, -7);
  assert.equal(DEFAULT_MOVE_DETECTION_CONFIG.poseTransferOutsideCorridorCrossoverMaximumWristDepthHipWidths, -5.8);
  assert.equal(DEFAULT_MOVE_DETECTION_CONFIG.poseTransferOutsideCorridorBetweenLegsMaximumWristDepthHipWidths, -4);
  assert.equal(DEFAULT_MOVE_DETECTION_CONFIG.poseTransferCooldownMs, 550);
  assert.equal(DEFAULT_MOVE_DETECTION_CONFIG.betweenLegsRecentExtremeKneeSpreadHipWidths, 2.75);
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
  const controlled = (observation: MotionObservation): MotionObservation => ({
    ...observation,
    leftWrist: { x: 0.5, y: 0.62, visibility: 0.95 },
    leftKnee: { x: 0.2, y: 0.75 }, rightKnee: { x: 0.8, y: 0.75 },
  });
  const moves = detectMoves([frame(0, 0.3), controlled(frame(250, 0.5, 0.62)), controlled(frame(500, 0.7, 0.62))]);
  assert.ok(moves.some((move) => move.move === "between-the-legs"));
  const outside = detectMoves([frame(0, 0.3), frame(250, 0.5, 0.3), frame(500, 0.7)]);
  assert.equal(outside.some((move) => move.move === "between-the-legs"), false);
});

test("retains temporal between-the-legs evidence when sparse samples interpolate the crossing too high", () => {
  const controlled = (observation: MotionObservation): MotionObservation => ({
    ...observation,
    leftWrist: { x: 0.5, y: 0.62, visibility: 0.95 },
    leftKnee: { x: 0.2, y: 0.75 }, rightKnee: { x: 0.8, y: 0.75 },
  });
  const moves = detectMoves([
    controlled(frame(0, 0.3, 0.62)),
    controlled(frame(250, 0.45, 0.44)),
    controlled(frame(500, 0.7, 0.44)),
  ]);
  assert.ok(moves.some((move) => move.move === "between-the-legs"));
  assert.equal(moves.some((move) => move.move === "behind-the-back"), false);
  assert.ok(moves.find((move) => move.move === "between-the-legs")!.endMs <= 500);
});

test("abstains from a lateral crossover when both wrists stay shallow in pose depth", () => {
  const shallow = (observation: MotionObservation): MotionObservation => ({
    ...observation,
    leftWrist: { ...observation.leftWrist, z: -0.3 }, rightWrist: { ...observation.rightWrist, z: -0.3 },
    leftHip: { ...observation.leftHip, z: 0 }, rightHip: { ...observation.rightHip, z: 0 },
  });
  const moves = detectMoves([shallow(frame(0, 0.3, 0.3)), shallow(frame(250, 0.5, 0.3)), shallow(frame(500, 0.7, 0.3))]);
  assert.equal(moves.some((move) => move.move === "crossover"), false);
});

test("does not call a projected leg-region crossing between-the-legs without sustained wrist control", () => {
  const moves = detectMoves([frame(0, 0.3), frame(250, 0.5, 0.62), frame(500, 0.7)]);
  assert.equal(moves.some((move) => move.move === "between-the-legs"), false);
  assert.ok(moves.some((move) => move.move === "behind-the-back"));
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

test("abstains when one physical transfer has contradictory specific anatomy", () => {
  const resolved = resolveMoveDetections([
    detection("crossover", 10_500, 10_800, 0.88),
    detection("between-the-legs", 10_667, 10_967, 0.82),
    detection("crossover", 10_800, 11_100, 0.9),
    detection("behind-the-back", 10_700, 11_000, 0.8),
  ]);
  assert.deepEqual(resolved, []);
});

test("deduplicates the same move independent of insertion order and keeps later repetitions", () => {
  const resolved = resolveMoveDetections([
    detection("crossover", 0, 250, 0.7),
    detection("hesitation", 2_000, 2_500, 0.75),
    detection("crossover", 200, 450, 0.9),
    detection("crossover", 1_000, 1_250, 0.8),
  ]);
  assert.deepEqual(resolved.filter((move) => move.move === "crossover").map((move) => move.startMs), [200, 1_000]);
});

test("rejects a move window spanning a large observation gap", () => {
  const observations = [frame(0, 0.3), frame(200, 0.5, 0.3), frame(700, 0.7)];
  assert.deepEqual(detectMoves(observations), []);
});

test("does not classify a lateral transfer from predicted endpoints", () => {
  const observations = [
    { ...frame(0, 0.3), ballSource: "interpolated" as const },
    frame(250, 0.5, 0.62),
    frame(500, 0.7),
  ];
  assert.deepEqual(detectMoves(observations), []);
});

test("does not turn torso jitter into screen-space ball travel", () => {
  const shifted = (observation: MotionObservation, amount: number): MotionObservation => ({
    ...observation,
    leftHip: { ...observation.leftHip, x: observation.leftHip.x + amount }, rightHip: { ...observation.rightHip, x: observation.rightHip.x + amount },
    leftKnee: { ...observation.leftKnee, x: observation.leftKnee.x + amount }, rightKnee: { ...observation.rightKnee, x: observation.rightKnee.x + amount },
  });
  const observations = [shifted(frame(0, 0.5, 0.3), 0.1), frame(250, 0.5, 0.3), shifted(frame(500, 0.5, 0.3), -0.1)];
  assert.deepEqual(detectMoves(observations), []);
});

test("uses normalized knee spread to distinguish pose-supported transfers", () => {
  const transfer = (wideStance: boolean): MotionObservation[] => {
    const source = { ...frame(0, 0.62, 0.62),
      leftWrist: { x: 0.3, y: 0.55, z: -0.2, visibility: 0.95 },
      rightWrist: { x: 0.56, y: 0.62, z: -0.2, visibility: 0.95 },
      leftHip: { x: 0.4, y: 0.48, z: 0 }, rightHip: { x: 0.6, y: 0.48, z: 0 } };
    const destination = { ...frame(300, 0.38, 0.62),
      leftWrist: { x: 0.44, y: 0.62, z: 0, visibility: 0.95 },
      rightWrist: { x: 0.7, y: 0.55, z: -0.2, visibility: 0.95 },
      leftHip: { x: 0.4, y: 0.48, z: 0 }, rightHip: { x: 0.6, y: 0.48, z: 0 },
      leftKnee: { x: wideStance ? 0.1 : 0.42, y: 0.75 }, rightKnee: { x: wideStance ? 0.9 : 0.58, y: 0.75 } };
    const confirmation = { ...destination, timeMs: 450 };
    return [source, destination, confirmation];
  };
  const poseOnly = { ...DEFAULT_MOVE_DETECTION_CONFIG, lateralTravelHipWidths: 10 };
  assert.ok(detectMoves(transfer(true), poseOnly).some((move) => move.move === "between-the-legs"));
  assert.ok(detectMoves(transfer(false), poseOnly).some((move) => move.move === "behind-the-back"));
});

test("keeps consecutive lateral repetitions that share a measured endpoint", () => {
  const moves = detectMoves([
    frame(0, 0.3, 0.49), frame(200, 0.4, 0.49), frame(400, 0.55, 0.49), frame(600, 0.7, 0.49),
    frame(800, 0.55, 0.49), frame(1_000, 0.4, 0.49), frame(1_200, 0.3, 0.49),
  ]);
  assert.equal(moves.filter((move) => move.move === "behind-the-back").length, 2);
});

test("uses stance and wrist depth for a behind-the-back crossing below the projected knees", () => {
  const behindDepth = (observation: MotionObservation): MotionObservation => ({
    ...observation,
    leftWrist: { ...observation.leftWrist, z: -0.25 }, rightWrist: { ...observation.rightWrist, z: -0.25 },
    leftHip: { ...observation.leftHip, z: 0 }, rightHip: { ...observation.rightHip, z: 0 },
  });
  const moves = detectMoves([
    behindDepth(frame(0, 0.3, 0.82)),
    behindDepth(frame(250, 0.5, 0.82)),
    behindDepth(frame(500, 0.7, 0.82)),
  ]);
  const behind = moves.find((move) => move.move === "behind-the-back");
  assert.ok(behind);
  assert.match(behind.evidence.join(" "), /below the projected knee line/);
});

test("uses a wide stance for a between-the-legs crossing below the projected knees", () => {
  const wide = (observation: MotionObservation): MotionObservation => ({
    ...observation,
    leftKnee: { x: 0.2, y: 0.75 }, rightKnee: { x: 0.8, y: 0.75 },
  });
  const moves = detectMoves([wide(frame(0, 0.3, 0.82)), wide(frame(250, 0.5, 0.82)), wide(frame(500, 0.7, 0.82))]);
  assert.ok(moves.some((move) => move.move === "between-the-legs"));
  assert.equal(moves.some((move) => move.move === "behind-the-back"), false);
});

test("uses normalized wrist depth to distinguish a front-of-body crossover handoff", () => {
  const source = { ...frame(0, 0.62, 0.62), rightWrist: { x: 0.56, y: 0.62, z: 0, visibility: 0.95 } };
  const destination = { ...frame(300, 0.38, 0.62), leftWrist: { x: 0.44, y: 0.62, z: -1.6, visibility: 0.95 } };
  const moves = detectMoves([source, destination, { ...destination, timeMs: 450 }], { ...DEFAULT_MOVE_DETECTION_CONFIG, lateralTravelHipWidths: 10 });
  const crossover = moves.find((move) => move.move === "crossover");
  assert.ok(crossover);
  assert.match(crossover.evidence.join(" "), /in front of the hips/);
  assert.equal(moves.some((move) => move.move === "between-the-legs"), false);
});

test("does not treat the first wrist seen in the knee corridor as a handoff", () => {
  const firstControl = { ...frame(300, 0.44, 0.62),
    leftWrist: { x: 0.44, y: 0.62, z: 0, visibility: 0.95 },
    rightWrist: { x: 0.7, y: 0.55, z: -0.2, visibility: 0.95 },
    leftHip: { x: 0.4, y: 0.48, z: 0 }, rightHip: { x: 0.6, y: 0.48, z: 0 } };
  assert.deepEqual(detectMoves([frame(0, 0.44, 0.62), firstControl], { ...DEFAULT_MOVE_DETECTION_CONFIG, lateralTravelHipWidths: 10 }), []);
});

test("pose-supported transfer requires measured ball evidence at the wrist switch", () => {
  const transfer = [
    { ...frame(0, 0.62), rightWrist: { x: 0.56, y: 0.62, visibility: 0.95 } },
    { ...frame(300, 0.38), leftWrist: { x: 0.44, y: 0.62, visibility: 0.95 }, ballSource: "interpolated" as const },
  ];
  const poseOnly = { ...DEFAULT_MOVE_DETECTION_CONFIG, lateralTravelHipWidths: 10 };
  assert.deepEqual(detectMoves(transfer, poseOnly), []);
});

test("detects a pose-supported crossover when measured wrist control switches above the knee corridor", () => {
  const transfer = [
    { ...frame(0, 0.32, 0.42), ballSource: "detected" as const },
    { ...frame(200, 0.68, 0.42), ballSource: "detected" as const },
    { ...frame(350, 0.68, 0.42), ballSource: "detected" as const },
  ];
  const poseOnly = { ...DEFAULT_MOVE_DETECTION_CONFIG, lateralTravelHipWidths: 10 };
  const crossover = detectMoves(transfer, poseOnly).find((move) => move.move === "crossover");
  assert.ok(crossover); assert.match(crossover.evidence.join(" "), /control changed between wrists/);
});

test("pose-supported crossover rejects one-frame wrist-control wobble", () => {
  const wobble = [
    { ...frame(0, 0.32, 0.42), ballSource: "detected" as const },
    { ...frame(200, 0.68, 0.42), ballSource: "detected" as const },
    { ...frame(350, 0.32, 0.42), ballSource: "detected" as const },
  ];
  const poseOnly = { ...DEFAULT_MOVE_DETECTION_CONFIG, lateralTravelHipWidths: 10 };
  assert.equal(detectMoves(wobble, poseOnly).some((move) => move.move === "crossover"), false);
});

test("uses a very wide stance to recover a sparse outside-corridor between-the-legs handoff", () => {
  const wide = (observation: MotionObservation): MotionObservation => ({
    ...observation,
    leftKnee: { x: 0.23, y: 0.75 }, rightKnee: { x: 0.77, y: 0.75 },
    leftWrist: { x: 0.32, y: 0.42 }, rightWrist: { x: 0.68, y: 0.42 },
  });
  const transfer = [
    wide({ ...frame(0, 0.32, 0.42), ballSource: "detected" as const }),
    wide({ ...frame(200, 0.68, 0.42), ballSource: "detected" as const }),
    wide({ ...frame(350, 0.68, 0.42), ballSource: "detected" as const }),
  ];
  const poseOnly = { ...DEFAULT_MOVE_DETECTION_CONFIG, lateralTravelHipWidths: 10 };
  const moves = detectMoves(transfer, poseOnly);
  assert.ok(moves.some((move) => move.move === "between-the-legs"));
  assert.equal(moves.some((move) => move.move === "crossover"), false);
});

test("does not turn an ordinary wide-stance crossover into between-the-legs", () => {
  const ordinaryWide = (observation: MotionObservation): MotionObservation => ({
    ...observation,
    leftKnee: { x: 0.235, y: 0.75 }, rightKnee: { x: 0.765, y: 0.75 },
    leftWrist: { x: 0.32, y: 0.42 }, rightWrist: { x: 0.68, y: 0.42 },
  });
  const transfer = [
    ordinaryWide({ ...frame(0, 0.32, 0.42), ballSource: "detected" as const }),
    ordinaryWide({ ...frame(200, 0.68, 0.42), ballSource: "detected" as const }),
    ordinaryWide({ ...frame(350, 0.68, 0.42), ballSource: "detected" as const }),
  ];
  const moves = detectMoves(transfer, { ...DEFAULT_MOVE_DETECTION_CONFIG, lateralTravelHipWidths: 10 });
  assert.ok(moves.some((move) => move.move === "crossover"));
  assert.equal(moves.some((move) => move.move === "between-the-legs"), false);
});

test("can use an extreme stance immediately before a sparse outside-corridor handoff", () => {
  const pose = (observation: MotionObservation, kneeLeft: number, kneeRight: number): MotionObservation => ({
    ...observation,
    leftKnee: { x: kneeLeft, y: 0.75 }, rightKnee: { x: kneeRight, y: 0.75 },
    leftWrist: { x: 0.32, y: 0.42, z: -1.2 }, rightWrist: { x: 0.68, y: 0.42, z: -1.2 },
  });
  const moves = detectMoves([
    pose({ ...frame(0, 0.32, 0.42), ballSource: "detected" as const }, 0.24, 0.76),
    pose({ ...frame(100, 0.32, 0.42), ballSource: "detected" as const }, 0.21, 0.79),
    pose({ ...frame(200, 0.68, 0.42), ballSource: "detected" as const }, 0.24, 0.76),
    pose({ ...frame(350, 0.68, 0.42), ballSource: "detected" as const }, 0.24, 0.76),
  ], { ...DEFAULT_MOVE_DETECTION_CONFIG, lateralTravelHipWidths: 10,
    betweenLegsRecentExtremeKneeSpreadHipWidths: 2.8 });
  const betweenLegs = moves.find((move) => move.move === "between-the-legs");
  assert.ok(betweenLegs);
  assert.match(betweenLegs.evidence.join(" "), /recent knee spread/);
});

test("uses wrist depth to classify outside-corridor handoffs across all three live moves", () => {
  const transfer = (wristDepth: number, kneeLeft: number, kneeRight: number) => {
    const pose = (observation: MotionObservation): MotionObservation => ({
      ...observation,
      leftHip: { ...observation.leftHip, z: 0 }, rightHip: { ...observation.rightHip, z: 0 },
      leftKnee: { x: kneeLeft, y: 0.75 }, rightKnee: { x: kneeRight, y: 0.75 },
      leftWrist: { x: 0.32, y: 0.42, z: wristDepth }, rightWrist: { x: 0.68, y: 0.42, z: wristDepth },
    });
    return [
      pose({ ...frame(0, 0.32, 0.42), ballSource: "detected" as const }),
      pose({ ...frame(200, 0.68, 0.42), ballSource: "detected" as const }),
      pose({ ...frame(350, 0.68, 0.42), ballSource: "detected" as const }),
    ];
  };
  const poseOnly = { ...DEFAULT_MOVE_DETECTION_CONFIG, lateralTravelHipWidths: 10 };
  assert.ok(detectMoves(transfer(-1.2, 0.3, 0.7), poseOnly).some((move) => move.move === "crossover"));
  assert.ok(detectMoves(transfer(-0.7, 0.3, 0.7), poseOnly).some((move) => move.move === "behind-the-back"));
  assert.ok(detectMoves(transfer(-0.8, 0.23, 0.77), poseOnly).some((move) => move.move === "between-the-legs"));
});

test("aligns sparse lateral and pose evidence inside the between-the-legs wrist-depth band", () => {
  const depthBand = (observation: MotionObservation): MotionObservation => ({
    ...observation,
    leftHip: { ...observation.leftHip, z: 0 }, rightHip: { ...observation.rightHip, z: 0 },
    leftKnee: { x: 0.24, y: 0.75 }, rightKnee: { x: 0.76, y: 0.75 },
    leftWrist: { x: 0.32, y: 0.42, z: -0.9 }, rightWrist: { x: 0.68, y: 0.42, z: -0.9 },
  });
  const moves = detectMoves([
    depthBand({ ...frame(0, 0.3, 0.3), ballSource: "detected" as const }),
    depthBand({ ...frame(250, 0.5, 0.3), ballSource: "detected" as const }),
    depthBand({ ...frame(500, 0.7, 0.3), ballSource: "detected" as const }),
  ]);
  assert.ok(moves.some((move) => move.move === "between-the-legs"));
  assert.equal(moves.some((move) => move.move === "behind-the-back"), false);
  assert.ok(moves.find((move) => move.move === "between-the-legs")!.endMs <= 500);
});
