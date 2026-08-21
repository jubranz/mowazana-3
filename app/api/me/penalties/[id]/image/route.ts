import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-utils";
import { fetchWordPressMedia } from "@/lib/wordpress";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireSession();
  if (!auth.session) return auth.error;
  const source = request.nextUrl.searchParams.get("source") ?? "";
  const media = await fetchWordPressMedia(source);
  if (!media) return new NextResponse(null, { status: 404 });
  return new NextResponse(media.bytes, { headers: { "Content-Type": media.contentType, "Cache-Control": "private, max-age=300" } });
}
