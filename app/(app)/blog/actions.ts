"use server";

/* Article engine edit actions (admin/mod only): create/update/publish/
   unpublish/soft-delete. The UI renders entries for admin/mod only;
   this re-checks (session + canModerate). Publish semantics: the
   publish checkbox = publish (first publish time preserved); unchecked
   = draft/unpublish (published_at NULL, invisible in front lists and
   detail). After writing, /blog and /learn list/detail prefetch caches
   are invalidated. Navigation belongs to the form layer (modal-ized
   like work publishing): the action only returns a result — publish ->
   replace to /explore/<slug> (the modal closes silently, landing on
   detail); draft -> stay at the edit position (returning the row id so
   the next save updates instead of duplicating). */
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
  /* Success state: the form layer navigates on it (publish -> detail;
     draft -> keep editing in place). */
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

/* MySQL unique-constraint conflict ((slug, locale) composite unique)
   -> a friendly error. */
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

  /* Issue/tutorial metadata: empty = NULL; non-empty validates strictly
     (letter -> monthly.ts, guide -> tutorials.ts), errors shown
     inline. */
  let payload: string | null = null;
  let guideHasVideo = false;
  /* The guide's series slug: series pages invalidate with the write
     (letters have no series). */
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
  /* A letter's three layers assemble from data (src/lib/monthly.ts) so
     its body may be empty; a video-first guide may leave the text empty
     (the detail shows "video-first episode"), everything else stays
     required. */
  if (!bodyMd && kind !== "letter" && !guideHasVideo) return { error: t(locale, "err.artBody") };

  const input = { slug, kind, locale: artLocale, title, summary, bodyMd, sortOrder, payload };
  /* Fetch old values (slug/series) before the update: after a rename or
     series change, old-path caches must be invalidated too. */
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
  /* Old slug: the renamed detail page's cache invalidates as a
     backstop. */
  if (prev && prev.slug !== slug) revalidatePath(`/explore/${prev.slug}`);
  /* Series pages: both old and new invalidate (the old page's episode
     list must drop this episode). */
  for (const s of new Set([prev?.series ?? null, seriesSlug])) {
    if (s) revalidatePath(`/explore/series/${s}`);
  }
  /* Stats snapshot cache invalidation: publishing/unpublishing can both
     change the snapshot's look. */
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
  /* Delete carries only an id: fetch slug/series first, then delete —
     detail and series pages can be invalidated precisely. */
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
