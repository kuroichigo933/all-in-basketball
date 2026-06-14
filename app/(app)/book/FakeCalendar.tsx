"use client";

import { useMemo, useState } from "react";

type SessionType = { id: string; title: string; description: string; duration_minutes: number; price_cents: number };

const SAMPLE_TYPES: SessionType[] = [
  { id: "private", title: "Private 1-on-1", description: "60 min with Coach Sanar. Built around your goals.", duration_minutes: 60, price_cents: 7000 },
  { id: "small", title: "Small group (2–3)", description: "60 min. Bring a friend, split the cost.", duration_minutes: 60, price_cents: 5000 },
  { id: "skills", title: "Skills clinic", description: "75 min group session. Shooting one week, handles the next.", duration_minutes: 75, price_cents: 3500 },
];

// Fixed demo data — slot times per day-of-month within the current month
// is computed deterministically so the UI is the same every render.
const SLOT_TEMPLATES: Record<number, string[]> = {
  // day-of-week (0 = Sun) → list of times
  0: [], // Sunday off
  1: ["4:00 PM", "5:00 PM", "6:30 PM"],
  2: ["5:00 PM", "6:00 PM", "7:00 PM"],
  3: ["4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM"],
  4: ["5:00 PM", "6:00 PM"],
  5: ["4:00 PM", "5:30 PM"],
  6: ["9:00 AM", "10:00 AM", "11:00 AM", "12:30 PM"],
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function fmtMonth(d: Date) {
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

export default function FakeCalendar({ today }: { today: string }) {
  const todayDate = useMemo(() => new Date(today), [today]);
  const [cursor, setCursor] = useState(() => startOfMonth(todayDate));
  const [typeId, setTypeId] = useState<string>(SAMPLE_TYPES[0].id);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ day: number; time: string; type: string } | null>(null);

  const monthStart = cursor;
  const firstWeekday = monthStart.getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const isCurrentMonth =
    cursor.getMonth() === todayDate.getMonth() && cursor.getFullYear() === todayDate.getFullYear();
  const minDay = isCurrentMonth ? todayDate.getDate() : 1;
  const isPastMonth =
    cursor.getFullYear() < todayDate.getFullYear() ||
    (cursor.getFullYear() === todayDate.getFullYear() && cursor.getMonth() < todayDate.getMonth());

  function slotsFor(day: number): string[] {
    const d = new Date(cursor.getFullYear(), cursor.getMonth(), day);
    return SLOT_TEMPLATES[d.getDay()] ?? [];
  }

  function selectDay(day: number) {
    if (day < minDay) return;
    if (slotsFor(day).length === 0) return;
    setSelectedDay(day);
    setSelectedTime(null);
    setConfirmed(null);
  }

  function request() {
    if (selectedDay == null || !selectedTime) return;
    const t = SAMPLE_TYPES.find((s) => s.id === typeId)!;
    setConfirmed({ day: selectedDay, time: selectedTime, type: t.title });
  }

  const days: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const selectedType = SAMPLE_TYPES.find((t) => t.id === typeId);
  const slots = selectedDay != null ? slotsFor(selectedDay) : [];

  return (
    <div>
      {/* Session type */}
      <div className="grid gap-3 sm:grid-cols-3">
        {SAMPLE_TYPES.map((t) => (
          <button key={t.id} onClick={() => setTypeId(t.id)} type="button"
            className={`card p-4 text-left ${typeId === t.id ? "border-game" : "hover:border-muted"}`}>
            <p className="font-semibold">{t.title}</p>
            <p className="mt-1 text-xs text-muted">{t.description}</p>
            <p className="score mt-2 text-xl text-game">${(t.price_cents / 100).toFixed(0)}</p>
            <p className="text-xs text-muted">{t.duration_minutes} min</p>
          </button>
        ))}
      </div>

      {/* Calendar header */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="display text-xl">{fmtMonth(cursor)}</h2>
        <div className="flex gap-2">
          <button type="button" disabled={isPastMonth || isCurrentMonth}
            onClick={() => setCursor((c) => addMonths(c, -1))}
            className="rounded-card border border-line px-3 py-1.5 text-sm text-muted hover:text-chalk disabled:opacity-40 disabled:hover:text-muted"
            aria-label="Previous month">←</button>
          <button type="button" onClick={() => setCursor((c) => addMonths(c, 1))}
            className="rounded-card border border-line px-3 py-1.5 text-sm text-muted hover:text-chalk"
            aria-label="Next month">→</button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wider text-muted sm:text-xs">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="py-1">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          if (d == null) return <div key={`e${i}`} className="aspect-square" />;
          const open = slotsFor(d);
          const past = d < minDay;
          const isToday = isCurrentMonth && d === todayDate.getDate();
          const isSelected = selectedDay === d;
          const hasSlots = open.length > 0 && !past;
          return (
            <button key={d} type="button" onClick={() => selectDay(d)}
              disabled={!hasSlots}
              className={`relative aspect-square rounded-card border text-sm transition-colors
                ${isSelected ? "border-game bg-game/15 text-game" :
                  hasSlots ? "border-line bg-surface text-chalk hover:border-game" :
                  "border-transparent bg-transparent text-muted/50"}
                ${isToday && !isSelected ? "ring-1 ring-wood" : ""}
              `}>
              <span className="absolute left-1.5 top-1 text-[11px] font-semibold sm:text-xs">{d}</span>
              {hasSlots && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-semibold uppercase tracking-wider text-make sm:text-[10px]">
                  {open.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        <span className="font-semibold text-make">Green</span> number = open slots that day. Sundays are closed.
      </p>

      {/* Slot picker */}
      {selectedDay && (
        <div className="mt-6">
          <h3 className="display text-lg">
            {new Date(cursor.getFullYear(), cursor.getMonth(), selectedDay).toLocaleDateString(undefined, {
              weekday: "long", month: "long", day: "numeric",
            })}
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {slots.map((t) => (
              <button key={t} type="button" onClick={() => setSelectedTime(t)}
                className={`card p-3 text-sm font-semibold ${selectedTime === t ? "border-game text-game" : "text-muted hover:text-chalk"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Confirm */}
      <button type="button" onClick={request}
        disabled={selectedDay == null || !selectedTime}
        className="btn-game mt-6 w-full">
        Request {selectedType?.title ?? "session"}
        {selectedTime && selectedDay != null
          ? ` — ${new Date(cursor.getFullYear(), cursor.getMonth(), selectedDay).toLocaleDateString(undefined, { month: "short", day: "numeric" })} at ${selectedTime}`
          : ""}
      </button>

      {confirmed && (
        <p className="mt-3 text-center text-sm font-semibold text-make">
          Requested {confirmed.type} for{" "}
          {new Date(cursor.getFullYear(), cursor.getMonth(), confirmed.day).toLocaleDateString(undefined, {
            weekday: "short", month: "short", day: "numeric",
          })}{" "}at {confirmed.time}. We&apos;ll confirm shortly.
        </p>
      )}
    </div>
  );
}
