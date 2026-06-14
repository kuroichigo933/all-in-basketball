"use client";

import { useState } from "react";

export default function ReviewUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [focus, setFocus] = useState("shooting form");
  const [notes, setNotes] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Upload is intentionally disabled — film review is coming soon.
  }

  return (
    <form onSubmit={submit} className="card p-6">
      <h2 className="display text-xl">Send in your film</h2>
      <p className="mt-1 text-sm text-muted">
        30–60 seconds, side-on or facing the hoop, full body in frame. A coach will break it down
        within 5 business days.
      </p>
      <p className="mt-2 inline-block rounded-full border border-line px-3 py-0.5 text-xs font-semibold uppercase tracking-wider text-wood">
        Coming soon
      </p>
      <div className="mt-4 space-y-4">
        <div>
          <label className="label" htmlFor="clip">Your clip</label>
          <input id="clip" type="file" accept="video/*" className="input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div>
          <label className="label" htmlFor="focus">What should we look at?</label>
          <select id="focus" className="input" value={focus} onChange={(e) => setFocus(e.target.value)}>
            <option>shooting form</option>
            <option>free throw routine</option>
            <option>ball handling</option>
            <option>finishing</option>
            <option>defensive stance</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="notes">Anything the coach should know?</label>
          <textarea id="notes" className="input" rows={3} value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. My shot feels flat from three. I shoot fine from midrange." />
        </div>
      </div>
      <button className="btn-game mt-5 w-full" disabled>
        {file ? "Upload coming soon" : "Pick a clip"}
      </button>
    </form>
  );
}
