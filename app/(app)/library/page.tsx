import { createClient } from "@/lib/supabase/server";
import { PageTitle, TierPill } from "@/components/ui";
import { hasTier, type Tier } from "@/lib/tiers";
import Link from "next/link";

const CATEGORIES = ["all", "shooting", "handles", "finishing", "defense", "footwork", "conditioning"];

export default async function Library({ searchParams }: { searchParams: { c?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("tier").eq("id", user!.id).single();
  const tier = (profile?.tier ?? "free") as Tier;
  const cat = searchParams.c && CATEGORIES.includes(searchParams.c) ? searchParams.c : "all";

  let query = supabase.from("drills").select("*").order("created_at");
  if (cat !== "all") query = query.eq("category", cat);
  const { data: drills } = await query;

  return (
    <>
      <PageTitle kicker="Drill library" title="Put in the work" />
      <div className="mb-6 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Link key={c} href={c === "all" ? "/library" : `/library?c=${c}`}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold capitalize
              ${cat === c ? "border-game text-game" : "border-line text-muted hover:text-chalk"}`}>
            {c}
          </Link>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(drills ?? []).map((d) => {
          const unlocked = hasTier(tier, d.tier_required as Tier);
          return (
            <div key={d.id} className="card overflow-hidden">
              <div className="relative aspect-video bg-raised">
                {unlocked ? (
                  <video src={d.video_url} controls preload="none" className="h-full w-full object-cover"
                    poster={d.thumbnail_url ?? undefined} />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2">
                    <span className="text-2xl">🔒</span>
                    <Link href="/pricing" className="text-sm font-semibold text-game">Members only — unlock</Link>
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{d.title}</h2>
                  <TierPill tier={d.tier_required as Tier} />
                </div>
                <p className="mt-1 text-sm text-muted">{d.description}</p>
                <p className="mt-2 text-xs uppercase tracking-wider text-muted">
                  {d.category} · {d.skill_level} · {Math.round(d.duration_seconds / 60)} min
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
