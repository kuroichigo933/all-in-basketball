import { OnlineBallTracker, type OnlineBallTrackerConfig } from "./onlineBallTracker.ts";
import { poseContextFromObservation, rankBallCandidates } from "./calibratedBallCandidateRanker.ts";
import type { MotionObservation } from "./types.ts";

/** Replays saved pre-association candidates without rerunning browser vision models. */
export function replayBallTracking(
  observations: MotionObservation[],
  config: Partial<OnlineBallTrackerConfig> = {},
): MotionObservation[] {
  const tracker = new OnlineBallTracker(500, 3.5, config);
  return observations.map((observation) => {
    if (!Array.isArray(observation.ballCandidates)) throw new Error(`Observation at ${observation.timeMs} ms has no candidate snapshot.`);
    const playerDetected = observation.playerDetected ?? observation.poseConfidence >= 0.35;
    const candidates = rankBallCandidates(observation.ballCandidates, poseContextFromObservation(observation));
    const track = tracker.update(observation.timeMs, candidates, playerDetected);
    return {
      ...observation,
      ball: track?.point ?? null,
      ballConfidence: track?.confidence ?? 0,
      ballSource: track?.source ?? "missing",
      ballMeasured: Boolean(track && !track.predicted),
      ballMeasurement: track?.measurementPoint,
      ballDetectorId: track?.detectorId,
      ballMeasurementSize: track?.apparentSize,
      ballCandidates: candidates,
    };
  });
}
