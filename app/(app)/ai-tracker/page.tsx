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
        Upload a short, stationary-camera clip with one full-body player and one ball. The controlled MVP evaluates crossover, between-the-legs, behind-the-back, hesitation, and in-and-out patterns.
      </p>
      
      <div className="card p-6 border-game/30">
        <AITracker />
      </div>
    </>
  );
}
