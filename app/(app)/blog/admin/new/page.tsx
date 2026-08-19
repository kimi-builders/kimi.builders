/* 新建文章(S3-1 编辑后台):admin/mod 专属,服务端门槛 + 表单交互(ArticleForm)在客户端。
   kind 在表单里选:letter=月刊,guide=学习路径(同一张表,同一表单)。 */
import type { Metadata } from "next";
import { getSessionUser } from "@/src/lib/auth/session";
import { canModerate } from "@/src/lib/featured";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { UPCOMING } from "@/src/lib/upcoming";
import SoonPanel from "../../../_components/SoonPanel";
import ArticleForm from "../../_components/ArticleForm";

export const metadata: Metadata = { title: "新建文章 — kimi.builders" };

export default async function NewArticlePage() {
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
  return (
    <div className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      <h1 className="text-2xl font-semibold text-paper">
        {t(locale, "artf.newTitle")}
      </h1>
      <ArticleForm locale={locale} />
    </div>
  );
}
