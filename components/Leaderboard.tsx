"use client";

import { useState } from "react";

export type LeaderboardItem = {
  name: string;
  currentStreak: number;
  longestStreak: number;
  isCurrentUser: boolean;
};

export default function Leaderboard({ items }: { items: LeaderboardItem[] }) {
  const [activeTab, setActiveTab] = useState<"current" | "longest">("current");

  // Format full name into "First Name + Last Initial." (e.g. "Luqman C.")
  function formatName(fullName: string) {
    if (!fullName) return "Hooper";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    const first = parts[0];
    const lastInitial = parts[parts.length - 1][0];
    return `${first} ${lastInitial.toUpperCase()}.`;
  }

  // Sort and filter top 10
  const sortedItems = [...items]
    .sort((a, b) => {
      if (activeTab === "current") {
        return b.currentStreak - a.currentStreak;
      } else {
        return b.longestStreak - a.longestStreak;
      }
    })
    .slice(0, 10);

  return (
    <div className="card p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4 mb-4">
        <div>
          <h2 className="display text-xl sm:text-2xl">Global Leaderboard</h2>
          <p className="text-xs text-muted mt-1">See how you rank against the community</p>
        </div>
        <div className="flex bg-raised rounded-lg p-1 border border-line shrink-0 max-w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("current")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === "current"
                ? "bg-game text-asphalt shadow"
                : "text-muted hover:text-chalk"
            }`}
          >
            Current Streak
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("longest")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === "longest"
                ? "bg-game text-asphalt shadow"
                : "text-muted hover:text-chalk"
            }`}
          >
            Best Streak
          </button>
        </div>
      </div>

      {sortedItems.length === 0 ? (
        <p className="text-sm text-muted text-center py-4">No streak data available yet.</p>
      ) : (
        <div className="divide-y divide-line">
          {sortedItems.map((item, index) => (
            <div
              key={`${item.name}-${index}`}
              className={`flex items-center justify-between py-3 px-2 rounded-lg transition-colors ${
                item.isCurrentUser ? "bg-game/10 border border-game/20" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`score text-sm font-bold w-5 text-center ${
                  index === 0 ? "text-wood text-lg" : index === 1 ? "text-muted text-base" : index === 2 ? "text-gamedim" : "text-muted"
                }`}>
                  {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}`}
                </span>
                <div>
                  <span className={`font-semibold ${item.isCurrentUser ? "text-game" : "text-chalk"}`}>
                    {formatName(item.name)}
                  </span>
                  {item.isCurrentUser && (
                    <span className="ml-2 text-[10px] uppercase font-bold tracking-wider bg-game/20 text-game px-1.5 py-0.5 rounded">
                      You
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 score font-bold text-lg text-chalk">
                <span>{activeTab === "current" ? item.currentStreak : item.longestStreak}</span>
                <span className="text-sm text-muted font-normal">
                  {activeTab === "current" ? "days" : "days max"}
                </span>
                <span className="text-sm">🔥</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}