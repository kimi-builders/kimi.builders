/* 编辑文章完整页(直接访问/刷新);应用内点击(详情页「编辑」)经拦截路由
   弹窗展示(app/@modal/(.)blog/admin/[slug]/edit),两者共用 EditArticleContent。
   按 slug + ?locale= 精确定位,草稿也能取到。admin/mod 专属。 */
import type { Metadata } from "next";
import EditArticleContent from "./_components/EditArticleContent";

export const metadata: Metadata = { title: "编辑文章 — kimi.builders" };

export default function EditArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  return <EditArticleContent params={params} searchParams={searchParams} />;
}
