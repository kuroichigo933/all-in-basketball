import { createClient } from "@/lib/supabase/server";
import { PageTitle, Stat } from "@/components/ui";
import FamilyLink from "./FamilyLink";

export default async function Family() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user!.id).single();

  const { data: links } = await supabase.from("parent_links")
    .select("child_id, accepted, invite_code").eq("parent_id", user!.id);
  const childIds = (links ?? []).filter((l) => l.accepted && l.child_id !== user!.id).map((l) => l.child_id);
  const pendingCodes = (links ?? []).filter((l) => !l.accepted && l.invite_code).map((l) => l.invite_code!);

  const children = childIds.length
    ? await Promise.all(childIds.map(async (id) => {
        const [{ data: profile }, { data: stats }, { count: workouts }, { data: shots }] = await Promise.all([
          supabase.from("profiles").select("full_name, skill_level").eq("id", id).single(),
          supabase.from("user_stats").select("*").eq("user_id", id).single(),
          supabase.from("workout_logs").select("id", { count: "exact", head: true }).eq("user_id", id),
          supabase.from("shot_logs").select("makes, attempts, shot_sessions!inner(user_id)").eq("shot_sessions.user_id", id),
        ]);
        const totals = (shots ?? []).reduce((a, s) => ({ makes: a.makes + s.makes, attempts: a.attempts + s.attempts }), { makes: 0, attempts: 0 });
        return { id, profile, stats, workouts: workouts ?? 0, totals };
      }))
    : [];

  return (
    <>
      <PageTitle kicker="Family" title={me?.role === "parent" ? "Your players" : "Link a parent"} />
      <FamilyLink role={me?.role ?? "player"} pendingCodes={pendingCodes} />
      <div className="mt-8 space-y-6">
        {children.map((c) => (
          <section key={c.id} className="card p-6">
            <div className="baseline flex items-end justify-between">
              <h2 className="display text-2xl">{c.profile?.full_name}</h2>
              <span className="text-xs uppercase tracking-wider text-muted">{c.profile?.skill_level}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat value={c.stats?.current_streak ?? 0} label="Day streak" />
              <Stat value={c.workouts} label="Workouts" />
              <Stat value={c.totals.attempts} label="Shots logged" />
              <Stat value={c.totals.attempts ? `${Math.round((c.totals.makes / c.totals.attempts) * 100)}%` : "—"} label="FG %" />
            </div>
          </section>
        ))}
        {me?.role === "parent" && children.length === 0 && (
          <p className="text-sm text-muted">
            No players linked yet. Generate a code above and have your player enter it on their own account.
          </p>
        )}
      </div>
    </>
  );
}
