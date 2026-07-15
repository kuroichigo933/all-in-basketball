import type { BallIdentityEvaluationLabel } from "./evaluateBall.ts";
import type { ValidationClip } from "./validation.ts";

export type BallDetectorDatasetSample = {
  clipId: string;
  sourceId: string;
  cohort: string;
  split: "calibration";
  timeMs: number;
  visibility: "visible" | "absent";
  trainingEligible: boolean;
  difficultyReason?: string;
  image: string;
  label: string;
  box?: { x: number; y: number; width: number; height: number };
};

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const MINIMUM_TRAINING_BOX_DIMENSION = 0.015;

export function requireCalibrationDatasetSplit(split: string): asserts split is "calibration" {
  if (split !== "calibration") throw new Error("Ball detector datasets may be exported from calibration labels only.");
}

export function yoloBallLabel(label: BallIdentityEvaluationLabel): string | null {
  if (label.visibility === "occluded") return null;
  if (label.visibility === "absent") return "";
  const centerX = label.box.x + label.box.width / 2;
  const centerY = label.box.y + label.box.height / 2;
  return `0 ${centerX.toFixed(8)} ${centerY.toFixed(8)} ${label.box.width.toFixed(8)} ${label.box.height.toFixed(8)}\n`;
}

export function createBallDatasetSamples(
  clip: ValidationClip,
  labels: BallIdentityEvaluationLabel[],
): BallDetectorDatasetSample[] {
  requireCalibrationDatasetSplit(clip.split);
  if (!SAFE_ID.test(clip.id)) throw new Error(`Unsafe clip ID for detector dataset: ${clip.id}`);
  return labels.flatMap((label) => {
    if (label.visibility === "occluded") return [];
    if (!Number.isSafeInteger(label.timeMs)) throw new Error(`Ball dataset timestamps must be integer milliseconds: ${label.timeMs}`);
    const stem = `${clip.id}-${String(label.timeMs).padStart(6, "0")}`;
    const difficult = label.visibility === "visible" && Math.min(label.box.width, label.box.height) < MINIMUM_TRAINING_BOX_DIMENSION;
    const prefix = difficult ? "excluded/" : "";
    return [{
      clipId: clip.id,
      sourceId: clip.sourceId,
      cohort: clip.cohort,
      split: "calibration" as const,
      timeMs: label.timeMs,
      visibility: label.visibility,
      trainingEligible: !difficult,
      ...(difficult ? { difficultyReason: `Minimum normalized box dimension is below ${MINIMUM_TRAINING_BOX_DIMENSION}.` } : {}),
      image: `${prefix}images/${stem}.jpg`,
      label: `${prefix}labels/${stem}.txt`,
      ...(label.visibility === "visible" ? { box: label.box } : {}),
    }];
  });
}
