import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasTier, type Tier } from "@/lib/tiers";
import CourtMode, { type Block } from "./CourtMode";

export default async function Play({ params, searchParams }: {
  params: { id: string }; searchParams: { day?: string };
}) {
  if (!searchParams.day) notFound();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: program }, { data: profile }, { data: day }] = await Promise.all([
    supabase.from("programs").select("id, tier_required").eq("id", params.id).single(),
    supabase.from("profiles").select("tier").eq("id", user!.id).single(),
    supabase.from("program_days")
      .select("id, title, program_day_drills(id, sort, work_seconds, rest_seconds, reps_label, audio_cue, drills(title, video_url))")
      .eq("id", searchParams.day).single(),
  ]);
  if (!program || !day) notFound();
  if (!hasTier((profile?.tier ?? "free") as Tier, program.tier_required as Tier)) redirect("/pricing");

  const blocks: Block[] = (day.program_day_drills as any[])
    .sort((a, b) => a.sort - b.sort)
    .map((b) => ({
      id: b.id,
      title: b.drills?.title ?? "Drill",
      videoUrl: b.drills?.video_url ?? "",
      workSeconds: b.work_seconds,
      restSeconds: b.rest_seconds,
      repsLabel: b.reps_label,
      audioCue: b.audio_cue,
    }));

  return <CourtMode blocks={blocks} programId={program.id} dayId={day.id} dayTitle={day.title} />;
}
