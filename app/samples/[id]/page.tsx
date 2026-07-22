import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getSampleProgram, SAMPLE_PROGRAMS } from "@/lib/sample-programs";
import PublicTrialBanner from "@/components/PublicTrialBanner";

export function generateStaticParams() {
  return SAMPLE_PROGRAMS.map((p) => ({ id: p.id }));
}

export default function SampleProgramDetail({ params }: { params: { id: string } }) {
  const program = getSampleProgram(params.id);
  if (!program) notFound();

  return (
    <>
      <PublicTrialBanner />
      <main className="mx-auto max-w-4xl px-4 py-12">
        <Link href="/samples" className="text-sm text-muted hover:text-game">← All sample programs</Link>

        <header className="mt-4">
          <p className="text-xs uppercase tracking-[0.25em] text-game">{program.tagline}</p>
          <h1 className="display mt-2 text-4xl md:text-5xl">{program.title}</h1>
          <p className="mt-3 max-w-2xl text-muted">{program.description}</p>
          <p className="mt-4 text-sm font-semibold uppercase tracking-wider text-wood">
            5 drills · 12 minutes each · 60-minute session
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={`/samples/${program.id}/play`} className="btn-game">Start practice</Link>
          </div>
        </header>

        <ol className="mt-10 space-y-5">
          {program.drills.map((d, i) => (
            <li key={i} className="card overflow-hidden md:grid md:grid-cols-[1fr_1.4fr]">
              <div className="relative aspect-[4/3] w-full md:aspect-auto md:h-full">
                <Image src={d.image} alt={d.title} fill sizes="(max-width: 768px) 100vw, 40vw"
                  className="object-cover" />
              </div>
              <div className="p-5 md:p-6">
                <div className="flex items-center gap-3">
                  <span className="score text-3xl text-game">{String(i + 1).padStart(2, "0")}</span>
                  <span className="rounded-full border border-line px-3 py-0.5 text-xs font-semibold uppercase tracking-wider text-muted">
                    12 min
                  </span>
                </div>
                <h2 className="display mt-2 text-2xl">{d.title}</h2>
                <p className="mt-2 text-sm text-muted">{d.description}</p>
                <p className="mt-3 text-sm font-semibold text-game">Coach&apos;s cue: <span className="text-chalk">{d.cue}</span></p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href={`/samples/${program.id}/play`} className="btn-game">Start practice</Link>
          <Link href="/samples" className="btn-ghost">Try another program</Link>
        </div>
      </main>
    </>
  );
}
