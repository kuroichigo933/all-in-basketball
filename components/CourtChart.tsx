"use client";

// Half-court shot chart. Interactive mode: tap a zone to select it.
// Display mode: zones are heat-colored by shooting percentage.

export const ZONES: { id: string; label: string; d: string; lx: number; ly: number }[] = [
  { id: "corner3_l", label: "Left corner 3", d: "M10 10 H70 V150 H10 Z", lx: 40, ly: 85 },
  { id: "corner3_r", label: "Right corner 3", d: "M430 10 H490 V150 H430 Z", lx: 460, ly: 85 },
  { id: "wing3_l", label: "Left wing 3", d: "M10 150 H70 L70 230 Q110 330 180 360 L150 420 Q40 360 10 230 Z", lx: 85, ly: 290 },
  { id: "wing3_r", label: "Right wing 3", d: "M490 150 H430 L430 230 Q390 330 320 360 L350 420 Q460 360 490 230 Z", lx: 415, ly: 290 },
  { id: "top3", label: "Top of the key 3", d: "M180 360 Q250 385 320 360 L350 420 Q250 455 150 420 Z", lx: 250, ly: 405 },
  { id: "midrange_l", label: "Left midrange", d: "M70 10 H170 V230 Q120 220 70 230 Z", lx: 120, ly: 130 },
  { id: "midrange_r", label: "Right midrange", d: "M330 10 H430 V230 Q380 220 330 230 Z", lx: 380, ly: 130 },
  { id: "elbow_l", label: "Left elbow", d: "M70 230 Q120 220 170 230 L170 300 Q120 330 95 300 Z", lx: 128, ly: 268 },
  { id: "elbow_r", label: "Right elbow", d: "M430 230 Q380 220 330 230 L330 300 Q380 330 405 300 Z", lx: 372, ly: 268 },
  { id: "freethrow", label: "Free throw", d: "M170 230 H330 V300 Q250 345 170 300 Z", lx: 250, ly: 275 },
  { id: "paint", label: "Paint", d: "M170 10 H330 V230 H170 Z", lx: 250, ly: 120 },
];

export type ZoneStats = Record<string, { makes: number; attempts: number }>;

function heat(pct: number | null) {
  if (pct === null) return "#1E2024";
  if (pct >= 0.5) return "#7BD88F";
  if (pct >= 0.35) return "#D7A36A";
  return "#B23E0F";
}

export default function CourtChart({
  stats = {},
  selected,
  onSelect,
}: {
  stats?: ZoneStats;
  selected?: string | null;
  onSelect?: (zoneId: string) => void;
}) {
  const interactive = !!onSelect;
  return (
    <svg viewBox="0 0 500 470" className="w-full" role={interactive ? "group" : "img"}
      aria-label="Half-court shot chart">
      <rect x="0" y="0" width="500" height="470" fill="#101214" rx="14" />
      {ZONES.map((z) => {
        const s = stats[z.id];
        const pct = s && s.attempts > 0 ? s.makes / s.attempts : null;
        const isSel = selected === z.id;
        return (
          <g key={z.id}>
            <path
              d={z.d}
              fill={interactive ? (isSel ? "#FF5C1A" : "#1E2024") : heat(pct)}
              fillOpacity={interactive ? 1 : pct === null ? 1 : 0.85}
              stroke={isSel ? "#FF5C1A" : "#2A2C31"}
              strokeWidth="2"
              className={interactive ? "cursor-pointer transition-opacity hover:opacity-80" : ""}
              onClick={interactive ? () => onSelect!(z.id) : undefined}
              role={interactive ? "button" : undefined}
              aria-label={z.label}
              tabIndex={interactive ? 0 : undefined}
              onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") onSelect!(z.id); } : undefined}
            />
            {!interactive && s && s.attempts > 0 && (
              <text x={z.lx} y={z.ly} textAnchor="middle" fill="#0E0F11" fontSize="15" fontWeight="700">
                {Math.round((s.makes / s.attempts) * 100)}%
              </text>
            )}
          </g>
        );
      })}
      {/* court lines on top */}
      <g stroke="#F4F2ED" strokeOpacity="0.35" strokeWidth="2.5" fill="none">
        <rect x="170" y="10" width="160" height="220" />
        <circle cx="250" cy="230" r="58" />
        <path d="M70 10 V230 Q250 470 430 230 V10" />
        <circle cx="250" cy="48" r="9" fill="#FF5C1A" stroke="none" />
      </g>
    </svg>
  );
}
