import type { Point } from "./types.ts";

export type NormalizedBounds = { left: number; top: number; right: number; bottom: number };
export type ColorBallCandidate = { center: Point; confidence: number; pixels: number; apparentSize: number; appearanceConfidence: number };

export function detectOrangeBallPixelCandidates(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: NormalizedBounds = { left: 0, top: 0, right: 1, bottom: 1 },
  previous: Point | null = null,
  maximumCandidates = 4,
): ColorBallCandidate[] {
  const mask = new Uint8Array(width * height); const visited = new Uint8Array(width * height);
  const left = Math.max(0, Math.floor(bounds.left * width)); const right = Math.min(width - 1, Math.ceil(bounds.right * width));
  const top = Math.max(0, Math.floor(bounds.top * height)); const bottom = Math.min(height - 1, Math.ceil(bounds.bottom * height));
  for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
    const offset = (y * width + x) * 4; const r = rgba[offset]; const g = rgba[offset + 1]; const b = rgba[offset + 2];
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    if (r > 55 && r > g * 1.28 && g > b * 1.02 && max - min > 28) mask[y * width + x] = 1;
  }
  const candidates: Array<{ candidate: ColorBallCandidate; score: number }> = [];
  const queueX = new Int32Array(width * height); const queueY = new Int32Array(width * height);
  for (let sy = top; sy <= bottom; sy += 1) for (let sx = left; sx <= right; sx += 1) {
    const start = sy * width + sx; if (!mask[start] || visited[start]) continue;
    let head = 0; let tail = 1; queueX[0] = sx; queueY[0] = sy; visited[start] = 1;
    let pixels = 0; let sumX = 0; let sumY = 0; let minX = sx; let maxX = sx; let minY = sy; let maxY = sy;
    while (head < tail) {
      const x = queueX[head]; const y = queueY[head]; head += 1; pixels += 1; sumX += x; sumY += y;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      // Basketball seams and motion blur can split one orange ball into thin,
      // disconnected islands. Join orange pixels across a one-pixel gap while
      // retaining the component's original pixels for fill/size scoring.
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
        if (!dx && !dy || Math.abs(dx) + Math.abs(dy) > 2) continue;
        const nx = x + dx; const ny = y + dy;
        if (nx < left || nx > right || ny < top || ny > bottom) continue; const index = ny * width + nx;
        if (mask[index] && !visited[index]) { visited[index] = 1; queueX[tail] = nx; queueY[tail] = ny; tail += 1; }
      }
    }
    if (pixels < 6 || pixels > 900) continue;
    const boxWidth = maxX - minX + 1; const boxHeight = maxY - minY + 1; const aspect = Math.min(boxWidth, boxHeight) / Math.max(boxWidth, boxHeight);
    const fill = pixels / (boxWidth * boxHeight); if (aspect < 0.45 || fill < 0.28) continue;
    const center = { x: sumX / pixels / width, y: sumY / pixels / height };
    const continuity = previous ? Math.max(0, 1 - Math.hypot(center.x - previous.x, center.y - previous.y) * 3) : 0.5;
    const apparentSize = Math.sqrt(pixels / (width * height));
    const sizeScore = Math.min(1, pixels / 45); const score = aspect * 0.3 + fill * 0.25 + continuity * 0.3 + sizeScore * 0.15;
    const appearanceConfidence = aspect * 0.5 + fill * 0.3 + sizeScore * 0.2;
    candidates.push({ candidate: { center, confidence: Math.min(0.72, Math.max(0.12, score * 0.72)), pixels,
      apparentSize, appearanceConfidence }, score });
  }
  return candidates.sort((a, b) => b.score - a.score || b.candidate.pixels - a.candidate.pixels)
    .slice(0, Math.max(0, maximumCandidates)).map(({ candidate }) => candidate);
}

export function detectOrangeBallPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: NormalizedBounds = { left: 0, top: 0, right: 1, bottom: 1 },
  previous: Point | null = null,
): ColorBallCandidate | null {
  return detectOrangeBallPixelCandidates(rgba, width, height, bounds, previous, 1)[0] ?? null;
}

