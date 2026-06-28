import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import { postFeedback, claimSubmission } from "../../../actions";

export default async function ReviewDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  if (me?.role !== "coach") redirect("/dashboard");

  const { data: sub } = await supabase.from("review_submissions")
    .select("id, focus, notes, status, video_path, created_at, profiles(full_name, age_group, skill_level)")
    .eq("id", params.id).single();
  if (!sub) notFound();

  const { data: signed } = await supabase.storage.from("review-videos")
    .createSignedUrl(sub.video_path, 3600);

  async function send(formData: FormData) {
    "use server";
    await postFeedback(params.id, String(formData.get("body") ?? ""));
    redirect("/coach");
  }

  const p = sub.profiles as any;

  return (
    <>
      <PageTitle kicker="Film review" title={`${p?.full_name} · ${sub.focus}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          {signed?.signedUrl ? (
            <video src={signed.signedUrl} controls playsInline controlsList="nodownload" className="w-full rounded-card bg-raised" />
          ) : (
            <p className="text-sm text-game">Couldn&apos;t load the clip.</p>
          )}
          <div className="card mt-4 p-4 text-sm">
            <p><span className="text-muted">Player:</span> {p?.full_name} · {p?.age_group} · {p?.skill_level}</p>
            <p className="mt-2"><span className="text-muted">Their note:</span> {sub.notes || "—"}</p>
          </div>
          {sub.status === "pending" && (
            <form action={claimSubmission.bind(null, sub.id)} className="mt-3">
              <button className="btn-ghost w-full">Mark as in review</button>
            </form>
          )}
        </div>
        <form action={send} className="card h-fit p-5">
          <h2 className="display text-xl">Your breakdown</h2>
          <p className="mt-1 text-sm text-muted">
            What&apos;s working, the one biggest fix, and a drill to work on it.
          </p>
          <textarea name="body" rows={12} required className="input mt-4"
            placeholder={"What I like: …\n\nThe one thing to fix: …\n\nDrill to fix it: …"} />
          <button className="btn-game mt-4 w-full">Send feedback</button>
        </form>
      </div>
    </>
  );
}
