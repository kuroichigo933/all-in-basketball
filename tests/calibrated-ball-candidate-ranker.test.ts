import test from "node:test";
import assert from "node:assert/strict";
import { BALL_CANDIDATE_FEATURES, CALIBRATED_BALL_CANDIDATE_RANKER, candidateIdentityFeatures,
  scoreBallCandidateIdentity, validateCalibratedBallCandidateRanker } from "../lib/motion/calibratedBallCandidateRanker.ts";

const pose = { leftWrist: { x: 0.3, y: 0.4 }, rightWrist: { x: 0.7, y: 0.4 },
  leftHip: { x: 0.4, y: 0.6 }, rightHip: { x: 0.6, y: 0.6 },
  leftKnee: { x: 0.4, y: 0.8 }, rightKnee: { x: 0.6, y: 0.8 } };

test("loads the versioned calibration-only ball candidate ranker", () => {
  assert.equal(CALIBRATED_BALL_CANDIDATE_RANKER.calibrationOnly, true);
  assert.deepEqual(CALIBRATED_BALL_CANDIDATE_RANKER.features, [...BALL_CANDIDATE_FEATURES]);
  assert.equal(CALIBRATED_BALL_CANDIDATE_RANKER.layers.at(-1)?.weights.length, 1);
});

test("extracts finite pose-relative candidate features and a bounded score", () => {
  const candidate = { point: { x: 0.45, y: 0.65 }, confidence: 0.4, source: "motion" as const,
    apparentSize: 0.05, appearanceConfidence: 0.7 };
  assert.equal(candidateIdentityFeatures(candidate, pose).length, BALL_CANDIDATE_FEATURES.length);
  assert.ok(candidateIdentityFeatures(candidate, pose).every(Number.isFinite));
  const score = scoreBallCandidateIdentity(candidate, pose);
  assert.ok(score >= 0 && score <= 1);
});

test("rejects a ranker with a mismatched feature contract", () => {
  assert.throws(() => validateCalibratedBallCandidateRanker({ ...CALIBRATED_BALL_CANDIDATE_RANKER,
    features: ["wrong"] }), /feature contract/);
});
