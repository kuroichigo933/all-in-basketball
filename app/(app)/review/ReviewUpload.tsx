"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startFilmUpload, finalizeFilmReview } from "@/app/(app)/actions";

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; pct: number }
  | { kind: "finalizing" }
  | { kind: "done" }
  | { kind: "error"; message: string };

// PUT the file bytes straight to the Drive resumable session URI and resolve
// with the created file's id. Kept in the browser so large clips never hit the
// (4.5 MB-capped) serverless request path.
function uploadToDrive(
  sessionUri: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", sessionUri, true);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText).id);
        } catch {
          reject(new Error("Upload finished but the response was unreadable."));
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(file);
  });
}

export default function ReviewUpload({ balance }: { balance: number }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [focus, setFocus] = useState("shooting form");
  const [otherText, setOtherText] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const noCredits = balance <= 0;
  const busy = status.kind === "uploading" || status.kind === "finalizing";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || noCredits || busy) return;

    setStatus({ kind: "uploading", pct: 0 });
    try {
      const start = await startFilmUpload(file.name, file.type || "video/mp4");
      if ("error" in start) {
        setStatus({ kind: "error", message: start.error ?? "Couldn't start the upload." });
        return;
      }

      const fileId = await uploadToDrive(start.sessionUri, file, (pct) =>
        setStatus({ kind: "uploading", pct })
      );

      setStatus({ kind: "finalizing" });
      const done = await finalizeFilmReview(fileId, focus, otherText, notes);
      if ("error" in done) {
        setStatus({ kind: "error", message: done.error ?? "Something went wrong." });
        return;
      }

      setStatus({ kind: "done" });
      setFile(null);
      setOtherText("");
      setNotes("");
      router.refresh(); // refresh the remaining-credits count
    } catch (err: any) {
      setStatus({ kind: "error", message: err?.message ?? "Something went wrong." });
    }
  }

  let buttonLabel = "Send to coach";
  if (noCredits) buttonLabel = "No reviews left";
  else if (status.kind === "uploading") buttonLabel = `Uploading… ${status.pct}%`;
  else if (status.kind === "finalizing") buttonLabel = "Sending…";
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

      {status.kind === "error" && (
        <p className="mt-4 text-sm text-game">{status.message}</p>
      )}
      {status.kind === "done" && (
        <p className="mt-4 text-sm text-make">Sent! Your coach will be in touch within 5 business days.</p>
      )}

      <button className="btn-game mt-5 w-full" disabled={noCredits || busy || !file}>
        {buttonLabel}
      </button>
    </form>
  );
}
