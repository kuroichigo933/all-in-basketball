"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function Signup() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const { error } = await createClient().auth.signUp({
      email, password,
      options: { data: { full_name: name }, emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) { setError(error.message); setBusy(false); return; }
    router.push("/onboarding");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-8">
        <h1 className="display text-2xl">Start free</h1>
        <p className="mt-1 text-sm text-muted">No card needed. Upgrade anytime.</p>
        <div className="mt-6 space-y-4">
          <div><label className="label" htmlFor="name">Name</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div><label className="label" htmlFor="email">Email</label>
            <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div><label className="label" htmlFor="pw">Password</label>
            <input id="pw" className="input" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        </div>
        {error && <p className="mt-3 text-sm text-game">{error}</p>}
        <button className="btn-game mt-6 w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        <p className="mt-4 text-sm text-muted">Have an account? <Link className="text-game" href="/login">Log in</Link></p>
      </form>
    </main>
  );
}
