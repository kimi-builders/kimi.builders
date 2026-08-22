/* The edit-article full page (direct access/refresh); in-app clicks
   (the detail page's "edit") render the intercepted-route modal
   (app/@modal/(.)blog/admin/[slug]/edit) — both share
   EditArticleContent. Located by slug + ?locale= exactly; drafts
   resolve too. admin/mod only. */
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
