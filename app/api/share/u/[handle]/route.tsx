/* Profile share poster PNG: GET /api/share/u/[handle]. In dev,
   ?preview=1 renders a mock snapshot; download=1 sets the attachment
   header. Unknown handle -> 404. */
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import {
  getProfileShareSnapshot,
  mockProfileShareSnapshot,
  PROFILE_SHARE_CACHE_CONTROL,
  profileShareText,
} from "@/src/lib/share-posters";
import { getPosterFonts } from "@/app/api/share/poster-fonts";
import { posterRateLimited } from "@/app/api/share/poster-guard";
import { POSTER_STATIC_TEXT } from "@/app/api/share/poster-kit";
import { profilePosterSize } from "@/app/api/share/poster-sizes";
import { ProfileSharePoster } from "./ProfileSharePoster";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  /* IP rate limit: rendering is heavy — stop the volume before the
     query/render pipeline. */
  if (await posterRateLimited(request)) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  const { handle } = await params;
  const preview =
    process.env.NODE_ENV === "development" && request.nextUrl.searchParams.get("preview") === "1";
  const snapshot = preview
    ? mockProfileShareSnapshot()
    : await getProfileShareSnapshot(handle);
  if (!snapshot) {
    return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  const fonts = await getPosterFonts(profileShareText(snapshot) + POSTER_STATIC_TEXT);
  return new ImageResponse(<ProfileSharePoster snapshot={snapshot} />, {
    ...profilePosterSize(snapshot),
    ...(fonts.length ? { fonts } : {}),
    headers: {
      "Cache-Control": PROFILE_SHARE_CACHE_CONTROL,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="kimi-builders-u-${snapshot.handle}.png"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
