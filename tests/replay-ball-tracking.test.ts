import test from "node:test";
import assert from "node:assert/strict";
import { replayBallTracking } from "../lib/motion/replayBallTracking.ts";
import { ballTrackerCandidateConfigs, buildBallAppearanceConfigGrid, buildBallAssociationConfigGrid, buildBallChallengerConfigGrid, buildBallDynamicsConfigGrid, buildBallRankerConfigGrid, buildBallTrackerConfigGrid, isBetterBallTrackerScore, requirePerManifestObservationDirectories } from "../scripts/tune-ball-tracker.ts";
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
  ], { immediateDetectedMinimumConfidence: 0.3, immediateDetectedMinimumSize: 0.04,
    immediateDetectedMaximumSize: 0.09, immediateDetectedMaximumDistance: 1.5 });
  assert.equal(replayed[2].ballSource, "detected"); assert.ok(replayed[2].ball!.x > 0.7);
});

test("refuses replay when candidate snapshots are missing", () => {
  assert.throws(() => replayBallTracking([{ ...observation(0, []), ballCandidates: undefined }]), /no candidate snapshot/);
});

test("replay honors player-gated measurement acceptance", () => {
  const distractor = [{ point: { x: 0.5, y: 0.5 }, confidence: 0.9, source: "color" as const }];
  const replayed = replayBallTracking([
    { ...observation(0, distractor), poseConfidence: 0, playerDetected: false },
    { ...observation(100, distractor), poseConfidence: 0, playerDetected: false },
  ]);
  assert.equal(replayed[0].ball, null); assert.equal(replayed[1].ball, null);
});

test("builds a finite calibration grid for immediate learned-detection overrides", () => {
  const grid = buildBallTrackerConfigGrid();
  assert.equal(grid.length, 3072);
  assert.ok(grid.every((config) => Number.isFinite(config.immediateDetectedMinimumConfidence) &&
    config.immediateDetectedMinimumSize < config.immediateDetectedMaximumSize &&
    Number.isFinite(config.challengerMotionMinimumConfidence) && config.challengerMotionMinimumSize > 0 &&
    Number.isFinite(config.challengerColorMinimumConfidence)));
});

test("uses move F1 to break an exact ball-identity tuning tie", () => {
  const current = { metrics: { f1: 0.68, precision: 0.66 }, moves: { f1: 0.3, precision: 0.4 } };
  const candidate = { metrics: { f1: 0.68, precision: 0.66 }, moves: { f1: 0.34, precision: 0.35 } };
  assert.equal(isBetterBallTrackerScore(candidate, current), true);
  assert.equal(isBetterBallTrackerScore(current, candidate), false);
});

test("treats an omitted occlusion rate as zero when breaking later ties", () => {
  const current = { metrics: { f1: 0.68, precision: 0.66 }, moves: { f1: 0.3, precision: 0.4 } };
  const candidate = { metrics: { f1: 0.68, precision: 0.66, occlusionPredictionRate: 0 }, moves: { f1: 0.34, precision: 0.35 } };
  assert.equal(isBetterBallTrackerScore(candidate, current), true);
  assert.equal(isBetterBallTrackerScore(current, candidate), false);
});

test("uses occlusion prediction persistence before move F1 to break a ball-identity tie", () => {
  const current = { metrics: { f1: 0.68, precision: 0.66, occlusionPredictionRate: 0 }, moves: { f1: 0.4, precision: 0.4 } };
  const candidate = { metrics: { f1: 0.68, precision: 0.64, occlusionPredictionRate: 0.5 }, moves: { f1: 0.3, precision: 0.3 } };
  assert.equal(isBetterBallTrackerScore(candidate, current), true);
});

test("requires one observation directory per manifest for combined ball tuning", () => {
  assert.doesNotThrow(() => requirePerManifestObservationDirectories(2, ["first", "second"]));
  assert.throws(() => requirePerManifestObservationDirectories(2, ["only-one"]), /exactly one/);
});

test("score-only tracker evaluation bypasses the tuning grid", () => {
  const config = { immediateDetectedMinimumConfidence: 0.4 };
  assert.deepEqual(ballTrackerCandidateConfigs(config), [config]);
  assert.equal(ballTrackerCandidateConfigs().length, 3072);
});

test("builds a bounded association-only grid", () => {
  const grid = buildBallAssociationConfigGrid();
  assert.equal(grid.length, 60);
  assert.ok(grid.every((config) => config.associationQualityWeight + config.associationSizeWeight <= 1));
  assert.deepEqual(ballTrackerCandidateConfigs(undefined, true), grid);
});

test("builds a bounded appearance-only grid", () => {
  const grid = buildBallAppearanceConfigGrid();
  assert.equal(grid.length, 12);
  assert.ok(grid.every((config) => config.associationQualityWeight + config.associationSizeWeight +
    config.associationAppearanceWeight <= 1));
  assert.deepEqual(ballTrackerCandidateConfigs(undefined, false, true), grid);
});

test("builds a bounded dynamics-only grid", () => {
  const grid = buildBallDynamicsConfigGrid();
  assert.equal(grid.length, 16);
  assert.ok(grid.every((config) => config.measurementCorrectionGain >= 0.7 && config.measurementCorrectionGain <= 1 &&
    config.velocityCorrectionGain >= 0 && config.velocityCorrectionGain <= 0.35));
  assert.deepEqual(ballTrackerCandidateConfigs(undefined, false, false, true), grid);
});

test("builds a bounded challenger-appearance grid", () => {
  const grid = buildBallChallengerConfigGrid();
  assert.equal(grid.length, 6);
  assert.ok(grid.every((config) => config.challengerAppearanceWeight >= 0 &&
    config.challengerAppearanceWeight <= 1));
  assert.deepEqual(ballTrackerCandidateConfigs(undefined, false, false, false, true), grid);
});

test("builds a bounded calibrated-ranker grid", () => {
  const grid = buildBallRankerConfigGrid();
  assert.equal(grid.length, 25);
  assert.ok(grid.every((config) => config.identityQualityWeight >= 0 && config.identityQualityWeight <= 1 &&
    config.identityOverrideMinimumConfidence >= 0.5));
  assert.deepEqual(ballTrackerCandidateConfigs(undefined, false, false, false, false, true), grid);
});
