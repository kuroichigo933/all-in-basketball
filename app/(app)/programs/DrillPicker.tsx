"use client";

import { useState } from "react";
import type { DrillCategory, DrillFile } from "@/lib/google-drive";

type QueueItem = DrillFile & { category: string; tier: string };

const TIER_ORDER = ["Beginner", "Intermediate", "Expert"];

export default function DrillPicker({ categories }: { categories: DrillCategory[] }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [playing, setPlaying] = useState<number | null>(null);
  const [openCat, setOpenCat] = useState<string | null>(categories[0]?.category ?? null);

  function toggle(drill: DrillFile, category: string, tier: string) {
    setQueue((q) => {
      const idx = q.findIndex((x) => x.id === drill.id);
      if (idx !== -1) return q.filter((_, i) => i !== idx);
      return [...q, { ...drill, category, tier }];
    });
  }

  function move(idx: number, dir: -1 | 1) {
    setQueue((q) => {
      const next = [...q];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return next;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  if (playing !== null) {
    const drill = queue[playing];
    return (
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-game">{drill.category} · {drill.tier}</p>
            <h3 className="display text-xl">{drill.name}</h3>
          </div>
          <span className="text-sm text-muted">{playing + 1} / {queue.length}</span>
        </div>
        <div className="aspect-video w-full overflow-hidden rounded-card bg-raised">
          <iframe src={drill.embedUrl} allow="autoplay" className="h-full w-full" title={drill.name} />
        </div>
        <div className="mt-4 flex gap-3">
          {playing > 0 && (
            <button className="btn-ghost flex-1 !py-2" onClick={() => setPlaying((p) => (p ?? 0) - 1)}>← Prev</button>
          )}
          {playing < queue.length - 1 ? (
            <button className="btn-game flex-1 !py-2" onClick={() => setPlaying((p) => (p ?? 0) + 1)}>Next →</button>
          ) : (
            <button className="btn-game flex-1 !py-2" onClick={() => setPlaying(null)}>Done ✓</button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {queue.map((d, i) => (
            <button key={d.id} onClick={() => setPlaying(i)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors
                ${i === playing ? "border-game text-game" : "border-line text-muted hover:border-game"}`}>
              {i + 1}. {d.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      {/* Drill selector */}
      <div className="space-y-2">
        {categories.map((cat) => {
          const isOpen = openCat === cat.category;
          return (
            <div key={cat.category} className="card overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenCat(isOpen ? null : cat.category)}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <span className="display text-lg">{cat.category}</span>
                <span className="text-muted">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="border-t border-line px-4 pb-4 pt-3 space-y-4">
                  {TIER_ORDER
                    .filter((t) => cat.tiers.some((ti) => ti.tier === t))
                    .concat(cat.tiers.filter((t) => !TIER_ORDER.includes(t.tier)).map((t) => t.tier))
                    .map((tierName) => {
                      const tierData = cat.tiers.find((t) => t.tier === tierName);
                      if (!tierData) return null;
                      return (
                        <div key={tierName}>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-wood">{tierName}</p>
                          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {tierData.drills.map((drill) => {
                              const inQueue = queue.some((q) => q.id === drill.id);
                              return (
                                <button
                                  key={drill.id}
                                  type="button"
                                  onClick={() => toggle(drill, cat.category, tierName)}
                                  className={`flex items-center justify-between gap-2 rounded-card border px-3 py-2 text-left text-sm transition-colors
                                    ${inQueue
                                      ? "border-game bg-game/10 text-game"
                                      : "border-line text-chalk hover:border-game"}`}
                                >
                                  <span className="truncate">{drill.name}</span>
                                  <span className="flex-none text-xs">{inQueue ? "✓" : "+"}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Queue */}
      <div className="card p-4 h-fit sticky top-20">
        <p className="display text-lg">Your session</p>
        {queue.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Pick drills on the left to add them here.</p>
        ) : (
          <ol className="mt-3 space-y-1.5">
            {queue.map((d, i) => (
              <li key={d.id} className="flex items-center gap-2 rounded-card border border-line px-2.5 py-2 text-sm">
                <span className="score w-5 flex-none text-center text-xs text-muted">{i + 1}</span>
                <span className="flex-1 truncate">{d.name}</span>
                <div className="flex gap-1 flex-none">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                    className="text-xs text-muted hover:text-chalk disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === queue.length - 1}
                    className="text-xs text-muted hover:text-chalk disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => toggle(d, d.category, d.tier)}
                    className="text-xs text-muted hover:text-game">✕</button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <button
          type="button"
          className="btn-game mt-4 w-full"
          disabled={queue.length === 0}
          onClick={() => setPlaying(0)}
        >
          Start session ({queue.length} drill{queue.length !== 1 ? "s" : ""})
        </button>
        {queue.length > 0 && (
          <button type="button" onClick={() => setQueue([])}
            className="mt-2 w-full text-center text-xs text-muted hover:text-game">
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
