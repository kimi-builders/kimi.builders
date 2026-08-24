/* Monthly section poster PNG: GET /api/share/letter/[slug]?section=
   facts|decisions. A missing/invalid section falls back to facts
   (normalized at the assembly layer, see src/lib/share-letter.ts); in
   dev, ?preview=1 renders the first fixture from
   tests/fixtures/monthly-mock (no DB — visual review, same pattern as
   the other posters); download=1 sets the attachment header. No such
   published issue -> 404, never rendered. */
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import {
  LETTER_POSTER_STATIC_TEXT,
  getLetterShareSnapshot,
  letterShareText,
  letterSnapshotFromMock,
  normalizeLetterSection,
} from "@/src/lib/share-letter";
import { getPosterFonts } from "@/app/api/share/poster-fonts";
import { posterRateLimited } from "@/app/api/share/poster-guard";
import { POSTER_STATIC_TEXT } from "@/app/api/share/poster-kit";
import { LETTER_POSTER_SIZE } from "@/app/api/share/poster-sizes";
import { normalizePosterLocale } from "@/src/lib/poster-locale";
import { LetterSharePoster } from "./LetterSharePoster";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  /* IP rate limit: rendering is heavy — stop the volume before the
     query/render pipeline. */
  if (await posterRateLimited(request)) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  const { slug } = await params;
  const locale = normalizePosterLocale(request.nextUrl.searchParams.get("locale"));
  const preview =
    process.env.NODE_ENV === "development" && request.nextUrl.searchParams.get("preview") === "1";
  const section = normalizeLetterSection(request.nextUrl.searchParams.get("section"));
  /* The dev preview's mock fixture imports dynamically so it never
     enters the production render bundle. */
  const snapshot = preview
    ? letterSnapshotFromMock((await import("@/tests/fixtures/monthly-mock")).BLOG_ISSUES[0], section, locale)
    : await getLetterShareSnapshot(slug, section, locale);
  if (!snapshot) {
    return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  const fonts = await getPosterFonts(
    letterShareText(snapshot) + POSTER_STATIC_TEXT + LETTER_POSTER_STATIC_TEXT,
  );
  return new ImageResponse(<LetterSharePoster snapshot={snapshot} locale={locale} />, {
    ...LETTER_POSTER_SIZE,
    /* Satori treats an empty array as zero fonts (all tofu) — fall back
       to the default fonts. */
    ...(fonts.length ? { fonts } : {}),
    headers: {
      /* Issue content changes (assembled like the monthly page);
         posters tolerate 5 minutes of staleness. */
      "Cache-Control": preview ? "private, no-store, max-age=0" : "public, max-age=300",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="kimi-builders-letter-${snapshot.slug}-${snapshot.section}.png"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
