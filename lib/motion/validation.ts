import type { ExpectedMove, EvaluationMetrics } from "./evaluate.ts";
import type { AnalysisSummary, MoveName, MotionObservation } from "./types.ts";
import type { SamplingDiagnostics } from "./sampling.ts";
import type { BallIdentityEvaluationLabel } from "./evaluateBall.ts";

export const ALL_MOVE_NAMES: MoveName[] = ["crossover", "between-the-legs", "behind-the-back", "hesitation", "in-and-out"];
export const CONTROLLED_MOVE_NAMES: MoveName[] = ["behind-the-back", "between-the-legs"];
export const LIVE_MOVE_NAMES: MoveName[] = ["crossover", "between-the-legs", "behind-the-back"];
export type ValidationSplit = "calibration" | "holdout";
export type BallCaptureMetadata = {
  ballAppearance: string;
  playerId: string;
  lighting: string;
  hardNegative: boolean;
};
export type ValidationClip = {
  id: string; sourceId: string; segmentId: string; cohort: string; split: ValidationSplit;
  capture?: BallCaptureMetadata;
  labelReview?: { protocol: "manual-independent-event-v1"; reviewFps: number; durationMs: number; reviewedLabelCount: number };
  video?: string; observations: string; expected: ExpectedMove[];
};
export type ValidationManifest = { schemaVersion: 2; toleranceMs?: number; clips: ValidationClip[] };
export type AnalysisExport = {
  schemaVersion: 2; clip?: Omit<ValidationClip, "observations" | "expected">;
  sampleIntervalMs: number; observations: MotionObservation[]; labels: ExpectedMove[];
  ballLabels?: BallIdentityEvaluationLabel[]; result: AnalysisSummary | null; sampling?: SamplingDiagnostics;
};
export type GateResult = { status: "pass" | "fail" | "blocked"; reason: string };
export type ValidationReport = {
  split: ValidationSplit; clips: number; processed: number; failures: string[];
  total: EvaluationMetrics; controlledTotal: EvaluationMetrics; liveThreeTotal: EvaluationMetrics;
  byClass: Partial<Record<MoveName, EvaluationMetrics>>;
  coverage: { pose: number; detectedBall: number; trackedBall: number };
  gates: { controlledTwoClass: GateResult; liveThreeMove: GateResult; fiveClassRelease: GateResult };
};

export function validateBallCaptureMetadata(value: unknown): BallCaptureMetadata {
  if (!value || typeof value !== "object") throw new Error("Ball capture metadata must be an object.");
  const capture = value as Partial<BallCaptureMetadata>;
  if (
    typeof capture.ballAppearance !== "string" || !capture.ballAppearance.trim() ||
    typeof capture.playerId !== "string" || !capture.playerId.trim() ||
    typeof capture.lighting !== "string" || !capture.lighting.trim() ||
    typeof capture.hardNegative !== "boolean"
  ) throw new Error("Invalid ball capture metadata.");
  return {
    ballAppearance: capture.ballAppearance.trim(),
    playerId: capture.playerId.trim(),
    lighting: capture.lighting.trim(),
    hardNegative: capture.hardNegative,
  };
}

export function validateManifest(value: unknown): ValidationManifest {
  if (!value || typeof value !== "object") throw new Error("Manifest must be an object.");
  const manifest = value as Partial<ValidationManifest>;
  if (manifest.schemaVersion !== 2 || !Array.isArray(manifest.clips) || !manifest.clips.length) throw new Error("Manifest schemaVersion 2 requires at least one clip.");
  if (manifest.toleranceMs !== undefined && (!Number.isFinite(manifest.toleranceMs) || manifest.toleranceMs < 0)) {
    throw new Error("Manifest toleranceMs must be a finite non-negative number.");
  }
  const clipIds = new Set<string>();
  const sourceSegments = new Set<string>();
  for (const clip of manifest.clips) {
    if (!clip.id || !clip.sourceId || !clip.segmentId || !clip.cohort || !["calibration", "holdout"].includes(clip.split) || !clip.observations || !Array.isArray(clip.expected)) {
      throw new Error(`Invalid validation clip: ${clip.id ?? "unknown"}`);
    }
    if (clipIds.has(clip.id)) throw new Error(`Duplicate validation clip ID: ${clip.id}`);
    clipIds.add(clip.id);
    const sourceSegment = `${clip.sourceId}\u0000${clip.segmentId}`;
    if (sourceSegments.has(sourceSegment)) throw new Error(`Duplicate validation source/segment: ${clip.sourceId}/${clip.segmentId}`);
    sourceSegments.add(sourceSegment);
    let previousEndMs = -1;
    for (let index = 0; index < clip.expected.length; index += 1) {
      const label = clip.expected[index];
      if (!label || !ALL_MOVE_NAMES.includes(label.move) || !Number.isFinite(label.startMs) || !Number.isFinite(label.endMs) || label.startMs < 0 || label.endMs <= label.startMs) {
        throw new Error(`Invalid expected move ${index + 1} in validation clip: ${clip.id}`);
      }
      if (label.startMs < previousEndMs) throw new Error(`Overlapping or unsorted expected moves in validation clip: ${clip.id}`);
      previousEndMs = label.endMs;
    }
    if (clip.capture) {
      try { clip.capture = validateBallCaptureMetadata(clip.capture); }
      catch { throw new Error(`Invalid capture metadata for validation clip: ${clip.id}`); }
    }
    if (clip.labelReview && (clip.labelReview.protocol !== "manual-independent-event-v1" ||
      !Number.isFinite(clip.labelReview.reviewFps) || clip.labelReview.reviewFps <= 0 || clip.labelReview.reviewFps > 240 ||
      !Number.isFinite(clip.labelReview.durationMs) || clip.labelReview.durationMs <= 0 ||
      !Number.isInteger(clip.labelReview.reviewedLabelCount) || clip.labelReview.reviewedLabelCount !== clip.expected.length)) {
      throw new Error(`Invalid label-review provenance for validation clip: ${clip.id}`);
    }
  }
  return manifest as ValidationManifest;
}

