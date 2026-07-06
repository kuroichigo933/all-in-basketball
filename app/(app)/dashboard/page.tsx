import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Stat, PageTitle, TierPill } from "@/components/ui";
import type { Tier } from "@/lib/tiers";
import { getDrillLibraryCached, filterEarlyAccess } from "@/lib/google-drive";
import JumpBackInCard, { RecommendedDrill } from "@/components/JumpBackInCard";
import Leaderboard, { LeaderboardItem } from "@/components/Leaderboard";

export default async function Dashboard() {
  const supabase = createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  const [
    { data: profile },
    { data: stats },
    { data: enrollments },
    { data: badges },
    { data: completedData },
    { data: dbDrillsResult },
    { data: rawLeaderboard }
  ] = await Promise.all([
    supabase.from("profiles").select("full_name, tier, role, goals").eq("id", user!.id).single(),
    supabase.from("user_stats").select("*").eq("user_id", user!.id).single(),
    supabase.from("program_enrollments")
      .select("current_day, programs(id, title, weeks)").eq("user_id", user!.id),
    supabase.from("user_badges").select("badge_code, badges(name, icon)").eq("user_id", user!.id),
    supabase.from("completed_drills").select("drill_id, completed_at").eq("user_id", user!.id).order("completed_at", { ascending: false }),
    supabase.from("drills").select("*"),
    admin.from("user_stats").select(`
      user_id,
      current_streak,
      longest_streak,
      profiles (
        full_name
      )
    `)
  ]);

  const active = enrollments?.[0];
  const completedList = completedData ?? [];
  const completedIds = new Set(completedList.map((c) => c.drill_id));
  const dbDrills = dbDrillsResult ?? [];

  const fullName = profile?.full_name || user?.user_metadata?.full_name || "hooper";
  const firstName = fullName.split(" ")[0];

  // 1. Fetch drills — new ones (< 7 days) are Professional/coach only.
  const canSeeNew = (profile as any)?.role === "coach" || profile?.tier === "professional";
  const driveCategories = filterEarlyAccess(await getDrillLibraryCached(), canSeeNew);

  // 2. Flatten all available drills
  const allDrills: RecommendedDrill[] = [];
  
  if (driveCategories.length > 0) {
    for (const cat of driveCategories) {
      for (const t of cat.tiers) {
        for (const d of t.drills) {
          allDrills.push({
            id: d.id,
            name: d.name,
            videoUrl: d.videoUrl,
            category: cat.category,
            tier: t.tier,
          });
        }
      }
    }
  } else if (dbDrills.length > 0) {
    for (const d of dbDrills) {
      allDrills.push({
        id: d.id,
        name: d.title,
        videoUrl: d.video_url,
        category: d.category,
        tier: d.skill_level,
      });
    }
  }

  // 3. Find the recommended drill
  let recommendedDrill: RecommendedDrill | null = null;
  let recommendationType: "next" | "oldest" | "first" = "first";

  if (allDrills.length > 0) {
    if (completedList.length > 0) {
      const latestCompletedId = completedList[0].drill_id;
      const latestIndex = allDrills.findIndex((d) => d.id === latestCompletedId);

      if (latestIndex !== -1 && latestIndex + 1 < allDrills.length) {
        recommendedDrill = allDrills[latestIndex + 1];
        recommendationType = "next";
      } else {
        // Find the first uncompleted one
        const firstUncompleted = allDrills.find((d) => !completedIds.has(d.id));
        if (firstUncompleted) {
          recommendedDrill = firstUncompleted;
          recommendationType = "next";
        }
      }

      // If still not set, and all are completed, find oldest completed (least recently completed)
      if (!recommendedDrill && completedIds.size >= allDrills.length) {
        const oldestCompletedId = completedList[completedList.length - 1]?.drill_id;
        recommendedDrill = allDrills.find((d) => d.id === oldestCompletedId) || allDrills[0];
        recommendationType = "oldest";
      }
    } else {
      recommendedDrill = allDrills[0];
      recommendationType = "first";
    }
  }

  // 4. Map leaderboard items
  const leaderboardItems: LeaderboardItem[] = (rawLeaderboard ?? []).map((row: any) => ({
    name: row.profiles?.full_name || "Hooper",
    currentStreak: row.current_streak || 0,
    longestStreak: row.longest_streak || 0,
    isCurrentUser: row.user_id === user!.id,
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <PageTitle kicker="Locker room" title={`Let's keep grinding ${firstName}`} />
        <TierPill tier={(profile?.tier ?? "free") as Tier} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Stat value={stats?.current_streak ?? 0} label="Current Streak" />
        <Stat value={stats?.longest_streak ?? 0} label="Longest Streak" />
      </div>

      {recommendedDrill && (
        <section className="space-y-3">
          <div className="flex items-baseline gap-3">
            <h2 className="display text-xl">Jump Back In</h2>
            <span className="text-xs uppercase tracking-wider text-muted">Pick up where you left off</span>
          </div>
          <JumpBackInCard drill={recommendedDrill} type={recommendationType} />
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        {active && active.programs ? (
          <Link href={`/programs/${(active.programs as any).id}`} className="card group p-6 hover:border-game">
            <p className="text-xs uppercase tracking-[0.2em] text-game">Continue training</p>
            <h2 className="display mt-2 text-2xl group-hover:text-game">{(active.programs as any).title}</h2>
            <p className="mt-1 text-sm text-muted">You&apos;re on day {active.current_day}. Keep it going.</p>
          </Link>
        ) : (
          <Link href="/programs" className="card group p-6 hover:border-game">
            <p className="text-xs uppercase tracking-[0.2em] text-game">Start here</p>
            <h2 className="display mt-2 text-2xl group-hover:text-game">Pick a program</h2>
            <p className="mt-1 text-sm text-muted">Find a structured plan matching your onboarding goals.</p>
          </Link>
        )}
        <Link href="/progress" className="card group p-6 hover:border-game">
          <p className="text-xs uppercase tracking-[0.2em] text-game">Log a session</p>
          <h2 className="display mt-2 text-2xl group-hover:text-game">Track your shots</h2>
          <p className="mt-1 text-sm text-muted">Tap the court, log your makes, watch the chart heat up.</p>
        </Link>
      </section>

      {badges && badges.length > 0 && (
        <section>
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

      <section>
        <Leaderboard items={leaderboardItems} />
      </section>
    </div>
  );
}