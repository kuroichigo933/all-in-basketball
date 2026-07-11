import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import AITracker from "./AITracker";

export const dynamic = "force-dynamic";

export default async function AITrackerPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <>
      <PageTitle kicker="Video Lab" title="Dribble Move Analyzer" />
      <p className="mb-6 text-muted">
        Start the front-facing camera for near-real-time player, ball, and dribble-move tracking. Uploaded clips remain available as a secondary benchmark workflow.
      </p>
      
      <div className="card p-6 border-game/30">
        <AITracker />
      </div>
    </>
  );
}
