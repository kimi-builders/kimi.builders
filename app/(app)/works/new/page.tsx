/* 提交作品页(直接访问/刷新的完整页);应用内点击经拦截路由弹窗展示
   (app/(app)/@modal/(.)works/new),两者共用 NewWorkContent。 */
import type { Metadata } from "next";
import NewWorkContent from "./_components/NewWorkContent";

export const metadata: Metadata = { title: "提交作品 — kimi.builders" };

export default function NewWorkPage() {
  return <NewWorkContent />;
}
