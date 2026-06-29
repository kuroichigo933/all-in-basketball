import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Stat, PageTitle, TierPill } from "@/components/ui";
import type { Tier } from "@/lib/tiers";

export default async function Dashboard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: profile }, { data: stats }, { data: enrollments }, { data: badges }, { data: credits }] =
    await Promise.all([
      supabase.from("profiles").select("full_name, tier, goals").eq("id", user!.id).single(),
      supabase.from("user_stats").select("*").eq("user_id", user!.id).single(),
      supabase.from("program_enrollments")
        .select("current_day, programs(id, title, weeks)").eq("user_id", user!.id),
      supabase.from("user_badges").select("badge_code, badges(name, icon)").eq("user_id", user!.id),
      supabase.from("review_credits").select("balance").eq("user_id", user!.id).single(),
    ]);

  const goal = profile?.goals?.[0];
  const { data: recommended } = goal
    ? await supabase.from("programs").select("id, title, description").eq("focus", goal).limit(1)
    : { data: null };
  const active = enrollments?.[0];

  return (
    <>
      <div className="flex items-start justify-between">
        <PageTitle kicker="Locker room" title={`Let's keep grinding ${profile?.full_name || user?.user_metadata?.full_name || "hooper"}`} />
        <TierPill tier={(profile?.tier ?? "free") as Tier} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={stats?.current_streak ?? 0} label="Day streak" />
        <Stat value={stats?.longest_streak ?? 0} label="Best streak" />
        <Stat value={stats?.xp ?? 0} label="XP" />
        <Stat value={credits?.balance ?? 0} label="Review credits" />
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        {active && active.programs ? (
          <Link href={`/programs/${(active.programs as any).id}`} className="card group p-6 hover:border-game">
            <p className="text-xs uppercase tracking-[0.2em] text-game">Continue training</p>
            <h2 className="display mt-2 text-2xl group-hover:text-game">{(active.programs as any).title}</h2>
            <p className="mt-1 text-sm text-muted">You&apos;re on day {active.current_day}. Keep it going.</p>
          </Link>
        ) : recommended?.[0] ? (
          <Link href={`/programs/${recommended[0].id}`} className="card group p-6 hover:border-game">
            <p className="text-xs uppercase tracking-[0.2em] text-game">Picked for your goals</p>
            <h2 className="display mt-2 text-2xl group-hover:text-game">{recommended[0].title}</h2>
            <p className="mt-1 text-sm text-muted">{recommended[0].description}</p>
          </Link>
        ) : (
          <Link href="/programs" className="card group p-6 hover:border-game">
            <p className="text-xs uppercase tracking-[0.2em] text-game">Start here</p>
            <h2 className="display mt-2 text-2xl group-hover:text-game">Pick a program</h2>
          </Link>
        )}
        <Link href="/progress" className="card group p-6 hover:border-game">
          <p className="text-xs uppercase tracking-[0.2em] text-game">Log a session</p>
          <h2 className="display mt-2 text-2xl group-hover:text-game">Track your shots</h2>
          <p className="mt-1 text-sm text-muted">Tap the court, log your makes, watch the chart heat up.</p>
        </Link>
      </section>

      {badges && badges.length > 0 && (
        <section className="mt-8">
          <h2 className="display baseline text-xl">Trophy case</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {badges.map((b: any) => (
              <span key={b.badge_code} className="card px-4 py-2 text-sm">
                {b.badges?.icon} {b.badges?.name}
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
