import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageTitle, TierPill } from "@/components/ui";
import { hasTier, type Tier } from "@/lib/tiers";
import { SAMPLE_PROGRAMS } from "@/lib/sample-programs";

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

      {/* Sample programs — five-drill, one-hour sessions */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="display text-xl sm:text-2xl">Sample sessions</h2>
          <span className="text-xs uppercase tracking-wider text-muted">5 drills · 60 min</span>
        </div>
        <p className="mt-1 text-sm text-muted">
          Tap a focus to see the drills. Each session is five 12-minute blocks.
        </p>
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
      </section>

      <section>
        <h2 className="display baseline text-xl sm:text-2xl">Drill library</h2>
        <div className="mb-6 mt-4 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Link key={c} href={c === "all" ? "/library" : `/library?c=${c}`}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold capitalize
                ${cat === c ? "border-game text-game" : "border-line text-muted hover:text-chalk"}`}>
              {c}
            </Link>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(drills ?? []).length === 0 && (
            <p className="col-span-full text-sm text-muted">
              No drills loaded yet — check out the sample sessions above to get started.
            </p>
          )}
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
                    <h3 className="font-semibold">{d.title}</h3>
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
      </section>
    </>
  );
}
