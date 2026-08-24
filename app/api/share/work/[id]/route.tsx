/* Work share poster PNG: GET /api/share/work/[id]. In dev, ?preview=1
   renders a mock snapshot; download=1 sets the attachment header.
   Missing -> 404. */
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
import { normalizePosterLocale } from "@/src/lib/poster-locale";
import { WorkSharePoster } from "./WorkSharePoster";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  /* IP rate limit: rendering is heavy — stop the volume before the
     query/render pipeline. */
  if (await posterRateLimited(request)) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  const { id } = await params;
  const locale = normalizePosterLocale(request.nextUrl.searchParams.get("locale"));
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
  return new ImageResponse(<WorkSharePoster snapshot={snapshot} locale={locale} />, {
    ...workPosterSize(snapshot),
    ...(fonts.length ? { fonts } : {}),
    headers: {
      "Cache-Control": preview ? "private, no-store, max-age=0" : "public, max-age=300",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="kimi-builders-work-${snapshot.id}.png"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
