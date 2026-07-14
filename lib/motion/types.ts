export type Point = { x: number; y: number; z?: number; visibility?: number };

export type MotionObservation = {
  timeMs: number;
  poseConfidence: number;
  ballConfidence: number;
  leftWrist: Point;
  rightWrist: Point;
  leftShoulder?: Point;
  rightShoulder?: Point;
  leftHip: Point;
  rightHip: Point;
  leftKnee: Point;
  rightKnee: Point;
  ball: Point | null;
  ballSource?: "detected" | "color" | "motion" | "interpolated" | "missing";
  /** True for a measurement accepted on this frame, false for tracker prediction or absence. */
  ballMeasured?: boolean;
  /** Accepted detector candidate before temporal smoothing; absent on predicted frames. */
  ballMeasurement?: Point;
  /** Model identifier when the accepted measurement came from a learned detector. */
  ballDetectorId?: string;
};

export type MoveName = "crossover" | "between-the-legs" | "behind-the-back" | "hesitation" | "in-and-out";

export type MoveDetection = {
  move: MoveName;
  startMs: number;
  endMs: number;
  confidence: number;
  evidence: string[];
};

export type AnalysisSummary = {
  observations: number;
  poseCoverage: number;
  ballCoverage: number;
  detectedBallCoverage: number;
  interpolatedBallFrames: number;
  moves: MoveDetection[];
};
