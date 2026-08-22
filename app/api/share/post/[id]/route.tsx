/* Post share poster PNG: GET /api/share/post/[id]. In dev, ?preview=1
   renders a mock snapshot (no DB — visual review, same pattern as the
   usage poster); download=1 sets the attachment header.
   Private/deleted/missing -> 404, never rendered. */
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import {
  getPostShareSnapshot,
  mockPostShareSnapshot,
  postShareText,
} from "@/src/lib/share-posters";
import { getPosterFonts } from "@/app/api/share/poster-fonts";
import { posterRateLimited } from "@/app/api/share/poster-guard";
import { POSTER_STATIC_TEXT } from "@/app/api/share/poster-kit";
import { postPosterSize } from "@/app/api/share/poster-sizes";
import { PostSharePoster } from "./PostSharePoster";

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
  const preview =
    process.env.NODE_ENV === "development" && request.nextUrl.searchParams.get("preview") === "1";
  const postId = Number(id);
  const snapshot = preview
    ? mockPostShareSnapshot()
    : Number.isInteger(postId) && postId > 0
      ? await getPostShareSnapshot(postId)
      : null;
  if (!snapshot) {
    return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  const fonts = await getPosterFonts(postShareText(snapshot) + POSTER_STATIC_TEXT);
  return new ImageResponse(<PostSharePoster snapshot={snapshot} />, {
    ...postPosterSize(snapshot),
    /* Satori treats an empty array as zero fonts (all tofu) — fall back
       to the default fonts. */
    ...(fonts.length ? { fonts } : {}),
    headers: {
      /* Content changes; posters tolerate 5 minutes of staleness. */
      "Cache-Control": preview ? "private, no-store, max-age=0" : "public, max-age=300",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="kimi-builders-post-${snapshot.id}.png"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
