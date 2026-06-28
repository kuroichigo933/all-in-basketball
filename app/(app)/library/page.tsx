import { PageTitle } from "@/components/ui";
import { getDrillLibrary } from "@/lib/google-drive";
import DrillVideoCard from "@/components/DrillVideoCard";

export const dynamic = "force-dynamic";

const TIER_ORDER = ["Beginner", "Intermediate", "Expert"];

function sortTiers<T extends { tier: string }>(tiers: T[]): T[] {
  return [...tiers].sort((a, b) => {
    const ai = TIER_ORDER.indexOf(a.tier);
    const bi = TIER_ORDER.indexOf(b.tier);
    if (ai === -1 && bi === -1) return a.tier.localeCompare(b.tier);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export default async function Library() {
  const categories = await getDrillLibrary();

  if (categories.length === 0) {
    return (
      <>
        <PageTitle kicker="Drill library" title="Put in the work" />
        <p className="text-sm text-muted">
          No drills loaded yet. Check the server logs for Drive connection details,
          or make sure the Google Drive folder is shared with the service account.
        </p>
      </>
    );
  }

  return (
    <>
      <PageTitle kicker="Drill library" title="Put in the work" />
      <div className="space-y-12">
        {categories.map((cat) => (
          <section key={cat.category}>
            <h2 className="display baseline pb-3 text-2xl sm:text-3xl">{cat.category}</h2>
            <div className="mt-5 space-y-8">
              {sortTiers(cat.tiers).map(({ tier, drills }) => (
                <div key={tier}>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-wood">{tier}</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {drills.map((drill) => (
                      <DrillVideoCard
                        key={drill.id}
                        drill={drill}
                        category={cat.category}
                        tier={tier}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
