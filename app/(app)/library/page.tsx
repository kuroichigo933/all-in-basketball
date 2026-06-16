import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageTitle, TierPill } from "@/components/ui";
import { hasTier, type Tier } from "@/lib/tiers";
import { SAMPLE_PROGRAMS } from "@/lib/sample-programs";
import { getDrillLibrary } from "@/lib/google-drive";

const TIER_ORDER = ["Beginner", "Intermediate", "Expert"];

export default async function Library() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("tier").eq("id", user!.id).single();
  const tier = (profile?.tier ?? "free") as Tier;

  const driveCategories = await getDrillLibrary();
  const hasDrive = driveCategories.length > 0;

  return (
    <>
      <PageTitle kicker="Drill library" title="Put in the work" />

      {hasDrive ? (
        /* ── Google Drive-backed library ── */
        <div className="space-y-10">
          {driveCategories.map((cat) => (
            <section key={cat.category}>
              <h2 className="display baseline pb-3 text-2xl">{cat.category}</h2>
              <div className="mt-4 space-y-6">
                {TIER_ORDER
                  .filter((t) => cat.tiers.some((tier) => tier.tier === t))
                  .concat(cat.tiers.filter((t) => !TIER_ORDER.includes(t.tier)).map((t) => t.tier))
                  .map((tierName) => {
                    const tierData = cat.tiers.find((t) => t.tier === tierName);
                    if (!tierData) return null;
                    return (
                      <div key={tierName}>
                        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-wood">{tierName}</p>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {tierData.drills.map((drill) => (
                            <div key={drill.id} className="card overflow-hidden">
                              <div className="relative aspect-video bg-raised">
                                <iframe
                                  src={drill.embedUrl}
                                  allow="autoplay"
                                  className="h-full w-full"
                                  title={drill.name}
                                  loading="lazy"
                                />
                              </div>
                              <div className="p-3">
                                <p className="font-semibold">{drill.name}</p>
                                <p className="mt-0.5 text-xs uppercase tracking-wider text-muted">
                                  {cat.category} · {tierName}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        /* ── Fallback: sample programs until Drive is wired up ── */
        <>
          <div className="mb-6 rounded-card border border-wood/40 bg-wood/10 px-4 py-3 text-sm text-wood">
            Connect a Google Drive folder to load real drill videos here — see the setup guide below.
          </div>

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
            <h2 className="display baseline pb-3 text-xl">By category</h2>
            <div className="mt-6 space-y-8">
              {[
                { category: "Shooting", tiers: ["Beginner", "Intermediate", "Expert"] },
                { category: "Dribbling", tiers: ["Beginner", "Intermediate", "Expert"] },
                { category: "Conditioning", tiers: ["Beginner", "Intermediate", "Expert"] },
                { category: "Balance", tiers: ["Beginner", "Intermediate", "Expert"] },
              ].map((cat) => (
                <div key={cat.category}>
                  <h3 className="font-semibold text-chalk">{cat.category}</h3>
                  <div className="mt-3 space-y-4">
                    {cat.tiers.map((t) => (
                      <div key={t}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-wood">{t}</p>
                        <p className="text-sm text-muted">
                          Videos will appear here once your Google Drive folder is connected.
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
