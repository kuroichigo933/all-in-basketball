import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVideoStream, isLibraryVideo } from "@/lib/google-drive";

// Serves drill-library videos from Google Drive. Review footage no longer flows
// through here — it lives in Supabase storage and is served via signed URLs.
export async function GET(
  request: Request,
  { params }: { params: { fileId: string } }
) {
  // Must be authenticated
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only stream files that are actually in the drill library — never an
  // arbitrary Drive fileId the service account happens to have access to.
  if (!(await isLibraryVideo(params.fileId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
