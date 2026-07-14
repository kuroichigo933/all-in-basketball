export const BALL_MODEL_ARTIFACT_SCHEMA_VERSION = 1 as const;
export const MEDIAPIPE_TASKS_VISION_PACKAGE = "@mediapipe/tasks-vision" as const;

export type BallModelArtifactStatus = "candidate" | "validated";

export type BallModelArtifact = {
  schemaVersion: typeof BALL_MODEL_ARTIFACT_SCHEMA_VERSION;
  /** Immutable, versioned identifier in the form <slug>-v<positive integer>. */
  id: string;
  status: BallModelArtifactStatus;
  model: {
    format: "tflite";
    path: string;
    sha256: string;
    bytes: number;
    labels: string[];
  };
  runtime: {
    package: typeof MEDIAPIPE_TASKS_VISION_PACKAGE;
    /** Exact installed version; ranges such as ^0.10.35 are not accepted. */
    version: string;
  };
  evidence: {
    licensePath: string;
    modelCardPath: string;
    evaluationReportPath?: string;
    browserSmokeReportPath?: string;
  };
};

const VERSIONED_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*-v[1-9]\d*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SAFE_PATH = /^[A-Za-z0-9@][A-Za-z0-9@._-]*(?:\/[A-Za-z0-9@][A-Za-z0-9@._-]*)*$/;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

export function isSafeRepoRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || !SAFE_PATH.test(value) || value.includes("\\")) return false;
  return value.split("/").every((segment) => segment !== "." && segment !== "..");
}

function requireSafePath(value: unknown, field: string): string {
  if (!isSafeRepoRelativePath(value)) throw new Error(`${field} must be a canonical, safe repo-relative path.`);
  return value;
}

/** Pure structural parser. Filesystem, hash, and installed-runtime checks belong to the verifier. */
export function parseBallModelArtifact(value: unknown): BallModelArtifact {
  if (!isRecord(value)) throw new Error("Ball-model artifact must be an object.");
  if (value.schemaVersion !== BALL_MODEL_ARTIFACT_SCHEMA_VERSION) throw new Error(`Ball-model artifact schemaVersion must be ${BALL_MODEL_ARTIFACT_SCHEMA_VERSION}.`);
  if (typeof value.id !== "string" || !VERSIONED_ID.test(value.id)) throw new Error("Ball-model artifact id must be versioned as <slug>-v<positive integer>.");
  if (value.status !== "candidate" && value.status !== "validated") throw new Error("Ball-model artifact status must be candidate or validated.");

  if (!isRecord(value.model)) throw new Error("Ball-model artifact model must be an object.");
  if (value.model.format !== "tflite") throw new Error("Ball-model artifact model.format must be tflite.");
  const modelPath = requireSafePath(value.model.path, "model.path");
  if (!modelPath.toLowerCase().endsWith(".tflite")) throw new Error("model.path must end in .tflite.");
  if (typeof value.model.sha256 !== "string" || !SHA256.test(value.model.sha256)) throw new Error("model.sha256 must be 64 lowercase hexadecimal characters.");
  if (!Number.isSafeInteger(value.model.bytes) || (value.model.bytes as number) <= 0) throw new Error("model.bytes must be a positive safe integer.");
  if (!Array.isArray(value.model.labels) || !value.model.labels.length ||
    value.model.labels.some((label) => typeof label !== "string" || !label.length || label.trim() !== label)) {
    throw new Error("model.labels must contain one or more non-empty, trimmed strings.");
  }
  const labels = value.model.labels as string[];
  if (new Set(labels.map((label) => label.toLowerCase())).size !== labels.length) throw new Error("model.labels must be unique ignoring case.");

  if (!isRecord(value.runtime) || value.runtime.package !== MEDIAPIPE_TASKS_VISION_PACKAGE) {
    throw new Error(`runtime.package must be ${MEDIAPIPE_TASKS_VISION_PACKAGE}.`);
  }
  if (typeof value.runtime.version !== "string" || !EXACT_VERSION.test(value.runtime.version)) {
    throw new Error("runtime.version must be an exact semantic version, not a range.");
  }

  if (!isRecord(value.evidence)) throw new Error("Ball-model artifact evidence must be an object.");
  const evidence = {
    licensePath: requireSafePath(value.evidence.licensePath, "evidence.licensePath"),
    modelCardPath: requireSafePath(value.evidence.modelCardPath, "evidence.modelCardPath"),
    ...(value.evidence.evaluationReportPath === undefined ? {} :
      { evaluationReportPath: requireSafePath(value.evidence.evaluationReportPath, "evidence.evaluationReportPath") }),
    ...(value.evidence.browserSmokeReportPath === undefined ? {} :
      { browserSmokeReportPath: requireSafePath(value.evidence.browserSmokeReportPath, "evidence.browserSmokeReportPath") }),
  };
  if (value.status === "validated" && (!evidence.evaluationReportPath || !evidence.browserSmokeReportPath)) {
    throw new Error("A validated artifact requires evaluationReportPath and browserSmokeReportPath evidence.");
  }
  const referencedPaths = [modelPath, ...Object.values(evidence)];
  if (new Set(referencedPaths).size !== referencedPaths.length) throw new Error("Model and evidence paths must be distinct.");

  return {
    schemaVersion: BALL_MODEL_ARTIFACT_SCHEMA_VERSION,
    id: value.id,
    status: value.status,
    model: { format: "tflite", path: modelPath, sha256: value.model.sha256, bytes: value.model.bytes as number, labels: [...labels] },
    runtime: { package: MEDIAPIPE_TASKS_VISION_PACKAGE, version: value.runtime.version },
    evidence,
  };
}
