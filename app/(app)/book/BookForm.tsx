"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestBooking } from "../actions";

type SessionType = { id: string; title: string; description: string; duration_minutes: number; price_cents: number };
type Slot = { id: string; starts_at: string };

export default function BookForm({ types, slots }: { types: SessionType[]; slots: Slot[] }) {
  const router = useRouter();
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [slotId, setSlotId] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  function submit() {
    start(async () => {
      const res = await requestBooking(slotId, typeId, note);
      if (res?.error) { setMsg(res.error); return; }
      setMsg("Requested. We'll confirm shortly.");
      setSlotId(""); setNote("");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        {types.map((t) => (
          <button key={t.id} onClick={() => setTypeId(t.id)}
            className={`card p-4 text-left ${typeId === t.id ? "border-game" : "hover:border-muted"}`}>
            <p className="font-semibold">{t.title}</p>
            <p className="mt-1 text-xs text-muted">{t.description}</p>
            <p className="score mt-2 text-xl text-game">${(t.price_cents / 100).toFixed(0)}</p>
            <p className="text-xs text-muted">{t.duration_minutes} min</p>
          </button>
        ))}
      </div>

      <h2 className="display baseline mt-8 text-xl">Open times</h2>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {slots.length === 0 && <p className="col-span-full text-sm text-muted">No open slots right now — check back soon.</p>}
        {slots.map((s) => (
          <button key={s.id} onClick={() => setSlotId(s.id)}
            className={`card p-3 text-sm ${slotId === s.id ? "border-game text-game" : "text-muted hover:text-chalk"}`}>
            {new Date(s.starts_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <label className="label" htmlFor="note">Anything we should know?</label>
        <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. 8th grader, working on left hand" />
      </div>
      {msg && <p className="mt-3 text-sm font-semibold text-make">{msg}</p>}
      <button className="btn-game mt-4 w-full" disabled={pending || !slotId || !typeId} onClick={submit}>
        {pending ? "Requesting…" : "Request session"}
      </button>
    </div>
  );
}
