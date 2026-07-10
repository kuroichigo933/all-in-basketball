"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DrillFile } from "@/lib/google-drive";
import { completeDrillAction } from "@/app/(app)/actions";

export default function DrillVideoCard({
  drill,
  category,
  tier,
  completed,
  locked = false,
}: {
  drill: DrillFile;
  category: string;
  tier: string;
  completed?: boolean;
  locked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [completedState, setCompletedState] = useState(!!completed);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setCompletedState(!!completed);
  }, [completed]);

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
    const isModalOpen = open || showUpgradeModal;
    document.body.style.overflow = isModalOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open, showUpgradeModal]);

  const handleCardClick = () => {
    if (locked) {
      setShowUpgradeModal(true);
    } else {
      setOpen(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleCardClick}
        className="card group w-full overflow-hidden text-left focus-visible:outline-game"
        aria-label={locked ? `Unlock ${drill.name}` : `Play ${drill.name}`}
      >
        {/* Thumbnail — Real thumbnail from Drive, falls back to elegant CSS static design */}
        <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-[#1E2024] to-[#0E0F11] group-hover:from-[#2A2C31] group-hover:to-[#17181B] border-b border-line transition-all">
          {/* Subtle basketball theme background graphic (visible if no thumbnail) */}
          <div className="absolute right-4 bottom-4 opacity-[0.03] text-chalk pointer-events-none group-hover:scale-105 transition-transform duration-300">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-24 h-24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.53c-.26-.81-1-1.4-1.9-1.4h-1v-3c0-.55-.45-1-1-1h-6v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.4z" />
            </svg>
          </div>

          {drill.thumbnailUrl && (
            <img 
              src={drill.thumbnailUrl} 
              alt={drill.name} 
              className="absolute inset-0 w-full h-full object-cover z-0 opacity-80 group-hover:opacity-100 transition-opacity duration-300"
              loading="lazy"
            />
          )}

          {/* Premium/Locked top-right badge */}
          {locked ? (
            <div className="absolute right-3.5 top-3.5 z-20 flex h-6 px-2.5 items-center justify-center rounded-full bg-wood/90 text-[10px] font-bold text-chalk uppercase tracking-wider backdrop-blur-sm shadow-md border border-wood/20">
              Locked
            </div>
          ) : completedState ? (
            <div className="absolute right-3.5 top-3.5 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-make text-asphalt shadow-md">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          ) : null}

          {/* Centered play button / lock overlay */}
          <div className="absolute inset-0 flex items-center justify-center z-10">
            {locked ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-asphalt/80 border border-white/10 backdrop-blur-sm transition-transform duration-150 group-hover:scale-110 group-hover:bg-wood group-hover:text-chalk group-hover:border-wood shadow-lg">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5 text-wood group-hover:text-chalk">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-asphalt/80 border border-white/10 backdrop-blur-sm transition-transform duration-150 group-hover:scale-110 group-hover:bg-game group-hover:text-asphalt group-hover:border-game shadow-lg">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 translate-x-[1px]">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            )}
          </div>
        </div>
        <div className="p-3 flex items-start justify-between gap-2">
          <p className="font-semibold leading-snug text-chalk group-hover:text-game transition-colors">{drill.name}</p>
          {completedState && !locked && (
            <span className="text-make shrink-0" title="Completed">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </span>
          )}
        </div>
      </button>

      {/* Video Playback Modal */}
      {open && !locked && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-asphalt/95 p-4 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-3xl">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-game">{category} · {tier}</p>
                <div className="flex items-center gap-2">
                  <h2 className="display mt-0.5 text-2xl">{drill.name}</h2>
                  {completedState && (
                    <span className="text-make shrink-0" title="Completed">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-5 w-5">
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
              controlsList="nodownload"
              onContextMenu={(e) => e.preventDefault()}
              onEnded={async () => {
                setCompletedState(true);
                await completeDrillAction(drill.id);
              }}
            />
          </div>
        </div>
      )}

      {/* Premium Upgrade Modal */}
      {showUpgradeModal && locked && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-asphalt/95 p-4 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setShowUpgradeModal(false); }}
        >
          <div className="w-full max-w-md card p-6 text-center border-game relative">
            <button
              type="button"
              onClick={() => setShowUpgradeModal(false)}
              className="absolute right-4 top-4 rounded-full border border-line p-1.5 text-muted hover:border-game hover:text-game"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-wood/10 border border-wood/30 mb-4 text-wood">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-6 w-6">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h2 className="display text-2xl mb-2">Unlock Full Access</h2>
            <p className="text-sm text-muted mb-6 leading-relaxed">
              &ldquo;{drill.name}&rdquo; is exclusive to premium members. Upgrade your account to unlock our entire library of over 100+ drills, full training programs, and direct coach film feedback!
            </p>
            <div className="flex flex-col gap-2">
              <Link href="/pricing" className="btn-game w-full text-center py-2.5">
                View Pricing &amp; Start Free Trial
              </Link>
              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="btn-ghost w-full py-2"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}