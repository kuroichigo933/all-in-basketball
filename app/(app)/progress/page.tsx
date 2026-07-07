import { createClient } from "@/lib/supabase/server";
import { PageTitle, Stat } from "@/components/ui";
import CourtChart, { type ZoneStats } from "@/components/CourtChart";
import ShotTracker from "./ShotTracker";

function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec.toString().padStart(2, "0")}s` : `${sec}s`;
}

export default async function Progress() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: logs }, { data: stats }, { count: workouts }, { data: history }] = await Promise.all([
    supabase.from("shot_logs").select("zone, makes, attempts, shot_sessions!inner(user_id)")
      .eq("shot_sessions.user_id", user!.id),
    supabase.from("user_stats").select("*").eq("user_id", user!.id).single(),
    supabase.from("workout_logs").select("id", { count: "exact", head: true }).eq("user_id", user!.id),
    supabase.from("workout_logs")
      .select("id, duration_seconds, completed_at, program_days(title)")
      .eq("user_id", user!.id)
      .order("completed_at", { ascending: false })
      .limit(30),
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

      <section className="mt-8">
        <div className="card p-5">
          <h2 className="display text-xl">Workout history</h2>
          <p className="mt-1 text-sm text-muted">Every session you&apos;ve logged, newest first.</p>
          {!history || history.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No workouts logged yet — finish a session in Train and it&apos;ll show up here.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {history.map((w: any) => (
                <li key={w.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-semibold text-chalk">{w.program_days?.title || "Training session"}</p>
                    <p className="text-xs text-muted">
                      {new Date(w.completed_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  <span className="score flex-none text-muted">{fmtDuration(w.duration_seconds)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
