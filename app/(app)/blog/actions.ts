"use server";

/* 文章引擎编辑动作(S3-1,admin/mod 专属):新建/更新/发布/撤稿/软删。
   UI 只对 admin/mod 渲染入口,这里再兜底一次(session + canModerate)。
   发布语义:publish 勾选 = 发布(保留首次发布时间),不勾 = 草稿/撤稿(published_at NULL,
   前台列表与详情均不露出)。写完后作废 /blog 与 /learn 的列表与详情预取缓存。
   导航交给表单层(20260822 弹窗化,与作品发布同构):action 只返回结果,
   发布 → replace 到 /explore/<slug>(弹窗静默关、落在详情);存草稿 →
   停在编辑位续编(带回首行 id,再保存走更新不重复建行)。 */
import { revalidatePath, updateTag } from "next/cache";
import { getSessionUser } from "@/src/lib/auth/session";
import { PUBLIC_MONTHLY_STATS_CACHE_TAG } from "@/src/lib/cache-tags";
import {
  createArticle,
  getArticleSlugAndSeriesById,
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
import { parseGuidePayload } from "@/src/lib/tutorials";

export interface ArticleFormState {
  /* 成功态:表单层据此导航(发布 → 详情;草稿 → 原地续编) */
  ok?: boolean;
  id?: number;
  slug?: string;
  artLocale?: string;
  published?: boolean;
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
  const sortOrder = normalizeSortOrder(String(formData.get("sort_order") || ""));
  const publish = formData.get("publish") === "on";

  /* 期次/教程元数据:空 = NULL;非空走严格校验(letter → monthly.ts,
     guide → tutorials.ts),错误就地提示 */
  let payload: string | null = null;
  let guideHasVideo = false;
  /* guide 的系列 slug:系列页随写路径失效(letter 无系列) */
  let seriesSlug: string | null = null;
  if (kind === "letter") {
    const parsed = parseLetterPayload(String(formData.get("payload") || ""));
    if (!parsed.ok) return { error: `payload:${parsed.error}` };
    payload = Object.keys(parsed.payload).length
      ? JSON.stringify(parsed.payload)
      : null;
  } else if (kind === "guide") {
    const parsed = parseGuidePayload(String(formData.get("payload") || ""));
    if (!parsed.ok) return { error: `payload:${parsed.error}` };
    payload = Object.keys(parsed.payload).length
      ? JSON.stringify(parsed.payload)
      : null;
    guideHasVideo = !!parsed.payload.video;
    seriesSlug = parsed.payload.series ?? null;
  }
  /* letter 的三层由数据组装(src/lib/monthly.ts),正文可空;guide 以视频为主时
     文稿可空(集详情显示「本集以视频为主」),其余仍必填 */
  if (!bodyMd && kind !== "letter" && !guideHasVideo) return { error: t(locale, "err.artBody") };

  const input = { slug, kind, locale: artLocale, title, summary, bodyMd, sortOrder, payload };
  /* 更新前取旧值(slug/系列):改 slug 或换系列后,旧路径缓存也要失效(20260822 P2-6) */
  const prev = id ? await getArticleSlugAndSeriesById(id) : null;
  let rowId = id;
  try {
    if (id) {
      const ok = await updateArticle(id, input, publish);
      if (!ok) return { error: t(locale, "err.generic") };
    } else {
      rowId = await createArticle(user.id, input, publish);
    }
  } catch (e) {
    if (isDupEntry(e)) return { error: t(locale, "err.artSlugTaken") };
    throw e;
  }

  revalidatePath("/explore");
  revalidatePath(`/explore/${slug}`);
  /* 旧 slug:改名的详情页缓存兜底失效 */
  if (prev && prev.slug !== slug) revalidatePath(`/explore/${prev.slug}`);
  /* 系列页:新旧系列都失效(换系列时旧页的集列表要摘掉本集) */
  for (const s of new Set([prev?.series ?? null, seriesSlug])) {
    if (s) revalidatePath(`/explore/series/${s}`);
  }
  /* 统计快照缓存失效(20260822 P2-5):发布/撤稿都可能改变快照观感 */
  updateTag(PUBLIC_MONTHLY_STATS_CACHE_TAG);
  return { ok: true, id: rowId, slug, artLocale, published: publish };
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
  /* 删除动作只带 id:先取 slug/系列再删,详情与系列页都可精确失效(20260822 P2-6) */
  const prev = await getArticleSlugAndSeriesById(id);
  const ok = await softDeleteArticle(id);
  if (ok) {
    revalidatePath("/explore");
    if (prev) {
      revalidatePath(`/explore/${prev.slug}`);
      if (prev.series) revalidatePath(`/explore/series/${prev.series}`);
    }
    updateTag(PUBLIC_MONTHLY_STATS_CACHE_TAG);
  }
  return { ok };
}
