import type { Point } from "./types.ts";

export type NormalizedCrop = { x: number; y: number; width: number; height: number };

const visible = (point: Point | undefined): point is Point => Boolean(point && (point.visibility ?? 1) >= 0.35);
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

/**
 * Selects a square, player-centred crop in source-pixel space. Object models
 * normally resize a 16:9 camera frame to a square tensor; cropping first keeps
 * a small basketball substantially larger while retaining the full player and
 * the bottom of the bounce.
 */
export function selectPoseBallCrop(points: Point[], sourceWidth: number, sourceHeight: number): NormalizedCrop | null {
  if (sourceWidth <= 0 || sourceHeight <= 0) return null;
  const body = points.filter(visible);
  if (body.length < 6) return null;

  const xs = body.map((point) => point.x * sourceWidth);
  const ys = body.map((point) => point.y * sourceHeight);
  const minimumX = Math.min(...xs); const maximumX = Math.max(...xs);
  const minimumY = Math.min(...ys); const maximumY = Math.max(...ys);
  const bodyWidth = Math.max(sourceWidth * 0.06, maximumX - minimumX);
  const bodyHeight = Math.max(sourceHeight * 0.25, maximumY - minimumY);

  const left = minimumX - Math.max(sourceWidth * 0.03, bodyWidth * 0.8);
  const right = maximumX + Math.max(sourceWidth * 0.03, bodyWidth * 0.8);
  const top = minimumY - bodyHeight * 0.1;
  const bottom = maximumY + bodyHeight * 0.2;
  const side = Math.min(Math.max(right - left, bottom - top), sourceWidth, sourceHeight);
  if (side <= 0) return null;

  const centerX = (left + right) / 2;
  // Bias downward so a low bounce remains in-frame when the square is clamped.
  const centerY = (top + bottom) / 2 + bodyHeight * 0.04;
  const x = clamp(centerX - side / 2, 0, sourceWidth - side);
  const y = clamp(centerY - side / 2, 0, sourceHeight - side);
  return { x: x / sourceWidth, y: y / sourceHeight, width: side / sourceWidth, height: side / sourceHeight };
}

export function mapPointFromCrop(point: Point, crop: NormalizedCrop): Point {
  return { ...point, x: crop.x + point.x * crop.width, y: crop.y + point.y * crop.height };
}
