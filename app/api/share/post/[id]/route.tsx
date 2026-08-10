/* 帖子分享海报 PNG:GET /api/share/post/[id]
   dev 下 ?preview=1 用 mock 快照(不碰 DB,视觉验收用,对齐用量海报 pattern);
   download=1 给附件头。私密/已删/不存在 → 404 不渲染。 */
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import {
  getPostShareSnapshot,
  mockPostShareSnapshot,
  postShareText,
} from "@/src/lib/share-posters";
import { getPosterFonts } from "@/app/api/share/poster-fonts";
import { POSTER_SIZE, POSTER_STATIC_TEXT } from "@/app/api/share/poster-kit";
import { PostSharePoster } from "./PostSharePoster";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
    ...POSTER_SIZE,
    /* 空数组会被 satori 当「零字体」(全豆腐),必须回落默认字体 */
    ...(fonts.length ? { fonts } : {}),
    headers: {
      /* 内容会变,海报允许 5 分钟陈旧 */
      "Cache-Control": preview ? "private, no-store, max-age=0" : "public, max-age=300",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="kimi-builders-post-${snapshot.id}.png"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
