import test from "node:test";
import assert from "node:assert/strict";
import { parseMoveLabelImport, parseMoveLabelImportDocument, validateMoveLabels } from "../lib/motion/moveLabelImport.ts";

test("imports five-class move CSV within the loaded duration", () => {
  const labels = parseMoveLabelImport("start,end,move\n00:00.0,00:00.5,hesitation\n00:00.5,00:01.0,in and out", "moves.csv", "clip", 1_000);
  assert.deepEqual(labels.map((label) => label.move), ["hesitation", "in-and-out"]);
});

test("selects the matching clip from a validation manifest", () => {
  const manifest = JSON.stringify({ schemaVersion: 2, clips: [
    { id: "other", expected: [] },
    { id: "clip-001", expected: [{ move: "crossover", startMs: 100, endMs: 600 }] },
  ] });
  assert.deepEqual(parseMoveLabelImport(manifest, "manifest.json", "clip-001", 1_000), [
    { move: "crossover", startMs: 100, endMs: 600 },
  ]);
  assert.throws(() => parseMoveLabelImport(manifest, "manifest.json", "missing", 1_000), /no clip named missing/);
});

test("accepts analysis and sidecar JSON but rejects wrong clips and invalid intervals", () => {
  const labels = [{ move: "behind-the-back", startMs: 0, endMs: 500 }];
  assert.deepEqual(parseMoveLabelImport(JSON.stringify({ schemaVersion: 2, labels }), "analysis.json", "clip", 1_000), labels);
  assert.throws(() => parseMoveLabelImport(JSON.stringify({ schemaVersion: 1, clipId: "other", labels }), "labels.json", "clip", 1_000), /belong to other/);
  assert.throws(() => validateMoveLabels([...labels, { move: "crossover", startMs: 400, endMs: 800 }], 1_000), /overlap/);
  assert.throws(() => validateMoveLabels([{ move: "crossover", startMs: 900, endMs: 1_100 }], 1_000), /after the loaded video/);
});

test("round-trips a valid manual review frame rate", () => {
  const imported = parseMoveLabelImportDocument(JSON.stringify({ clipId: "clip-a", reviewFps: 30, durationMs: 1_000, labels: [
    { move: "crossover", startMs: 100, endMs: 500 },
  ] }), "clip-a.move-labels.json", "clip-a", 1_000);
  assert.equal(imported.reviewFps, 30);
  assert.equal(imported.labels.length, 1);
  assert.throws(() => parseMoveLabelImportDocument(JSON.stringify({ reviewFps: 0, labels: [] }), "labels.json", "", 1_000), /reviewFps/);
  assert.throws(() => parseMoveLabelImportDocument(JSON.stringify({ reviewFps: 30, durationMs: 2_000, labels: [] }), "labels.json", "", 1_000), /duration/);
});
