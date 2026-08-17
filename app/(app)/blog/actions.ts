"use server";

/* 文章引擎编辑动作(S3-1,admin/mod 专属):新建/更新/发布/撤稿/软删。
   UI 只对 admin/mod 渲染入口,这里再兜底一次(session + canModerate)。
   发布语义:publish 勾选 = 发布(保留首次发布时间),不勾 = 草稿/撤稿(published_at NULL,
   前台列表与详情均不露出)。写完后作废 /blog 与 /learn 的列表与详情预取缓存。 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/src/lib/auth/session";
import {
  createArticle,
  normalizeArticleKind,
  normalizeArticleLocale,
  normalizeArticleSlug,
  normalizeSortOrder,
  softDeleteArticle,
  updateArticle,
  ARTICLE_SUMMARY_MAX,
  ARTICLE_TITLE_MAX,
} from "@/src/lib/articles";
import { canModerate } from "@/src/lib/featured";
import { t } from "@/src/lib/i18n";
import { getLocale } from "@/src/lib/i18n-server";
import { parseLetterPayload } from "@/src/lib/monthly";

export interface ArticleFormState {
  error?: string;
}

export interface ArticleMutationResult {
  ok: boolean;
  error?: string;
}

/* MySQL 唯一约束冲突((slug, locale) 复合唯一)→ 友好错误。 */
function isDupEntry(e: unknown): boolean {
  const err = e as { code?: string; errno?: number };
  return err?.code === "ER_DUP_ENTRY" || err?.errno === 1062;
}

export async function saveArticleAction(
  _prev: ArticleFormState | null,
  formData: FormData,
): Promise<ArticleFormState> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { error: t(locale, "err.login") };
  if (!canModerate(user.role)) return { error: t(locale, "err.forbidden") };

  const id = Number(formData.get("id")) || 0;
  const slug = normalizeArticleSlug(String(formData.get("slug") || ""));
  if (!slug) return { error: t(locale, "err.artSlug") };
  const kind = normalizeArticleKind(String(formData.get("kind") || ""));
  const artLocale = normalizeArticleLocale(String(formData.get("locale") || ""));
  if (!kind || !artLocale) return { error: t(locale, "err.artMeta") };
  const title = String(formData.get("title") || "").trim();
  if (!title || title.length > ARTICLE_TITLE_MAX)
    return { error: t(locale, "err.artTitle") };
  const summary = String(formData.get("summary") || "").trim();
  if (summary.length > ARTICLE_SUMMARY_MAX)
    return { error: t(locale, "err.artSummaryLong") };
  const bodyMd = String(formData.get("body") || "").trim();
  /* letter 的三层由数据组装(src/lib/monthly.ts),正文可空;guide 仍必填 */
  if (!bodyMd && kind !== "letter") return { error: t(locale, "err.artBody") };
  const sortOrder = normalizeSortOrder(String(formData.get("sort_order") || ""));
  const publish = formData.get("publish") === "on";

  /* letter 期次元数据:空 = NULL(纯自动组装);非空走严格校验,错误就地提示 */
  let payload: string | null = null;
  if (kind === "letter") {
    const parsed = parseLetterPayload(String(formData.get("payload") || ""));
    if (!parsed.ok) return { error: `payload:${parsed.error}` };
    payload = Object.keys(parsed.payload).length
      ? JSON.stringify(parsed.payload)
      : null;
  }

  const input = { slug, kind, locale: artLocale, title, summary, bodyMd, sortOrder, payload };
  try {
    if (id) {
      const ok = await updateArticle(id, input, publish);
      if (!ok) return { error: t(locale, "err.generic") };
    } else {
      await createArticle(user.id, input, publish);
    }
  } catch (e) {
    if (isDupEntry(e)) return { error: t(locale, "err.artSlugTaken") };
    throw e;
  }

  revalidatePath("/blog");
  revalidatePath("/learn");
  revalidatePath(`/blog/${slug}`);
  revalidatePath(`/learn/${slug}`);
  /* 发布 → 落到公开页;存草稿 → 回到编辑页(草稿前台不显示,编辑页是唯一工作位) */
  redirect(
    publish
      ? kind === "guide"
        ? `/learn/${slug}`
        : `/blog/${slug}`
      : `/blog/admin/${slug}/edit?locale=${artLocale}`,
  );
}

export async function deleteArticleAction(
  formData: FormData,
): Promise<ArticleMutationResult> {
  const user = await getSessionUser();
  const locale = await getLocale(user);
  if (!user) return { ok: false, error: t(locale, "err.login") };
  if (!canModerate(user.role))
    return { ok: false, error: t(locale, "err.forbidden") };
  const id = Number(formData.get("id"));
  if (!id) return { ok: false, error: t(locale, "err.generic") };
  const ok = await softDeleteArticle(id);
  if (ok) {
    revalidatePath("/blog");
    revalidatePath("/learn");
  }
  return { ok };
}
