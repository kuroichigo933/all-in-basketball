"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PublicTrialBanner from "@/components/PublicTrialBanner";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setBusy(false); return; }
    router.push(params.get("next") ?? "/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-sm p-8">
      <h1 className="display text-2xl">Log in</h1>
      <div className="mt-6 space-y-4">
        <div><label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div><label className="label" htmlFor="pw">Password</label>
          <input id="pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
      </div>
      {error && <p className="mt-3 text-sm text-game">{error}</p>}
      <button className="btn-game mt-6 w-full" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
      <p className="mt-4 text-sm text-muted">New here? <Link className="text-game" href="/signup">Sign up</Link></p>
    </form>
  );
}

export default function Login() {
  return (
    <>
      <PublicTrialBanner />
      <main className="relative flex min-h-screen items-center justify-center px-4 py-20">
        <Link href="/" className="absolute left-4 top-6 text-sm text-muted hover:text-chalk sm:left-8">← Back to home</Link>
        <Suspense><LoginForm /></Suspense>
      </main>
    </>
  );
}
