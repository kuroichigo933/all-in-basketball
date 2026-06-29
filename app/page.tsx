import Link from "next/link";
import Image from "next/image";

export default function Landing() {
  return (
    <main>
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-2 px-4">
        <span className="display text-xl text-game">All In</span>
        <nav className="flex items-center gap-3 sm:gap-4">
          <Link href="/pricing" className="hidden text-sm font-semibold text-muted hover:text-chalk sm:inline">Pricing</Link>
          <Link href="/login" className="text-sm font-semibold text-muted hover:text-chalk">Log in</Link>
          <Link href="/signup" className="btn-game !py-2 !px-4 text-sm">Sign up</Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-12 pt-10 sm:pb-16 sm:pt-16 md:pt-24 lg:grid lg:grid-cols-2 lg:items-center lg:gap-12 xl:gap-16">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-game sm:text-sm">All In Basketball Training</p>
          <h1 className="display mt-3 text-4xl leading-[1.05] sm:text-5xl md:text-7xl">
            If it was easy, everyone would do it.
          </h1>
          <p className="mt-6 text-lg text-muted">
            Train the way our in-gym athletes train. Follow-along court workouts, a full drill
            library, shot tracking — and send us film of your shot for a real coach breakdown.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-game">Create an account</Link>
            <Link href="/pricing" className="btn-ghost">See plans</Link>
          </div>
        </div>
        
        <div className="mt-10 lg:mt-0 relative aspect-[4/3] w-full overflow-hidden rounded-card border border-line shadow-2xl bg-raised">
          <video
            src="/api/video/1BlXqo_s5yClB_BSiV4NSpdCW9diJ5qfy"
            autoPlay
            loop
            muted
            playsInline
            controlsList="nodownload"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent" />
        </div>
      </section>

      {/* Lead coach */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="card overflow-hidden md:grid md:grid-cols-[1fr_1.2fr]">
          <div className="relative aspect-[4/5] w-full md:aspect-auto md:h-full">
            <Image
              src="/coach-sanar.png"
              alt="Coach Sanar"
              fill
              priority
              sizes="(max-width: 768px) 100vw, 40vw"
              className="object-cover"
            />
          </div>
          <div className="p-6 md:p-10">
            <p className="text-xs uppercase tracking-[0.25em] text-game">Lead Coach</p>
            <h2 className="display mt-2 text-4xl md:text-5xl">Sanar</h2>
            <p className="mt-2 text-sm font-semibold uppercase tracking-wider text-wood">
            NBA G League Capital City Go-Go · Iraqi National Team   15+ years coaching
            </p>
            <p className="mt-5 text-muted">
              Sanar played for the NBA G League Capital City Go-Go practice squad and the Iraqi 
              National Team. He has spent more than a decade developing hoopers at every level — from 
              first-time middle schoolers learning a proper stance, to college and pro players 
              sharpening their game in the off-season.
            </p>
            <p className="mt-4 text-muted">
              Whether you&apos;re trying to crack your varsity rotation or just want a shot that
              finally goes in, Sanar meets you where you are and pushes you to the next floor.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/signup" className="btn-game !py-2 !px-4 text-sm">Start training with Sanar</Link>
              <Link href="/book" className="btn-ghost !py-2 !px-4 text-sm">Book a session</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-20">
        <div className="grid gap-4 md:grid-cols-3">
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
