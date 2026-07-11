"use client";

import { useEffect, useRef, useState } from "react";
import { FilesetResolver, ObjectDetector, PoseLandmarker } from "@mediapipe/tasks-vision";
import { detectMoves, summarizeAnalysis } from "@/lib/motion/detectMoves";
import { trackBallContinuity } from "@/lib/motion/trackBall";
import type { AnalysisSummary, MotionObservation, Point } from "@/lib/motion/types";
import type { MoveName } from "@/lib/motion/types";
import type { ExpectedMove } from "@/lib/motion/evaluate";
import { ALL_MOVE_NAMES } from "@/lib/motion/validation";
import { detectMovingBallPixels, detectOrangeBallPixels } from "@/lib/motion/colorBall";

const SAMPLE_INTERVAL_MS = 100;
const MAX_CLIP_SECONDS = 60;
const LIVE_WINDOW_MS = 4_000;
const EVENT_COOLDOWN_MS = 900;
const landmark = (points: Point[], index: number): Point => points[index] ?? { x: 0, y: 0, visibility: 0 };

export default function AITracker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileUrlRef = useRef<string | null>(null);
  const poseRef = useRef<PoseLandmarker | null>(null);
  const objectsRef = useRef<ObjectDetector | null>(null);
  const cancelledRef = useRef(false);
  const liveFrameRef = useRef<number | null>(null);
  const liveStartedRef = useRef(0);
  const lastInferenceRef = useRef(0);
  const liveObservationsRef = useRef<MotionObservation[]>([]);
  const lastEventRef = useRef<{ move: MoveName; atMs: number } | null>(null);
  const colorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousBallRef = useRef<Point | null>(null);
  const previousFramePixelsRef = useRef<Uint8ClampedArray | null>(null);
  const [mode, setMode] = useState<"live" | "upload">("live");
  const [live, setLive] = useState(false);
  const [debugOverlay, setDebugOverlay] = useState(true);
  const [liveEvents, setLiveEvents] = useState<Array<{ move: MoveName; confidence: number; timeMs: number }>>([]);
  const [repetitions, setRepetitions] = useState<Partial<Record<MoveName, number>>>({});
  const [tracking, setTracking] = useState({ pose: 0, ball: 0 });
  const [cameraExpanded, setCameraExpanded] = useState(false);
  const [status, setStatus] = useState("Choose a short MP4, WebM, or MOV clip.");
  const [running, setRunning] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AnalysisSummary | null>(null);
  const [exportData, setExportData] = useState<MotionObservation[]>([]);
  const [labels, setLabels] = useState<ExpectedMove[]>([]);
  const [labelMove, setLabelMove] = useState<MoveName>("behind-the-back");
  const [labelStartMs, setLabelStartMs] = useState<number | null>(null);
  const [clipId, setClipId] = useState("");

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
    const create = async (delegate: "GPU" | "CPU") => {
      const pose = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", delegate },
        runningMode: "VIDEO", numPoses: 1,
      });
      try {
        const objects = await ObjectDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite", delegate },
          scoreThreshold: 0.25, runningMode: "VIDEO",
        });
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

  function draw(points: Point[], ball: Point | null, ballConfidence: number, trajectory: Point[] = []) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!debugOverlay) return;
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

  function detectVisualBall(video: HTMLVideoElement, points: Point[]) {
    const canvas = colorCanvasRef.current ?? document.createElement("canvas"); colorCanvasRef.current = canvas;
    canvas.width = 320; canvas.height = Math.max(1, Math.round(320 * video.videoHeight / video.videoWidth));
    const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const visible = points.filter((point) => (point.visibility ?? 1) >= 0.35);
    const bounds = visible.length ? {
      left: Math.max(0, Math.min(...visible.map((point) => point.x)) - 0.22),
      right: Math.min(1, Math.max(...visible.map((point) => point.x)) + 0.22),
      top: Math.max(0, Math.min(...visible.map((point) => point.y)) + 0.1),
      bottom: Math.min(1, Math.max(...visible.map((point) => point.y)) + 0.12),
    } : undefined;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const orange = detectOrangeBallPixels(pixels, canvas.width, canvas.height, bounds, previousBallRef.current);
    const moving = detectMovingBallPixels(pixels, previousFramePixelsRef.current, canvas.width, canvas.height, bounds, previousBallRef.current);
    previousFramePixelsRef.current = pixels.slice();
    if (moving) return { ...moving, source: "motion" as const };
    return orange ? { ...orange, source: "color" as const } : null;
  }

  function stopLiveCamera(message = "Camera stopped.") {
    if (liveFrameRef.current !== null) cancelAnimationFrame(liveFrameRef.current);
    liveFrameRef.current = null;
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (video) video.srcObject = null;
    setLive(false); setCameraExpanded(false); setTracking({ pose: 0, ball: 0 }); setStatus(message);
  }

  async function startLiveCamera() {
    const video = videoRef.current;
    if (!video) return;
    setStatus("Loading vision models..."); setRunning(true);
    try {
      await initializeModels();
      setStatus("Requesting front camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false,
      });
      video.src = ""; video.srcObject = stream; await video.play();
      liveStartedRef.current = performance.now(); lastInferenceRef.current = 0;
      liveObservationsRef.current = []; lastEventRef.current = null; previousBallRef.current = null; previousFramePixelsRef.current = null;
      setLiveEvents([]); setRepetitions({}); setLive(true); setVideoReady(true);
      setStatus("Live tracking active. Keep one player and one ball in frame.");
      liveFrameRef.current = requestAnimationFrame(processLiveFrame);
    } catch (error) {
      console.error("[AI tracker] live camera failed", error);
      stopLiveCamera(error instanceof Error ? `Camera failed: ${error.message}` : "Camera failed.");
    } finally { setRunning(false); }
  }

  function processLiveFrame(now: number) {
    const video = videoRef.current;
    if (!video || !poseRef.current || !objectsRef.current || !video.srcObject) return;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && now - lastInferenceRef.current >= SAMPLE_INTERVAL_MS) {
      lastInferenceRef.current = now;
      try {
        const timeMs = Math.round(now - liveStartedRef.current);
        const poseResult = poseRef.current.detectForVideo(video, now);
        const objectResult = objectsRef.current.detectForVideo(video, now);
        const points = (poseResult.landmarks[0] ?? []) as Point[];
        const detection = objectResult.detections.filter((item) => item.categories[0]?.categoryName === "sports ball")
          .sort((a, b) => (b.categories[0]?.score ?? 0) - (a.categories[0]?.score ?? 0))[0];
        const box = detection?.boundingBox;
        let ball = box ? { x: (box.originX + box.width / 2) / video.videoWidth, y: (box.originY + box.height / 2) / video.videoHeight } : null;
        const poseConfidence = points.length ? points.reduce((sum, point) => sum + (point.visibility ?? 1), 0) / points.length : 0;
        const visualBall = ball ? null : detectVisualBall(video, points); if (!ball && visualBall) ball = visualBall.center;
        const ballConfidence = detection?.categories[0]?.score ?? visualBall?.confidence ?? 0; previousBallRef.current = ball;
        const observation: MotionObservation = { timeMs, poseConfidence, ballConfidence, ball, ballSource: detection ? "detected" : visualBall?.source ?? "missing",
          leftShoulder: landmark(points, 11), rightShoulder: landmark(points, 12), leftWrist: landmark(points, 15), rightWrist: landmark(points, 16),
          leftHip: landmark(points, 23), rightHip: landmark(points, 24), leftKnee: landmark(points, 25), rightKnee: landmark(points, 26) };
        liveObservationsRef.current.push(observation);
        liveObservationsRef.current = liveObservationsRef.current.filter((item) => timeMs - item.timeMs <= LIVE_WINDOW_MS);
        const tracked = trackBallContinuity(liveObservationsRef.current);
        const moves = detectMoves(tracked);
        const completed = moves.at(-1);
        if (completed && completed.endMs >= timeMs - 500 && (!lastEventRef.current || lastEventRef.current.move !== completed.move || timeMs - lastEventRef.current.atMs > EVENT_COOLDOWN_MS)) {
          lastEventRef.current = { move: completed.move, atMs: timeMs };
          setLiveEvents((events) => [{ move: completed.move, confidence: completed.confidence, timeMs }, ...events].slice(0, 8));
          setRepetitions((counts) => ({ ...counts, [completed.move]: (counts[completed.move] ?? 0) + 1 }));
        }
        setTracking({ pose: poseConfidence, ball: ballConfidence });
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
    cancelledRef.current = false; previousBallRef.current = null; previousFramePixelsRef.current = null; setRunning(true); setResult(null); setProgress(0);
    try {
      await initializeModels();
      const observations: MotionObservation[] = [];
      let lastSampleMs = -SAMPLE_INTERVAL_MS;
      video.currentTime = 0; video.muted = true; video.playbackRate = 4;
      await new Promise<void>((resolve, reject) => {
        let callbackId = 0;
        const cleanup = () => { if (callbackId) video.cancelVideoFrameCallback(callbackId); video.removeEventListener("ended", complete); video.removeEventListener("error", failed); };
        const complete = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error("The browser could not decode the clip.")); };
        const processFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
          if (cancelledRef.current) { video.pause(); cleanup(); resolve(); return; }
          const timeMs = Math.round(metadata.mediaTime * 1000);
          if (timeMs - lastSampleMs >= SAMPLE_INTERVAL_MS - 2) {
            lastSampleMs = timeMs;
            const inferenceTimestamp = performance.now();
            const poseResult = poseRef.current!.detectForVideo(video, inferenceTimestamp);
            const objectResult = objectsRef.current!.detectForVideo(video, inferenceTimestamp);
            const points = (poseResult.landmarks[0] ?? []) as Point[];
            const detection = objectResult.detections.filter((item) => item.categories[0]?.categoryName === "sports ball")
              .sort((a, b) => (b.categories[0]?.score ?? 0) - (a.categories[0]?.score ?? 0))[0];
            const box = detection?.boundingBox;
            let ball = box ? { x: (box.originX + box.width / 2) / video.videoWidth, y: (box.originY + box.height / 2) / video.videoHeight } : null;
            const poseConfidence = points.length ? points.reduce((sum, point) => sum + (point.visibility ?? 1), 0) / points.length : 0;
            const visualBall = ball ? null : detectVisualBall(video, points); if (!ball && visualBall) ball = visualBall.center;
            const ballConfidence = detection?.categories[0]?.score ?? visualBall?.confidence ?? 0; previousBallRef.current = ball;
            observations.push({ timeMs, poseConfidence, ballConfidence, ball, ballSource: detection ? "detected" : visualBall?.source ?? "missing",
              leftShoulder: landmark(points, 11), rightShoulder: landmark(points, 12), leftWrist: landmark(points, 15), rightWrist: landmark(points, 16),
              leftHip: landmark(points, 23), rightHip: landmark(points, 24), leftKnee: landmark(points, 25), rightKnee: landmark(points, 26) });
            draw(points, ball, ballConfidence); setProgress(metadata.mediaTime / video.duration);
          }
          callbackId = video.requestVideoFrameCallback(processFrame);
        };
        video.addEventListener("ended", complete, { once: true }); video.addEventListener("error", failed, { once: true });
        callbackId = video.requestVideoFrameCallback(processFrame);
        video.play().catch(reject);
      });
      video.pause(); video.playbackRate = 1;
      if (!cancelledRef.current) {
        const tracked = trackBallContinuity(observations);
        setExportData(tracked);
        setResult(summarizeAnalysis(tracked));
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
    setVideoReady(false); videoRef.current.src = url; setResult(null); setExportData([]); setLabels([]); setLabelStartMs(null);
    setClipId(file.name.replace(/\.[^.]+$/, "")); setProgress(0); setStatus(`Loading: ${file.name}`);
  }

  function downloadObservations() {
    const payload = JSON.stringify({ schemaVersion: 2, clip: { id: clipId }, sampleIntervalMs: SAMPLE_INTERVAL_MS, observations: exportData, labels, result }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${clipId || "basketball-analysis"}.json`; anchor.click();
    URL.revokeObjectURL(url);
  }

  return <div className="space-y-5">
    <div className="flex gap-2 border-b border-line pb-3">
      <button className={mode === "live" ? "btn-game" : "btn-ghost"} onClick={() => { if (mode !== "live") { setMode("live"); setStatus("Ready to start front-camera tracking."); } }}>Live camera</button>
      <button className={mode === "upload" ? "btn-game" : "btn-ghost"} onClick={() => { stopLiveCamera("Upload benchmark mode."); setMode("upload"); }}>Upload benchmark</button>
    </div>
    {mode === "live" ? <div className="flex flex-wrap items-center gap-3">
      {!live ? <button className="btn-game" disabled={running} onClick={startLiveCamera}>{running ? "Starting..." : "Start front camera"}</button> : <button className="btn-ghost" onClick={() => stopLiveCamera()}>Stop camera</button>}
      {live && <button className="btn-ghost" onClick={() => setCameraExpanded((expanded) => !expanded)}>{cameraExpanded ? "Exit full screen" : "Full screen"}</button>}
      <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={debugOverlay} onChange={(event) => setDebugOverlay(event.target.checked)} /> Debug overlay</label>
      <p className="text-sm text-muted">{status}</p>
    </div> : <div className="flex flex-wrap items-center gap-3">
      <label className="btn-ghost cursor-pointer">Choose video<input type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" disabled={running} onChange={(event) => selectFile(event.target.files?.[0])} /></label>
      <button className="btn-game" disabled={running || !videoReady} onClick={analyze}>{running ? `Analyzing ${Math.round(progress * 100)}%` : "Analyze clip"}</button>
      {running && <button className="btn-ghost" onClick={() => { cancelledRef.current = true; setStatus("Analysis cancelled."); }}>Cancel</button>}
      <p className="text-sm text-muted">{status}</p>
    </div>}
    {mode === "upload" && running && <div className="h-2 overflow-hidden rounded bg-raised"><div className="h-full bg-game transition-all" style={{ width: `${progress * 100}%` }} /></div>}
    <div className={`relative aspect-video overflow-hidden bg-raised ${cameraExpanded ? "fixed inset-0 z-[100] aspect-auto rounded-none" : "rounded-card"}`}>
      <video ref={videoRef} controls={mode === "upload"} playsInline disablePictureInPicture preload="auto" onCanPlay={(event) => {
        if (mode === "live") { setVideoReady(true); return; }
        if (event.currentTarget.duration > MAX_CLIP_SECONDS) {
          setVideoReady(false); setStatus(`Clip is too long. Use a clip up to ${MAX_CLIP_SECONDS} seconds.`); return;
        }
        setVideoReady(true); setStatus("Video ready to analyze.");
      }} onError={() => { setVideoReady(false); setStatus("This browser could not decode the selected video."); }} className={`h-full w-full object-contain ${mode === "live" ? "-scale-x-100" : ""}`} />
      <canvas ref={canvasRef} className={`pointer-events-none absolute inset-0 h-full w-full object-contain ${mode === "live" ? "-scale-x-100" : ""}`} />
      {cameraExpanded && <button className="btn-ghost absolute right-4 top-4 z-20 bg-asphalt/90" onClick={() => setCameraExpanded(false)}>Exit full screen</button>}
    </div>
    {mode === "live" && <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-card border border-line bg-raised p-4"><h2 className="display text-lg">Tracking confidence</h2><div className="mt-3 flex gap-6 text-sm"><span>Player <strong>{Math.round(tracking.pose * 100)}%</strong></span><span>Ball <strong>{Math.round(tracking.ball * 100)}%</strong></span><span>Window <strong>4s</strong></span><span>Inference <strong>10 FPS</strong></span></div></div>
      <div className="rounded-card border border-line bg-raised p-4"><h2 className="display text-lg">Repetitions</h2><div className="mt-3 flex flex-wrap gap-4 text-sm">{(["crossover", "between-the-legs", "behind-the-back"] as MoveName[]).map((move) => <span key={move} className="capitalize">{move.replaceAll("-", " ")} <strong>{repetitions[move] ?? 0}</strong></span>)}</div></div>
      <div className="rounded-card border border-line bg-raised p-4 md:col-span-2"><h2 className="display text-lg">Recent moves</h2>{liveEvents.length ? <ul className="mt-3 space-y-2">{liveEvents.map((event, index) => <li key={`${event.timeMs}-${index}`} className="flex gap-3 text-sm"><strong className="capitalize">{event.move.replaceAll("-", " ")}</strong><span>{Math.round(event.confidence * 100)}%</span><span className="text-muted">{(event.timeMs / 1000).toFixed(1)}s</span></li>)}</ul> : <p className="mt-2 text-sm text-muted">No completed move detected yet.</p>}</div>
    </section>}
    {mode === "upload" && videoReady && <section className="rounded-card border border-line bg-raised p-4">
      <h2 className="display text-lg">Independent event labels</h2>
      <p className="mt-1 text-sm text-muted">Watch the clip and mark every complete repetition. Detector predictions below are never copied into labels.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input className="input max-w-56" aria-label="Clip ID" value={clipId} onChange={(event) => setClipId(event.target.value)} />
        <select className="input max-w-56" value={labelMove} onChange={(event) => setLabelMove(event.target.value as MoveName)}>{ALL_MOVE_NAMES.map((move) => <option key={move} value={move}>{move.replaceAll("-", " ")}</option>)}</select>
        <button className="btn-ghost" onClick={() => setLabelStartMs(Math.round((videoRef.current?.currentTime ?? 0) * 1000))}>Mark start</button>
        <button className="btn-game" disabled={labelStartMs === null} onClick={() => {
          const endMs = Math.round((videoRef.current?.currentTime ?? 0) * 1000);
          if (labelStartMs !== null && endMs > labelStartMs) setLabels((current) => [...current, { move: labelMove, startMs: labelStartMs, endMs }].sort((a, b) => a.startMs - b.startMs));
          setLabelStartMs(null);
        }}>Mark end{labelStartMs === null ? "" : ` (${(labelStartMs / 1000).toFixed(2)}s)`}</button>
      </div>
      {labels.length === 0 ? <p className="mt-3 text-sm text-muted">No labels yet.</p> : <ul className="mt-3 space-y-2">{labels.map((label, index) => <li key={`${label.startMs}-${index}`} className="flex flex-wrap items-center gap-2 text-sm">
        <select className="input max-w-48" value={label.move} onChange={(event) => setLabels((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, move: event.target.value as MoveName } : item))}>{ALL_MOVE_NAMES.map((move) => <option key={move} value={move}>{move}</option>)}</select>
        <input className="input w-28" type="number" step="0.01" value={label.startMs / 1000} onChange={(event) => setLabels((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, startMs: Math.round(Number(event.target.value) * 1000) } : item))} />
        <span>to</span><input className="input w-28" type="number" step="0.01" value={label.endMs / 1000} onChange={(event) => setLabels((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, endMs: Math.round(Number(event.target.value) * 1000) } : item))} />
        <button className="text-game" onClick={() => setLabels((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Delete</button>
      </li>)}</ul>}
    </section>}
    {mode === "upload" && result && <section className="rounded-card border border-line bg-raised p-4">
      <div className="flex flex-wrap gap-5 text-sm"><span>Pose coverage <strong>{Math.round(result.poseCoverage * 100)}%</strong></span><span>Ball coverage <strong>{Math.round(result.ballCoverage * 100)}%</strong></span><span>Raw ball detections <strong>{Math.round(result.detectedBallCoverage * 100)}%</strong></span><span>Tracked gaps <strong>{result.interpolatedBallFrames}</strong></span><span>Samples <strong>{result.observations}</strong></span></div>
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
