import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVideoStream } from "@/lib/google-drive";

export async function GET(
  request: Request,
  { params }: { params: { fileId: string } }
) {
  // Must be authenticated
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
