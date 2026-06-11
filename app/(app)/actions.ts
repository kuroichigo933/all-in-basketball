"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function awardBadge(userId: string, code: string) {
  const admin = createAdminClient();
  await admin.from("user_badges").upsert({ user_id: userId, badge_code: code }, { onConflict: "user_id,badge_code", ignoreDuplicates: true });
}

// ---------- Onboarding ----------
export async function completeOnboarding(formData: FormData) {
  const { supabase, user } = await requireUser();
  const goals = formData.getAll("goals").map(String);
  await supabase.from("profiles").update({
    role: String(formData.get("role") ?? "player"),
    age_group: String(formData.get("age_group") ?? "adult"),
    position: String(formData.get("position") ?? "unsure"),
    skill_level: String(formData.get("skill_level") ?? "beginner"),
    goals,
    onboarded: true,
  }).eq("id", user.id);
  redirect("/dashboard");
}

// ---------- Training ----------
export async function enrollInProgram(programId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("program_enrollments").upsert({ user_id: user.id, program_id: programId });
  revalidatePath("/programs");
}

export async function logWorkout(programDayId: string | null, durationSeconds: number, programId?: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("workout_logs").insert({
    user_id: user.id, program_day_id: programDayId, duration_seconds: durationSeconds,
  });
  const admin = createAdminClient();
  await admin.rpc("bump_activity", { p_user: user.id, p_xp: 50 });
  await awardBadge(user.id, "first_workout");

  if (programDayId && programId) {
    const { data: enr } = await supabase.from("program_enrollments")
      .select("current_day").eq("user_id", user.id).eq("program_id", programId).single();
    const { data: day } = await supabase.from("program_days")
      .select("day_number").eq("id", programDayId).single();
    if (enr && day && day.day_number >= enr.current_day) {
      await supabase.from("program_enrollments")
        .update({ current_day: day.day_number + 1 })
        .eq("user_id", user.id).eq("program_id", programId);
    }
  }
  await checkStreakBadges(user.id);
  revalidatePath("/dashboard");
  revalidatePath("/progress");
}

export async function logShotSession(entries: { zone: string; makes: number; attempts: number }[]) {
  const { supabase, user } = await requireUser();
  const valid = entries.filter((e) => e.attempts > 0 && e.makes >= 0 && e.makes <= e.attempts);
  if (valid.length === 0) return;
  const { data: session } = await supabase.from("shot_sessions")
    .insert({ user_id: user.id }).select("id").single();
  if (!session) return;
  await supabase.from("shot_logs").insert(
    valid.map((e) => ({ session_id: session.id, zone: e.zone, makes: e.makes, attempts: e.attempts }))
  );
  const admin = createAdminClient();
  await admin.rpc("bump_activity", { p_user: user.id, p_xp: 25 });

  const { data: totals } = await admin.from("shot_logs")
    .select("attempts, shot_sessions!inner(user_id)").eq("shot_sessions.user_id", user.id);
  const totalAttempts = (totals ?? []).reduce((s: number, r: any) => s + r.attempts, 0);
  if (totalAttempts >= 500) await awardBadge(user.id, "shots_500");
  await checkStreakBadges(user.id);
  revalidatePath("/progress");
  revalidatePath("/dashboard");
}

async function checkStreakBadges(userId: string) {
  const admin = createAdminClient();
  const { data: stats } = await admin.from("user_stats").select("current_streak").eq("user_id", userId).single();
  if (!stats) return;
  if (stats.current_streak >= 7) await awardBadge(userId, "streak_7");
  if (stats.current_streak >= 30) await awardBadge(userId, "streak_30");
}

// ---------- Film Room ----------
export async function submitReview(videoPath: string, focus: string, notes: string) {
  const { supabase, user } = await requireUser();
  const admin = createAdminClient();
  const { data: credits } = await admin.from("review_credits").select("balance").eq("user_id", user.id).single();
  if (!credits || credits.balance < 1) return { error: "You need a review credit. Get one on the pricing page." };
  await admin.from("review_credits").update({ balance: credits.balance - 1 }).eq("user_id", user.id);
  await supabase.from("review_submissions").insert({ user_id: user.id, video_path: videoPath, focus, notes });
  await awardBadge(user.id, "first_review");
  revalidatePath("/review");
  return { ok: true };
}

export async function postFeedback(submissionId: string, body: string) {
  const { supabase } = await requireUser();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("review_feedback").insert({ submission_id: submissionId, coach_id: user!.id, body });
  await supabase.from("review_submissions").update({ status: "complete" }).eq("id", submissionId);
  revalidatePath("/coach");
  revalidatePath("/review");
}

export async function claimSubmission(submissionId: string) {
  const { supabase } = await requireUser();
  await supabase.from("review_submissions").update({ status: "in_review" }).eq("id", submissionId);
  revalidatePath("/coach");
}

// ---------- Booking ----------
export async function requestBooking(slotId: string, sessionTypeId: string, note: string) {
  const { supabase, user } = await requireUser();
  const admin = createAdminClient();
  const { data: slot } = await admin.from("availability_slots").select("booked").eq("id", slotId).single();
  if (!slot || slot.booked) return { error: "That time was just taken. Pick another slot." };
  await supabase.from("bookings").insert({ slot_id: slotId, user_id: user.id, session_type_id: sessionTypeId, note });
  await admin.from("availability_slots").update({ booked: true }).eq("id", slotId);
  revalidatePath("/book");
  return { ok: true };
}

export async function setBookingStatus(bookingId: string, status: "confirmed" | "completed" | "cancelled") {
  const { supabase } = await requireUser();
  await supabase.from("bookings").update({ status }).eq("id", bookingId);
  if (status === "cancelled") {
    const admin = createAdminClient();
    const { data: b } = await admin.from("bookings").select("slot_id").eq("id", bookingId).single();
    if (b) await admin.from("availability_slots").update({ booked: false }).eq("id", b.slot_id);
  }
  revalidatePath("/coach");
  revalidatePath("/book");
}

export async function addAvailability(startsAtISO: string, durationMinutes: number) {
  const { supabase, user } = await requireUser();
  const starts = new Date(startsAtISO);
  const ends = new Date(starts.getTime() + durationMinutes * 60000);
  await supabase.from("availability_slots").insert({
    coach_id: user.id, starts_at: starts.toISOString(), ends_at: ends.toISOString(),
  });
  revalidatePath("/coach");
}

// ---------- Family ----------
export async function createChildInvite() {
  const { supabase, user } = await requireUser();
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  // placeholder child id = parent until accepted? No — store invite with code, child claims it.
  // Simpler model: parent generates a code row keyed to themselves; child redeems it.
  await createAdminClient().from("parent_links").insert({
    parent_id: user.id, child_id: user.id, invite_code: code, accepted: false,
  });
  revalidatePath("/family");
  return { code };
}

export async function redeemChildInvite(code: string) {
  const { supabase, user } = await requireUser();
  const admin = createAdminClient();
  const { data: link } = await admin.from("parent_links")
    .select("parent_id").eq("invite_code", code.toUpperCase()).eq("accepted", false).single();
  if (!link) return { error: "That code isn't valid." };
  await admin.from("parent_links").delete().eq("invite_code", code.toUpperCase());
  await admin.from("parent_links").insert({
    parent_id: link.parent_id, child_id: user.id, accepted: true,
  });
  revalidatePath("/family");
  return { ok: true };
}
