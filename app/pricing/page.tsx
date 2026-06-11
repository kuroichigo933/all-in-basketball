import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const PLANS = [
  {
    name: "Free", price: "$0", period: "", cta: "Start free", plan: null,
    points: ["Starter drills", "Shot tracking + streaks", "Book in-person sessions"],
  },
  {
    name: "Member", price: "$14.99", period: "/mo", cta: "Go Member", plan: "member",
    points: ["Full drill library", "All follow-along programs", "Court Mode with voice cues", "Progress + badges"],
  },
  {
    name: "All In", price: "$39.99", period: "/mo", cta: "Go All In", plan: "allin", featured: true,
    points: ["Everything in Member", "2 coach film reviews / month", "Priority session booking", "Parent dashboard"],
  },
];

export default async function Pricing() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <p className="text-xs uppercase tracking-[0.25em] text-game">Pricing</p>
      <h1 className="display mt-2 text-4xl md:text-5xl">Pick how far you want to take it</h1>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
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

      <div className="card mt-8 flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h2 className="display text-xl">Single film review</h2>
          <p className="mt-1 text-sm text-muted">One coach breakdown of your shot. No subscription needed. <span className="score text-game text-lg">$29</span></p>
        </div>
        {user ? (
          <form action="/api/stripe/checkout" method="POST">
            <input type="hidden" name="plan" value="review_credit" />
            <button className="btn-game">Buy a review</button>
          </form>
        ) : (
          <Link href="/signup" className="btn-game">Sign up to buy</Link>
        )}
      </div>
      {user && (
        <form action="/api/stripe/portal" method="POST" className="mt-6">
          <button className="text-sm text-muted underline hover:text-chalk">Manage my subscription</button>
        </form>
      )}
    </main>
  );
}
