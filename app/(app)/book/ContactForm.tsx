"use client";

import { useState } from "react";
import { sendBookingRequest } from "@/app/(app)/actions";

export default function ContactForm({
  defaultName = "",
  defaultEmail = "",
  defaultExperience = "beginner",
}: {
  defaultName?: string;
  defaultEmail?: string;
  defaultExperience?: string;
}) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [age, setAge] = useState("");
  const [experience, setExperience] = useState(defaultExperience);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      setStatus("error");
      return;
    }
    setStatus("sending");
    const res = await sendBookingRequest({ name, email, age, experience, message });
    if ("error" in res) {
      setError(res.error ?? "Something went wrong.");
      setStatus("error");
      return;
    }
    setStatus("done");
  }

  if (status === "done") {
    return (
      <div className="card p-6">
        <p className="display text-xl text-make">Request sent!</p>
        <p className="mt-1 text-sm text-muted">
          Coach Sanar will reach out to you at <span className="text-chalk">{email}</span> to set up a time.
        </p>
      </div>
    );
  }

  const busy = status === "sending";

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input id="name" className="input" value={name} disabled={busy}
          onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" type="email" className="input" value={email} disabled={busy}
          onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="age">Age</label>
        <input id="age" className="input" value={age} disabled={busy} inputMode="numeric"
          onChange={(e) => setAge(e.target.value)} placeholder="e.g. 14" />
      </div>
      <div>
        <label className="label" htmlFor="experience">Experience level</label>
        <select id="experience" className="input" value={experience} disabled={busy}
          onChange={(e) => setExperience(e.target.value)}>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="message">Anything else? (optional)</label>
        <textarea id="message" rows={3} className="input" value={message} disabled={busy}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Goals, what you want to work on, general availability…" />
      </div>

      {status === "error" && <p className="text-sm text-game">{error}</p>}

      <button className="btn-game w-full" disabled={busy}>
        {busy ? "Sending…" : "Request a session"}
      </button>
    </form>
  );
}
