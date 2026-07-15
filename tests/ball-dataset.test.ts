import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createBallDatasetSamples, requireCalibrationDatasetSplit, yoloBallLabel } from "../lib/motion/ballDataset.ts";
import { parseBallDatasetArgs, resolveSafeBallDatasetOutput } from "../scripts/export-ball-dataset.ts";
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
    manifest: "validation/custom.json", split: "calibration", output: "validation/local/ball-dataset/calibration-representative-v1",
  });
  assert.throws(() => parseBallDatasetArgs(["--split", "holdout"]), /calibration labels only/);
  assert.throws(() => resolveSafeBallDatasetOutput("validation/local"), /child of validation\/local/);
  assert.throws(() => resolveSafeBallDatasetOutput("outside"), /child of validation\/local/);
  assert.equal(resolveSafeBallDatasetOutput("validation/local/ball-dataset/test"), resolve("validation/local/ball-dataset/test"));
});
