/* 发帖页(直接访问/刷新的完整页);应用内点击经拦截路由弹窗展示
   (app/(app)/@modal/(.)community/new),两者共用 NewPostContent。 */
import NewPostContent from "./_components/NewPostContent";

export const metadata = { title: "发帖 — kimi.builders" };

export default function NewPostPage() {
  return <NewPostContent />;
}
