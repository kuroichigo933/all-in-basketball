import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { isSafeRepoRelativePath, parseBallModelArtifact, type BallModelArtifact } from "../lib/motion/ballModelArtifact.ts";
import { parseVerifyBallModelArtifactArgs, readInstalledMediaPipeVersion, verifyBallModelArtifact, type BallModelArtifactFileAccess } from "../scripts/verify-ball-model-artifact.ts";

const modelBytes = Buffer.from([32, 0, 0, 0, 84, 70, 76, 51, 1, 2, 3, 4]);
const modelHash = createHash("sha256").update(modelBytes).digest("hex");
const repoRoot = resolve("ball-model-artifact-test-root");

function artifact(): BallModelArtifact {
  return {
    schemaVersion: 1,
    id: "front-camera-basketball-v1",
    status: "candidate",
    model: { format: "tflite", path: "models/ball-v1/model.tflite", sha256: modelHash, bytes: modelBytes.byteLength, labels: ["basketball"] },
    runtime: { package: "@mediapipe/tasks-vision", version: "0.10.35" },
    evidence: { licensePath: "models/ball-v1/LICENSE.md", modelCardPath: "models/ball-v1/MODEL_CARD.md" },
  };
}

function fakeFiles(extra: Record<string, Uint8Array> = {}): BallModelArtifactFileAccess {
  const entries = new Map<string, Uint8Array>(Object.entries({
    "models/ball-v1/model.tflite": modelBytes,
    "models/ball-v1/LICENSE.md": Buffer.from("test license"),
    "models/ball-v1/MODEL_CARD.md": Buffer.from("test card"),
    ...extra,
  }).map(([path, bytes]) => [resolve(repoRoot, path), bytes]));
  return {
    isFile: (path) => entries.has(path),
    readFile(path) { const value = entries.get(path); if (!value) throw new Error(`Missing fake file: ${path}`); return value; },
    realpath: (path) => path,
  };
}

test("parses a versioned candidate artifact without touching the filesystem", () => {
  assert.deepEqual(parseBallModelArtifact(artifact()), artifact());
  assert.equal(isSafeRepoRelativePath("models/ball-v1/model.tflite"), true);
  for (const path of ["../model.tflite", "/model.tflite", "C:/model.tflite", "models\\model.tflite", "models//model.tflite"]) {
    assert.equal(isSafeRepoRelativePath(path), false, path);
  }
});

test("rejects unversioned IDs, ranges, unsafe paths, and invalid integrity metadata", () => {
  assert.throws(() => parseBallModelArtifact({ ...artifact(), id: "basketball" }), /versioned/);
  assert.throws(() => parseBallModelArtifact({ ...artifact(), runtime: { package: "@mediapipe/tasks-vision", version: "^0.10.35" } }), /exact semantic version/);
  assert.throws(() => parseBallModelArtifact({ ...artifact(), model: { ...artifact().model, path: "../model.tflite" } }), /safe repo-relative/);
  assert.throws(() => parseBallModelArtifact({ ...artifact(), model: { ...artifact().model, sha256: "ABC" } }), /sha256/);
  assert.throws(() => parseBallModelArtifact({ ...artifact(), model: { ...artifact().model, bytes: 0 } }), /positive safe integer/);
});

test("requires evaluation and browser-smoke evidence for validated status", () => {
  assert.throws(() => parseBallModelArtifact({ ...artifact(), status: "validated" }), /evaluationReportPath and browserSmokeReportPath/);
  const validated = { ...artifact(), status: "validated", evidence: { ...artifact().evidence,
    evaluationReportPath: "models/ball-v1/evaluation.json", browserSmokeReportPath: "models/ball-v1/browser-smoke.json" } };
  assert.equal(parseBallModelArtifact(validated).status, "validated");
});

test("verifies exact bytes, SHA-256, TFL3 identifier, evidence files, and runtime", () => {
  const result = verifyBallModelArtifact(artifact(), { repoRoot, installedMediaPipeVersion: "0.10.35", files: fakeFiles() });
  assert.equal(result.artifact.id, artifact().id); assert.equal(result.evidencePaths.length, 2);
  assert.throws(() => verifyBallModelArtifact({ ...artifact(), model: { ...artifact().model, bytes: modelBytes.byteLength + 1 } },
    { repoRoot, installedMediaPipeVersion: "0.10.35", files: fakeFiles() }), /byte count mismatch/);
  assert.throws(() => verifyBallModelArtifact({ ...artifact(), model: { ...artifact().model, sha256: "0".repeat(64) } },
    { repoRoot, installedMediaPipeVersion: "0.10.35", files: fakeFiles() }), /SHA-256 mismatch/);
  const notTflite = Buffer.from(modelBytes); notTflite[4] = 0;
  const invalidContainer = { ...artifact(), model: { ...artifact().model, sha256: createHash("sha256").update(notTflite).digest("hex") } };
  assert.throws(() => verifyBallModelArtifact(invalidContainer, { repoRoot, installedMediaPipeVersion: "0.10.35",
    files: fakeFiles({ "models/ball-v1/model.tflite": notTflite }) }), /TFL3/);
  assert.throws(() => verifyBallModelArtifact(artifact(), { repoRoot, installedMediaPipeVersion: "0.10.34", files: fakeFiles() }), /0.10.34 is installed/);
});

test("requires license and evidence files to exist inside the repository", () => {
  const missingLicense = fakeFiles(); missingLicense.isFile = (path) => !path.endsWith("LICENSE.md") && fakeFiles().isFile(path);
  assert.throws(() => verifyBallModelArtifact(artifact(), { repoRoot, installedMediaPipeVersion: "0.10.35", files: missingLicense }), /LICENSE.md/);
  const validated = { ...artifact(), status: "validated", evidence: { ...artifact().evidence,
    evaluationReportPath: "models/ball-v1/evaluation.json", browserSmokeReportPath: "models/ball-v1/browser-smoke.json" } };
  assert.throws(() => verifyBallModelArtifact(validated, { repoRoot, installedMediaPipeVersion: "0.10.35", files: fakeFiles() }), /evaluation.json/);
  const escaping = fakeFiles(); escaping.realpath = (path) => path.endsWith("MODEL_CARD.md") ? resolve(repoRoot, "../outside/MODEL_CARD.md") : path;
  assert.throws(() => verifyBallModelArtifact(artifact(), { repoRoot, installedMediaPipeVersion: "0.10.35", files: escaping }), /escapes through a symlink/);
});

test("reads the installed MediaPipe version and accepts only a safe manifest argument", () => {
  const packagePath = "node_modules/@mediapipe/tasks-vision/package.json";
  const files = fakeFiles({ [packagePath]: Buffer.from('{"version":"0.10.35"}') });
  assert.equal(readInstalledMediaPipeVersion(repoRoot, files), "0.10.35");
  assert.deepEqual(parseVerifyBallModelArtifactArgs(["--manifest", "models/ball-v1/artifact.json"]), { manifest: "models/ball-v1/artifact.json" });
  assert.throws(() => parseVerifyBallModelArtifactArgs(["--manifest", "../artifact.json"]), /Usage/);
});
