"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { FilesetResolver, ObjectDetector, PoseLandmarker } from "@mediapipe/tasks-vision";
import { createUniformBallLabelSchedule } from "../../../lib/motion/ballLabelSchedule";
import { detectMoves, summarizeAnalysis } from "@/lib/motion/detectMoves";
import { trackBallContinuity } from "@/lib/motion/trackBall";
import type { AnalysisSummary, MotionObservation, Point } from "@/lib/motion/types";
import type { MoveName } from "@/lib/motion/types";
import type { ExpectedMove } from "@/lib/motion/evaluate";
import { ALL_MOVE_NAMES, validateBallCaptureMetadata, type BallCaptureMetadata } from "@/lib/motion/validation";
import { detectMovingBallPixelCandidates, detectOrangeBallPixelCandidates } from "@/lib/motion/colorBall";
import { OnlineBallTracker, type BallMeasurement } from "@/lib/motion/onlineBallTracker";
import { selectCompletedLiveMove, type LiveMoveCursor } from "@/lib/motion/liveMoveEvents";
import { summarizeSampling, type SamplingDiagnostics } from "@/lib/motion/sampling";
import { applyPoseBallPrior } from "@/lib/motion/ballCandidate";
import { mapPointFromCrop, selectPoseBallCrop, selectPoseBallFocusCrop, type NormalizedCrop } from "@/lib/motion/poseCrop";
import { evaluateBallIdentity, validateBallIdentityEvaluationLabels, type BallIdentityEvaluationLabel } from "@/lib/motion/evaluateBall";
import { GENERIC_BALL_MODEL, MediaPipeBallDetector, resolvePreferredBallModel, type BallModelConfig, type BrowserBallDetector } from "@/lib/motion/browserBallDetector";
import { rankBallCandidates } from "@/lib/motion/calibratedBallCandidateRanker";
import { auditMoveLabelCoverage, auditRapidMoveLabels } from "@/lib/motion/auditMoveLabels";
import { parseMoveLabelImportDocument, validateMoveLabels } from "@/lib/motion/moveLabelImport";
import { DEFAULT_REVIEW_FPS, snapReviewTimeMs, stepReviewTimeMs } from "@/lib/motion/frameReview";
import { BallModelPassScheduler } from "@/lib/motion/ballModelPassScheduler";
import { summarizeLiveRuntimeDiagnostics, type LiveRuntimeMetrics } from "@/lib/motion/liveRuntimeDiagnostics";

const SAMPLE_INTERVAL_MS = 100;
const UI_METRICS_INTERVAL_MS = 250;
const MAX_CLIP_SECONDS = 60;
const LIVE_WINDOW_MS = 4_000;
const landmark = (points: Point[], index: number): Point => points[index] ?? { x: 0, y: 0, visibility: 0 };
const EMPTY_TRACKING = { pose: 0, ball: 0, samples: 0, measuredBallCoverage: 0, trackedBallCoverage: 0, inferenceFps: 0, maximumGapMs: 0,
  averageInferenceMs: 0, maximumInferenceMs: 0, primaryPasses: 0, focusPasses: 0, skippedModelPasses: 0,
  runtimeGate: "insufficient-duration" as "insufficient-duration" | "pass" | "fail" };

