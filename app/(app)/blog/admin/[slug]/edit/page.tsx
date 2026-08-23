/* The edit-article full page (direct access/refresh); in-app clicks
   (the detail page's "edit") render the intercepted-route modal
   (app/@modal/(.)blog/admin/[slug]/edit) — both share
   EditArticleContent. Located by slug + ?locale= exactly; drafts
   resolve too. admin/mod only. */
import type { Metadata } from "next";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import EditArticleContent from "./_components/EditArticleContent";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "meta.editArticle") };
}

export default function EditArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  return <EditArticleContent params={params} searchParams={searchParams} />;
}
