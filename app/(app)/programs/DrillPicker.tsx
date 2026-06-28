"use client";

import { useState } from "react";
import type { DrillCategory, DrillFile } from "@/lib/google-drive";

type QueueItem = DrillFile & { category: string; tier: string };

const TIER_ORDER = ["Beginner", "Intermediate", "Expert"];

export default function DrillPicker({ categories }: { categories: DrillCategory[] }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [playing, setPlaying] = useState<number | null>(null);
  const [openCat, setOpenCat] = useState<string | null>(categories[0]?.category ?? null);

  // Play session options
  const [playMode, setPlayMode] = useState<"continuous" | "break" | null>(null);
  const [showModeSelect, setShowModeSelect] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [checkedItems, setCheckedItems] = useState<{ [index: number]: boolean }>({});

  const handleSetPlaying = (idx: number | null) => {
    setPlaying(idx);
    setShowChecklist(false);
    setCheckedItems({});
  };

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
    const checklistItems = (drill.checklist && drill.checklist.length > 0)
      ? drill.checklist
      : ["Practice " + drill.name];

    const handleVideoEnded = () => {
      if (playMode === "continuous") {
        if (playing < queue.length - 1) {
          handleSetPlaying(playing + 1);
        } else {
          handleSetPlaying(null);
        }
      } else if (playMode === "break") {
        setShowChecklist(true);
        setCheckedItems({});
      }
    };

    const handleCheck = (index: number) => {
      setCheckedItems((prev) => {
        const next = { ...prev, [index]: !prev[index] };
        const allChecked = checklistItems.every((_, idx) => next[idx] === true);
        if (allChecked) {
          setTimeout(() => {
            if (playing !== null) {
              if (playing < queue.length - 1) {
                handleSetPlaying(playing + 1);
              } else {
                handleSetPlaying(null);
              }
            }
          }, 800);
        }
        return next;
      });
    };

    return (
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-game">{drill.category} · {drill.tier}</p>
            <h3 className="display text-xl">{drill.name}</h3>
          </div>
          <span className="text-sm text-muted">{playing + 1} / {queue.length}</span>
        </div>

        {showChecklist ? (
          <div className="my-4 rounded-card border border-game/30 bg-game/5 p-6 animate-in fade-in duration-200">
            <p className="display text-xl text-game mb-1">Practice Checklist</p>
            <p className="text-sm text-muted mb-4">Complete all steps to automatically advance to the next drill.</p>
            <div className="space-y-3">
              {checklistItems.map((item, idx) => {
                const isChecked = !!checkedItems[idx];
                return (
                  <label
                    key={idx}
                    className={`flex items-center gap-3 rounded-card border p-4 cursor-pointer select-none transition-colors
                      ${isChecked 
                        ? "border-make bg-make/10 text-make" 
                        : "border-line bg-raised/50 hover:border-game/50"}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleCheck(idx)}
                      className="h-5 w-5 rounded border-line text-game focus:ring-game"
                    />
                    <span className={`text-base font-medium ${isChecked ? "line-through text-muted" : "text-chalk"}`}>
                      {item}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          <video
            src={drill.videoUrl}
            controls
            autoPlay
            playsInline
            preload="metadata"
            className="w-full rounded-card bg-raised"
            style={{ maxHeight: "60vh" }}
            controlsList="nodownload"
            onContextMenu={(e) => e.preventDefault()}
            onEnded={handleVideoEnded}
          />
        )}

        <div className="mt-4 flex gap-3">
          {playing > 0 && (
            <button className="btn-ghost flex-1 !py-2" onClick={() => handleSetPlaying(playing - 1)}>← Prev</button>
          )}
          {playing < queue.length - 1 ? (
            <button className="btn-game flex-1 !py-2" onClick={() => handleSetPlaying(playing + 1)}>Next →</button>
          ) : (
            <button className="btn-game flex-1 !py-2" onClick={() => handleSetPlaying(null)}>Done ✓</button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {queue.map((d, i) => (
            <button key={d.id} onClick={() => handleSetPlaying(i)}
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
          onClick={() => setShowModeSelect(true)}
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

      {showModeSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="display text-2xl mb-2 text-chalk">Choose Session Mode</h3>
            <p className="text-sm text-muted mb-6">How would you like to practice your chosen drills?</p>
            
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setPlayMode("continuous");
                  setShowModeSelect(false);
                  handleSetPlaying(0);
                }}
                className="w-full text-left rounded-card border border-line p-4 hover:border-game hover:bg-game/5 transition-colors group"
              >
                <p className="font-bold text-chalk group-hover:text-game">Continuous Play</p>
                <p className="text-xs text-muted mt-1">Videos play one after another automatically as soon as they finish.</p>
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setPlayMode("break");
                  setShowModeSelect(false);
                  handleSetPlaying(0);
                }}
                className="w-full text-left rounded-card border border-line p-4 hover:border-game hover:bg-game/5 transition-colors group"
              >
                <p className="font-bold text-chalk group-hover:text-game">Break to Practice Between Videos</p>
                <p className="text-xs text-muted mt-1">Pause after each video to practice the moves shown in the video! Use our recommended list or until you feel comforable.</p>
              </button>
            </div>
            
            <button
              type="button"
              onClick={() => setShowModeSelect(false)}
              className="btn-ghost mt-6 w-full !py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
