import test from "node:test";
import assert from "node:assert/strict";
import { applyMoveLabelReviews, validateMoveLabelReviewSidecar } from "../lib/motion/moveLabelReview.ts";
import { parseApplyReviewedLabelArgs } from "../scripts/apply-reviewed-move-labels.ts";

const clip = (id: string, split: "calibration" | "holdout" = "calibration") => ({ id, sourceId: "source", segmentId: id,
  cohort: "controlled", split, observations: `${id}.json`, expected: [{ move: "crossover", startMs: 100, endMs: 500 }] });
const sidecar = (clipId = "a") => ({ schemaVersion: 1, clipId, protocol: "manual-independent-event-v1", reviewFps: 30,
  durationMs: 2_000, labels: [{ move: "crossover", startMs: 200, endMs: 700 }] });

test("applies reviewed calibration labels with provenance without mutating the source", () => {
  const source = { schemaVersion: 2, clips: [clip("a"), clip("b")] };
  const revised = applyMoveLabelReviews(source, [sidecar()]);
  assert.deepEqual(revised.clips[0].expected, [{ move: "crossover", startMs: 200, endMs: 700 }]);
  assert.equal(revised.clips[0].labelReview?.reviewedLabelCount, 1);
  assert.equal(revised.clips[1].labelReview, undefined);
  assert.deepEqual(source.clips[0].expected, [{ move: "crossover", startMs: 100, endMs: 500 }]);
});

test("rejects incomplete provenance, wrong clips, duplicate reviews, and holdout replacement", () => {
  assert.throws(() => validateMoveLabelReviewSidecar({ ...sidecar(), durationMs: undefined }), /video duration/);
  assert.throws(() => applyMoveLabelReviews({ schemaVersion: 2, clips: [clip("a")] }, [sidecar("missing")]), /no clip/);
  assert.throws(() => applyMoveLabelReviews({ schemaVersion: 2, clips: [clip("a")] }, [sidecar(), sidecar()]), /Duplicate/);
  assert.throws(() => applyMoveLabelReviews({ schemaVersion: 2, clips: [clip("a", "holdout")] }, [sidecar()]), /calibration/);
});

test("confines reviewed output locally and prevents source overwrite", () => {
  const parsed = parseApplyReviewedLabelArgs(["--manifest", "validation/local/manifests/source.json", "--labels", "a.json,b.json",
    "--output", "validation/local/manifests/reviewed.json"]);
  assert.equal(parsed.labels.length, 2);
  assert.throws(() => parseApplyReviewedLabelArgs(["--manifest", "source.json", "--labels", "a.json", "--output", "validation/reviewed.json"]), /validation\/local/);
  assert.throws(() => parseApplyReviewedLabelArgs(["--manifest", "source.json", "--labels", "a.json", "--output", "source.json"]), /validation\/local|overwrite/);
});
