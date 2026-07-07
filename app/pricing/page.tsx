"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function Pricing() {
  const [user, setUser] = useState<any>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });
  }, []);

  const plans = [
    {
      name: "Basic",
      price: billingCycle === "monthly" ? "$9.99" : "$99.99",
      period: billingCycle === "monthly" ? "/mo" : "/yr",
      saving: billingCycle === "yearly" ? "Save $20/yr" : null,
      cta: "Go Basic",
      plan: billingCycle === "yearly" ? "basic_yearly" : "basic",
      points: ["Full drill library", "All follow-along programs"],
    },
    {
      name: "Professional",
      price: billingCycle === "monthly" ? "$24.99" : "$249.99",
      period: billingCycle === "monthly" ? "/mo" : "/yr",
      saving: billingCycle === "yearly" ? "Save $50/yr" : null,
      cta: "Go Professional",
      plan: billingCycle === "yearly" ? "professional_yearly" : "professional",
      featured: true,
      points: ["Everything in Basic", "4 coach film reviews / month", "Priority session booking", "Early access to new content"],
    },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-16 relative">
      <Link href={user ? "/dashboard" : "/"} className="absolute left-4 top-6 text-sm text-muted hover:text-chalk sm:left-4">← Back to {user ? "dashboard" : "home"}</Link>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mt-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-game">Pricing</p>
          <h1 className="display mt-2 text-4xl md:text-5xl">Pick how far you want to take it</h1>
        </div>
        
        {/* Toggle billing cycle */}
        <div className="flex items-center gap-1.5 rounded-full bg-raised p-1 border border-line self-start md:self-auto">
          <button
            type="button"
            onClick={() => setBillingCycle("monthly")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${billingCycle === "monthly" ? "bg-game text-asphalt shadow" : "text-muted hover:text-chalk"}`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle("yearly")}
            className={`relative rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${billingCycle === "yearly" ? "bg-game text-asphalt shadow" : "text-muted hover:text-chalk"}`}
          >
            Yearly
            <span className="absolute -top-3.5 -right-3.5 flex h-4 items-center justify-center rounded-full bg-wood px-1.5 text-[8px] font-bold text-chalk uppercase tracking-wider animate-pulse shadow-md border border-game/20">
              20% off
            </span>
          </button>
        </div>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {plans.map((p) => (
          <div key={p.name} className={`card flex flex-col p-6 ${p.featured ? "border-game" : ""}`}>
            {p.featured && <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-game">Most serious</p>}
            <div className="flex items-start justify-between">
              <h2 className="display text-2xl">{p.name}</h2>
              {p.saving && (
                <span className="rounded bg-wood/10 border border-wood/25 px-2 py-0.5 text-xs font-semibold text-wood uppercase tracking-wide">
                  {p.saving}
                </span>
              )}
            </div>
            <p className="mt-2">
              <span className="score text-4xl">{p.price}</span>
              <span className="text-muted">{p.period}</span>
            </p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted">
              {p.points.map((pt) => <li key={pt}>· {pt}</li>)}
            </ul>
            {p.plan ? (
              user ? (
                <form action="/api/stripe/checkout" method="POST" className="mt-6">
                  <input type="hidden" name="plan" value={p.plan} />
                  <button className={p.featured ? "btn-game w-full" : "btn-ghost w-full"}>{p.cta}</button>
                </form>
              ) : (
                <Link href={`/signup?plan=${p.plan}`} className={`mt-6 block text-center ${p.featured ? "btn-game" : "btn-ghost"} w-full`}>{p.cta}</Link>
              )
            ) : (
              <Link href={user ? "/dashboard" : "/signup"} className="btn-ghost mt-6 block text-center w-full">{p.cta}</Link>
            )}
          </div>
        ))}
      </div>

      {!loading && user && (
        <form action="/api/stripe/portal" method="POST" className="mt-6 text-center">
          <button className="text-sm text-muted underline hover:text-chalk">Manage my subscription</button>
        </form>
      )}
    </main>
  );
}
