"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { logWorkout } from "../../../actions";

export type Block = {
  id: string;
  title: string;
  videoUrl: string;
  workSeconds: number;
  restSeconds: number;
  repsLabel: string | null;
  audioCue: string | null;
};

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function CourtMode({ blocks, programId, dayId, dayTitle }: {
  blocks: Block[]; programId: string; dayId: string; dayTitle: string;
}) {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"work" | "rest" | "done">("work");
  const [remaining, setRemaining] = useState(blocks[0]?.workSeconds ?? 0);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const wakeLock = useRef<any>(null);
  const block = blocks[idx];

  // keep the screen on while training
  useEffect(() => {
    if (!started) return;
    async function lock() {
      try { wakeLock.current = await (navigator as any).wakeLock?.request("screen"); } catch {}
    }
    lock();
    const onVis = () => { if (document.visibilityState === "visible") lock(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      wakeLock.current?.release?.();
    };
  }, [started]);

  const advance = useCallback(() => {
    if (phase === "work") {
      if (block.restSeconds > 0 && idx < blocks.length - 1) {
        setPhase("rest");
        setRemaining(block.restSeconds);
        speak(`Rest. ${block.restSeconds} seconds. Next up: ${blocks[idx + 1].title}.`);
      } else if (idx < blocks.length - 1) {
        const n = idx + 1;
        setIdx(n); setPhase("work"); setRemaining(blocks[n].workSeconds);
        speak(blocks[n].audioCue ?? `Next drill: ${blocks[n].title}.`);
      } else {
        setPhase("done");
        speak("That's the workout. Great work. Log it and get some water.");
      }
    } else if (phase === "rest") {
      const n = idx + 1;
      setIdx(n); setPhase("work"); setRemaining(blocks[n].workSeconds);
      speak(blocks[n].audioCue ?? `Go. ${blocks[n].title}.`);
    }
  }, [phase, idx, block, blocks]);

  // countdown
  useEffect(() => {
    if (!started || phase === "done") return;
    const t = setInterval(() => {
      setElapsed((e) => e + 1);
      setRemaining((r) => {
        if (r === 4) speak("3, 2, 1");
        if (r <= 1) { clearInterval(t); advance(); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [started, phase, idx, advance]);

  async function finish() {
    setSaving(true);
    await logWorkout(dayId, elapsed, programId);
    router.push("/dashboard");
  }

  if (!started) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-game">Court Mode</p>
        <h1 className="display mt-2 text-3xl">{dayTitle}</h1>
        <p className="mt-3 text-muted">
          {blocks.length} drills. Prop your phone up where you can see it — voice cues will
          call out every drill and rest so you can keep your hands on the ball.
        </p>
        <button className="btn-game mt-8 w-full"
          onClick={() => { setStarted(true); speak(block.audioCue ?? `First drill: ${block.title}.`); }}>
          Start workout
        </button>
        <ol className="mt-8 space-y-2 text-left">
          {blocks.map((b, i) => (
            <li key={b.id} className="card flex items-center justify-between p-3 text-sm">
              <span>{i + 1}. {b.title}</span>
              <span className="text-muted">{fmt(b.workSeconds)}{b.repsLabel ? ` · ${b.repsLabel}` : ""}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="score text-7xl text-game">{fmt(elapsed)}</p>
        <h1 className="display mt-4 text-3xl">Workout complete</h1>
        <p className="mt-2 text-muted">Log it to keep your streak alive.</p>
        <button className="btn-game mt-8 w-full" onClick={finish} disabled={saving}>
          {saving ? "Logging…" : "Log this workout"}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>Drill {idx + 1} of {blocks.length}</span>
        <span>Total {fmt(elapsed)}</span>
      </div>

      {phase === "work" ? (
        <>
          <video key={block.id} src={block.videoUrl} autoPlay loop muted playsInline
            onContextMenu={(e) => e.preventDefault()}
            className="mt-4 aspect-video w-full rounded-card bg-raised object-cover" />
          <h1 className="display mt-4 text-2xl">{block.title}</h1>
          {block.repsLabel && <p className="text-sm font-semibold text-wood">{block.repsLabel}</p>}
        </>
      ) : (
        <div className="mt-4 flex aspect-video w-full flex-col items-center justify-center rounded-card bg-raised">
          <p className="display text-2xl text-muted">Rest</p>
          <p className="mt-1 text-sm text-muted">Up next: {blocks[idx + 1]?.title}</p>
        </div>
      )}

      <p className={`score mt-6 text-center text-8xl ${phase === "rest" ? "text-wood" : "text-game"}`}>
        {fmt(remaining)}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button className="btn-ghost" onClick={() => setRemaining((r) => r + 30)}>+30 sec</button>
        <button className="btn-game" onClick={() => { setRemaining(0); advance(); }}>
          {phase === "rest" ? "Skip rest" : "Done — next"}
        </button>
      </div>
    </div>
  );
}
