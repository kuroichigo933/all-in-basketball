"use client";

import { useEffect, useRef, useState } from "react";
import { FilesetResolver, ObjectDetector, PoseLandmarker } from "@mediapipe/tasks-vision";

export default function AITracker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isInitializing, setIsInitializing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("Ready to start");
  
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const objectDetectorRef = useRef<ObjectDetector | null>(null);
  const reqFrameRef = useRef<number>(0);
  const lastVideoTimeRef = useRef(-1);

  async function startCamera() {
    setIsInitializing(true);
    setStatus("Loading AI models (this may take a few seconds)...");
    
    try {
      // 1. Initialize MediaPipe Vision Tasks
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      
      // 2. Load Pose Landmarker
      const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numPoses: 1
      });
      poseLandmarkerRef.current = poseLandmarker;

      // 3. Load Object Detector (for the ball)
      const objectDetector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
          delegate: "GPU"
        },
        scoreThreshold: 0.5,
        runningMode: "VIDEO"
      });
      objectDetectorRef.current = objectDetector;

      // 4. Request Webcam Access
      setStatus("Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "environment" }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => {
          setIsInitializing(false);
          setIsRunning(true);
          setStatus("AI Tracking Active");
          predictWebcam();
        };
      }
    } catch (err: any) {
      setIsInitializing(false);
      setStatus("Error: " + err.message);
      console.error(err);
    }
  }

  function stopCamera() {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    cancelAnimationFrame(reqFrameRef.current);
    setIsRunning(false);
    setStatus("Camera stopped");
  }

  function predictWebcam() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !poseLandmarkerRef.current || !objectDetectorRef.current) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      let startTimeMs = performance.now();
      
      // Predict Pose
      const poseResult = poseLandmarkerRef.current.detectForVideo(video, startTimeMs);
      
      // Predict Objects (Looking for 'sports ball')
      const objectResult = objectDetectorRef.current.detectForVideo(video, startTimeMs);

      // Render
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw Poses
      if (poseResult.landmarks) {
        for (const landmark of poseResult.landmarks) {
          // Draw skeleton points
          ctx.fillStyle = "#FF5722"; // Game Color
          for (const point of landmark) {
            ctx.beginPath();
            ctx.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }

      // Draw Balls
      if (objectResult.detections) {
        for (const detection of objectResult.detections) {
          const cat = detection.categories[0];
          if (cat.categoryName === "sports ball") {
            const bb = detection.boundingBox;
            if (bb) {
              ctx.strokeStyle = "#4CAF50"; // Green for ball
              ctx.lineWidth = 4;
              ctx.strokeRect(bb.originX, bb.originY, bb.width, bb.height);
              ctx.fillStyle = "#4CAF50";
              ctx.font = "16px sans-serif";
              ctx.fillText(`Ball ${Math.round(cat.score * 100)}%`, bb.originX, bb.originY - 10);
            }
          }
        }
      }
      ctx.restore();
    }

    reqFrameRef.current = requestAnimationFrame(predictWebcam);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCamera();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={`font-semibold ${isRunning ? "text-make" : "text-muted"}`}>{status}</p>
        {!isRunning ? (
          <button onClick={startCamera} disabled={isInitializing} className="btn-game">
            {isInitializing ? "Loading..." : "Start Camera"}
          </button>
        ) : (
          <button onClick={stopCamera} className="btn-ghost">
            Stop
          </button>
        )}
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-card bg-raised">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          className="absolute inset-0 h-full w-full object-cover"
        />
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 h-full w-full object-cover"
          style={{ zIndex: 10 }}
        />
        {!isRunning && !isInitializing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-muted">Camera is off</p>
          </div>
        )}
      </div>
      
      {isRunning && (
        <div className="rounded-card border border-line bg-surface p-4 text-sm text-muted">
          <p><strong>Note:</strong> The AI is looking for your skeletal structure (orange dots) and objects categorized as "sports ball" (green box).</p>
        </div>
      )}
    </div>
  );
}
