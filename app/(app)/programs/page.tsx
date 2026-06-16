import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import { getDrillLibrary } from "@/lib/google-drive";
import { SAMPLE_PROGRAMS } from "@/lib/sample-programs";
import DrillPicker from "./DrillPicker";

export default async function Programs() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: profile }, { data: enrollments }] = await Promise.all([
    supabase.from("profiles").select("goals").eq("id", user!.id).single(),
    supabase.from("program_enrollments").select("program_id, current_day").eq("user_id", user!.id),
  ]);
  const enrolled = new Map((enrollments ?? []).map((e) => [e.program_id, e.current_day]));
  const goals = profile?.goals ?? [];

  const driveCategories = await getDrillLibrary();
  const hasDrive = driveCategories.length > 0;

  return (
    <>
      <PageTitle kicker="Train" title="Build your session" />

      {/* Custom session builder */}
      <section className="mb-10">
        <div className="flex items-baseline gap-3">
          <h2 className="display text-xl sm:text-2xl">Custom session</h2>
          <span className="text-xs uppercase tracking-wider text-muted">pick drills, play them in order</span>
        </div>
        <p className="mt-1 text-sm text-muted">
          {hasDrive
            ? "Pick drills from any category and tier. We'll queue them up and time you through the whole thing."
            : "Connect Google Drive in Drills first to build custom sessions from your own videos."}
        </p>
        {hasDrive ? (
          <div className="mt-4">
            <DrillPicker categories={driveCategories} />
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SAMPLE_PROGRAMS.map((p) => (
              <Link key={p.id} href={`/samples/${p.id}`}
                className="card group overflow-hidden hover:border-game">
                <div className="relative aspect-[4/3] w-full">
                  <Image src={p.cover} alt={p.title} fill sizes="(max-width: 640px) 100vw, 25vw"
                    className="object-cover transition-transform group-hover:scale-[1.03]" />
                </div>
                <div className="p-3">
                  <h3 className="display text-lg group-hover:text-game">{p.title}</h3>
                  <p className="mt-0.5 text-xs uppercase tracking-wider text-muted">{p.tagline}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Structured programs from DB */}
      <section>
        <h2 className="display baseline pb-3 text-xl sm:text-2xl">Structured programs</h2>
        <ProgramList enrolled={enrolled} goals={goals} supabase={supabase} />
      </section>
    </>
  );
}

async function ProgramList({ enrolled, goals, supabase }: any) {
  const { data: programs } = await supabase.from("programs").select("*").order("created_at");
  if (!programs || programs.length === 0) {
    return <p className="mt-4 text-sm text-muted">No programs yet — check back soon, or try a sample session above.</p>;
  }
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {programs.map((p: any) => (
        <Link key={p.id} href={`/programs/${p.id}`} className="card group p-6 hover:border-game">
          <div className="flex items-start justify-between gap-2">
            <h3 className="display text-2xl group-hover:text-game">{p.title}</h3>
          </div>
          <p className="mt-2 text-sm text-muted">{p.description}</p>
          <p className="mt-3 text-xs uppercase tracking-wider text-muted">
            {p.weeks} weeks · {p.skill_level === "all" ? "all levels" : p.skill_level}
          </p>
          <div className="mt-3 flex gap-2">
            {goals.includes(p.focus) && (
              <span className="rounded-full bg-game/15 px-3 py-1 text-xs font-semibold text-game">Matches your goals</span>
            )}
            {enrolled.has(p.id) && (
              <span className="rounded-full bg-make/15 px-3 py-1 text-xs font-semibold text-make">Day {enrolled.get(p.id)}</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
