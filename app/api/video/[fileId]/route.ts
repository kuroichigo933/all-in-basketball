import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVideoStream } from "@/lib/google-drive";

export async function GET(
  request: Request,
  { params }: { params: { fileId: string } }
) {
  // Must be authenticated
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Film-review footage is coach-only — never viewable by players (not even the
  // uploader). Drill-library videos aren't in review_submissions and stream to
  // any logged-in user as before. Admin client is used so the check sees every
  // review row regardless of RLS ownership.
  const { data: reviewRow } = await createAdminClient()
    .from("review_submissions").select("id").eq("video_path", params.fileId).maybeSingle();
  if (reviewRow) {
    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (me?.role !== "coach") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const range = request.headers.get("range") ?? undefined;

  let result: { stream: ReadableStream; contentType: string; contentLength?: number; contentRange?: string; status: number };
  try {
    result = await getVideoStream(params.fileId, range);
  } catch (err) {
    console.error("[VideoProxy] error:", err);
    return NextResponse.json({ error: "Failed to fetch video" }, { status: 502 });
  }

  const headers: Record<string, string> = {
    "Content-Type": result.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  if (result.contentLength != null) headers["Content-Length"] = String(result.contentLength);
  if (result.contentRange) headers["Content-Range"] = result.contentRange;

  return new Response(result.stream, { status: result.status, headers });
}
