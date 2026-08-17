/* 月刊分节分享海报 PNG:GET /api/share/letter/[slug]?section=facts|decisions|letter
   section 缺省/非法 → facts(归一化在组装层,见 src/lib/share-letter.ts);
   dev 下 ?preview=1 用 tests/fixtures/monthly-mock 第一期渲染(不碰 DB,视觉验收用,
   对齐帖子/作品/主页海报 pattern);download=1 给附件头。无此已发布期 → 404 不渲染。 */
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
import { POSTER_STATIC_TEXT } from "@/app/api/share/poster-kit";
import { LETTER_POSTER_SIZE } from "@/app/api/share/poster-sizes";
import { LetterSharePoster } from "./LetterSharePoster";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const preview =
    process.env.NODE_ENV === "development" && request.nextUrl.searchParams.get("preview") === "1";
  const section = normalizeLetterSection(request.nextUrl.searchParams.get("section"));
  /* dev 预览用 mock 夹具:动态 import,不随生产渲染路径进 bundle */
  const snapshot = preview
    ? letterSnapshotFromMock((await import("@/tests/fixtures/monthly-mock")).BLOG_ISSUES[0], section)
    : await getLetterShareSnapshot(slug, section);
  if (!snapshot) {
    return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  const fonts = await getPosterFonts(
    letterShareText(snapshot) + POSTER_STATIC_TEXT + LETTER_POSTER_STATIC_TEXT,
  );
  return new ImageResponse(<LetterSharePoster snapshot={snapshot} />, {
    ...LETTER_POSTER_SIZE,
    /* 空数组会被 satori 当「零字体」(全豆腐),必须回落默认字体 */
    ...(fonts.length ? { fonts } : {}),
    headers: {
      /* 期内容会变(同月刊页组装制),海报允许 5 分钟陈旧 */
      "Cache-Control": preview ? "private, no-store, max-age=0" : "public, max-age=300",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="kimi-builders-letter-${snapshot.slug}-${snapshot.section}.png"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
