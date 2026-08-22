/* The new-article full page (direct access/refresh); in-app clicks
   (the explore header's "publish") render the intercepted-route modal
   (app/@modal/(.)blog/admin/new) — both share NewArticleContent. The
   kind is chosen in the form: letter = monthly, guide = learn path
   (one table, one form). */
import type { Metadata } from "next";
import NewArticleContent from "./_components/NewArticleContent";

export const metadata: Metadata = { title: "新建文章 — kimi.builders" };

export default function NewArticlePage() {
  return <NewArticleContent />;
}
