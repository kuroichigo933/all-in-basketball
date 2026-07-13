import type { ExpectedMove, EvaluationMetrics } from "./evaluate.ts";
import type { AnalysisSummary, MoveName, MotionObservation } from "./types.ts";
import type { SamplingDiagnostics } from "./sampling.ts";
import type { BallIdentityLabel } from "./evaluateBall.ts";

export const ALL_MOVE_NAMES: MoveName[] = ["crossover", "between-the-legs", "behind-the-back", "hesitation", "in-and-out"];
export const CONTROLLED_MOVE_NAMES: MoveName[] = ["behind-the-back", "between-the-legs"];
export type ValidationSplit = "calibration" | "holdout";
export type ValidationClip = {
  id: string; sourceId: string; segmentId: string; cohort: string; split: ValidationSplit;
  video?: string; observations: string; expected: ExpectedMove[];
};
export type ValidationManifest = { schemaVersion: 2; toleranceMs?: number; clips: ValidationClip[] };
export type AnalysisExport = {
  schemaVersion: 2; clip?: Omit<ValidationClip, "observations" | "expected">;
  sampleIntervalMs: number; observations: MotionObservation[]; labels: ExpectedMove[];
  ballLabels?: BallIdentityLabel[]; result: AnalysisSummary | null; sampling?: SamplingDiagnostics;
};
export type GateResult = { status: "pass" | "fail" | "blocked"; reason: string };
export type ValidationReport = {
  split: ValidationSplit; clips: number; processed: number; failures: string[];
  total: EvaluationMetrics; controlledTotal: EvaluationMetrics; byClass: Partial<Record<MoveName, EvaluationMetrics>>;
  coverage: { pose: number; detectedBall: number; trackedBall: number };
  gates: { controlledTwoClass: GateResult; fiveClassRelease: GateResult };
};

export function validateManifest(value: unknown): ValidationManifest {
  if (!value || typeof value !== "object") throw new Error("Manifest must be an object.");
  const manifest = value as Partial<ValidationManifest>;
  if (manifest.schemaVersion !== 2 || !Array.isArray(manifest.clips) || !manifest.clips.length) throw new Error("Manifest schemaVersion 2 requires at least one clip.");
  for (const clip of manifest.clips) {
    if (!clip.id || !clip.sourceId || !clip.segmentId || !clip.cohort || !["calibration", "holdout"].includes(clip.split) || !clip.observations || !Array.isArray(clip.expected)) {
      throw new Error(`Invalid validation clip: ${clip.id ?? "unknown"}`);
    }
  }
  return manifest as ValidationManifest;
}

export function selectSplit(manifest: ValidationManifest, split: ValidationSplit) {
  return manifest.clips.filter((clip) => clip.split === split);
}

export function evaluateGates(labels: ExpectedMove[], controlledMetrics: EvaluationMetrics, releaseMetrics: EvaluationMetrics = controlledMetrics) {
  const represented = new Set(labels.map((label) => label.move));
  const controlled = CONTROLLED_MOVE_NAMES.every((move) => represented.has(move));
  const allFive = ALL_MOVE_NAMES.every((move) => represented.has(move));
  return {
    controlledTwoClass: controlled ? { status: controlledMetrics.meets95Percent ? "pass" : "fail", reason: "Evaluation set contains both controlled classes; gate uses only controlled-class predictions." } as GateResult : { status: "blocked", reason: "Evaluation set must contain behind-the-back and between-the-legs labels." } as GateResult,
    fiveClassRelease: allFive ? { status: releaseMetrics.meets95Percent ? "pass" : "fail", reason: "Evaluation set contains all five move classes." } as GateResult : { status: "blocked", reason: "Independent labeled evaluation data do not cover all five move classes." } as GateResult,
  };
}
