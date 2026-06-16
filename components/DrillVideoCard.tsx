"use client";

import { useEffect, useRef, useState } from "react";
import type { DrillFile } from "@/lib/google-drive";

export default function DrillVideoCard({ drill, category, tier }: {
  drill: DrillFile;
  category: string;
  tier: string;
}) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (open) {
      videoRef.current?.play().catch(() => {});
    } else {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card group w-full overflow-hidden text-left focus-visible:outline-game"
        aria-label={`Play ${drill.name}`}
      >
        {/* Thumbnail — first frame via preload="metadata" */}
        <div className="relative aspect-video w-full overflow-hidden bg-raised">
          <video
            src={drill.videoUrl}
            preload="metadata"
            muted
            playsInline
            className="h-full w-full object-cover"
            tabIndex={-1}
          />
          {/* Play button overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-asphalt/20 transition-colors group-hover:bg-asphalt/10">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-asphalt/70 ring-2 ring-white/20 backdrop-blur-sm transition-transform duration-150 group-hover:scale-110 group-active:scale-95">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 translate-x-[2px] text-chalk">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>
        <div className="p-3">
          <p className="font-semibold leading-snug">{drill.name}</p>
        </div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-asphalt/95 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-3xl">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-game">{category} · {tier}</p>
                <h2 className="display mt-0.5 text-2xl">{drill.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-none rounded-full border border-line p-2 text-muted hover:border-game hover:text-game"
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <video
              ref={videoRef}
              src={drill.videoUrl}
              controls
              playsInline
              preload="metadata"
              className="w-full rounded-card bg-raised"
              style={{ maxHeight: "70vh" }}
            />
          </div>
        </div>
      )}
    </>
  );
}
