"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { submitReview } from "../actions";

export default function ReviewUpload({ credits }: { credits: number }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [focus, setFocus] = useState("shooting form");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) { setError("Keep clips under 200 MB — 30 to 60 seconds is plenty."); return; }
    setBusy(true); setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const path = `${user!.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("review-videos").upload(path, file);
    if (upErr) { setError(upErr.message); setBusy(false); return; }
    const res = await submitReview(path, focus, notes);
    if (res?.error) { setError(res.error); setBusy(false); return; }
    setFile(null); setNotes("");
    setBusy(false);
    router.refresh();
  }

  if (credits < 1) {
    return (
      <div className="card border-dashed p-6 text-center">
        <p className="font-semibold">No review credits yet</p>
        <p className="mt-1 text-sm text-muted">
          All In members get monthly credits, or grab a single review any time.
        </p>
        <a href="/pricing" className="btn-game mt-4">Get a review credit</a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-6">
      <h2 className="display text-xl">Send in your film</h2>
      <p className="mt-1 text-sm text-muted">
        30–60 seconds, side-on or facing the hoop, full body in frame. A coach will break it down
        within 5 business days. This uses 1 credit (you have {credits}).
      </p>
      <div className="mt-4 space-y-4">
        <div>
          <label className="label" htmlFor="clip">Your clip</label>
          <input id="clip" type="file" accept="video/*" capture="environment" className="input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
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
      {error && <p className="mt-3 text-sm text-game">{error}</p>}
      <button className="btn-game mt-5 w-full" disabled={busy || !file}>
        {busy ? "Uploading…" : "Submit for review (1 credit)"}
      </button>
    </form>
  );
}
