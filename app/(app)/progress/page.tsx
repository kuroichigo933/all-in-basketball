import { createClient } from "@/lib/supabase/server";
import { PageTitle, Stat } from "@/components/ui";
import CourtChart, { type ZoneStats } from "@/components/CourtChart";
import ShotTracker from "./ShotTracker";

export default async function Progress() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: logs }, { data: stats }, { count: workouts }] = await Promise.all([
    supabase.from("shot_logs").select("zone, makes, attempts, shot_sessions!inner(user_id)")
      .eq("shot_sessions.user_id", user!.id),
    supabase.from("user_stats").select("*").eq("user_id", user!.id).single(),
    supabase.from("workout_logs").select("id", { count: "exact", head: true }).eq("user_id", user!.id),
  ]);

  const zoneStats: ZoneStats = {};
  let makes = 0, attempts = 0;
  for (const l of logs ?? []) {
    const z = (zoneStats[l.zone] ??= { makes: 0, attempts: 0 });
    z.makes += l.makes; z.attempts += l.attempts;
    makes += l.makes; attempts += l.attempts;
  }

  return (
    <>
      <PageTitle kicker="Progress" title="Your game, on paper" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={attempts ? `${Math.round((makes / attempts) * 100)}%` : "—"} label="Overall FG" />
        <Stat value={attempts} label="Shots logged" />
        <Stat value={workouts ?? 0} label="Workouts" />
        <Stat value={stats?.current_streak ?? 0} label="Day streak" />
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <ShotTracker />
        <div className="card p-5">
          <h2 className="display text-xl">Shot chart</h2>
          <p className="mt-1 text-sm text-muted">All-time percentages by spot. Green is money, orange needs reps.</p>
          <div className="mt-4"><CourtChart stats={zoneStats} /></div>
        </div>
      </section>
    </>
  );
}
