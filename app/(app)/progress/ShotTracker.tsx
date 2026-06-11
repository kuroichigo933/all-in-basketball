"use client";

import { useState, useTransition } from "react";
import CourtChart, { ZONES } from "@/components/CourtChart";
import { logShotSession } from "../actions";

export default function ShotTracker() {
  const [selected, setSelected] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, { makes: number; attempts: number }>>({});
  const [pending, start] = useTransition();
  const [savedFlash, setSavedFlash] = useState(false);

  const zone = ZONES.find((z) => z.id === selected);
  const current = selected ? entries[selected] ?? { makes: 0, attempts: 0 } : null;

  function set(field: "makes" | "attempts", value: number) {
    if (!selected) return;
    setEntries((e) => {
      const cur = e[selected] ?? { makes: 0, attempts: 0 };
      const next = { ...cur, [field]: Math.max(0, value) };
      if (next.makes > next.attempts) {
        if (field === "makes") next.attempts = next.makes; else next.makes = next.attempts;
      }
      return { ...e, [selected]: next };
    });
  }

  function save() {
    const payload = Object.entries(entries)
      .filter(([, v]) => v.attempts > 0)
      .map(([zone, v]) => ({ zone, ...v }));
    if (payload.length === 0) return;
    start(async () => {
      await logShotSession(payload);
      setEntries({}); setSelected(null);
      setSavedFlash(true); setTimeout(() => setSavedFlash(false), 2500);
    });
  }

  const totals = Object.values(entries).reduce(
    (a, v) => ({ makes: a.makes + v.makes, attempts: a.attempts + v.attempts }),
    { makes: 0, attempts: 0 }
  );

  return (
    <div className="card p-5">
      <h2 className="display text-xl">Log a shooting session</h2>
      <p className="mt-1 text-sm text-muted">Tap a spot on the floor, enter your makes and attempts.</p>
      <div className="mt-4 grid gap-5 md:grid-cols-[1.2fr_1fr]">
        <CourtChart selected={selected} onSelect={setSelected} />
        <div>
          {zone && current ? (
            <>
              <p className="font-semibold text-game">{zone.label}</p>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="label" htmlFor="makes">Makes</label>
                  <input id="makes" type="number" min={0} inputMode="numeric" className="input"
                    value={current.makes} onChange={(e) => set("makes", Number(e.target.value))} />
                </div>
                <div>
                  <label className="label" htmlFor="attempts">Attempts</label>
                  <input id="attempts" type="number" min={0} inputMode="numeric" className="input"
                    value={current.attempts} onChange={(e) => set("attempts", Number(e.target.value))} />
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Pick a zone on the court to start.</p>
          )}
          <div className="mt-6 border-t border-line pt-4">
            <p className="text-sm text-muted">
              Session so far: <span className="font-semibold text-chalk">{totals.makes}/{totals.attempts}</span>
            </p>
            <button className="btn-game mt-3 w-full" onClick={save}
              disabled={pending || totals.attempts === 0}>
              {pending ? "Saving…" : "Save session"}
            </button>
            {savedFlash && <p className="mt-2 text-sm font-semibold text-make">Session saved. Streak updated.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
