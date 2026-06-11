import Link from "next/link";

export default function Landing() {
  return (
    <main>
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <span className="display text-xl text-game">All In</span>
        <nav className="flex items-center gap-4">
          <Link href="/pricing" className="text-sm font-semibold text-muted hover:text-chalk">Pricing</Link>
          <Link href="/login" className="text-sm font-semibold text-muted hover:text-chalk">Log in</Link>
          <Link href="/signup" className="btn-game !py-2 !px-4 text-sm">Start free</Link>
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-4 pb-20 pt-16 md:pt-24">
        <p className="text-sm uppercase tracking-[0.25em] text-game">All In Basketball Training</p>
        <h1 className="display mt-3 max-w-3xl text-5xl leading-[1.05] md:text-7xl">
          If it was easy, everyone would do it.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted">
          Train the way our in-gym athletes train. Follow-along court workouts, a full drill
          library, shot tracking — and send us film of your shot for a real coach breakdown.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup" className="btn-game">Create a free account</Link>
          <Link href="/pricing" className="btn-ghost">See plans</Link>
        </div>

        <div className="mt-20 grid gap-4 md:grid-cols-3">
          {[
            ["Take us to the court", "Prop your phone up and press play. Timed drills, rest clocks, and voice cues call out every block so you never touch the screen mid-rep."],
            ["Film Room feedback", "Upload a clip of your shot. A real All In coach — college and pro experience — breaks down your mechanics and tells you exactly what to fix."],
            ["See yourself improve", "Log makes and misses by spot on the floor. Your shot chart heats up as your percentages climb. Streaks keep you honest."],
          ].map(([t, d]) => (
            <div key={t} className="card p-6">
              <h2 className="display text-xl text-game">{t}</h2>
              <p className="mt-2 text-sm text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
