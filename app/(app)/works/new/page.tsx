/* 提交作品页(直接访问/刷新的完整页);应用内点击经拦截路由弹窗展示
   (app/(app)/@modal/(.)works/new),两者共用 NewWorkContent。
   ?path=<slug> = 毕业归因来源路径(20260920,透传给 NewWorkContent)。 */
import type { Metadata } from "next";
import NewWorkContent from "./_components/NewWorkContent";

export const metadata: Metadata = { title: "提交作品 — kimi.builders" };

export default function NewWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string | string[] }>;
}) {
  return <NewWorkContent searchParams={searchParams} />;
}
