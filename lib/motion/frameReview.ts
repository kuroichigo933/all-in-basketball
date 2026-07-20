export const DEFAULT_REVIEW_FPS = 30;

export function frameDurationMs(framesPerSecond = DEFAULT_REVIEW_FPS) {
  if (!Number.isFinite(framesPerSecond) || framesPerSecond <= 0 || framesPerSecond > 240) {
    throw new Error("Review frame rate must be greater than zero and no more than 240 FPS.");
  }
  return 1_000 / framesPerSecond;
}

export function snapReviewTimeMs(timeMs: number, framesPerSecond = DEFAULT_REVIEW_FPS, durationMs = Number.POSITIVE_INFINITY) {
  if (!Number.isFinite(timeMs)) throw new Error("Review timestamp must be finite.");
  if (!(durationMs > 0)) throw new Error("Review duration must be positive.");
  const frameMs = frameDurationMs(framesPerSecond);
  return Math.min(durationMs, Math.max(0, Math.round(timeMs / frameMs) * frameMs));
}

export function stepReviewTimeMs(
  timeMs: number,
  frameDelta: number,
  durationMs: number,
  framesPerSecond = DEFAULT_REVIEW_FPS,
) {
  if (!Number.isInteger(frameDelta) || frameDelta === 0) throw new Error("Frame step must be a non-zero integer.");
  const frameMs = frameDurationMs(framesPerSecond);
  const currentFrame = Math.round(Math.max(0, timeMs) / frameMs);
  return Math.min(durationMs, Math.max(0, (currentFrame + frameDelta) * frameMs));
}
