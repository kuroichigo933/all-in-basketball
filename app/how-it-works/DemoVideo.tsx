"use client";

import { useRef, useState } from "react";

// Portrait demo clip with an obvious play button that disappears once playing.
export default function DemoVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  return (
    <div className="relative inline-block">
      <video
        ref={ref}
        src="/demo.mp4"
        controls
        playsInline
        preload="metadata"
        onPlay={() => setStarted(true)}
        className="max-h-[62vh] w-auto rounded-card border border-line bg-black shadow-2xl"
      />
      {!started && (
        <button
          type="button"
          aria-label="Play video"
          onClick={() => ref.current?.play()}
          className="absolute inset-0 flex items-center justify-center rounded-card bg-black/20"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-asphalt/80 text-chalk shadow-lg backdrop-blur-sm transition-transform hover:scale-110 hover:border-game hover:bg-game hover:text-asphalt">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 translate-x-[2px]">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}
