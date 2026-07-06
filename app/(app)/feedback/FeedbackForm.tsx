"use client";

import { useState } from "react";
import { submitFeedback } from "@/app/(app)/actions";

export default function FeedbackForm() {
  const [type, setType] = useState("New Feature");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError("Please enter your feedback.");
      setStatus("error");
      return;
    }
    setStatus("sending");
    const res = await submitFeedback(type, message);
    if ("error" in res) {
      setError(res.error ?? "Something went wrong.");
      setStatus("error");
      return;
    }
    setStatus("done");
    setMessage("");
  }

  if (status === "done") {
    return (
      <div className="card p-6">
        <p className="display text-xl text-make">Thanks!</p>
        <p className="mt-1 text-sm text-muted">Your feedback was submitted.</p>
        <button type="button" className="btn-ghost mt-4" onClick={() => setStatus("idle")}>
          Submit more
        </button>
      </div>
    );
  }

  const busy = status === "sending";

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <div>
        <label className="label" htmlFor="type">Type</label>
        <select id="type" className="input" value={type} disabled={busy}
          onChange={(e) => setType(e.target.value)}>
          <option value="New Feature">New Feature</option>
          <option value="Bug/Issue">Bug/Issue</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="message">Details</label>
        <textarea id="message" rows={6} className="input" value={message} disabled={busy}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What would you like to see, or what went wrong?" />
      </div>

      {status === "error" && <p className="text-sm text-game">{error}</p>}

      <button className="btn-game w-full" disabled={busy}>
        {busy ? "Submitting…" : "Submit feedback"}
      </button>
    </form>
  );
}
