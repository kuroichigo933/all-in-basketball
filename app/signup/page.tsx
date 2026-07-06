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
  const [plan, setPlan] = useState<"basic" | "professional">("basic");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    
    const client = createClient();
    const { error: signUpError } = await client.auth.signUp({
      email, password,
      options: { data: { full_name: name }, emailRedirectTo: `${location.origin}/auth/callback` },
    });
    
    if (signUpError) { 
      setError(signUpError.message); 
      setBusy(false); 
      return; 
    }

    // Explicitly refresh the session to ensure cookies are set
    await client.auth.refreshSession();

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan })
      });
      const data = await res.json();
      
      if (data.url) {
        window.location.href = data.url;
        return; // Stop here, user goes to Stripe
      } else if (data.error) {
        setError(data.error);
        setBusy(false);
        return;
      }
    } catch (err) {
      setError("Could not redirect to checkout. Please try again.");
      setBusy(false);
      return;
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <Link href="/" className="absolute left-4 top-6 text-sm text-muted hover:text-chalk sm:left-8">← Back to home</Link>
      <form onSubmit={submit} className="card w-full max-w-md p-8">
        <h1 className="display text-2xl">Start your journey</h1>
        <p className="mt-1 text-sm text-muted">Pick a plan and get to work.</p>
        
        <div className="mt-6 space-y-4">
          <div><label className="label" htmlFor="name">Name</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div><label className="label" htmlFor="email">Email</label>
            <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div><label className="label" htmlFor="pw">Password</label>
            <input id="pw" className="input" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            
          <div>
            <label className="label mb-2 block">Choose a Plan</label>
            <div className="space-y-3">
              <label className={`block cursor-pointer rounded-card border p-4 transition-colors ${plan === "basic" ? "border-game bg-game/5" : "border-line hover:border-game/50"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input type="radio" name="plan" value="basic" checked={plan === "basic"} onChange={() => setPlan("basic")} className="h-4 w-4 text-game focus:ring-game" />
                    <span className="font-semibold text-chalk">Basic</span>
                  </div>
                  <span className="text-sm font-medium text-game">$9.99/mo</span>
                </div>
                <p className="mt-2 pl-7 text-xs text-muted">Full drill library & all follow-along programs.</p>
              </label>

              <label className={`block cursor-pointer rounded-card border p-4 transition-colors ${plan === "professional" ? "border-game bg-game/5" : "border-line hover:border-game/50"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input type="radio" name="plan" value="professional" checked={plan === "professional"} onChange={() => setPlan("professional")} className="h-4 w-4 text-game focus:ring-game" />
                    <span className="font-semibold text-chalk">Professional</span>
                  </div>
                  <span className="text-sm font-medium text-game">$24.99/mo</span>
                </div>
                <p className="mt-2 pl-7 text-xs text-muted">Everything in Basic, 4 coach reviews/mo, priority sessions & early access.</p>
              </label>
            </div>
          </div>
        </div>
        
        {error && <p className="mt-3 text-sm text-game">{error}</p>}
        <button className="btn-game mt-6 w-full" disabled={busy}>
          {busy ? "Processing…" : "Continue to Payment"}
        </button>
        <p className="mt-4 text-center text-sm text-muted">Have an account? <Link className="text-game" href="/login">Log in</Link></p>
      </form>
    </main>
  );
}
