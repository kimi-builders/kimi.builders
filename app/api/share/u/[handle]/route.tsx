/* 个人主页分享海报 PNG:GET /api/share/u/[handle]
   dev 下 ?preview=1 用 mock 快照;download=1 给附件头。handle 不存在 → 404。 */
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import {
  getProfileShareSnapshot,
  mockProfileShareSnapshot,
  profileShareText,
} from "@/src/lib/share-posters";
import { getPosterFonts } from "@/app/api/share/poster-fonts";
import { POSTER_STATIC_TEXT } from "@/app/api/share/poster-kit";
import { profilePosterSize } from "@/app/api/share/poster-sizes";
import { ProfileSharePoster } from "./ProfileSharePoster";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
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
      "Cache-Control": preview ? "private, no-store, max-age=0" : "public, max-age=300",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="kimi-builders-u-${snapshot.handle}.png"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
