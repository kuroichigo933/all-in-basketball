"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SampleProgram } from "@/lib/sample-programs";

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}

const WORK_SECONDS = 12 * 60; // 12 min per drill

export default function SamplePlayer({ program }: { program: SampleProgram }) {
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [idx, setIdx] = useState(0);
  const [remaining, setRemaining] = useState(WORK_SECONDS);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const wakeLock = useRef<any>(null);

  const drill = program.drills[idx];

  useEffect(() => {
    if (!started || done) return;
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
  }, [started, done]);

  const next = useCallback(() => {
    if (idx >= program.drills.length - 1) {
      setDone(true);
      speak("Session complete. Great work.");
      return;
    }
    const n = idx + 1;
    setIdx(n);
    setRemaining(WORK_SECONDS);
    speak(`Next drill: ${program.drills[n].title}.`);
  }, [idx, program.drills]);

  useEffect(() => {
    if (!started || done || paused) return;
    const t = setInterval(() => {
      setElapsed((e) => e + 1);
      setRemaining((r) => {
        if (r === 4) speak("3, 2, 1");
        if (r <= 1) { clearInterval(t); next(); return WORK_SECONDS; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [started, done, paused, idx, next]);

  if (!started) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <Link href={`/samples/${program.id}`} className="text-sm text-muted hover:text-game">← Back to drills</Link>
        <p className="mt-4 text-xs uppercase tracking-[0.2em] text-game">Demo Practice</p>
        <h1 className="display mt-2 text-3xl">{program.title}</h1>
        <p className="mt-3 text-muted">
          5 drills · 12 minutes each · 60 minutes total. Prop your phone up where you can see it —
          we&apos;ll call out each drill so you can keep your hands on the ball.
        </p>
        <button
          className="btn-game mt-8 w-full"
          onClick={() => { setStarted(true); speak(`First drill: ${program.drills[0].title}.`); }}
        >
          Start practice
        </button>
        <ol className="mt-8 space-y-2 text-left">
          {program.drills.map((d, i) => (
            <li key={i} className="card flex items-center justify-between gap-3 p-3 text-sm">
              <span className="truncate">{i + 1}. {d.title}</span>
              <span className="flex-none text-muted">12:00</span>
            </li>
          ))}
        </ol>
      </main>
    );
  }

  if (done) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="score text-6xl text-game sm:text-7xl">{fmt(elapsed)}</p>
        <h1 className="display mt-4 text-3xl">Practice complete</h1>
        <p className="mt-2 text-muted">Nice work. Hydrate, then go put it in the game.</p>
        <div className="mt-8 flex flex-col gap-3">
          <Link href={`/samples/${program.id}`} className="btn-game">Back to drills</Link>
          <Link href="/dashboard" className="btn-ghost">Home</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted">
        <span>Drill {idx + 1} of {program.drills.length}</span>
        <span>Total {fmt(elapsed)}</span>
      </div>

      <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-card bg-raised">
        <Image src={drill.image} alt={drill.title} fill sizes="(max-width: 768px) 100vw, 700px"
          className="object-cover" />
      </div>

      <h1 className="display mt-4 text-2xl">{drill.title}</h1>
      <p className="mt-1 text-sm text-muted">{drill.description}</p>
      <p className="mt-2 text-sm font-semibold text-game">Coach&apos;s cue: <span className="text-chalk">{drill.cue}</span></p>

      <p className="score mt-6 text-center text-7xl text-game sm:text-8xl">{fmt(remaining)}</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button className="btn-ghost" onClick={() => setPaused((p) => !p)}>
          {paused ? "Resume" : "Pause"}
        </button>
        <button className="btn-game" onClick={() => { setRemaining(WORK_SECONDS); next(); }}>
          {idx === program.drills.length - 1 ? "Finish" : "Done — next"}
        </button>
      </div>
    </main>
  );
}
