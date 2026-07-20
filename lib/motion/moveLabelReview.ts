import type { ExpectedMove } from "./evaluate.ts";
import { validateMoveLabels } from "./moveLabelImport.ts";
import { validateManifest, type ValidationManifest } from "./validation.ts";

export type MoveLabelReviewSidecar = {
  schemaVersion: 1;
  clipId: string;
  protocol: "manual-independent-event-v1";
  reviewFps: number;
  durationMs: number;
  labels: ExpectedMove[];
};

export function validateMoveLabelReviewSidecar(value: unknown): MoveLabelReviewSidecar {
  if (!value || typeof value !== "object") throw new Error("Move-label review sidecar must be an object.");
  const sidecar = value as Partial<MoveLabelReviewSidecar>;
  if (sidecar.schemaVersion !== 1 || typeof sidecar.clipId !== "string" || !sidecar.clipId.trim() ||
    sidecar.protocol !== "manual-independent-event-v1" || !Number.isFinite(sidecar.reviewFps) || sidecar.reviewFps! <= 0 || sidecar.reviewFps! > 240 ||
    !Number.isFinite(sidecar.durationMs) || sidecar.durationMs! <= 0) {
    throw new Error("Move-label review sidecar requires clip ID, manual protocol, review FPS, and video duration.");
  }
  return {
    schemaVersion: 1,
    clipId: sidecar.clipId.trim(),
    protocol: "manual-independent-event-v1",
    reviewFps: sidecar.reviewFps!,
    durationMs: Math.round(sidecar.durationMs!),
    labels: validateMoveLabels(sidecar.labels, sidecar.durationMs!),
  };
}

export function applyMoveLabelReviews(manifestValue: unknown, sidecarValues: unknown[]): ValidationManifest {
  const manifest = validateManifest(manifestValue);
  if (!sidecarValues.length) throw new Error("At least one reviewed move-label sidecar is required.");
  const sidecars = sidecarValues.map(validateMoveLabelReviewSidecar);
  const seen = new Set<string>();
  for (const sidecar of sidecars) {
    if (seen.has(sidecar.clipId)) throw new Error(`Duplicate reviewed sidecar for ${sidecar.clipId}.`);
    seen.add(sidecar.clipId);
  }
  const byClip = new Map(sidecars.map((sidecar) => [sidecar.clipId, sidecar]));
  for (const sidecar of sidecars) {
    const clip = manifest.clips.find((candidate) => candidate.id === sidecar.clipId);
    if (!clip) throw new Error(`Manifest has no clip named ${sidecar.clipId}.`);
    if (clip.split !== "calibration") throw new Error(`Reviewed labels may only replace calibration labels: ${sidecar.clipId}.`);
  }
  const revised = {
    ...manifest,
    clips: manifest.clips.map((clip) => {
      const sidecar = byClip.get(clip.id);
      if (!sidecar) return { ...clip, expected: clip.expected.map((label) => ({ ...label })) };
      return { ...clip, expected: sidecar.labels, labelReview: {
        protocol: sidecar.protocol, reviewFps: sidecar.reviewFps, durationMs: sidecar.durationMs,
        reviewedLabelCount: sidecar.labels.length,
      } };
    }),
  };
  return validateManifest(revised);
}
