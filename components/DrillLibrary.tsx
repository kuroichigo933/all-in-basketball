"use client";

import { useState } from "react";
import type { DrillCategory } from "@/lib/google-drive";
import DrillVideoCard from "@/components/DrillVideoCard";

const TIER_ORDER = ["Beginner", "Intermediate", "Expert"];

function sortTiers<T extends { tier: string }>(tiers: T[]): T[] {
  return [...tiers].sort((a, b) => {
    const ai = TIER_ORDER.indexOf(a.tier);
    const bi = TIER_ORDER.indexOf(b.tier);
    if (ai === -1 && bi === -1) return a.tier.localeCompare(b.tier);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// Collapsible category sections. Drill cards (and their thumbnails) only mount
// when a section is expanded, so the first paint is just the section headers —
// no dozens of image requests up front. The first category starts open.
export default function DrillLibrary({
  categories,
  completedIds,
}: {
  categories: DrillCategory[];
  completedIds: string[];
}) {
  const completed = new Set(completedIds);
  const [open, setOpen] = useState<string | null>(categories[0]?.category ?? null);

  return (
    <div className="space-y-4">
      {categories.map((cat) => {
        const isOpen = open === cat.category;
        const count = cat.tiers.reduce((n, t) => n + t.drills.length, 0);
        return (
          <section key={cat.category} className="card overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : cat.category)}
              className="flex w-full items-center justify-between gap-3 p-5 text-left"
              aria-expanded={isOpen}
            >
              <h2 className="display text-2xl sm:text-3xl">{cat.category}</h2>
              <span className="flex items-center gap-3 text-muted">
                <span className="text-xs uppercase tracking-wider">{count} drill{count === 1 ? "" : "s"}</span>
                <span className="text-sm">{isOpen ? "▲" : "▼"}</span>
              </span>
            </button>

            {isOpen && (
              <div className="space-y-8 border-t border-line p-5">
                {sortTiers(cat.tiers).map(({ tier, drills }) => (
                  <div key={tier}>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-wood">{tier}</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {drills.map((drill) => (
                        <DrillVideoCard
                          key={drill.id}
                          drill={drill}
                          category={cat.category}
                          tier={tier}
                          completed={completed.has(drill.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
