/* 编辑帖子页(直接访问/刷新的完整页);应用内点击经拦截路由弹窗展示
   (app/(app)/@modal/(.)community/[id]/edit),两者共用 EditPostContent。 */
import type { Metadata } from "next";
import EditPostContent from "./_components/EditPostContent";

export const metadata: Metadata = { title: "编辑帖子 — kimi.builders" };

export default function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <EditPostContent params={params} />;
}
