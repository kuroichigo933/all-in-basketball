import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const PLANS = [
  {
    name: "Basic", price: "$9.99", period: "/mo", cta: "Go Basic", plan: "basic",
    points: ["Full drill library", "All follow-along programs", "1 coach film review / month"],
  },
  {
    name: "Professional", price: "$24.99", period: "/mo", cta: "Go Professional", plan: "professional", featured: true,
    points: ["Everything in Basic", "4 coach film reviews / month", "Priority session booking", "Early access to new content"],
  },
];

export default async function Pricing() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-5xl px-4 py-16 relative">
      <Link href={user ? "/dashboard" : "/"} className="absolute left-4 top-6 text-sm text-muted hover:text-chalk sm:left-4">← Back to {user ? "dashboard" : "home"}</Link>
      <p className="text-xs uppercase tracking-[0.25em] text-game mt-4">Pricing</p>
      <h1 className="display mt-2 text-4xl md:text-5xl">Pick how far you want to take it</h1>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {PLANS.map((p) => (
          <div key={p.name} className={`card flex flex-col p-6 ${p.featured ? "border-game" : ""}`}>
            {p.featured && <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-game">Most serious</p>}
            <h2 className="display text-2xl">{p.name}</h2>
            <p className="mt-2"><span className="score text-4xl">{p.price}</span><span className="text-muted">{p.period}</span></p>
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
                <Link href="/signup" className={`mt-6 ${p.featured ? "btn-game" : "btn-ghost"} w-full`}>{p.cta}</Link>
              )
            ) : (
              <Link href={user ? "/dashboard" : "/signup"} className="btn-ghost mt-6 w-full">{p.cta}</Link>
            )}
          </div>
        ))}
      </div>

      {user && (
        <form action="/api/stripe/portal" method="POST" className="mt-6 text-center">
          <button className="text-sm text-muted underline hover:text-chalk">Manage my subscription</button>
        </form>
      )}
    </main>
  );
}
