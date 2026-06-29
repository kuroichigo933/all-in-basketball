import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageTitle, LockedCard, TierPill } from "@/components/ui";
import { hasTier, type Tier } from "@/lib/tiers";
import { enrollInProgram } from "../../actions";

export default async function ProgramDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: program }, { data: profile }] = await Promise.all([
    supabase.from("programs").select("*").eq("id", params.id).single(),
    supabase.from("profiles").select("tier").eq("id", user!.id).single(),
  ]);
  if (!program) notFound();
  const tier = (profile?.tier ?? "free") as Tier;
  const unlocked = hasTier(tier, program.tier_required as Tier);

  const { data: enrollment } = await supabase.from("program_enrollments")
    .select("current_day").eq("user_id", user!.id).eq("program_id", program.id).maybeSingle();
  const { data: days } = await supabase.from("program_days")
    .select("id, day_number, title, program_day_drills(id)")
    .eq("program_id", program.id).order("day_number");

  return (
    <>
      <div className="mb-6">
        <Link href="/programs" className="text-sm text-muted hover:text-chalk">← Back to programs</Link>
      </div>
      <PageTitle kicker={`${program.weeks}-week program`} title={program.title} />
      <p className="max-w-2xl text-muted">{program.description}</p>
      <div className="mt-3"><TierPill tier={program.tier_required as Tier} /></div>

      {!unlocked ? (
        <div className="mt-8 max-w-md"><LockedCard requiredLabel="members-only" /></div>
      ) : !enrollment ? (
        <form action={enrollInProgram.bind(null, program.id)} className="mt-8">
          <button className="btn-game">Start this program</button>
        </form>
      ) : (
        <p className="mt-6 text-sm font-semibold text-make">You&apos;re on day {enrollment.current_day}.</p>
      )}

      <ol className="mt-8 space-y-3">
        {(days ?? []).map((d) => {
          const isNext = enrollment?.current_day === d.day_number;
          const done = (enrollment?.current_day ?? 1) > d.day_number;
          return (
            <li key={d.id} className={`card flex items-center justify-between gap-4 p-5 ${isNext ? "border-game" : ""}`}>
              <div className="flex items-center gap-4">
                <span className={`score text-3xl ${done ? "text-make" : isNext ? "text-game" : "text-muted"}`}>
                  {String(d.day_number).padStart(2, "0")}
                </span>
                <div>
                  <h2 className="font-semibold">{d.title}</h2>
                  <p className="text-xs uppercase tracking-wider text-muted">
                    {(d.program_day_drills as any[])?.length ?? 0} drills {done && "· done"}
                  </p>
                </div>
              </div>
              {unlocked && enrollment && (
                <Link href={`/programs/${program.id}/play?day=${d.id}`}
                  className={isNext ? "btn-game !py-2 !px-4 text-sm" : "btn-ghost !py-2 !px-4 text-sm"}>
                  {isNext ? "Take it to the court" : "Play"}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
