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

export type BallDetectorCollectionReadiness = {
  status: "ready" | "blocked";
  counts: {
    sources: number;
    eligibleVisible: number;
    absent: number;
    absentSources: number;
    ballAppearances: number;
    players: number;
    lightingConditions: number;
    hardNegativeClips: number;
    clipsMissingCaptureMetadata: number;
  };
  requirements: {
    minimumSources: number;
    minimumEligibleVisible: number;
    minimumAbsent: number;
    minimumAbsentSources: number;
    requiredBallAppearances: string[];
    minimumPlayers: number;
    minimumLightingConditions: number;
    minimumHardNegativeClips: number;
  };
  reasons: string[];
};

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const MINIMUM_TRAINING_BOX_DIMENSION = 0.015;
export const DEFAULT_BALL_COLLECTION_REQUIREMENTS = {
  minimumSources: 2,
  minimumEligibleVisible: 40,
  minimumAbsent: 20,
  minimumAbsentSources: 2,
  requiredBallAppearances: ["orange", "black"],
  minimumPlayers: 2,
  minimumLightingConditions: 2,
  minimumHardNegativeClips: 1,
} as const;

export function assessBallDetectorCollectionReadiness(
  clips: ValidationClip[],
  samples: BallDetectorDatasetSample[],
): BallDetectorCollectionReadiness {
  const requirements = {
    ...DEFAULT_BALL_COLLECTION_REQUIREMENTS,
    requiredBallAppearances: [...DEFAULT_BALL_COLLECTION_REQUIREMENTS.requiredBallAppearances],
  };
  const metadata = clips.flatMap((clip) => clip.capture ? [{ clipId: clip.id, capture: clip.capture }] : []);
  const sources = new Set(clips.map((clip) => clip.sourceId));
  const eligibleVisible = samples.filter((sample) => sample.trainingEligible && sample.visibility === "visible").length;
  const absent = samples.filter((sample) => sample.trainingEligible && sample.visibility === "absent").length;
  const absentSamples = samples.filter((sample) => sample.trainingEligible && sample.visibility === "absent");
  const absentSources = new Set(absentSamples.map((sample) => sample.sourceId));
  const absentClipIds = new Set(absentSamples.map((sample) => sample.clipId));
  const appearances = new Set(metadata.map(({ capture }) => capture.ballAppearance.trim().toLowerCase()));
  const players = new Set(metadata.map(({ capture }) => capture.playerId.trim().toLowerCase()));
  const lighting = new Set(metadata.map(({ capture }) => capture.lighting.trim().toLowerCase()));
  const hardNegativeClips = metadata.filter(({ clipId, capture }) => capture.hardNegative && absentClipIds.has(clipId)).length;
  const clipsMissingCaptureMetadata = clips.length - metadata.length;
  const reasons: string[] = [];
  if (sources.size < requirements.minimumSources) reasons.push(`Need at least ${requirements.minimumSources} independently recorded sources; found ${sources.size}.`);
  if (eligibleVisible < requirements.minimumEligibleVisible) reasons.push(`Need at least ${requirements.minimumEligibleVisible} eligible visible-ball frames; found ${eligibleVisible}.`);
  if (absent < requirements.minimumAbsent) reasons.push(`Need at least ${requirements.minimumAbsent} predeclared absent-ball frames; found ${absent}.`);
  if (absentSources.size < requirements.minimumAbsentSources) reasons.push(`Need absent-ball frames from at least ${requirements.minimumAbsentSources} independently recorded sources; found ${absentSources.size}.`);
  const missingAppearances = requirements.requiredBallAppearances.filter((appearance) => !appearances.has(appearance));
  if (missingAppearances.length) reasons.push(`Missing required ball appearance metadata/coverage: ${missingAppearances.join(", ")}.`);
  if (players.size < requirements.minimumPlayers) reasons.push(`Need at least ${requirements.minimumPlayers} distinct pseudonymous players; found ${players.size}.`);
  if (lighting.size < requirements.minimumLightingConditions) reasons.push(`Need at least ${requirements.minimumLightingConditions} lighting conditions; found ${lighting.size}.`);
  if (hardNegativeClips < requirements.minimumHardNegativeClips) reasons.push(`Need at least ${requirements.minimumHardNegativeClips} clip explicitly declared as hard-negative footage; found ${hardNegativeClips}.`);
  if (clipsMissingCaptureMetadata) reasons.push(`${clipsMissingCaptureMetadata} clip(s) are missing capture metadata.`);
  return {
    status: reasons.length ? "blocked" : "ready",
    counts: { sources: sources.size, eligibleVisible, absent, absentSources: absentSources.size, ballAppearances: appearances.size, players: players.size,
      lightingConditions: lighting.size, hardNegativeClips, clipsMissingCaptureMetadata },
    requirements,
    reasons,
  };
}

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
