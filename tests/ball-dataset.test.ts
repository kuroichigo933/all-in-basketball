import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { assessBallDetectorCollectionReadiness, createBallDatasetSamples, requireCalibrationDatasetSplit, yoloBallLabel } from "../lib/motion/ballDataset.ts";
import { parseBallDatasetArgs, requireUniqueBallDatasetClipIds, resolveBallDatasetCaptureMetadata, resolveSafeBallDatasetOutput } from "../scripts/export-ball-dataset.ts";
import type { BallIdentityEvaluationLabel } from "../lib/motion/evaluateBall.ts";
import type { ValidationClip } from "../lib/motion/validation.ts";

const clip: ValidationClip = {
  id: "ball-01-000", sourceId: "ball-01", segmentId: "000", cohort: "controlled", split: "calibration",
  video: "local/ball.mp4", observations: "observations/ball.json", expected: [],
};

test("exports visible and absent labels while excluding occlusions", () => {
  const labels: BallIdentityEvaluationLabel[] = [
    { timeMs: 100, visibility: "visible", box: { x: 0.2, y: 0.3, width: 0.1, height: 0.2 } },
    { timeMs: 200, visibility: "absent" },
    { timeMs: 300, visibility: "occluded" },
  ];
  const samples = createBallDatasetSamples(clip, labels);
  assert.deepEqual(samples.map(({ timeMs, visibility }) => ({ timeMs, visibility })), [
    { timeMs: 100, visibility: "visible" }, { timeMs: 200, visibility: "absent" },
  ]);
  assert.equal(yoloBallLabel(labels[0]), "0 0.25000000 0.40000000 0.10000000 0.20000000\n");
  assert.equal(yoloBallLabel(labels[1]), "");
  assert.equal(yoloBallLabel(labels[2]), null);
  assert.ok(samples.every((sample) => sample.trainingEligible));
});

test("keeps tiny partial positives auditable but outside the training directories", () => {
  const [sample] = createBallDatasetSamples(clip, [
    { timeMs: 400, visibility: "visible", box: { x: 0.4, y: 0.4, width: 0.007, height: 0.05 } },
  ]);
  assert.equal(sample.trainingEligible, false);
  assert.match(sample.difficultyReason ?? "", /below 0.015/);
  assert.equal(sample.image, "excluded/images/ball-01-000-000400.jpg");
  assert.equal(sample.label, "excluded/labels/ball-01-000-000400.txt");
});

test("refuses holdout leakage and unsafe sample names", () => {
  assert.throws(() => requireCalibrationDatasetSplit("holdout"), /calibration labels only/);
  assert.throws(() => createBallDatasetSamples({ ...clip, split: "holdout" }, []), /calibration labels only/);
  assert.throws(() => createBallDatasetSamples({ ...clip, id: "../escape" }, []), /Unsafe clip ID/);
});

test("parses calibration-only command arguments and confines output locally", () => {
  assert.deepEqual(parseBallDatasetArgs(["--manifest", "validation/custom.json"]), {
    manifest: "validation/custom.json", additionalManifests: [], split: "calibration", output: "validation/local/ball-dataset/calibration-representative-v1",
  });
  assert.deepEqual(parseBallDatasetArgs(["--additional-manifests", "first.json, second.json"] ).additionalManifests, ["first.json", "second.json"]);
  assert.throws(() => parseBallDatasetArgs(["--split", "holdout"]), /calibration labels only/);
  assert.throws(() => resolveSafeBallDatasetOutput("validation/local"), /child of validation\/local/);
  assert.throws(() => resolveSafeBallDatasetOutput("outside"), /child of validation\/local/);
  assert.equal(resolveSafeBallDatasetOutput("validation/local/ball-dataset/test"), resolve("validation/local/ball-dataset/test"));
});

test("blocks detector collection readiness when negatives and capture diversity are missing", () => {
  const samples = createBallDatasetSamples(clip, [
    { timeMs: 100, visibility: "visible", box: { x: 0.2, y: 0.3, width: 0.1, height: 0.1 } },
  ]);
  const readiness = assessBallDetectorCollectionReadiness([clip], samples);
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.counts.absent, 0);
  assert.equal(readiness.counts.clipsMissingCaptureMetadata, 1);
  assert.ok(readiness.reasons.some((reason) => reason.includes("absent-ball")));
  assert.ok(readiness.reasons.some((reason) => reason.includes("orange, black")));
});

test("reports ready only with source-separated positive, negative, and capture coverage", () => {
  const clips: ValidationClip[] = [
    { ...clip, capture: { ballAppearance: "orange", playerId: "player-a", lighting: "daylight", hardNegative: true } },
    { ...clip, id: "ball-02-000", sourceId: "ball-02", capture: { ballAppearance: "black", playerId: "player-b", lighting: "indoor", hardNegative: false } },
  ];
  const labels: BallIdentityEvaluationLabel[] = [
    ...Array.from({ length: 40 }, (_, index) => ({ timeMs: index * 100, visibility: "visible" as const,
      box: { x: 0.2, y: 0.3, width: 0.1, height: 0.1 } })),
    ...Array.from({ length: 20 }, (_, index) => ({ timeMs: 5000 + index * 100, visibility: "absent" as const })),
  ];
  const samples = clips.flatMap((item, index) => createBallDatasetSamples(item, labels.filter((_, labelIndex) => labelIndex % 2 === index)));
  const readiness = assessBallDetectorCollectionReadiness(clips, samples);
  assert.equal(readiness.status, "ready");
  assert.deepEqual(readiness.reasons, []);
  assert.equal(readiness.counts.sources, 2);
  assert.equal(readiness.counts.absent, 20);
  assert.equal(readiness.counts.absentSources, 2);
});

test("does not count adjacent negatives or declarations without absent labels as diverse hard negatives", () => {
  const clips: ValidationClip[] = [
    { ...clip, capture: { ballAppearance: "orange", playerId: "player-a", lighting: "daylight", hardNegative: true } },
    { ...clip, id: "ball-02-000", sourceId: "ball-02", capture: { ballAppearance: "black", playerId: "player-b", lighting: "indoor", hardNegative: true } },
  ];
  const negatives = Array.from({ length: 20 }, (_, index): BallIdentityEvaluationLabel => ({ timeMs: index * 100, visibility: "absent" }));
  const readiness = assessBallDetectorCollectionReadiness(clips, createBallDatasetSamples(clips[0], negatives));
  assert.equal(readiness.counts.absent, 20);
  assert.equal(readiness.counts.absentSources, 1);
  assert.equal(readiness.counts.hardNegativeClips, 1);
  assert.ok(readiness.reasons.some((reason) => reason.includes("independently recorded sources")));
});

test("accepts matching sidecar provenance and rejects manifest disagreement", () => {
  const manifestCapture = { ballAppearance: "black", playerId: "player-b", lighting: "indoor", hardNegative: true };
  assert.deepEqual(resolveBallDatasetCaptureMetadata(manifestCapture, { ...manifestCapture }), manifestCapture);
  assert.throws(() => resolveBallDatasetCaptureMetadata(manifestCapture, { ...manifestCapture, ballAppearance: "orange" }), /disagrees/);
});

test("rejects duplicate clip IDs across combined calibration manifests", () => {
  assert.doesNotThrow(() => requireUniqueBallDatasetClipIds([{ id: "clip-a" }, { id: "clip-b" }]));
  assert.throws(() => requireUniqueBallDatasetClipIds([{ id: "clip-a" }, { id: "clip-a" }]), /Duplicate calibration clip ID/);
});
