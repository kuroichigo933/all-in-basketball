import Link from "next/link";
import Image from "next/image";
import { SAMPLE_PROGRAMS } from "@/lib/sample-programs";
import PublicTrialBanner from "@/components/PublicTrialBanner";

export default function SamplesIndex() {
  return (
    <>
      <PublicTrialBanner />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <Link href="/" className="text-sm text-muted hover:text-game">← Back home</Link>
        <header className="mt-4">
          <p className="text-xs uppercase tracking-[0.25em] text-game">Sample Programs</p>
          <h1 className="display mt-2 text-4xl md:text-5xl">Pick a focus. Get to work.</h1>
          <p className="mt-3 max-w-xl text-muted">
            Each session is five 12-minute drills — one hour, one focus. Tap one to see the drills.
          </p>
        </header>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {SAMPLE_PROGRAMS.map((p) => (
            <Link key={p.id} href={`/samples/${p.id}`} className="card group overflow-hidden hover:border-game">
              <div className="relative aspect-[16/9] w-full">
                <Image src={p.cover} alt={p.title} fill sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover transition-transform group-hover:scale-[1.03]" />
              </div>
              <div className="p-5">
                <h2 className="display text-2xl group-hover:text-game">{p.title}</h2>
                <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-wood">{p.tagline}</p>
                <p className="mt-2 text-sm text-muted">{p.description}</p>
                <p className="mt-3 text-xs uppercase tracking-wider text-muted">5 drills · 60 minutes</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
