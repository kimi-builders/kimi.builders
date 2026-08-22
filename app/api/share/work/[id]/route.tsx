/* 作品分享海报 PNG:GET /api/share/work/[id]
   dev 下 ?preview=1 用 mock 快照;download=1 给附件头。不存在 → 404。 */
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import {
  getWorkShareSnapshot,
  mockWorkShareSnapshot,
  workShareText,
} from "@/src/lib/share-posters";
import { getPosterFonts } from "@/app/api/share/poster-fonts";
import { posterRateLimited } from "@/app/api/share/poster-guard";
import { POSTER_STATIC_TEXT } from "@/app/api/share/poster-kit";
import { workPosterSize } from "@/app/api/share/poster-sizes";
import { WorkSharePoster } from "./WorkSharePoster";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  /* IP 限流(20260822 P1-9):渲染重,先挡量再进查询/渲染管线 */
  if (await posterRateLimited(request)) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  const { id } = await params;
  const preview =
    process.env.NODE_ENV === "development" && request.nextUrl.searchParams.get("preview") === "1";
  const workId = Number(id);
  const snapshot = preview
    ? mockWorkShareSnapshot()
    : Number.isInteger(workId) && workId > 0
      ? await getWorkShareSnapshot(workId)
      : null;
  if (!snapshot) {
    return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  const fonts = await getPosterFonts(workShareText(snapshot) + POSTER_STATIC_TEXT);
  return new ImageResponse(<WorkSharePoster snapshot={snapshot} />, {
    ...workPosterSize(snapshot),
    ...(fonts.length ? { fonts } : {}),
    headers: {
      "Cache-Control": preview ? "private, no-store, max-age=0" : "public, max-age=300",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="kimi-builders-work-${snapshot.id}.png"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