export default function AITracker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileUrlRef = useRef<string | null>(null);
  const poseRef = useRef<PoseLandmarker | null>(null);
  const objectsRef = useRef<BrowserBallDetector | null>(null);
  const cancelledRef = useRef(false);
  const liveFrameRef = useRef<number | null>(null);
  const liveStartedRef = useRef(0);
  const lastInferenceRef = useRef(0);
  const lastMetricsRenderRef = useRef(0);
  const liveObservationsRef = useRef<MotionObservation[]>([]);
  const liveSessionObservationsRef = useRef<MotionObservation[]>([]);
  const lastEventRef = useRef<LiveMoveCursor | null>(null);
  const debugOverlayRef = useRef(true);
  const colorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const objectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousBallRef = useRef<Point | null>(null);
  const previousFramePixelsRef = useRef<Uint8ClampedArray | null>(null);
  const olderFramePixelsRef = useRef<Uint8ClampedArray | null>(null);
  const onlineBallTrackerRef = useRef(new OnlineBallTracker());
  const ballModelPassSchedulerRef = useRef(new BallModelPassScheduler());
  const liveMetricsRef = useRef<LiveRuntimeMetrics & { lastTimeMs: number }>({ samples: 0, measuredBallSamples: 0, trackedBallSamples: 0, lastTimeMs: 0, maximumGapMs: 0,
    totalInferenceMs: 0, maximumInferenceMs: 0, primaryPasses: 0, focusPasses: 0, skippedModelPasses: 0 });
  const [mode, setMode] = useState<"live" | "upload">("live");
  const [live, setLive] = useState(false);
  const [debugOverlay, setDebugOverlay] = useState(true);
  const [liveEvents, setLiveEvents] = useState<Array<{ move: MoveName; confidence: number; timeMs: number }>>([]);
  const [repetitions, setRepetitions] = useState<Partial<Record<MoveName, number>>>({});
  const [tracking, setTracking] = useState(EMPTY_TRACKING);
  const [cameraExpanded, setCameraExpanded] = useState(false);
  const [status, setStatus] = useState("Choose a short MP4, WebM, or MOV clip.");
  const [running, setRunning] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AnalysisSummary | null>(null);
  const [sampling, setSampling] = useState<SamplingDiagnostics | null>(null);
  const [exportData, setExportData] = useState<MotionObservation[]>([]);
  const [labels, setLabels] = useState<ExpectedMove[]>([]);
  const [labelMove, setLabelMove] = useState<MoveName>("behind-the-back");
  const [labelStartMs, setLabelStartMs] = useState<number | null>(null);
  const [reviewFps, setReviewFps] = useState(DEFAULT_REVIEW_FPS);
  const [reviewTimeMs, setReviewTimeMs] = useState(0);
  const [ballLabels, setBallLabels] = useState<BallIdentityEvaluationLabel[]>([]);
  const [ballScheduleMs, setBallScheduleMs] = useState<number[]>([]);
  const [ballAppearance, setBallAppearance] = useState("");
  const [capturePlayerId, setCapturePlayerId] = useState("");
  const [captureLighting, setCaptureLighting] = useState("");
  const [captureHardNegative, setCaptureHardNegative] = useState(false);
  const [drawingBallBox, setDrawingBallBox] = useState(false);
  const [ballDrag, setBallDrag] = useState<{ start: Point; current: Point } | null>(null);
  const [clipId, setClipId] = useState("");

  const ballIdentity = useMemo(() => ballLabels.length && exportData.length
    ? evaluateBallIdentity(ballLabels, exportData, { timestampToleranceMs: 60 })
    : null, [ballLabels, exportData]);
  const rapidLabelAudit = useMemo(() => labels.length && exportData.length
    ? auditRapidMoveLabels(labels, exportData)
    : [], [labels, exportData]);
  const labelCoverageAudit = useMemo(() => exportData.length
    ? auditMoveLabelCoverage(labels, exportData)
    : null, [labels, exportData]);
  const moveLabelValidationError = useMemo(() => {
    const durationMs = Math.round((videoRef.current?.duration ?? 0) * 1000);
    if (!videoReady || !labels.length || !Number.isFinite(durationMs) || durationMs <= 0) return null;
    try { validateMoveLabels(labels, durationMs); return null; }
    catch (error) { return error instanceof Error ? error.message : "Move labels are invalid."; }
  }, [labels, videoReady]);

  useEffect(() => () => {
    cancelledRef.current = true;
    if (liveFrameRef.current !== null) cancelAnimationFrame(liveFrameRef.current);
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    poseRef.current?.close();
    objectsRef.current?.close();
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
  }, []);

  async function initializeModels() {
    if (poseRef.current && objectsRef.current) return;
    setStatus("Loading pose and ball models...");
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm");
    const preferred = resolvePreferredBallModel(process.env.NEXT_PUBLIC_BASKETBALL_MODEL_URL, process.env.NEXT_PUBLIC_BASKETBALL_MODEL_LABELS);
    const create = async (delegate: "GPU" | "CPU") => {
      const pose = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", delegate },
        runningMode: "VIDEO", numPoses: 1,
      });
      const createDetector = async (config: BallModelConfig) => {
        const backend = await ObjectDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: config.assetPath, delegate },
          scoreThreshold: 0.1, categoryAllowlist: config.labels, maxResults: 3, runningMode: "VIDEO",
        });
        return new MediaPipeBallDetector(backend, config);
      };
      try {
        let objects: BrowserBallDetector;
        try { objects = await createDetector(preferred); }
        catch (customError) {
          if (!preferred.custom) throw customError;
          console.warn("[AI tracker] Custom basketball model failed; using generic sports-ball fallback", customError);
          objects = await createDetector({ ...GENERIC_BALL_MODEL, labels: [...GENERIC_BALL_MODEL.labels] });
        }
        return { pose, objects };
      } catch (error) { pose.close(); throw error; }
    };
    try {
      const models = await create("GPU"); poseRef.current = models.pose; objectsRef.current = models.objects;
    } catch (gpuError) {
      console.warn("[AI tracker] GPU initialization failed; using CPU", gpuError);
      setStatus("GPU unavailable; loading CPU models...");
      const models = await create("CPU"); poseRef.current = models.pose; objectsRef.current = models.objects;
    }
  }

  function warmModels() {
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180;
    const context = canvas.getContext("2d"); context?.fillRect(0, 0, canvas.width, canvas.height);
    const timestamp = performance.now();
    poseRef.current!.detectForVideo(canvas, timestamp);
    objectsRef.current!.warm(canvas, timestamp);
  }

  function seek(video: HTMLVideoElement, seconds: number) {
    return new Promise<void>((resolve, reject) => {
      if (Math.abs(video.currentTime - seconds) < 0.001 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        resolve(); return;
      }
      const done = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error("The browser could not decode this part of the clip.")); };
      const timedOut = () => { cleanup(); reject(new Error("Video seeking timed out. Try converting the clip to MP4/H.264.")); };
      const timeout = window.setTimeout(timedOut, 10_000);
      const cleanup = () => { window.clearTimeout(timeout); video.removeEventListener("seeked", done); video.removeEventListener("error", failed); };
      video.addEventListener("seeked", done, { once: true });
      video.addEventListener("error", failed, { once: true });
      video.currentTime = seconds;
    });
  }

  async function stepReviewFrame(frameDelta: number) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    video.pause();
    try {
      const targetMs = stepReviewTimeMs(video.currentTime * 1000, frameDelta, video.duration * 1000, reviewFps);
      await seek(video, targetMs / 1000);
      setReviewTimeMs(Math.round(targetMs));
    } catch (error) {
      setStatus(error instanceof Error ? `Frame step failed: ${error.message}` : "Frame step failed.");
    }
  }

  function currentReviewFrameMs() {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return 0;
    return Math.round(snapReviewTimeMs(video.currentTime * 1000, reviewFps, video.duration * 1000));
  }

  function draw(points: Point[], ball: Point | null, ballConfidence: number, trajectory: Point[] = []) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!debugOverlayRef.current) return;
    if (trajectory.length > 1) {
      context.strokeStyle = "#facc15"; context.lineWidth = 3; context.beginPath();
      trajectory.forEach((point, index) => index ? context.lineTo(point.x * canvas.width, point.y * canvas.height) : context.moveTo(point.x * canvas.width, point.y * canvas.height));
      context.stroke();
    }
    context.fillStyle = "#ff6b2c";
    points.forEach((point) => { context.beginPath(); context.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, Math.PI * 2); context.fill(); });
    if (ball) {
      context.strokeStyle = "#4ade80"; context.lineWidth = 4;
      context.beginPath(); context.arc(ball.x * canvas.width, ball.y * canvas.height, 14, 0, Math.PI * 2); context.stroke();
      context.fillStyle = "#4ade80"; context.font = "16px sans-serif";
      context.fillText(`Ball ${Math.round(ballConfidence * 100)}%`, ball.x * canvas.width + 18, ball.y * canvas.height);
    }
  }

  function detectVisualBalls(video: HTMLVideoElement, points: Point[]): BallMeasurement[] {
    const canvas = colorCanvasRef.current ?? document.createElement("canvas"); colorCanvasRef.current = canvas;
    const targetWidth = 320; const targetHeight = Math.max(1, Math.round(targetWidth * video.videoHeight / video.videoWidth));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) { canvas.width = targetWidth; canvas.height = targetHeight; }
    const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) return [];
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const visible = points.filter((point) => (point.visibility ?? 1) >= 0.35);
    const bounds = visible.length ? {
      left: Math.max(0, Math.min(...visible.map((point) => point.x)) - 0.22),
      right: Math.min(1, Math.max(...visible.map((point) => point.x)) + 0.22),
      top: Math.max(0, Math.min(...visible.map((point) => point.y)) + 0.1),
      bottom: Math.min(1, Math.max(...visible.map((point) => point.y)) + 0.12),
    } : undefined;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const orange = detectOrangeBallPixelCandidates(pixels, canvas.width, canvas.height, bounds, previousBallRef.current);
    const moving = detectMovingBallPixelCandidates(pixels, previousFramePixelsRef.current, canvas.width, canvas.height, bounds, previousBallRef.current, 8, olderFramePixelsRef.current);
    olderFramePixelsRef.current = previousFramePixelsRef.current;
    previousFramePixelsRef.current = pixels;
    return [
      ...orange.map((candidate) => ({ point: candidate.center, confidence: candidate.confidence, source: "color" as const,
        apparentSize: candidate.apparentSize, appearanceConfidence: candidate.appearanceConfidence })),
      ...moving.map((candidate) => ({ point: candidate.center, confidence: candidate.confidence, source: "motion" as const,
        apparentSize: candidate.apparentSize, appearanceConfidence: candidate.appearanceConfidence })),
    ].map((measurement) => applyPoseBallPrior(measurement, points));
  }

  function inferObservation(video: HTMLVideoElement, timeMs: number, inferenceTimestamp: number) {
    const poseResult = poseRef.current!.detectForVideo(video, inferenceTimestamp);
    const points = (poseResult.landmarks[0] ?? []) as Point[];
    const crop = selectPoseBallCrop(points, video.videoWidth, video.videoHeight);
    const detectInCrop = (selectedCrop: NormalizedCrop, timestamp: number): BallMeasurement[] => {
      const canvas = objectCanvasRef.current ?? document.createElement("canvas"); objectCanvasRef.current = canvas;
      if (canvas.width !== 320 || canvas.height !== 320) { canvas.width = 320; canvas.height = 320; }
      const context = canvas.getContext("2d");
      if (!context) return [];
      context.drawImage(video, selectedCrop.x * video.videoWidth, selectedCrop.y * video.videoHeight,
        selectedCrop.width * video.videoWidth, selectedCrop.height * video.videoHeight, 0, 0, canvas.width, canvas.height);
      return objectsRef.current!.detectForVideo(canvas, timestamp)
        .map((candidate) => ({ point: mapPointFromCrop(candidate.point, selectedCrop),
          confidence: candidate.confidence, source: "detected" as const, detectorId: candidate.detectorId,
          apparentSize: candidate.apparentSize * Math.sqrt(selectedCrop.width * selectedCrop.height),
          appearanceConfidence: candidate.appearanceConfidence }));
    };
    const candidateFocusCrop = crop ? selectPoseBallFocusCrop(points, video.videoWidth, video.videoHeight) : null;
    const focusCrop = candidateFocusCrop && crop && candidateFocusCrop.width < crop.width * 0.95 ? candidateFocusCrop : null;
    const modelPass = ballModelPassSchedulerRef.current.select(Boolean(crop), Boolean(focusCrop));
    const selectedCrop = modelPass === "focus" ? focusCrop : modelPass === "primary" ? crop : null;
    // A reliable player crop is required for acquisition, so a full-frame
    // object pass without one only consumes latency and cannot create a track.
    const modelMeasurements = selectedCrop ? detectInCrop(selectedCrop, inferenceTimestamp) : [];
    ballModelPassSchedulerRef.current.record(modelPass, modelMeasurements.length > 0);
    const poseConfidence = points.length ? points.reduce((sum, point) => sum + (point.visibility ?? 1), 0) / points.length : 0;
    const measurements = detectVisualBalls(video, points);
    measurements.push(...modelMeasurements);
    const rankedMeasurements = rankBallCandidates(measurements, {
      leftWrist: landmark(points, 15), rightWrist: landmark(points, 16), leftHip: landmark(points, 23),
      rightHip: landmark(points, 24), leftKnee: landmark(points, 25), rightKnee: landmark(points, 26),
    });
    // Do not acquire a ball from full-frame background motion when no player
    // pose is reliable. An existing track still receives an empty update and
    // may predict through the normal short loss window.
    const ballTrack = onlineBallTrackerRef.current.update(timeMs, rankedMeasurements, Boolean(crop)); const ball = ballTrack?.point ?? null;
    const ballConfidence = ballTrack?.confidence ?? 0; previousBallRef.current = ball;
    const observation: MotionObservation = { timeMs, poseConfidence, playerDetected: Boolean(crop), ballConfidence, ball, ballSource: ballTrack?.source ?? "missing", ballMeasured: Boolean(ballTrack && !ballTrack.predicted), ballMeasurement: ballTrack?.measurementPoint, ballDetectorId: ballTrack?.detectorId,
      ballMeasurementSize: ballTrack?.apparentSize,
      ballCandidates: rankedMeasurements.map((measurement) => ({ point: { ...measurement.point }, confidence: measurement.confidence,
        source: measurement.source as "detected" | "color" | "motion", detectorId: measurement.detectorId,
        apparentSize: measurement.apparentSize, appearanceConfidence: measurement.appearanceConfidence,
        identityConfidence: measurement.identityConfidence })),
      leftShoulder: landmark(points, 11), rightShoulder: landmark(points, 12), leftWrist: landmark(points, 15), rightWrist: landmark(points, 16),
      leftHip: landmark(points, 23), rightHip: landmark(points, 24), leftKnee: landmark(points, 25), rightKnee: landmark(points, 26) };
    return { observation, points, modelPass };
  }

  function stopLiveCamera(message = "Camera stopped.") {
    if (liveFrameRef.current !== null) cancelAnimationFrame(liveFrameRef.current);
    liveFrameRef.current = null;
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (video) video.srcObject = null;
    setLive(false); setCameraExpanded(false); setTracking(EMPTY_TRACKING); setStatus(message);
  }

  function pointFromPreview(event: ReactPointerEvent<HTMLDivElement>, mirrored: boolean) {
    if (!videoRef.current) return null;
    const video = videoRef.current; const rect = event.currentTarget.getBoundingClientRect();
    const scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);
    const renderedWidth = video.videoWidth * scale; const renderedHeight = video.videoHeight * scale;
    const offsetX = (rect.width - renderedWidth) / 2; const offsetY = (rect.height - renderedHeight) / 2;
    const displayX = (event.clientX - rect.left - offsetX) / renderedWidth; const displayY = (event.clientY - rect.top - offsetY) / renderedHeight;
    if (displayX < 0 || displayX > 1 || displayY < 0 || displayY > 1) return null;
    return { x: mirrored ? 1 - displayX : displayX, y: displayY };
  }

  function drawBallAnnotation(label: BallIdentityEvaluationLabel | null) {
    const canvas = canvasRef.current; const video = videoRef.current;
    if (!canvas || !video) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
    const context = canvas.getContext("2d"); if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!label) return;
    if (label.visibility !== "visible") {
      context.fillStyle = label.visibility === "occluded" ? "#facc15" : "#94a3b8";
      context.font = "bold 18px sans-serif";
      context.fillText(label.visibility === "occluded" ? "BALL TEMPORARILY OCCLUDED" : "NO BALL IN SCENE", 18, 30);
      return;
    }
    context.strokeStyle = "#4ade80"; context.lineWidth = 4;
    context.strokeRect(label.box.x * canvas.width, label.box.y * canvas.height, label.box.width * canvas.width, label.box.height * canvas.height);
  }

  function lockBallFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (mode === "upload" && drawingBallBox) {
      const point = pointFromPreview(event, false); if (!point) return;
      videoRef.current?.pause(); event.currentTarget.setPointerCapture(event.pointerId);
      setBallDrag({ start: point, current: point }); return;
    }
    if (mode !== "live" || !live || !videoRef.current) return;
    const point = pointFromPreview(event, true); if (!point) return;
    const timeMs = Math.max(0, performance.now() - liveStartedRef.current);
    onlineBallTrackerRef.current.seed(timeMs, point); previousBallRef.current = point;
    setTracking((current) => ({ ...current, ball: 0.8 })); setStatus("Ball locked. Continue dribbling.");
  }

  function updateBallDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!ballDrag) return;
    const point = pointFromPreview(event, false); if (!point) return;
    const next = { ...ballDrag, current: point }; setBallDrag(next);
    drawBallAnnotation({ timeMs: 0, visibility: "visible", box: {
      x: Math.min(next.start.x, point.x), y: Math.min(next.start.y, point.y),
      width: Math.abs(point.x - next.start.x), height: Math.abs(point.y - next.start.y),
    } });
  }

  function finishBallDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!ballDrag) return;
    const point = pointFromPreview(event, false) ?? ballDrag.current;
    const box = { x: Math.min(ballDrag.start.x, point.x), y: Math.min(ballDrag.start.y, point.y),
      width: Math.abs(point.x - ballDrag.start.x), height: Math.abs(point.y - ballDrag.start.y) };
    setBallDrag(null); setDrawingBallBox(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (box.width < 0.005 || box.height < 0.005) { drawBallAnnotation(null); return; }
    const label: BallIdentityEvaluationLabel = { timeMs: Math.round((videoRef.current?.currentTime ?? 0) * 10) * 100, visibility: "visible", box };
    setBallLabels((current) => [...current.filter((item) => item.timeMs !== label.timeMs), label].sort((a, b) => a.timeMs - b.timeMs));
    drawBallAnnotation(label);
  }

  async function startLiveCamera() {
    const video = videoRef.current;
    if (!video) return;
    setStatus("Loading vision models..."); setRunning(true);
    try {
      await initializeModels();
      setStatus("Warming up live vision models..."); warmModels();
      setStatus("Requesting front camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false,
      });
      video.src = ""; video.srcObject = stream; await video.play();
      liveStartedRef.current = performance.now(); lastInferenceRef.current = 0; lastMetricsRenderRef.current = 0;
      liveObservationsRef.current = []; liveSessionObservationsRef.current = []; lastEventRef.current = null; previousBallRef.current = null; previousFramePixelsRef.current = null; olderFramePixelsRef.current = null; onlineBallTrackerRef.current.reset();
      ballModelPassSchedulerRef.current.reset();
      liveMetricsRef.current = { samples: 0, measuredBallSamples: 0, trackedBallSamples: 0, lastTimeMs: 0, maximumGapMs: 0,
        totalInferenceMs: 0, maximumInferenceMs: 0, primaryPasses: 0, focusPasses: 0, skippedModelPasses: 0 }; setTracking(EMPTY_TRACKING);
      setLiveEvents([]); setRepetitions({}); setLive(true); setVideoReady(true);
      setStatus("Live tracking active. Keep one player and one ball in frame.");
      liveFrameRef.current = requestAnimationFrame(processLiveFrame);
    } catch (error) {
      console.error("[AI tracker] live camera failed", error);
      stopLiveCamera(error instanceof Error ? `Camera failed: ${error.message}` : "Camera failed.");
    } finally { setRunning(false); }
  }

  function processLiveFrame(_frameTimestamp: number) {
    const video = videoRef.current;
    if (!video || !poseRef.current || !objectsRef.current || !video.srcObject) return;
    const now = performance.now();
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && now - lastInferenceRef.current >= SAMPLE_INTERVAL_MS) {
      lastInferenceRef.current = now;
      try {
        const timeMs = Math.round(now - liveStartedRef.current);
        const inferenceStarted = performance.now();
        const { observation, points, modelPass } = inferObservation(video, timeMs, now);
        const inferenceMs = performance.now() - inferenceStarted;
        const { ball, ballConfidence, poseConfidence } = observation;
        liveSessionObservationsRef.current.push(observation);
        liveObservationsRef.current.push(observation);
        liveObservationsRef.current = liveObservationsRef.current.filter((item) => timeMs - item.timeMs <= LIVE_WINDOW_MS);
        const tracked = trackBallContinuity(liveObservationsRef.current);
        const completed = selectCompletedLiveMove(detectMoves(tracked), timeMs, lastEventRef.current);
        if (completed) {
          lastEventRef.current = { startMs: completed.startMs, endMs: completed.endMs, emittedAtMs: timeMs };
          setLiveEvents((events) => [{ move: completed.move, confidence: completed.confidence, timeMs: completed.endMs }, ...events].slice(0, 8));
          setRepetitions((counts) => ({ ...counts, [completed.move]: (counts[completed.move] ?? 0) + 1 }));
        }
        const metrics = liveMetricsRef.current; const gapMs = metrics.samples ? timeMs - metrics.lastTimeMs : 0;
        metrics.samples += 1; metrics.lastTimeMs = timeMs; metrics.maximumGapMs = Math.max(metrics.maximumGapMs, gapMs);
        metrics.totalInferenceMs += inferenceMs; metrics.maximumInferenceMs = Math.max(metrics.maximumInferenceMs, inferenceMs);
        if (modelPass === "primary") metrics.primaryPasses += 1;
        else if (modelPass === "focus") metrics.focusPasses += 1;
        else metrics.skippedModelPasses += 1;
        if (ball) metrics.trackedBallSamples += 1;
        if (ball && observation.ballSource !== "interpolated" && observation.ballSource !== "missing") metrics.measuredBallSamples += 1;
        if (now - lastMetricsRenderRef.current >= UI_METRICS_INTERVAL_MS) {
          lastMetricsRenderRef.current = now;
          const runtime = summarizeLiveRuntimeDiagnostics(metrics, timeMs, 1000 / SAMPLE_INTERVAL_MS);
          setTracking({ pose: poseConfidence, ball: ballConfidence, samples: metrics.samples,
            measuredBallCoverage: metrics.measuredBallSamples / metrics.samples, trackedBallCoverage: metrics.trackedBallSamples / metrics.samples,
            inferenceFps: timeMs > 0 ? metrics.samples / (timeMs / 1000) : 0, maximumGapMs: metrics.maximumGapMs,
            averageInferenceMs: metrics.totalInferenceMs / metrics.samples, maximumInferenceMs: metrics.maximumInferenceMs,
            primaryPasses: metrics.primaryPasses, focusPasses: metrics.focusPasses, skippedModelPasses: metrics.skippedModelPasses,
            runtimeGate: runtime.gate });
        }
        draw(points, ball, ballConfidence, tracked.flatMap((item) => item.ball ? [item.ball] : []).slice(-20));
      } catch (error) { console.error("[AI tracker] live frame failed", error); }
    }
    liveFrameRef.current = requestAnimationFrame(processLiveFrame);
  }

  async function analyze() {
    const video = videoRef.current;
    if (!video || !video.src || !videoReady || !Number.isFinite(video.duration)) {
      setStatus("Wait for the selected video to finish loading."); return;
    }
    cancelledRef.current = false; previousBallRef.current = null; previousFramePixelsRef.current = null; olderFramePixelsRef.current = null; onlineBallTrackerRef.current.reset(); ballModelPassSchedulerRef.current.reset(); setRunning(true); setResult(null); setSampling(null); setProgress(0);
    try {
      await initializeModels();
      const observations: MotionObservation[] = [];
      video.pause(); video.muted = true; video.playbackRate = 1;
      const durationMs = Math.floor(video.duration * 1000);
      let maximumFrameOffsetMs = 0;
      setStatus("Analyzing every 100 ms frame without skipping..."); await seek(video, 0);
      await new Promise<void>((resolve, reject) => {
        let callbackId = 0; let nextSampleMs = 0;
        const cleanup = () => { if (callbackId) video.cancelVideoFrameCallback(callbackId); video.removeEventListener("error", failed); video.removeEventListener("ended", complete); video.pause(); };
        const failed = () => { cleanup(); reject(new Error("The browser could not decode the clip.")); };
        const complete = () => {
          if (!cancelledRef.current && nextSampleMs <= durationMs) {
            const mediaTimeMs = video.currentTime * 1000; maximumFrameOffsetMs = Math.max(maximumFrameOffsetMs, Math.abs(mediaTimeMs - nextSampleMs));
            const { observation, points } = inferObservation(video, nextSampleMs, performance.now()); observations.push(observation);
            draw(points, observation.ball, observation.ballConfidence); setProgress(durationMs ? nextSampleMs / durationMs : 1);
          }
          cleanup(); resolve();
        };
        const processFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
          if (cancelledRef.current) { cleanup(); resolve(); return; }
          const mediaTimeMs = metadata.mediaTime * 1000;
          if (mediaTimeMs + SAMPLE_INTERVAL_MS / 2 < nextSampleMs) { callbackId = video.requestVideoFrameCallback(processFrame); return; }
          video.pause(); maximumFrameOffsetMs = Math.max(maximumFrameOffsetMs, Math.abs(mediaTimeMs - nextSampleMs));
          const { observation, points } = inferObservation(video, nextSampleMs, performance.now());
          observations.push(observation); draw(points, observation.ball, observation.ballConfidence);
          setProgress(durationMs ? nextSampleMs / durationMs : 1); nextSampleMs += SAMPLE_INTERVAL_MS;
          if (nextSampleMs > durationMs) { cleanup(); resolve(); return; }
          callbackId = video.requestVideoFrameCallback(processFrame); video.play().catch(failed);
        };
        video.addEventListener("error", failed, { once: true }); video.addEventListener("ended", complete, { once: true });
        callbackId = video.requestVideoFrameCallback(processFrame); video.play().catch(failed);
      });
      if (!cancelledRef.current) {
        const tracked = trackBallContinuity(observations);
        setExportData(tracked);
        setResult(summarizeAnalysis(tracked));
        setSampling({ ...summarizeSampling(tracked, durationMs, SAMPLE_INTERVAL_MS, "paced-frame"), maximumFrameOffsetMs });
        setProgress(1);
        setStatus("Analysis complete.");
      }
    } catch (error) {
      console.error("[AI tracker] analysis failed", error);
      setStatus(error instanceof Error ? `Analysis failed: ${error.message}` : "Analysis failed.");
    } finally { setRunning(false); }
  }

  function selectFile(file: File | undefined) {
    if (!file || !videoRef.current) return;
    if (!file.type.startsWith("video/")) { setStatus("Please choose a supported video file."); return; }
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    const url = URL.createObjectURL(file); fileUrlRef.current = url;
    setVideoReady(false); videoRef.current.src = url; setResult(null); setSampling(null); setExportData([]); setLabels([]); setLabelStartMs(null); setReviewTimeMs(0); setBallLabels([]); setBallScheduleMs([]);
    setBallAppearance(""); setCapturePlayerId(""); setCaptureLighting(""); setCaptureHardNegative(false); setDrawingBallBox(false); setBallDrag(null);
    setClipId(file.name.replace(/\.[^.]+$/, "")); setProgress(0); setStatus(`Loading: ${file.name}`);
  }

  function downloadObservations() {
    const payload = JSON.stringify({ schemaVersion: 2, clip: { id: clipId }, sampleIntervalMs: SAMPLE_INTERVAL_MS, sampling, observations: exportData, labels, ballLabels, result }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${clipId || "basketball-analysis"}.json`; anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadMoveLabels() {
    const video = videoRef.current;
    try {
      if (!video) throw new Error("Load a video before exporting move labels.");
      validateMoveLabels(labels, Math.round(video.duration * 1000));
    } catch (error) {
      setStatus(error instanceof Error ? `Move-label export blocked: ${error.message}` : "Move-label export blocked.");
      return;
    }
    const payload = JSON.stringify({ schemaVersion: 1, clipId, protocol: "manual-independent-event-v1", reviewFps,
      durationMs: Math.round(video.duration * 1000), labels }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${clipId || "basketball-analysis"}.move-labels.json`; anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importMoveLabels(file: File | undefined) {
    const video = videoRef.current;
    if (!file || !video) return;
    try {
      const durationMs = Math.round(video.duration * 1000);
      const imported = parseMoveLabelImportDocument(await file.text(), file.name, clipId.trim(), durationMs);
      setLabels(imported.labels); setLabelStartMs(null);
      if (imported.reviewFps !== undefined) setReviewFps(imported.reviewFps);
      setStatus(`Imported ${imported.labels.length} independent move labels${imported.reviewFps === undefined ? "" : ` at ${imported.reviewFps} FPS`}.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Move-label import failed: ${error.message}` : "Move-label import failed.");
    }
  }

  function downloadBallLabels() {
    const protocol = { name: "manual-independent-v1", ...(ballScheduleMs.length ? { scheduledTimesMs: ballScheduleMs } : {}) };
    const metadataStarted = Boolean(ballAppearance || capturePlayerId.trim() || captureLighting.trim() || captureHardNegative);
    if (metadataStarted && (!ballAppearance || !capturePlayerId.trim() || !captureLighting.trim())) {
      setStatus("Complete ball appearance, player ID, and lighting before exporting capture metadata."); return;
    }
    const capture: BallCaptureMetadata | undefined = metadataStarted ? {
      ballAppearance, playerId: capturePlayerId.trim(), lighting: captureLighting.trim(), hardNegative: captureHardNegative,
    } : undefined;
    const payload = JSON.stringify({ schemaVersion: 1, clipId, protocol, ...(capture ? { capture } : {}), labels: ballLabels }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${clipId || "basketball-analysis"}.ball-labels.json`; anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importBallLabels(file: File | undefined) {
    if (!file) return;
    try {
      const sidecar = JSON.parse(await file.text()) as { schemaVersion?: number; clipId?: string; protocol?: { scheduledTimesMs?: unknown } | string; clips?: Record<string, unknown>; capture?: unknown; labels?: unknown };
      const collectionSchedule = clipId && sidecar.clips ? sidecar.clips[clipId] : undefined;
      if (sidecar.schemaVersion !== 1 || (!Array.isArray(sidecar.labels) && !Array.isArray(collectionSchedule))) throw new Error("Expected a schemaVersion 1 ball-label sidecar or schedule.");
      if (sidecar.clipId && clipId && sidecar.clipId !== clipId) throw new Error(`Labels belong to ${sidecar.clipId}, not ${clipId}.`);
      const imported = Array.isArray(sidecar.labels) ? validateBallIdentityEvaluationLabels(sidecar.labels) : ballLabels;
      const declaredSchedule = typeof sidecar.protocol === "object" && Array.isArray(sidecar.protocol?.scheduledTimesMs)
        ? sidecar.protocol.scheduledTimesMs : collectionSchedule;
      const schedule = Array.isArray(declaredSchedule)
        ? Array.from(new Set(declaredSchedule.filter((timeMs): timeMs is number => typeof timeMs === "number" && Number.isFinite(timeMs) && timeMs >= 0))).sort((a, b) => a - b)
        : [];
      const capture = sidecar.capture === undefined ? undefined : validateBallCaptureMetadata(sidecar.capture);
      setBallLabels(imported); setBallScheduleMs(schedule); setDrawingBallBox(false); setBallDrag(null); drawBallAnnotation(null);
      if (capture) { setBallAppearance(capture.ballAppearance); setCapturePlayerId(capture.playerId); setCaptureLighting(capture.lighting); setCaptureHardNegative(capture.hardNegative); }
      const nextScheduled = schedule.find((timeMs) => !imported.some((label) => label.timeMs === timeMs));
      if (nextScheduled !== undefined && videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = nextScheduled / 1000; }
      setStatus(Array.isArray(sidecar.labels) ? `Imported ${sidecar.labels.length} independent ball labels.` : `Imported ${schedule.length} scheduled ball-label frames.`);
    } catch (error) { setStatus(error instanceof Error ? `Ball-label import failed: ${error.message}` : "Ball-label import failed."); }
  }

  function downloadLiveObservations() {
    const tracked = trackBallContinuity(liveSessionObservationsRef.current);
    const durationMs = tracked.at(-1)?.timeMs ?? 0;
    const liveSampling = summarizeSampling(tracked, durationMs, SAMPLE_INTERVAL_MS, "live-throttled");
    const runtime = summarizeLiveRuntimeDiagnostics(liveMetricsRef.current, durationMs, 1000 / SAMPLE_INTERVAL_MS);
    const payload = JSON.stringify({ schemaVersion: 2, clip: { id: "live-session" }, sampleIntervalMs: SAMPLE_INTERVAL_MS,
      sampling: liveSampling, runtime, observations: tracked, labels: [], ballLabels: [], result: summarizeAnalysis(tracked) }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `live-session-${Date.now()}.json`; anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="space-y-5">
    <div className="flex gap-2 border-b border-line pb-3">
      <button className={mode === "live" ? "btn-game" : "btn-ghost"} onClick={() => { if (mode !== "live") { setMode("live"); setStatus("Ready to start front-camera tracking."); } }}>Live camera</button>
      <button className={mode === "upload" ? "btn-game" : "btn-ghost"} onClick={() => { stopLiveCamera("Upload benchmark mode."); setMode("upload"); }}>Upload benchmark</button>
    </div>
    {mode === "live" ? <div className="flex flex-wrap items-center gap-3">
      {!live ? <button className="btn-game" disabled={running} onClick={startLiveCamera}>{running ? "Starting..." : "Start front camera"}</button> : <button className="btn-ghost" onClick={() => stopLiveCamera()}>Stop camera</button>}
      {live && <button className="btn-ghost" onClick={() => setCameraExpanded((expanded) => !expanded)}>{cameraExpanded ? "Exit full screen" : "Full screen"}</button>}
      {live && tracking.samples > 0 && <button className="btn-ghost" onClick={downloadLiveObservations}>Export live observations</button>}
      <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={debugOverlay} onChange={(event) => { debugOverlayRef.current = event.target.checked; setDebugOverlay(event.target.checked); }} /> Debug overlay</label>
      {live && <span className="text-xs text-muted">If tracking is weak, tap the ball once in the preview.</span>}
      <p className="text-sm text-muted">{status}</p>
    </div> : <div className="flex flex-wrap items-center gap-3">
      <label className="btn-ghost cursor-pointer">Choose video<input type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" disabled={running} onChange={(event) => selectFile(event.target.files?.[0])} /></label>
      <button className="btn-game" disabled={running || !videoReady} onClick={analyze}>{running ? `Analyzing ${Math.round(progress * 100)}%` : "Analyze clip"}</button>
      {running && <button className="btn-ghost" onClick={() => { cancelledRef.current = true; setStatus("Analysis cancelled."); }}>Cancel</button>}
      <p className="text-sm text-muted">{status}</p>
    </div>}
    {mode === "upload" && running && <div className="h-2 overflow-hidden rounded bg-raised"><div className="h-full bg-game transition-all" style={{ width: `${progress * 100}%` }} /></div>}
    <div onPointerDown={lockBallFromPointer} onPointerMove={updateBallDrag} onPointerUp={finishBallDrag} onPointerCancel={() => { setBallDrag(null); setDrawingBallBox(false); drawBallAnnotation(null); }} className={`relative aspect-video overflow-hidden bg-raised ${(mode === "live" && live) || (mode === "upload" && drawingBallBox) ? "cursor-crosshair" : ""} ${cameraExpanded ? "fixed inset-0 z-[100] aspect-auto rounded-none" : "rounded-card"}`}>
      <video ref={videoRef} controls={mode === "upload"} playsInline disablePictureInPicture preload="auto" onTimeUpdate={(event) => setReviewTimeMs(Math.round(event.currentTarget.currentTime * 1000))} onSeeked={(event) => setReviewTimeMs(Math.round(event.currentTarget.currentTime * 1000))} onCanPlay={(event) => {
        if (mode === "live") { setVideoReady(true); return; }
        if (event.currentTarget.duration > MAX_CLIP_SECONDS) {
          setVideoReady(false); setStatus(`Clip is too long. Use a clip up to ${MAX_CLIP_SECONDS} seconds.`); return;
        }
        setVideoReady(true); setStatus("Video ready to analyze.");
      }} onError={() => { if (mode === "upload") { setVideoReady(false); setStatus("This browser could not decode the selected video."); } }} className={`h-full w-full object-contain ${mode === "live" ? "-scale-x-100" : ""}`} />
      <canvas ref={canvasRef} className={`pointer-events-none absolute inset-0 h-full w-full object-contain ${mode === "live" ? "-scale-x-100" : ""}`} />
      {cameraExpanded && <button className="btn-ghost absolute right-4 top-4 z-20 bg-asphalt/90" onPointerDown={(event) => event.stopPropagation()} onClick={() => setCameraExpanded(false)}>Exit full screen</button>}
    </div>
    {mode === "live" && <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-card border border-line bg-raised p-4"><h2 className="display text-lg">Tracking confidence</h2><div className="mt-3 flex flex-wrap gap-6 text-sm"><span>Player confidence <strong>{Math.round(tracking.pose * 100)}%</strong></span><span>Ball confidence <strong>{Math.round(tracking.ball * 100)}%</strong></span><span>Measured ball frames <strong>{Math.round(tracking.measuredBallCoverage * 100)}%</strong></span><span>Tracked ball frames <strong>{Math.round(tracking.trackedBallCoverage * 100)}%</strong></span><span>Observed inference <strong>{tracking.inferenceFps.toFixed(1)} FPS</strong></span><span>10 FPS gate <strong>{tracking.runtimeGate === "insufficient-duration" ? "measuring" : tracking.runtimeGate}</strong></span><span>Average inference <strong>{tracking.averageInferenceMs.toFixed(0)} ms</strong></span><span>Slowest inference <strong>{tracking.maximumInferenceMs.toFixed(0)} ms</strong></span><span>Max gap <strong>{tracking.maximumGapMs} ms</strong></span><span>Model passes <strong>{tracking.primaryPasses} primary / {tracking.focusPasses} focused / {tracking.skippedModelPasses} skipped</strong></span><span>UI metrics <strong>4 FPS</strong></span><span>Samples <strong>{tracking.samples}</strong></span><span>Window <strong>4s</strong></span></div></div>
      <div className="rounded-card border border-line bg-raised p-4"><h2 className="display text-lg">Repetitions</h2><div className="mt-3 flex flex-wrap gap-4 text-sm">{(["crossover", "between-the-legs", "behind-the-back"] as MoveName[]).map((move) => <span key={move} className="capitalize">{move.replaceAll("-", " ")} <strong>{repetitions[move] ?? 0}</strong></span>)}</div></div>
      <div className="rounded-card border border-line bg-raised p-4 md:col-span-2"><h2 className="display text-lg">Recent moves</h2>{liveEvents.length ? <ul className="mt-3 space-y-2">{liveEvents.map((event, index) => <li key={`${event.timeMs}-${index}`} className="flex gap-3 text-sm"><strong className="capitalize">{event.move.replaceAll("-", " ")}</strong><span>{Math.round(event.confidence * 100)}%</span><span className="text-muted">{(event.timeMs / 1000).toFixed(1)}s</span></li>)}</ul> : <p className="mt-2 text-sm text-muted">No completed move detected yet.</p>}</div>
    </section>}
    {mode === "upload" && videoReady && <section className="rounded-card border border-line bg-raised p-4">
      <h2 className="display text-lg">Independent event labels</h2>
      <p className="mt-1 text-sm text-muted">Watch the clip and mark every complete repetition. Detector predictions below are never copied into labels.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input className="input max-w-56" aria-label="Clip ID" value={clipId} onChange={(event) => setClipId(event.target.value)} />
        <select className="input max-w-56" value={labelMove} onChange={(event) => setLabelMove(event.target.value as MoveName)}>{ALL_MOVE_NAMES.map((move) => <option key={move} value={move}>{move.replaceAll("-", " ")}</option>)}</select>
        <label className="btn-ghost cursor-pointer">Import move labels<input type="file" accept=".csv,application/json,text/csv" className="sr-only" onChange={(event) => { void importMoveLabels(event.target.files?.[0]); event.target.value = ""; }} /></label>
        <button className="btn-ghost" disabled={!labels.length || Boolean(moveLabelValidationError)} onClick={downloadMoveLabels}>Export move labels</button>
        <label className="flex items-center gap-2 text-sm text-muted">Review FPS <input className="input w-20" type="number" min="1" max="240" step="1" value={reviewFps} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value > 0 && value <= 240) setReviewFps(value); }} /></label>
        <button className="btn-ghost" onClick={() => { void stepReviewFrame(-1); }}>-1 frame</button>
        <button className="btn-ghost" onClick={() => { void stepReviewFrame(1); }}>+1 frame</button>
        <span className="text-sm text-muted">{(reviewTimeMs / 1000).toFixed(3)}s · frame {Math.round(reviewTimeMs * reviewFps / 1000)}</span>
        <button className="btn-ghost" onClick={() => setLabelStartMs(currentReviewFrameMs())}>Mark start</button>
        <button className="btn-game" disabled={labelStartMs === null} onClick={() => {
          const video = videoRef.current; const endMs = currentReviewFrameMs();
          if (labelStartMs !== null && video && endMs > labelStartMs) {
            try {
              const next = validateMoveLabels([...labels, { move: labelMove, startMs: labelStartMs, endMs }], Math.round(video.duration * 1000));
              setLabels(next);
            } catch (error) { setStatus(error instanceof Error ? `Move label not added: ${error.message}` : "Move label not added."); }
          }
          setLabelStartMs(null);
        }}>Mark end{labelStartMs === null ? "" : ` (${(labelStartMs / 1000).toFixed(2)}s)`}</button>
      </div>
      {moveLabelValidationError && <p className="mt-3 text-sm text-game">Export blocked: {moveLabelValidationError}</p>}
      {labels.length === 0 ? <p className="mt-3 text-sm text-muted">No labels yet.</p> : <ul className="mt-3 space-y-2">{labels.map((label, index) => <li key={`${label.startMs}-${index}`} className="flex flex-wrap items-center gap-2 text-sm">
        <button className="btn-ghost" onClick={() => { const video = videoRef.current; if (!video) return; video.pause(); video.currentTime = label.startMs / 1000; }}>Review</button>
        <select className="input max-w-48" value={label.move} onChange={(event) => setLabels((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, move: event.target.value as MoveName } : item))}>{ALL_MOVE_NAMES.map((move) => <option key={move} value={move}>{move}</option>)}</select>
        <input className="input w-28" type="number" step={1 / reviewFps} value={label.startMs / 1000} onChange={(event) => setLabels((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, startMs: Math.round(Number(event.target.value) * 1000) } : item))} />
        <span>to</span><input className="input w-28" type="number" step={1 / reviewFps} value={label.endMs / 1000} onChange={(event) => setLabels((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, endMs: Math.round(Number(event.target.value) * 1000) } : item))} />
        <button className="text-game" onClick={() => setLabels((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Delete</button>
      </li>)}</ul>}
      {rapidLabelAudit.length > 0 && <div className="mt-5 rounded-card border border-line bg-asphalt/40 p-4">
        <h3 className="font-semibold">Rapid-label motion audit</h3>
        <p className="mt-1 text-sm text-muted">This move-prediction-independent review compares contiguous label counts with confidence-qualified tracked-ball transitions across the body centerline. It never accepts, edits, or deletes a label automatically.</p>
        <ul className="mt-3 space-y-2">{rapidLabelAudit.map((audit) => <li key={`${audit.move}-${audit.startMs}`} className="flex flex-wrap items-center gap-3 text-sm">
          <button className="btn-ghost" onClick={() => { const video = videoRef.current; if (!video) return; video.pause(); video.currentTime = audit.startMs / 1000; }}>Review {(audit.startMs / 1000).toFixed(1)}-{(audit.endMs / 1000).toFixed(1)}s</button>
          <strong className="capitalize">{audit.move.replaceAll("-", " ")}</strong>
          <span>{audit.labelCount} labels / {audit.stableSideTransitions} observed transitions</span>
          <span className={audit.status === "pass" ? "text-emerald-300" : "text-game"}>{audit.status.replaceAll("-", " ")}</span>
          <span className="text-muted">Tracked evidence {Math.round(audit.usableCoverage * 100)}%</span>
          <span className="flex flex-wrap items-center gap-1 text-muted">Review anchors {audit.transitionTimesMs.map((timeMs) => <button key={timeMs} className="text-game underline" onClick={() => { const video = videoRef.current; if (!video) return; video.pause(); video.currentTime = Math.max(0, timeMs / 1000 - 0.25); }}>{(timeMs / 1000).toFixed(2)}s</button>)}</span>
        </li>)}</ul>
      </div>}
      {labelCoverageAudit && <div className="mt-5 rounded-card border border-line bg-asphalt/40 p-4">
        <h3 className="font-semibold">Full-clip label coverage audit</h3>
        <p className="mt-1 text-sm text-muted">Every confidence-qualified cross-body transition must match at most one independently authored crossover, between-the-legs, or behind-the-back label. Anchors below identify frames to inspect; they never become labels automatically.</p>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <span>{labelCoverageAudit.lateralLabelCount} lateral labels</span>
          <span>{labelCoverageAudit.stableSideTransitions} observed transitions</span>
          <span>{labelCoverageAudit.matchedTransitions} one-to-one matches</span>
          <span className={labelCoverageAudit.status === "pass" ? "text-emerald-300" : "text-game"}>{labelCoverageAudit.status.replaceAll("-", " ")}</span>
          <span className="text-muted">Tracked evidence {Math.round(labelCoverageAudit.usableCoverage * 100)}%</span>
        </div>
        <p className="mt-2 text-sm text-muted">{labelCoverageAudit.reason}</p>
        {labelCoverageAudit.uncoveredTransitionTimesMs.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <strong>Uncovered review anchors</strong>
          {labelCoverageAudit.uncoveredTransitionTimesMs.map((timeMs) => <button key={timeMs} className="text-game underline" onClick={() => { const video = videoRef.current; if (!video) return; video.pause(); video.currentTime = Math.max(0, timeMs / 1000 - 0.35); }}>{(timeMs / 1000).toFixed(2)}s</button>)}
        </div>}
        {labelCoverageAudit.unmatchedLabels.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <strong>Labels without transition support</strong>
          {labelCoverageAudit.unmatchedLabels.map((label, index) => <button key={`${label.startMs}-${index}`} className="text-game underline" onClick={() => { const video = videoRef.current; if (!video) return; video.pause(); video.currentTime = Math.max(0, label.startMs / 1000 - 0.25); }}>{label.move.replaceAll("-", " ")} {(label.startMs / 1000).toFixed(2)}s</button>)}
        </div>}
        {labelCoverageAudit.boundaryReviewTransitionTimesMs.length > 0 && <p className="mt-3 text-sm text-muted">Excluded boundary-review anchors: {labelCoverageAudit.boundaryReviewTransitionTimesMs.map((timeMs) => `${(timeMs / 1000).toFixed(2)}s`).join(", ")}. Confirm whether each repetition is complete before labeling it.</p>}
      </div>}
      <div className="mt-5 border-t border-line pt-4">
        <h3 className="font-semibold">Independent ball identity labels</h3>
        <p className="mt-1 text-sm text-muted">Pause on a frame and draw a tight box when the ball is visible. Use <strong>Ball temporarily occluded</strong> only when the ball is known to remain in play but is fully hidden at that instant. Use <strong>No ball in scene</strong> when it is truly absent or outside the frame. These labels are never created from tracker output.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select className="input" aria-label="Ball appearance" value={ballAppearance} onChange={(event) => setBallAppearance(event.target.value)}><option value="">Ball appearance</option><option value="orange">Orange</option><option value="black">Black</option><option value="other">Other</option></select>
          <input className="input" aria-label="Pseudonymous player ID" placeholder="Pseudonymous player ID" value={capturePlayerId} onChange={(event) => setCapturePlayerId(event.target.value)} />
          <input className="input" aria-label="Lighting condition" placeholder="Lighting condition" value={captureLighting} onChange={(event) => setCaptureLighting(event.target.value)} />
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={captureHardNegative} onChange={(event) => setCaptureHardNegative(event.target.checked)} /> Hard-negative footage</label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn-ghost" onClick={() => { const video = videoRef.current; if (!video) return; video.pause(); video.currentTime = Math.max(0, video.currentTime - 0.1); drawBallAnnotation(null); }}>-0.1s</button>
          <button className="btn-ghost" onClick={() => { const video = videoRef.current; if (!video) return; video.pause(); video.currentTime = Math.min(video.duration || 0, video.currentTime + 0.1); drawBallAnnotation(null); }}>+0.1s</button>
          <button className={drawingBallBox ? "btn-game" : "btn-ghost"} onClick={() => { videoRef.current?.pause(); setDrawingBallBox((current) => !current); setBallDrag(null); drawBallAnnotation(null); }}>{drawingBallBox ? "Drag on the ball..." : "Draw ball box"}</button>
          <button className="btn-ghost" onClick={() => {
            const label: BallIdentityEvaluationLabel = { timeMs: Math.round((videoRef.current?.currentTime ?? 0) * 10) * 100, visibility: "occluded" };
            setBallLabels((current) => [...current.filter((item) => item.timeMs !== label.timeMs), label].sort((a, b) => a.timeMs - b.timeMs));
            setDrawingBallBox(false); setBallDrag(null); drawBallAnnotation(label);
          }}>Ball temporarily occluded</button>
          <button className="btn-ghost" onClick={() => {
            const label: BallIdentityEvaluationLabel = { timeMs: Math.round((videoRef.current?.currentTime ?? 0) * 10) * 100, visibility: "absent" };
            setBallLabels((current) => [...current.filter((item) => item.timeMs !== label.timeMs), label].sort((a, b) => a.timeMs - b.timeMs));
            setDrawingBallBox(false); setBallDrag(null); drawBallAnnotation(label);
          }}>No ball in scene</button>
          <label className="btn-ghost cursor-pointer">Import ball labels<input type="file" accept="application/json" className="sr-only" onChange={(event) => { void importBallLabels(event.target.files?.[0]); event.target.value = ""; }} /></label>
          <button className="btn-ghost" disabled={ballScheduleMs.length > 0} onClick={() => {
            const durationMs = (videoRef.current?.duration ?? 0) * 1000;
            try {
              const schedule = createUniformBallLabelSchedule(durationMs, 20);
              setBallScheduleMs(schedule);
              if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = schedule[0] / 1000; drawBallAnnotation(null); }
              setStatus(`Created a ${schedule.length}-frame schedule from clip duration only; label it before reviewing detector output.`);
            } catch (error) { setStatus(error instanceof Error ? error.message : "Could not create ball-label schedule."); }
          }}>Create 20-frame schedule</button>
          <button className="btn-ghost" disabled={!ballLabels.length} onClick={downloadBallLabels}>Export ball labels</button>
          {ballScheduleMs.length > 0 && <button className="btn-ghost" onClick={() => {
            const next = ballScheduleMs.find((timeMs) => !ballLabels.some((label) => label.timeMs === timeMs));
            if (next !== undefined && videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = next / 1000; drawBallAnnotation(null); }
          }}>Next scheduled frame</button>}
          <span className="text-xs text-muted">{ballLabels.length} labeled frames</span>
          {ballScheduleMs.length > 0 && <span className="text-xs text-muted">{ballLabels.filter((label) => ballScheduleMs.includes(label.timeMs)).length}/{ballScheduleMs.length} scheduled</span>}
        </div>
        {ballLabels.length > 0 && <ul className="mt-3 max-h-48 space-y-2 overflow-auto">{ballLabels.map((label) => <li key={label.timeMs} className="flex flex-wrap items-center gap-3 text-sm">
          <button className="text-game" onClick={() => { const video = videoRef.current; if (video) { video.pause(); video.currentTime = label.timeMs / 1000; } drawBallAnnotation(label); }}>{(label.timeMs / 1000).toFixed(1)}s</button>
          <span className={label.visibility === "visible" ? "text-game" : label.visibility === "occluded" ? "text-wood" : "text-muted"}>{label.visibility === "visible" ? "ball box" : label.visibility === "occluded" ? "temporarily occluded" : "no ball in scene"}</span>
          <button className="text-game" onClick={() => { setBallLabels((current) => current.filter((item) => item.timeMs !== label.timeMs)); drawBallAnnotation(null); }}>Delete</button>
        </li>)}</ul>}
        {ballIdentity && <div className="mt-4 rounded border border-line p-3 text-sm">
          <div className="flex flex-wrap gap-5"><span>Tracked identity F1 <strong>{Math.round(ballIdentity.tracked.f1 * 100)}%</strong></span><span>Precision <strong>{Math.round(ballIdentity.tracked.precision * 100)}%</strong></span><span>Recall <strong>{Math.round(ballIdentity.tracked.recall * 100)}%</strong></span><span>Median center error <strong>{ballIdentity.tracked.medianCenterErrorRadii?.toFixed(2) ?? "n/a"} radii</strong></span>{ballIdentity.raw && <span>Raw identity F1 <strong>{Math.round(ballIdentity.raw.f1 * 100)}%</strong></span>}{ballIdentity.occlusion.occludedLabels > 0 && <><span>Occluded labels <strong>{ballIdentity.occlusion.occludedLabels}</strong></span>{ballIdentity.occlusion.trackPresenceRate !== null && <span>Occlusion track presence <strong>{Math.round(ballIdentity.occlusion.trackPresenceRate * 100)}%</strong></span>}{ballIdentity.occlusion.predictionPersistenceRate !== null && <span>Prediction persistence <strong>{Math.round(ballIdentity.occlusion.predictionPersistenceRate * 100)}%</strong></span>}<span>Occluded frame outcomes <strong>{ballIdentity.occlusion.predictedFrames} predicted / {ballIdentity.occlusion.measuredFrames} measured / {ballIdentity.occlusion.missingFrames} missing</strong></span></>}</div>
          {ballIdentity.warnings.map((warning) => <p key={warning} className="mt-2 text-xs text-wood">{warning}</p>)}
        </div>}
      </div>
    </section>}
    {mode === "upload" && result && <section className="rounded-card border border-line bg-raised p-4">
      <div className="flex flex-wrap gap-5 text-sm"><span>Pose coverage <strong>{Math.round(result.poseCoverage * 100)}%</strong></span><span>Ball coverage <strong>{Math.round(result.ballCoverage * 100)}%</strong></span><span>Raw ball detections <strong>{Math.round(result.detectedBallCoverage * 100)}%</strong></span><span>Tracked gaps <strong>{result.interpolatedBallFrames}</strong></span><span>Samples <strong>{result.observations}</strong></span>{sampling && <><span>Sample coverage <strong>{Math.round(sampling.coverage * 100)}%</strong></span><span>Max sample gap <strong>{sampling.maximumGapMs} ms</strong></span></>}</div>
      {(result.poseCoverage < 0.7 || result.detectedBallCoverage < 0.5) && <p className="mt-3 rounded border border-wood/50 bg-wood/10 p-3 text-sm text-wood">Low observation coverage: treat detections as provisional. Try a closer crop, brighter lighting, a stationary camera, and an unobstructed full-body view.</p>}
      <button className="btn-ghost mt-4" onClick={downloadObservations}>Export observations</button>
      <h2 className="display mt-4 text-lg">Detected moves</h2>
      {result.moves.length === 0 ? <p className="mt-2 text-muted">No supported move detected. Low ball coverage or an unsupported movement will not produce a guess.</p> :
        <ul className="mt-3 space-y-3">{result.moves.map((move, index) => <li key={`${move.move}-${move.startMs}-${index}`} className="border-l-2 border-game pl-3">
          <p className="font-semibold capitalize">{move.move.replaceAll("-", " ")} · {(move.startMs / 1000).toFixed(1)}–{(move.endMs / 1000).toFixed(1)}s · {Math.round(move.confidence * 100)}%</p>
          <p className="text-sm text-muted">{move.evidence.join("; ")}</p>
        </li>)}</ul>}
    </section>}
  </div>;
}
