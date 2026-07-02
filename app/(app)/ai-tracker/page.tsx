import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import AITracker from "./AITracker";

export const dynamic = "force-dynamic";

export default async function AITrackerPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles")
    .select("role").eq("id", user.id).single();
  
  // if (profile?.role !== "coach") redirect("/dashboard");

  return (
    <>
      <PageTitle kicker="Admin Only" title="AI Movement Tracker" />
      <p className="mb-6 text-muted">
        Real-time pose and ball estimation using Google MediaPipe. Put your phone back, step into the frame, and let the AI count your reps.
      </p>
      
      <div className="card p-6 border-game/30">
        <AITracker />
      </div>
    </>
  );
}
