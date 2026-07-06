"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { finalizeFilmReview } from "@/app/(app)/actions";

const BUCKET = "review-videos";

export default function ReviewUpload({ balance, userId }: { balance: number; userId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [focus, setFocus] = useState("shooting form");
  const [otherText, setOtherText] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading" | "finalizing" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const noCredits = balance <= 0;
  const busy = status === "uploading" || status === "finalizing";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || noCredits || busy) return;

    setStatus("uploading");
    setError("");
    try {
      const supabase = createClient();
      // Upload straight from the browser to Supabase storage (bypasses Vercel's
      // request-size limit). RLS requires the path to start with the user's id.
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${userId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || "video/mp4", upsert: false });
      if (upErr) {
        setError(upErr.message || "Upload failed.");
        setStatus("error");
        return;
      }

      setStatus("finalizing");
      const done = await finalizeFilmReview(path, focus, otherText, notes);
      if ("error" in done) {
        setError(done.error ?? "Something went wrong.");
        setStatus("error");
        return;
      }

      setStatus("done");
      setFile(null);
      setOtherText("");
      setNotes("");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
      setStatus("error");
    }
  }

  let buttonLabel = "Send to coach";
  if (noCredits) buttonLabel = "No reviews left";
  else if (status === "uploading") buttonLabel = "Uploading…";
  else if (status === "finalizing") buttonLabel = "Sending…";
  else if (!file) buttonLabel = "Pick a clip";

  return (
    <form onSubmit={submit} className="card p-6">
      <h2 className="display text-xl">Send in your film</h2>
      <p className="mt-1 text-sm text-muted">
        30–60 seconds, side-on or facing the hoop, full body in frame. A coach will break it down
        within 5 business days.
      </p>

      {noCredits && (
        <p className="mt-3 rounded-card border border-line bg-raised p-3 text-sm text-wood">
          You&apos;re out of review credits. Grab one on the{" "}
          <a href="/pricing" className="underline">pricing page</a>.
        </p>
      )}

      <div className="mt-4 space-y-4">
        <div>
          <label className="label" htmlFor="clip">Your clip</label>
          <input id="clip" type="file" accept="video/*" className="input" disabled={noCredits || busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div>
          <label className="label" htmlFor="focus">What should we look at?</label>
          <select id="focus" className="input" value={focus} disabled={noCredits || busy}
            onChange={(e) => setFocus(e.target.value)}>
            <option>shooting form</option>
            <option>free throw routine</option>
            <option>ball handling</option>
            <option>finishing</option>
            <option>defensive stance</option>
            <option value="other">other</option>
          </select>
        </div>
        {focus === "other" && (
          <div>
            <label className="label" htmlFor="otherText">Tell us what to look at</label>
            <input id="otherText" type="text" className="input" value={otherText} disabled={busy}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder="e.g. my footwork on step-back jumpers" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="notes">Anything the coach should know?</label>
          <textarea id="notes" className="input" rows={3} value={notes} disabled={busy}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. My shot feels flat from three. I shoot fine from midrange." />
        </div>
      </div>

      {status === "error" && <p className="mt-4 text-sm text-game">{error}</p>}
      {status === "done" && (
        <p className="mt-4 text-sm text-make">Sent! Your coach will be in touch within 5 business days.</p>
      )}

      <button className="btn-game mt-5 w-full" disabled={noCredits || busy || !file}>
        {buttonLabel}
      </button>
      {busy && <p className="mt-2 text-center text-xs text-muted">Larger clips can take a moment — keep this tab open.</p>}
    </form>
  );
}
