"use client";

import { useEffect, useRef, useState } from "react";
import { FilesetResolver, ObjectDetector, PoseLandmarker } from "@mediapipe/tasks-vision";
import { summarizeAnalysis } from "@/lib/motion/detectMoves";
import { trackBallContinuity } from "@/lib/motion/trackBall";
import type { AnalysisSummary, MotionObservation, Point } from "@/lib/motion/types";
import type { MoveName } from "@/lib/motion/types";
import type { ExpectedMove } from "@/lib/motion/evaluate";
import { ALL_MOVE_NAMES } from "@/lib/motion/validation";

const SAMPLE_INTERVAL_MS = 100;
const MAX_CLIP_SECONDS = 60;
const landmark = (points: Point[], index: number): Point => points[index] ?? { x: 0, y: 0, visibility: 0 };

export default function AITracker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileUrlRef = useRef<string | null>(null);
  const poseRef = useRef<PoseLandmarker | null>(null);
  const objectsRef = useRef<ObjectDetector | null>(null);
  const cancelledRef = useRef(false);
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

  function draw(points: Point[], ball: Point | null, ballConfidence: number) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ff6b2c";
    points.forEach((point) => { context.beginPath(); context.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, Math.PI * 2); context.fill(); });
    if (ball) {
      context.strokeStyle = "#4ade80"; context.lineWidth = 4;
      context.beginPath(); context.arc(ball.x * canvas.width, ball.y * canvas.height, 14, 0, Math.PI * 2); context.stroke();
      context.fillStyle = "#4ade80"; context.font = "16px sans-serif";
      context.fillText(`Ball ${Math.round(ballConfidence * 100)}%`, ball.x * canvas.width + 18, ball.y * canvas.height);
    }
  }

  async function analyze() {
    const video = videoRef.current;
    if (!video || !video.src || !videoReady || !Number.isFinite(video.duration)) {
      setStatus("Wait for the selected video to finish loading."); return;
    }
    cancelledRef.current = false; setRunning(true); setResult(null); setProgress(0);
    try {
      await initializeModels();
      const observations: MotionObservation[] = [];
      const samples = Math.max(1, Math.ceil(video.duration * 1000 / SAMPLE_INTERVAL_MS));
      for (let index = 0; index < samples && !cancelledRef.current; index += 1) {
        const timeMs = Math.min(index * SAMPLE_INTERVAL_MS, Math.floor(video.duration * 1000) - 1);
        await seek(video, timeMs / 1000);
        const poseResult = poseRef.current!.detectForVideo(video, timeMs);
        const objectResult = objectsRef.current!.detectForVideo(video, timeMs);
        const points = (poseResult.landmarks[0] ?? []) as Point[];
        const detection = objectResult.detections
          .filter((item) => item.categories[0]?.categoryName === "sports ball")
          .sort((a, b) => (b.categories[0]?.score ?? 0) - (a.categories[0]?.score ?? 0))[0];
        const box = detection?.boundingBox;
        const ball = box ? { x: (box.originX + box.width / 2) / video.videoWidth, y: (box.originY + box.height / 2) / video.videoHeight } : null;
        const poseConfidence = points.length ? points.reduce((sum, point) => sum + (point.visibility ?? 1), 0) / points.length : 0;
        const ballConfidence = detection?.categories[0]?.score ?? 0;
        observations.push({ timeMs, poseConfidence, ballConfidence, ball, ballSource: ball ? "detected" : "missing",
          leftShoulder: landmark(points, 11), rightShoulder: landmark(points, 12),
          leftWrist: landmark(points, 15), rightWrist: landmark(points, 16), leftHip: landmark(points, 23), rightHip: landmark(points, 24),
          leftKnee: landmark(points, 25), rightKnee: landmark(points, 26) });
        draw(points, ball, ballConfidence);
        setProgress((index + 1) / samples);
      }
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
    <div className="flex flex-wrap items-center gap-3">
      <label className="btn-ghost cursor-pointer">Choose video<input type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" disabled={running} onChange={(event) => selectFile(event.target.files?.[0])} /></label>
      <button className="btn-game" disabled={running || !videoReady} onClick={analyze}>{running ? `Analyzing ${Math.round(progress * 100)}%` : "Analyze clip"}</button>
      {running && <button className="btn-ghost" onClick={() => { cancelledRef.current = true; setStatus("Analysis cancelled."); }}>Cancel</button>}
      <p className="text-sm text-muted">{status}</p>
    </div>
    {running && <div className="h-2 overflow-hidden rounded bg-raised"><div className="h-full bg-game transition-all" style={{ width: `${progress * 100}%` }} /></div>}
    <div className="relative aspect-video overflow-hidden rounded-card bg-raised">
      <video ref={videoRef} controls playsInline preload="auto" onCanPlay={(event) => {
        if (event.currentTarget.duration > MAX_CLIP_SECONDS) {
          setVideoReady(false); setStatus(`Clip is too long. Use a clip up to ${MAX_CLIP_SECONDS} seconds.`); return;
        }
        setVideoReady(true); setStatus("Video ready to analyze.");
      }} onError={() => { setVideoReady(false); setStatus("This browser could not decode the selected video."); }} className="h-full w-full object-contain" />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
    </div>
    {videoReady && <section className="rounded-card border border-line bg-raised p-4">
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
    {result && <section className="rounded-card border border-line bg-raised p-4">
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
