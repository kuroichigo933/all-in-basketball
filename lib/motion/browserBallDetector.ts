import type { Point } from "./types.ts";

export const GENERIC_BALL_MODEL = {
  id: "mediapipe-efficientdet-sports-ball",
  assetPath: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
  labels: ["sports ball"],
  custom: false,
} as const;

export type BallModelConfig = { id: string; assetPath: string; labels: string[]; custom: boolean };
export type ModelBallCandidate = { point: Point; confidence: number; detectorId: string };

type DetectorInput = HTMLVideoElement | HTMLCanvasElement;
type DetectionBackend = {
  detectForVideo(input: DetectorInput, timestamp: number): {
    detections: Array<{
      boundingBox?: { originX: number; originY: number; width: number; height: number };
      categories: Array<{ categoryName?: string; score?: number }>;
    }>;
  };
  close(): void;
};

export interface BrowserBallDetector {
  readonly id: string;
  detectForVideo(input: DetectorInput, timestamp: number): ModelBallCandidate[];
  warm(input: HTMLCanvasElement, timestamp: number): void;
  close(): void;
}

export function resolvePreferredBallModel(assetPath?: string, labels?: string): BallModelConfig {
  const path = assetPath?.trim();
  if (!path) return { ...GENERIC_BALL_MODEL, labels: [...GENERIC_BALL_MODEL.labels] };
  const parsedLabels = (labels ?? "basketball").split(",").map((label) => label.trim()).filter(Boolean);
  return { id: "custom-basketball", assetPath: path, labels: parsedLabels.length ? parsedLabels : ["basketball"], custom: true };
}

export class MediaPipeBallDetector implements BrowserBallDetector {
  readonly id: string;
  private readonly labels: Set<string>;
  private readonly backend: DetectionBackend;

  constructor(backend: DetectionBackend, config: BallModelConfig) {
    this.backend = backend; this.id = config.id; this.labels = new Set(config.labels.map((label) => label.toLowerCase()));
  }

  detectForVideo(input: DetectorInput, timestamp: number): ModelBallCandidate[] {
    const width = "videoWidth" in input && input.videoWidth ? input.videoWidth : input.width;
    const height = "videoHeight" in input && input.videoHeight ? input.videoHeight : input.height;
    if (!width || !height) return [];
    return this.backend.detectForVideo(input, timestamp).detections.flatMap((detection) => {
      const category = detection.categories[0]; const box = detection.boundingBox;
      if (!box || !category?.categoryName || !this.labels.has(category.categoryName.toLowerCase())) return [];
      return [{ point: { x: (box.originX + box.width / 2) / width, y: (box.originY + box.height / 2) / height },
        confidence: category.score ?? 0, detectorId: this.id }];
    }).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  warm(input: HTMLCanvasElement, timestamp: number) { this.backend.detectForVideo(input, timestamp); }
  close() { this.backend.close(); }
}
