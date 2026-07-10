import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import { getDrillLibraryCached, filterEarlyAccess, type DrillCategory, type DrillFile } from "@/lib/google-drive";
import { STRUCTURED_PLANS } from "@/lib/structured-plans";
import DrillPicker from "./DrillPicker";

export const dynamic = "force-dynamic";

function getStructuredPlansWithQueues(categories: DrillCategory[]) {
  // Build a flat map of all available drills in Drive
  const drillMap = new Map<string, { drill: DrillFile; category: string; tier: string }>();
  for (const cat of categories) {
    for (const t of cat.tiers) {
      for (const d of t.drills) {
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        drillMap.set(normalize(d.name), { drill: d, category: cat.category, tier: t.tier });
      }
    }
  }

  return STRUCTURED_PLANS.map((plan) => {
    const queue: (DrillFile & { category: string; tier: string })[] = [];
    for (const name of plan.drillNames) {
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const match = drillMap.get(normalize(name));
      if (match) {
        queue.push({
          ...match.drill,
          category: match.category,
          tier: match.tier
        });
      }
    }
    return {
      ...plan,
      queue
    };
  });
}

export default async function Programs() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: profile }, { data: enrollments }] = await Promise.all([
    supabase.from("profiles").select("goals, tier, role").eq("id", user!.id).single(),
    supabase.from("program_enrollments").select("program_id, current_day").eq("user_id", user!.id),
  ]);
  const enrolled = new Map((enrollments ?? []).map((e) => [e.program_id, e.current_day]));
  const goals = profile?.goals ?? [];
  // Checklists are loaded on demand when a session starts (fetchChecklistsForQueueAction),
  // so we don't pay for parsing every checklist doc up front here.
  // New drills (< 7 days) are Professional/coach only.
  const canSeeNew = profile?.role === "coach" || profile?.tier === "professional";
  const driveCategories = filterEarlyAccess(await getDrillLibraryCached(), canSeeNew);

  const structuredPlans = getStructuredPlansWithQueues(driveCategories);

  return (
    <>
      <PageTitle kicker="Train" title="Build your session" />

      {driveCategories.length > 0 && (
        <section className="mb-10">
          <DrillPicker
            categories={driveCategories}
            structuredPlans={structuredPlans}
          />
        </section>
      )}

      {driveCategories.length === 0 && (
        <section className="mb-10">
          <p className="mt-3 text-sm text-muted">
            No drills loaded yet — check the Drills tab for connection status.
          </p>
        </section>
      )}

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
    return <p className="mt-4 text-sm text-muted">No structured programs yet — check back soon.</p>;
  }
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {programs.map((p: any) => (
        <Link key={p.id} href={`/programs/${p.id}`} className="card group p-6 hover:border-game">
          <h3 className="display text-2xl group-hover:text-game">{p.title}</h3>
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
