/* 新建文章完整页(直接访问/刷新);应用内点击(explore 页头「发内容」)经
   拦截路由弹窗展示(app/@modal/(.)blog/admin/new),两者共用 NewArticleContent。
   kind 在表单里选:letter=月刊,guide=学习路径(同一张表,同一表单)。 */
import type { Metadata } from "next";
import NewArticleContent from "./_components/NewArticleContent";

export const metadata: Metadata = { title: "新建文章 — kimi.builders" };

export default function NewArticlePage() {
  return <NewArticleContent />;
}
