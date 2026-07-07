import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Daily TTL cleanup: deletes film-review clips older than 14 days from Supabase
// storage. Scheduled by vercel.json. Vercel Cron sends
// `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.

const BUCKET = "review-videos";
const TTL_DAYS = 14;

export async function GET(request: Request) {
  // Fail closed: require the secret to be configured AND matched. (Vercel Cron
  // sends this Bearer header automatically when CRON_SECRET is set.)
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await admin
    .from("review_submissions")
    .select("id, video_path")
    .lt("created_at", cutoff)
    .neq("video_path", "");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const paths = (rows ?? []).map((r) => r.video_path).filter(Boolean);
  if (paths.length === 0) return NextResponse.json({ ok: true, removed: 0, cutoff });

  const { error: rmErr } = await admin.storage.from(BUCKET).remove(paths);
  if (rmErr) return NextResponse.json({ error: rmErr.message }, { status: 500 });

  // Clear the path so the file isn't re-processed and the coach page can show
  // "expired" cleanly.
  await admin.from("review_submissions").update({ video_path: "" }).in("id", (rows ?? []).map((r) => r.id));

  return NextResponse.json({ ok: true, removed: paths.length, cutoff });
}
