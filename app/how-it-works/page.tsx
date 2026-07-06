import Link from "next/link";

export default function HowItWorks() {
  return (
    <main>
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-2 px-4">
        <Link href="/" className="display text-xl text-game">All In</Link>
        <nav className="flex items-center gap-3 sm:gap-4">
          <Link href="/how-it-works" className="text-sm font-semibold text-game">How it Works</Link>
          <Link href="/pricing" className="hidden text-sm font-semibold text-muted hover:text-chalk sm:inline">Pricing</Link>
          <Link href="/login" className="text-sm font-semibold text-muted hover:text-chalk">Log in</Link>
          <Link href="/signup" className="btn-game !py-2 !px-4 text-sm">Sign up</Link>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-10 sm:py-16">
        <p className="text-xs uppercase tracking-[0.25em] text-game">How it works</p>
        <h1 className="display mt-2 text-4xl md:text-5xl">See it in action</h1>
        <div className="mt-8 flex justify-center overflow-hidden rounded-card border border-line bg-black shadow-2xl">
          <video src="/demo.mp4" controls playsInline preload="metadata" className="max-h-[75vh] w-auto" />
        </div>
        <div className="mt-8">
          <Link href="/signup" className="btn-game">Get started</Link>
        </div>
      </section>
    </main>
  );
}
