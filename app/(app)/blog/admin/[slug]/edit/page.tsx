/* 编辑文章(S3-1 编辑后台):按 slug + ?locale= 精确定位(同 slug 可有中英两行,
   草稿也能取到 —— 存草稿后 redirect 回这里继续改)。admin/mod 专属。 */
import type { Metadata } from "next";
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
import SoonPanel from "../../../../_components/SoonPanel";
import ArticleForm from "../../../_components/ArticleForm";

export const metadata: Metadata = { title: "编辑文章 — kimi.builders" };

export default async function EditArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const user = await getSessionUser();
  const locale = await getLocale(user);
  /* 板块未就绪(src/lib/upcoming.ts):编辑后台一并关闸 */
  if (UPCOMING.blog) {
    return <SoonPanel title={t(locale, "nav.blog")} locale={locale} />;
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
      <h1 className="font-mono text-lg font-semibold">
        {t(locale, "artf.editTitle")}
        {!article.publishedAt && (
          <span className="ml-3 rounded-md border border-line px-1.5 py-px align-middle font-mono text-[10px] tracking-wider text-grey">
            {t(locale, "art.draft")}
          </span>
        )}
      </h1>
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
        }}
      />
    </div>
  );
}
