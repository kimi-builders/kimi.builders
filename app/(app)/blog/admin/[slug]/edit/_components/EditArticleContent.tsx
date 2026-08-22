/* 编辑文章内容体(完整页与拦截弹窗共用,20260822 弹窗化):
   按 slug + ?locale= 精确定位(同 slug 可有中英两行,草稿也能取到);
   板块开关 + admin/mod 门槛 + ArticleForm。showTitle=false 时标题交给
   RouteModal 头部(草稿徽标在表单发布节仍有等价提示)。 */
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
  /* 板块未就绪(src/lib/upcoming.ts):编辑后台一并关闸 */
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
          {/* 20260819 版式对齐:页头接入 eyebrow + .kb-h2(草稿徽标保留在标题行) */}
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
