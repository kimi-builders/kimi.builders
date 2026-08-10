/* 编辑作品页(直接访问/刷新的完整页);应用内点击经拦截路由弹窗展示
   (app/(app)/@modal/(.)works/[id]/edit),两者共用 EditWorkContent。 */
import type { Metadata } from "next";
import EditWorkContent from "./_components/EditWorkContent";

export const metadata: Metadata = { title: "编辑作品 — kimi.builders" };

export default function EditWorkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <EditWorkContent params={params} />;
}
