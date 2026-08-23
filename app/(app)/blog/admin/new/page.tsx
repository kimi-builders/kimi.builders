/* The new-article full page (direct access/refresh); in-app clicks
   (the explore header's "publish") render the intercepted-route modal
   (app/@modal/(.)blog/admin/new) — both share NewArticleContent. The
   kind is chosen in the form: letter = monthly, guide = learn path
   (one table, one form). */
import type { Metadata } from "next";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import NewArticleContent from "./_components/NewArticleContent";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale, "meta.newArticle") };
}

export default function NewArticlePage() {
  return <NewArticleContent />;
}
