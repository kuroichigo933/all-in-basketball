"use client";

import { useState, useTransition } from "react";
import { addAvailability } from "../actions";

export default function AddSlot() {
  const [when, setWhen] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [pending, start] = useTransition();
  const [added, setAdded] = useState(false);

  return (
    <div className="card mt-4 space-y-3 p-5">
      <div>
        <label className="label" htmlFor="when">Date & time</label>
        <input id="when" type="datetime-local" className="input" value={when}
          onChange={(e) => setWhen(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="mins">Length (minutes)</label>
        <input id="mins" type="number" min={30} step={15} className="input" value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))} />
      </div>
      <button className="btn-game w-full" disabled={pending || !when}
        onClick={() => start(async () => {
          await addAvailability(new Date(when).toISOString(), minutes);
          setWhen(""); setAdded(true); setTimeout(() => setAdded(false), 2000);
        })}>
        {pending ? "Adding…" : "Add open slot"}
      </button>
      {added && <p className="text-sm font-semibold text-make">Slot added.</p>}
    </div>
  );
}
