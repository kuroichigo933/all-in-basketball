"use client";

import { useEffect, useRef, useState } from "react";
import { completeDrillAction } from "@/app/(app)/actions";

export type RecommendedDrill = {
  id: string;
  name: string;
  videoUrl: string;
  category: string;
  tier: string;
};

export default function JumpBackInCard({
  drill,
  type,
}: {
  drill: RecommendedDrill;
  type: "next" | "oldest" | "first";
}) {
  const [open, setOpen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Sync completion state if drill changes
  useEffect(() => {
    setCompleted(false);
  }, [drill]);

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
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const typeLabels = {
    next: "Up Next",
    oldest: "Personalized (Haven't watched in a while)",
    first: "Get Started",
  };

  return (
    <>
      <div className="card bg-gradient-to-br from-surface to-raised border-line p-6 relative overflow-hidden group">
        <div className="absolute right-0 bottom-0 translate-x-10 translate-y-10 opacity-5 pointer-events-none transition-transform duration-300 group-hover:scale-110">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-48 h-48 text-chalk">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.53c-.26-.81-1-1.4-1.9-1.4h-1v-3c0-.55-.45-1-1-1h-6v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.4z" />
          </svg>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-game/15 text-game border border-game/10">
              ⚡ {typeLabels[type]}
            </span>
            <h2 className="display text-2xl sm:text-3xl text-chalk leading-tight group-hover:text-game transition-colors">
              {drill.name}
            </h2>
            <p className="text-sm text-muted">
              Category: <span className="text-chalk font-semibold">{drill.category}</span> · Level:{" "}
              <span className="text-wood font-semibold">{drill.tier}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn btn-game font-semibold flex items-center justify-center gap-2 px-6 py-3.5 self-start md:self-auto shrink-0 shadow-lg shadow-game/10 hover:shadow-game/20 active:scale-95 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M8 5v14l11-7z" />
            </svg>
            Play Video
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-asphalt/95 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-3xl">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-game">
                  {drill.category} · {drill.tier}
                </p>
                <div className="flex items-center gap-2">
                  <h2 className="display mt-0.5 text-2xl">{drill.name}</h2>
                  {(completed) && (
                    <span className="text-make shrink-0" title="Completed">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="h-5 w-5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-none rounded-full border border-line p-2 text-muted hover:border-game hover:text-game"
                aria-label="Close"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4"
                >
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
              controlsList="nodownload"
              onContextMenu={(e) => e.preventDefault()}
              onEnded={async () => {
                setCompleted(true);
                await completeDrillAction(drill.id);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}