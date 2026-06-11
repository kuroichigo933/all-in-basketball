import { createClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import ReviewUpload from "./ReviewUpload";

const STATUS_LABEL: Record<string, string> = {
  pending: "In the queue", in_review: "Coach is on it", complete: "Feedback ready",
};

export default async function Review() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: credits }, { data: submissions }] = await Promise.all([
    supabase.from("review_credits").select("balance").eq("user_id", user!.id).single(),
    supabase.from("review_submissions")
      .select("id, focus, notes, status, created_at, review_feedback(body, created_at)")
      .eq("user_id", user!.id).order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <PageTitle kicker="Film Room" title="Get coached on your film" />
      <div className="grid gap-6 lg:grid-cols-2">
        <ReviewUpload credits={credits?.balance ?? 0} />
        <section>
          <h2 className="display baseline text-xl">Your submissions</h2>
          <div className="mt-4 space-y-3">
            {(submissions ?? []).length === 0 && (
              <p className="text-sm text-muted">Nothing yet. Send in your first clip — it&apos;s the fastest way to fix your shot.</p>
            )}
            {(submissions ?? []).map((s) => (
              <div key={s.id} className="card p-5">
                <div className="flex items-center justify-between">
                  <p className="font-semibold capitalize">{s.focus}</p>
                  <span className={`text-xs font-semibold uppercase tracking-wider
                    ${s.status === "complete" ? "text-make" : "text-wood"}`}>
                    {STATUS_LABEL[s.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">{new Date(s.created_at).toLocaleDateString()}</p>
                {(s.review_feedback as any[])?.map((f, i) => (
                  <div key={i} className="mt-3 rounded-card bg-raised p-4">
                    <p className="text-xs uppercase tracking-wider text-game">Coach feedback</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{f.body}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