export function validateAnalysisExport(value: unknown, expectedClipId?: string): AnalysisExport {
  if (!value || typeof value !== "object") throw new Error("Analysis export must be an object.");
  const analysis = value as Partial<AnalysisExport>;
  if (analysis.schemaVersion !== 2 || !Number.isFinite(analysis.sampleIntervalMs) || analysis.sampleIntervalMs! <= 0 ||
    !Array.isArray(analysis.observations) || !Array.isArray(analysis.labels)) {
    throw new Error("Analysis export schemaVersion 2 requires a positive sample interval, observations, and labels.");
  }
  if (expectedClipId && analysis.clip?.id && analysis.clip.id !== expectedClipId) {
    throw new Error(`Analysis export belongs to ${analysis.clip.id}, not ${expectedClipId}.`);
  }
  let previousTimeMs = -1;
  for (let index = 0; index < analysis.observations.length; index += 1) {
    const observation = analysis.observations[index];
    if (!observation || !Number.isFinite(observation.timeMs) || observation.timeMs < 0 || observation.timeMs <= previousTimeMs ||
      !Number.isFinite(observation.poseConfidence) || observation.poseConfidence < 0 || observation.poseConfidence > 1 ||
      !Number.isFinite(observation.ballConfidence) || observation.ballConfidence < 0 || observation.ballConfidence > 1) {
      throw new Error(`Invalid or out-of-order observation ${index + 1} in analysis export.`);
    }
    if (observation.ball && (!Number.isFinite(observation.ball.x) || !Number.isFinite(observation.ball.y) ||
      observation.ball.x < 0 || observation.ball.x > 1 || observation.ball.y < 0 || observation.ball.y > 1)) {
      throw new Error(`Invalid normalized ball position in observation ${index + 1}.`);
    }
    previousTimeMs = observation.timeMs;
  }
  return analysis as AnalysisExport;
}

export function selectSplit(manifest: ValidationManifest, split: ValidationSplit) {
  return manifest.clips.filter((clip) => clip.split === split);
}

export function parseMoveSelection(value: string, fallback: MoveName[] = CONTROLLED_MOVE_NAMES) {
  if (!value.trim()) return [...fallback];
  const moves = Array.from(new Set(value.split(",").map((move) => move.trim()).filter(Boolean))) as MoveName[];
  if (!moves.length || moves.some((move) => !ALL_MOVE_NAMES.includes(move))) throw new Error(`Invalid move selection: ${value}`);
  return moves;
}

export function evaluateGates(labels: ExpectedMove[], controlledMetrics: EvaluationMetrics, liveMetrics: EvaluationMetrics = controlledMetrics, releaseMetrics: EvaluationMetrics = liveMetrics) {
  const represented = new Set(labels.map((label) => label.move));
  const controlled = CONTROLLED_MOVE_NAMES.every((move) => represented.has(move));
  const liveThree = LIVE_MOVE_NAMES.every((move) => represented.has(move));
  const allFive = ALL_MOVE_NAMES.every((move) => represented.has(move));
  return {
    controlledTwoClass: controlled ? { status: controlledMetrics.meets95Percent ? "pass" : "fail", reason: "Evaluation set contains both controlled classes; gate uses only controlled-class predictions." } as GateResult : { status: "blocked", reason: "Evaluation set must contain behind-the-back and between-the-legs labels." } as GateResult,
    liveThreeMove: liveThree ? { status: liveMetrics.meets95Percent ? "pass" : "fail", reason: "Evaluation set contains crossover, between-the-legs, and behind-the-back; gate uses those three classes." } as GateResult : { status: "blocked", reason: "Evaluation set must contain crossover, between-the-legs, and behind-the-back labels." } as GateResult,
    fiveClassRelease: allFive ? { status: releaseMetrics.meets95Percent ? "pass" : "fail", reason: "Evaluation set contains all five move classes." } as GateResult : { status: "blocked", reason: "Independent labeled evaluation data do not cover all five move classes." } as GateResult,
  };
}
