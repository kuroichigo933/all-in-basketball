"use client";

import { useState } from "react";
import type { DrillCategory } from "@/lib/google-drive";
import DrillVideoCard from "@/components/DrillVideoCard";
import { isAllowedFreeDrill } from "@/lib/tiers";

// Order tiers Beginner → Intermediate → Advanced/Expert, tolerant of casing and
// stray whitespace in the Drive folder names (e.g. "Beginner ").
const TIER_ORDER = ["beginner", "intermediate", "advanced", "expert"];
function tierRank(tier: string): number {
  const i = TIER_ORDER.indexOf(tier.trim().toLowerCase());
  return i === -1 ? TIER_ORDER.length : i;
}

function sortTiers<T extends { tier: string }>(tiers: T[]): T[] {
  return [...tiers].sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.tier.localeCompare(b.tier));
}

// Collapsible category sections. Drill cards (and their thumbnails) only mount
// when a section is expanded, so the first paint is just the section headers —
// no dozens of image requests up front. The first category starts open.
export default function DrillLibrary({
  categories,
  completedIds,
  userTier,
}: {
  categories: DrillCategory[];
  completedIds: string[];
  userTier: string;
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
                      {drills.map((drill) => {
                        const isLocked = userTier === "free" && !isAllowedFreeDrill(drill.name);
                        return (
                          <DrillVideoCard
                            key={drill.id}
                            drill={drill}
                            category={cat.category}
                            tier={tier}
                            completed={completed.has(drill.id)}
                            locked={isLocked}
                          />
                        );
                      })}
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
