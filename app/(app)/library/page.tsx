import { PageTitle } from "@/components/ui";
import { getDrillLibraryCached } from "@/lib/google-drive";
import DrillLibrary from "@/components/DrillLibrary";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Library() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: completions }, categories] = await Promise.all([
    supabase.from("completed_drills").select("drill_id").eq("user_id", user?.id || ""),
    getDrillLibraryCached(),
  ]);

  const completedIds = (completions ?? []).map((c) => c.drill_id);

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
      <DrillLibrary categories={categories} completedIds={completedIds} />
    </>
  );
}
