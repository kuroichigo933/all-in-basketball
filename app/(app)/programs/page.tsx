import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageTitle, TierPill } from "@/components/ui";
import type { Tier } from "@/lib/tiers";

export default async function Programs() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: programs }, { data: profile }, { data: enrollments }] = await Promise.all([
    supabase.from("programs").select("*").order("created_at"),
    supabase.from("profiles").select("goals").eq("id", user!.id).single(),
    supabase.from("program_enrollments").select("program_id, current_day").eq("user_id", user!.id),
  ]);
  const enrolled = new Map((enrollments ?? []).map((e) => [e.program_id, e.current_day]));
  const goals = profile?.goals ?? [];

  return (
    <>
      <PageTitle kicker="Programs" title="Pick your path" />
      <div className="grid gap-4 md:grid-cols-2">
        {(programs ?? []).map((p) => (
          <Link key={p.id} href={`/programs/${p.id}`} className="card group p-6 hover:border-game">
            <div className="flex items-start justify-between gap-2">
              <h2 className="display text-2xl group-hover:text-game">{p.title}</h2>
              <TierPill tier={p.tier_required as Tier} />
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
    </>
  );
}
