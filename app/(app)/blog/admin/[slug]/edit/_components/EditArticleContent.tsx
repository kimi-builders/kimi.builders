/* Edit-article body (shared by the full page and the intercepted
   modal): located by slug + ?locale= exactly (one slug may hold zh
   and en rows; drafts resolve too); section switch + admin/mod gate +
   ArticleForm. showTitle=false hands the title to RouteModal's header
   (the draft badge still shows in the form's publish section). */
import { notFound } from "next/navigation";
import { getSessionUser } from "@/src/lib/auth/session";
import {
  getArticleForEdit,
  normalizeArticleLocale,
  normalizeArticleSlug,
} from "@/src/lib/articles";
import { canModerate } from "@/src/lib/featured";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { UPCOMING } from "@/src/lib/upcoming";
import SoonPanel from "../../../../../_components/SoonPanel";
import ArticleForm from "../../../../_components/ArticleForm";

export default async function EditArticleContent({
  params,
  searchParams,
  showTitle = true,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
  showTitle?: boolean;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const user = await getSessionUser();
  const locale = await getLocale(user);
  /* Section not ready (src/lib/upcoming.ts): the edit console closes
     with it. */
  if (UPCOMING.explore) {
    return <SoonPanel title={t(locale, "nav.explore")} locale={locale} />;
  }
  if (!user || !canModerate(user.role)) {
    return (
      <p className="mt-8 rounded-2xl border border-line bg-card p-6 font-mono text-xs text-grey">
        {t(locale, user ? "err.forbidden" : "err.login")}
      </p>
    );
  }
  const s = normalizeArticleSlug(slug);
  const artLocale = normalizeArticleLocale(sp.locale ?? "") ?? "zh";
  if (!s) notFound();
  const article = await getArticleForEdit(s, artLocale);
  if (!article) notFound();
  return (
    <div className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      {showTitle && (
        <>
          {/* Layout alignment: page head uses eyebrow + .kb-h2 (draft badge stays on the title row) */}
          <p className="kb-eyebrow">{t(locale, "artf.eyebrow")}</p>
          <h1 className="kb-h2 mt-3">
            {t(locale, "artf.editTitle")}
            {!article.publishedAt && (
              <span className="ml-3 rounded-md border border-line px-1.5 py-px align-middle font-mono text-xs tracking-wider text-grey">
                {t(locale, "art.draft")}
              </span>
            )}
          </h1>
        </>
      )}
      <ArticleForm
        locale={locale}
        initial={{
          id: article.id,
          slug: article.slug,
          kind: article.kind,
          locale: article.locale,
          title: article.title,
          summary: article.summary,
          bodyMd: article.bodyMd,
          sortOrder: article.sortOrder,
          published: !!article.publishedAt,
          payload: article.payload,
        }}
      />
    </div>
  );
}
