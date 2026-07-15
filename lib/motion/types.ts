export type Point = { x: number; y: number; z?: number; visibility?: number };

export type BallCandidateObservation = {
  point: Point;
  confidence: number;
  source: "detected" | "color" | "motion";
  detectorId?: string;
  apparentSize?: number;
};

export type MotionObservation = {
  timeMs: number;
  poseConfidence: number;
  /** Whether this frame supplied enough player evidence to accept new ball measurements. */
  playerDetected?: boolean;
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
  /** Square root of accepted candidate area divided by frame area, for identity diagnostics. */
  ballMeasurementSize?: number;
  /** All pose-adjusted candidates before temporal association, retained for validation replay. */
  ballCandidates?: BallCandidateObservation[];
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
