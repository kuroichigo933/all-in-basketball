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
  for (const clip of manifest.clips) {
    if (!clip.id || !clip.sourceId || !clip.segmentId || !clip.cohort || !["calibration", "holdout"].includes(clip.split) || !clip.observations || !Array.isArray(clip.expected)) {
      throw new Error(`Invalid validation clip: ${clip.id ?? "unknown"}`);
    }
    if (clip.capture) {
      try { clip.capture = validateBallCaptureMetadata(clip.capture); }
      catch { throw new Error(`Invalid capture metadata for validation clip: ${clip.id}`); }
    }
  }
  return manifest as ValidationManifest;
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