export function detectMovingBallPixelCandidates(
  rgba: Uint8ClampedArray,
  previousRgba: Uint8ClampedArray | null,
  width: number,
  height: number,
  bounds: NormalizedBounds = { left: 0, top: 0, right: 1, bottom: 1 },
  previous: Point | null = null,
  maximumCandidates = 5,
  olderRgba: Uint8ClampedArray | null = null,
): ColorBallCandidate[] {
  if (!previousRgba || previousRgba.length !== rgba.length) return [];
  const mask = new Uint8Array(width * height); const visited = new Uint8Array(width * height);
  const left = Math.max(0, Math.floor(bounds.left * width)); const right = Math.min(width - 1, Math.ceil(bounds.right * width));
  const top = Math.max(0, Math.floor(bounds.top * height)); const bottom = Math.min(height - 1, Math.ceil(bounds.bottom * height));
  for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
    const offset = (y * width + x) * 4; const r = rgba[offset]; const g = rgba[offset + 1]; const b = rgba[offset + 2];
    const difference = (Math.abs(r - previousRgba[offset]) + Math.abs(g - previousRgba[offset + 1]) + Math.abs(b - previousRgba[offset + 2])) / 3;
    const olderDifference = olderRgba && olderRgba.length === rgba.length
      ? (Math.abs(r - olderRgba[offset]) + Math.abs(g - olderRgba[offset + 1]) + Math.abs(b - olderRgba[offset + 2])) / 3
      : difference;
    if (difference > 22 && olderDifference > 18) mask[y * width + x] = 1;
  }
  const candidates: Array<{ candidate: ColorBallCandidate; score: number }> = [];
  const queueX = new Int32Array(width * height); const queueY = new Int32Array(width * height);
  for (let sy = top; sy <= bottom; sy += 1) for (let sx = left; sx <= right; sx += 1) {
    const start = sy * width + sx; if (!mask[start] || visited[start]) continue;
    let head = 0; let tail = 1; queueX[0] = sx; queueY[0] = sy; visited[start] = 1;
    let pixels = 0; let sumX = 0; let sumY = 0; let sumLuminance = 0; let minX = sx; let maxX = sx; let minY = sy; let maxY = sy;
    while (head < tail) {
      const x = queueX[head]; const y = queueY[head]; head += 1; pixels += 1; sumX += x; sumY += y;
      const colorOffset = (y * width + x) * 4; sumLuminance += rgba[colorOffset] * 0.299 + rgba[colorOffset + 1] * 0.587 + rgba[colorOffset + 2] * 0.114;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < left || nx > right || ny < top || ny > bottom) continue; const index = ny * width + nx;
        if (mask[index] && !visited[index]) { visited[index] = 1; queueX[tail] = nx; queueY[tail] = ny; tail += 1; }
      }
    }
    if (pixels < 5 || pixels > 750) continue;
    const boxWidth = maxX - minX + 1; const boxHeight = maxY - minY + 1; const aspect = Math.min(boxWidth, boxHeight) / Math.max(boxWidth, boxHeight);
    const fill = pixels / (boxWidth * boxHeight); if (aspect < 0.42 || fill < 0.22) continue;
    const center = { x: sumX / pixels / width, y: sumY / pixels / height };
    let borderLuminance = 0; let borderPixels = 0;
    for (let y = Math.max(top, minY - 2); y <= Math.min(bottom, maxY + 2); y += 1) for (let x = Math.max(left, minX - 2); x <= Math.min(right, maxX + 2); x += 1) {
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) continue; const offset = (y * width + x) * 4;
      borderLuminance += rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114; borderPixels += 1;
    }
    const contrast = borderPixels ? Math.min(1, Math.abs(sumLuminance / pixels - borderLuminance / borderPixels) / 80) : 0;
    const continuity = previous ? Math.max(0, 1 - Math.hypot(center.x - previous.x, center.y - previous.y) * 3.5) : 0.35;
    const apparentSize = Math.sqrt(pixels / (width * height));
    const sizeScore = Math.exp(-0.5 * (Math.log(pixels / 70) / 1.1) ** 2);
    const score = aspect * 0.2 + fill * 0.12 + continuity * 0.2 + sizeScore * 0.24 + contrast * 0.24;
    const appearanceConfidence = aspect * 0.35 + fill * 0.15 + sizeScore * 0.25 + contrast * 0.25;
    candidates.push({ candidate: { center, confidence: Math.min(0.68, Math.max(0.1, score * 0.7)), pixels,
      apparentSize, appearanceConfidence }, score });
  }
  return candidates.sort((a, b) => b.score - a.score || b.candidate.pixels - a.candidate.pixels)
    .slice(0, Math.max(0, maximumCandidates)).map(({ candidate }) => candidate);
}

export function detectMovingBallPixels(
  rgba: Uint8ClampedArray,
  previousRgba: Uint8ClampedArray | null,
  width: number,
  height: number,
  bounds: NormalizedBounds = { left: 0, top: 0, right: 1, bottom: 1 },
  previous: Point | null = null,
): ColorBallCandidate | null {
  return detectMovingBallPixelCandidates(rgba, previousRgba, width, height, bounds, previous, 1)[0] ?? null;
}
